import { callClaudeJSON, callClaudeJSONWithImages, MODELS } from './claudeClient';
import { getOrGenerateChain, customContextDigest, normalizeConceptKey } from './chainService';
import { gradeAndRecordReview, getReviewedConceptIds, hasAnySubjectHistory, FsrsRatingKey } from './reviewService';
import { searchWikimediaImages, fetchImageAsBase64 } from './wikimediaService';
import { supabaseAdmin } from './supabaseAdmin';
import {
  ENCODING_LESSON_FIRST_STEP_PROMPT,
  ENCODING_LESSON_CONTINUATION_PROMPT,
  ENCODING_ANSWER_CHECK_PROMPT,
  MECHANISTIC_CHECK_ANSWER_PROMPT,
  ENCODING_MATH_ANSWER_CHECK_PROMPT,
  EXPLICIT_QUESTION_PROMPT,
  DIAGRAM_VERIFICATION_PROMPT,
  STEP_DERIVABILITY_CHECK_PROMPT,
  NOTES_FROM_LESSON_PROMPT,
  ASK_PANEL_PROMPT,
} from '../constants/encodingLessonPrompts';

function stripCodeFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}

// A cached encoding_lesson_content row gets REUSED across students only
// when this is explicitly turned on (Render env var
// ENCODING_LESSON_CACHE_ENABLED=true) — off by default. While off, every
// lesson start generates fresh, so a bad generation (wrong prompt, missed
// contradiction, etc.) never gets served to a second student just because
// the first student happened to hit it first. The lesson is still WRITTEN
// to encoding_lesson_content either way (see continueEncodingLesson) —
// grading a calculation step re-reads its expectedSolution from that same
// row (fetchExpectedSolution), so the write can't be skipped without
// breaking grading for the student who's already mid-lesson; only the
// cross-student REUSE of an existing row is what this flag controls.
// Flip the env var back on once lesson quality is trusted again — no code
// change needed to resume caching.
const LESSON_CACHE_REUSE_ENABLED = process.env.ENCODING_LESSON_CACHE_ENABLED === 'true';

// Belt-and-suspenders against stray prose around the JSON body (e.g. a
// model narrating its self-check reasoning before settling into the
// output despite "Output ONLY valid JSON" instructions) — falls back to
// the outermost {...} span if a direct parse fails.
function extractJsonObject(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return text;
  return text.slice(start, end + 1);
}

async function callJSON<T>(systemPrompt: string, userContent: string, model: string, temperature = 0, maxTokens?: number, cacheSystemPrompt = false): Promise<T> {
  const raw = await callClaudeJSON({ model, systemPrompt, userContent, temperature, maxTokens, cacheSystemPrompt });
  const cleaned = stripCodeFences(raw);
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    try {
      return JSON.parse(extractJsonObject(cleaned)) as T;
    } catch (err) {
      // Logged raw so a truncated/malformed response (the most likely
      // cause of a parse failure here) is actually diagnosable after the
      // fact, instead of just surfacing as an opaque 500 to the client.
      console.error('LastMind: encoding lesson call returned invalid JSON.', { raw });
      throw err;
    }
  }
}

export interface ChainEdge { node_id: string; relationship: 'definitional' | 'reasoning'; }
// technique — see CHAIN_GENERATION_PROMPT rule 11/12: true for a node that
// exists specifically because computing/applying the target requires a
// procedural/computational method (often from a different subject than the
// lesson's own). A student is unlikely to have already covered a technique
// like this just because they're studying THIS subject — see
// forceTeachIds below, where this forces it to be actually taught rather
// than merely checked as assumed prior knowledge.
// generalMechanism — see CHAIN_GENERATION_PROMPT rule 14: true for a
// general, transferable mechanism/process/principle (diffusion, active
// transport, Newton's second law, supply and demand) the student is
// expected to already apply fluently across many topics, as opposed to
// concept-specific factual/structural grounding unique to this target. See
// buildPrerequisiteChains below, where this decides whether a direct
// prerequisite's whole chain gets pre-tested (check/mechanistic_check)
// before the target derivation starts, or instead gets recruited as a
// reasoning tool woven directly into the target derivation's own beats.
export interface ChainNode { id: string; label: string; derivable?: boolean; technique?: boolean; generalMechanism?: boolean; depends_on: ChainEdge[]; }
export interface Chain { concept_id: string; subject: string; nodes: ChainNode[]; }

// 'mechanistic_check' replaces a single-node 'check' when the prerequisite
// being verified is the tip of a genuine multi-node chain (see
// buildPrerequisiteChains) — one question spanning the whole chain's
// reasoning in a single answer, graded more strictly (see
// MECHANISTIC_CHECK_ANSWER_PROMPT) than an ordinary 'check'.
export type EncodingStepType = 'check' | 'mechanistic_check' | 'scene' | 'derive' | 'explain' | 'implication';

export interface EncodingDiagram {
  diagramUrl: string;
  diagramCaption: string;
  diagramAttribution: string;
}

export interface EncodingStep {
  nodeId: string;
  label: string;
  type: EncodingStepType;
  text: string;
  checkQuestion?: string;
  // Which FSRS concept a wrong answer on this step should be diagnosed
  // (and graded) against. Equals the lesson's own conceptKey for
  // scene/derive/explain beats actually about the TARGET, and for
  // "implication" beats too (deeper questions about that same target,
  // never a separate concept — their own nodeId is just a synthetic slug,
  // not a real chain node); equals the step's own nodeId for anything
  // about a prerequisite node instead (a "check" step, or a prerequisite
  // promoted to a taught beat because it was explicitly named in the
  // lesson's own title — see ENCODING_LESSON_BATCH_PROMPT). The frontend
  // uses this — not the step type — to decide both which concept to
  // diagnose and whether the diagnostic tree's cheaper atomic-only path is
  // required (nodeId !== conceptKey means there's no independently-cached
  // chain for it).
  diagnosisConceptKey: string;
  // Only ever set on a mechanistic_check step — the FULL ordered chain
  // (foundational-first, ending at this step's own nodeId/tip) it traces,
  // not just the tip. Lets submitEncodingAnswer grade the CONSECUTIVE
  // EDGES in that chain, not just the tip node itself, once this step
  // resolves — see attachChainNodes.
  chainNodes?: { id: string; label: string }[];
  diagram?: EncodingDiagram;
  // True when this step is a genuine calculation (numeric/algebraic, with
  // a definite computable answer) rather than a purely verbal one — see
  // ENCODING_LESSON_BATCH_PROMPT rule 10. Drives the frontend's math
  // keyboard input and the math-aware grading path (submitEncodingAnswer).
  // Never carries the actual solution — see CachedEncodingStep below for
  // why that has to stay entirely server-side.
  requiresCalculation?: boolean;
}

// The shape actually stored in encoding_lesson_content — a calculation
// step's verified correct solution (see ENCODING_LESSON_BATCH_PROMPT rule
// 1c) lives ONLY here, never in EncodingStep/EncodingLessonState, which
// the client holds and round-trips on every /encoding-lesson/submit call.
// If expectedSolution were embedded there, the answer would be sitting in
// plain sight in the network response before the student even attempts
// the question. Grading re-fetches this cache row by contentKey instead —
// see submitEncodingAnswer.
interface CachedEncodingStep extends EncodingStep {
  expectedSolution?: string;
}

export interface EncodingLessonState {
  conceptKey: string;
  subject: string;
  // Carried alongside subject so submitEncodingAnswer can resolve a
  // mechanistic_check chain's node labels to canonical concept ids for
  // edge-level FSRS grading (see resolveSiblingConceptId) — the same
  // topic every sibling in `siblingConcepts` below shares.
  topic: string;
  // Round-tripped from generation time so edge grading has the same
  // student-page context resolveSiblingConceptId was built for — this is
  // the FULL list (done and not-done), unlike the subset
  // matchesUnfinishedSibling itself filters down to.
  siblingConcepts: SiblingConcept[];
  steps: EncodingStep[];
  currentIndex: number;
  // "Core" means a step whose diagnosisConceptKey equals this lesson's own
  // conceptKey (the scene, target-derivation beats, and implications). One
  // entry pushed each time a core step reaches its FINAL resolution (never
  // on an intermediate reword/reattempt return — see submitEncodingAnswer):
  // 1 for a clean first-try pass, 0.5 for correct only after a
  // misread-reword or partial-understanding retry, 0 for wrong even after
  // that retry. ONLY ever reflects the TARGET's own performance — a wrong
  // prerequisite/other-concept step never touches this, since that node
  // gets its OWN independent FSRS grade at the point it's answered (see
  // submitEncodingAnswer's per-node grading) instead of being smeared into
  // the target's aggregate. Averaged into a single 0-1 index at lesson
  // completion (see submitEncodingAnswer's rating derivation) —
  // deliberately proportional rather than "any single core step wrong
  // forces the whole target to Again", since one rough moment amid
  // otherwise-clean steps is genuinely different evidence than a lesson
  // that was wrong throughout.
  coreStepScores: number[];
  // Set by the frontend once a scene/derive/explain diagnostic drill-down
  // has already graded this exact conceptKey mid-lesson (via the
  // diagnostic tree's own terminal branch) — the lesson-completion grade
  // below must not repeat that FSRS update for the same concept.
  targetGradedViaDrillDown?: boolean;
  // The exact encoding_lesson_content cache key this lesson's content came
  // from — purely a cache-routing string, not itself sensitive. Lets
  // submitEncodingAnswer re-fetch a calculation step's expectedSolution
  // for math-aware grading without ever having sent it to the client.
  contentKey: string;
  // Carried along so a wrong-answer drill-down (see diagnosticOrchestrator.ts)
  // can generate/look up its own prerequisite-node chains at the SAME
  // qualification+examBoard tier this lesson itself was generated at,
  // instead of silently falling back to the untiered "" bucket — see
  // getOrGenerateChain in chainService.ts.
  qualification: string;
  examBoard: string;
  // A self-directed "Other" folder's own title+description, carried the
  // same way qualification/examBoard are — so continueEncodingLesson's
  // independent chain re-fetch and its own generation call stay pinned to
  // the SAME custom scope this lesson started with, without the frontend
  // needing to resend them on /continue. Empty strings for an ordinary
  // qualification-based folder.
  customTitle: string;
  customDescription: string;
  // Node ids the student flagged "not confident about" on the pre-lesson
  // outline (see getEncodingLessonOutline) — see startEncodingLesson's own
  // comment on why this counts toward forceTeach. Always present (empty
  // array when the outline step was skipped or nothing was flagged) so
  // continueEncodingLesson can recompute the identical forcedNodeIds/
  // contentKey without a second round-trip of this list from the client.
  selfReportedUnsureNodeIds: string[];
  // Set to the step index that was just reworded after a "misread"
  // verdict (see submitEncodingAnswer) — checked on the NEXT submit for
  // that SAME index to cap this at exactly one reword attempt per step,
  // rather than looping forever if the student keeps misreading. A
  // genuinely wrong answer on the reworded retry falls through to normal
  // grading (and the diagnostic drill-down on failure) like any other step.
  reframedStepIndex?: number;
  // Set to the step index that was just given ONE partial-understanding
  // follow-up (see submitEncodingAnswer's "partiallyUnderstood" branch) —
  // checked on the NEXT submit for that SAME index to cap this at exactly
  // one re-explain attempt per step, mirroring reframedStepIndex's own
  // cap. A student who still can't complete the explanation on THIS
  // second attempt falls through to normal wrong-answer handling — the
  // diagnostic drill-down takes over from there.
  partialReattemptStepIndex?: number;
}

export interface EncodingStartResult {
  done: false;
  hookFact: string;
  step: EncodingStep;
  state: EncodingLessonState;
  // false on a cold-cache miss — `state.steps` holds ONLY the first step at
  // this point (fast to generate, so the student sees it immediately);
  // the frontend must fire /encoding-lesson/continue in the background as
  // soon as this first step is on screen, and await its result (merging
  // the full step list into state) before ever calling
  // /encoding-lesson/submit. true on a cache hit — state.steps already has
  // the whole lesson and no continuation call is needed.
  contentReady: boolean;
}

// The before/after FSRS card state from grading this lesson's single,
// aggregate rating (see submitEncodingAnswer) — purely for showing the
// student how their answers fed into the algorithm; nothing here is used
// for scheduling logic itself, that already happened inside
// gradeAndRecordReview before this summary is even built. `previous` is
// null the first time this concept is ever graded (no prior card to show).
export interface FsrsUpdateSummary {
  rating: FsrsRatingKey;
  previous: { stability: number; difficulty: number; due: string; reps: number; lapses: number; state: number } | null;
  updated: { stability: number; difficulty: number; due: string; reps: number; lapses: number; state: number; scheduledDays: number; elapsedDays: number };
}

export interface EncodingSubmitResult {
  done: boolean;
  correct?: boolean;
  feedback?: string | null;
  step?: EncodingStep;
  state: EncodingLessonState;
  fsrsUpdate?: FsrsUpdateSummary;
  // True when this result is a REWORDED re-ask of the SAME step (see
  // "step"), not a graded outcome — the grading call decided the student's
  // answer was responding to a different question than the one asked, not
  // that they got the real question wrong. `state.currentIndex` is
  // unchanged; nothing here counts toward coreStepScores or FSRS yet — the
  // step isn't finally resolved until the retry lands. The frontend should
  // just re-render `step` in place of the one just answered, with no
  // "incorrect" framing.
  misread?: boolean;
  // True when this result is ONE partial-understanding follow-up (see
  // partialReattemptStepIndex) — the student showed real but incomplete
  // understanding, so `step` is the SAME step re-served for one more
  // attempt at exactly the missing piece (see `feedback`, which carries
  // the follow-up prompt in this case), not a graded pass/fail.
  // `state.currentIndex` is unchanged; nothing here counts toward
  // coreStepScores or FSRS yet — only a SECOND failure (this flag absent
  // next time) does. Distinct from `misread`: this is a
  // genuine content gap the student is being given a fair shot to close
  // themselves, not a question-clarity problem.
  partialFollowUp?: boolean;
}

// Chains cached before the "derivable" field existed default to: a node
// with no prerequisites of its own can't be derived from anything else in
// the chain, so it's treated as non-derivable; anything with prerequisites
// is treated as derivable — matches the field's own intent without forcing
// every existing cached chain to regenerate.
function resolveDerivable(node: ChainNode): boolean {
  if (typeof node.derivable === 'boolean') return node.derivable;
  return (node.depends_on || []).length > 0;
}

function clean(s: string): string {
  return (s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

// Attaches each mechanistic_check step's own FULL traced chain (not just
// its tip id) so submitEncodingAnswer can grade the chain's consecutive
// EDGES once it resolves, not just the tip node — see DraftStep.chainNodes.
// Built from groundingChains (only chains actually pre-tested — a
// recruitedMechanismChain's tip never becomes a mechanistic_check step in
// the first place) keyed by each chain's own tip id, which the
// generation-prompt rules guarantee IS the mechanistic_check step's
// nodeId (a chain's LAST entry, per buildPrerequisiteChains' ordering).
function attachChainNodes(steps: DraftStep[], groundingChains: ChainNode[][]): void {
  const chainByTipId = new Map<string, ChainNode[]>();
  groundingChains
    .filter((c) => c.length > 1)
    .forEach((c) => chainByTipId.set(c[c.length - 1].id, c));
  steps.forEach((s) => {
    if (s.type !== 'mechanistic_check') return;
    const chain = chainByTipId.get(s.nodeId);
    if (chain) s.chainNodes = chain.map((n) => ({ id: n.id, label: n.label }));
  });
}

// Decomposes the dependency graph into separate LINEAR prerequisite
// chains, one per direct prerequisite of the target — each chain is that
// prerequisite's own full ancestor lineage (foundational-most node first,
// ending at the direct prerequisite itself), via post-order DFS through
// depends_on. Distinct direct prerequisites naturally give distinct
// chains, matching the real shape of most dependency graphs: several
// separate lines of prior knowledge that only actually converge at the
// target itself, not at each other. A node that happens to be a shared
// deep ancestor of two chains just appears in both — never deduplicated
// across chains, since each chain's own mechanistic check needs its own
// complete, self-contained lineage to question (see
// ENCODING_LESSON_CONTINUATION_PROMPT). Capped at maxChains direct
// prerequisites, same cost-control cap the old flat closePrerequisites
// list used.
//
// Each individual chain is ALSO capped at MAX_CHAIN_NODES, closest-to-tip
// first (breadth-first from the direct prerequisite, not depth-limited —
// a real generated graph can nest several layers of genuinely
// "definitional" prerequisites, e.g. indifference curves -> ordinal
// utility -> utility -> goods and bundles, which a pure depth cap
// wouldn't touch since every hop is short). Bundling an entire deep
// lineage into ONE combined mechanistic_check (see
// ENCODING_LESSON_CONTINUATION_PROMPT's chain-coverage rule) makes that
// single check progressively more unwieldy the more nodes it spans, even
// when every individual edge is legitimately necessary — this is what
// actually made a lesson "too long" in practice, not depth per se.
// Whatever gets cut here isn't lost, just demoted to ordinary
// backgroundNodes treatment (assumed, mentioned briefly for continuity if
// useful, never tested) — appropriate for the most foundational, furthest-
// back nodes in a bushy lineage, which tend to be exactly the ones a
// student at this qualification level can most safely be assumed to
// already have.
const MAX_CHAIN_NODES = 3;

function buildPrerequisiteChains(chain: Chain, target: ChainNode, maxChains = 3): ChainNode[][] {
  const byId = new Map(chain.nodes.map((n) => [n.id, n]));
  const directPrereqIds = (target.depends_on || []).map((d) => d.node_id).slice(0, maxChains);

  return directPrereqIds
    .map((tipId) => {
      const keep = new Set<string>();
      const queue: string[] = [tipId];
      while (queue.length && keep.size < MAX_CHAIN_NODES) {
        const id = queue.shift()!;
        if (keep.has(id)) continue;
        keep.add(id);
        (byId.get(id)?.depends_on || []).forEach((e) => {
          if (!keep.has(e.node_id)) queue.push(e.node_id);
        });
      }

      const visited = new Set<string>();
      const ordered: ChainNode[] = [];
      function visit(id: string) {
        if (visited.has(id) || !keep.has(id)) return;
        visited.add(id);
        const node = byId.get(id);
        if (!node) return;
        (node.depends_on || []).forEach((e) => visit(e.node_id));
        ordered.push(node);
      }
      visit(tipId);
      return ordered;
    })
    .filter((c) => c.length > 0);
}

// Splits the chains buildPrerequisiteChains produced into two genuinely
// different treatments, based on whether each chain's TIP (its own direct
// prerequisite of the target — always the last element, since ordered is
// foundational-first) is a general, transferable mechanism (see
// CHAIN_GENERATION_PROMPT rule 14) or concept-specific grounding:
// - groundingChains: unchanged behavior — pre-tested via a check/
//   mechanistic_check step before the target derivation begins, exactly as
//   every chain used to be treated.
// - recruitedMechanismChains: NOT pre-tested at all — passed to the
//   generation prompts as reasoning tools the target derivation's own
//   "derive" beats should actively require the student to APPLY in
//   context (see ENCODING_LESSON_CONTINUATION_PROMPT's own handling),
//   with any individually forceTeach-flagged node within one still taught,
//   just inline and just-in-time rather than as a separate upfront step.
//
// `promoteIds` (optional) overrides the generalMechanism-only split for a
// specific student's lesson: any chain containing a node whose id is in
// promoteIds is treated as a groundingChain regardless of what its tip's
// generalMechanism classification says. This exists for the self-reported
// "I'm not confident about this" signal (see selfReportedUnsureNodeIds) —
// a deliberate, explicit "I don't know this" from the student is a
// stronger, more specific signal than the qualification-baseline default
// the AI-generated classification assumes, and just-in-time placement
// buried inside the target derivation doesn't match what a student who
// flagged a genuine gap actually needs: seeing it taught properly, up
// front, before the derivation leans on it — the same treatment
// concept-specific grounding already gets.
function splitChainsByMechanism(
  chains: ChainNode[][],
  promoteIds: Set<string> = new Set()
): { groundingChains: ChainNode[][]; recruitedMechanismChains: ChainNode[][] } {
  const groundingChains: ChainNode[][] = [];
  const recruitedMechanismChains: ChainNode[][] = [];
  for (const c of chains) {
    const tip = c[c.length - 1];
    const promoted = c.some((n) => promoteIds.has(n.id));
    (tip?.generalMechanism && !promoted ? recruitedMechanismChains : groundingChains).push(c);
  }
  return { groundingChains, recruitedMechanismChains };
}

export interface SiblingConcept {
  label: string;
  done: boolean;
}

// Loose (not exact) match — chain node labels and the student's own page
// titles for the "same" concept are independently generated free text
// (e.g. "Budget line" vs "The budget constraint"), so exact equality would
// miss most real matches. False negatives here just fall back to the
// existing title-only heuristic (unchanged behavior); false positives are
// harmless too — force-teaching a prerequisite that genuinely was already
// known just makes that beat mildly redundant, never wrong.
function normalizeForMatch(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function matchesUnfinishedSibling(nodeLabel: string, siblingConcepts: SiblingConcept[]): boolean {
  const normNode = normalizeForMatch(nodeLabel);
  if (!normNode) return false;
  return siblingConcepts.some((s) => {
    if (s.done) return false;
    const normSib = normalizeForMatch(s.label);
    return !!normSib && (normSib === normNode || normSib.includes(normNode) || normNode.includes(normSib));
  });
}

// Same fuzzy match as matchesUnfinishedSibling, but for a genuinely
// different purpose — resolving a raw chain-node id (e.g. "the_nucleus")
// to the student's OWN page for that same real concept, if one exists,
// so edge-level FSRS grading (see submitEncodingAnswer's mechanistic_check
// handling) lands on the SAME concept_reviews key that page's own
// completed-lesson reviews use (normalizeConceptKey), not a disconnected
// raw id. Deliberately matches against EVERY sibling regardless of `done`
// — a FINISHED sibling is exactly the case with real FSRS history worth
// joining to; matchesUnfinishedSibling excludes those on purpose for its
// own (different) force-teach use, this function needs the opposite.
// `topic` is the CURRENT lesson's own topic — safe to reuse for every
// sibling here since siblingConceptsForCurrentPage (learn/index.html)
// only ever draws siblings from the same subfolder as the current page.
export function resolveSiblingConceptId(nodeLabel: string, subject: string, topic: string, siblingConcepts: SiblingConcept[]): string | null {
  const normNode = normalizeForMatch(nodeLabel);
  if (!normNode) return null;
  const match = siblingConcepts.find((s) => {
    const normSib = normalizeForMatch(s.label);
    return !!normSib && (normSib === normNode || normSib.includes(normNode) || normNode.includes(normSib));
  });
  return match ? normalizeConceptKey(subject, topic, match.label) : null;
}

const DIAGRAM_LOOKUP_TIMEOUT_MS = 8000;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

function buildAttribution(artist: string | null, licenseShortName: string | null): string {
  if (artist && licenseShortName) return `${artist} — ${licenseShortName}, via Wikimedia Commons`;
  if (artist) return `${artist}, via Wikimedia Commons`;
  return 'Via Wikimedia Commons';
}

// A negative verdict ("nothing suitable found/verified") used to be cached
// forever — one early failed lookup (a bad Wikimedia search, or Claude's
// deliberately strict verification declining every candidate) permanently
// blocked that concept for every student after it, with no way to recover
// short of manually deleting the row. A positive result stays cached
// forever (a genuinely good match doesn't go stale), but a negative one
// now gets retried after this window — cheap insurance against a single
// unlucky first attempt being permanent.
const DIAGRAM_NEGATIVE_RETRY_DAYS = 14;

/**
 * Looks up (or fetches + verifies + caches) a diagram for one concept, keyed
 * by concept + qualification + exam board so only the first student per
 * combination pays the search+vision cost — everyone after gets an instant
 * cache hit, including a cached "nothing suitable" negative (until it goes
 * stale — see DIAGRAM_NEGATIVE_RETRY_DAYS). Never throws: any failure just
 * means no diagram, since a missing diagram is harmless but a wrong one
 * would actively mislead a student.
 */
async function getOrFetchDiagram(
  conceptKey: string,
  qualification: string,
  examBoard: string,
  subject: string,
  targetLabel: string,
  searchQuery: string
): Promise<EncodingDiagram | null> {
  const diagramKey = `${conceptKey}::${clean(qualification)}::${clean(examBoard)}`;

  const { data: cached, error: cacheError } = await supabaseAdmin
    .from('encoding_diagrams')
    .select('diagram, created_at')
    .eq('diagram_key', diagramKey)
    .maybeSingle();
  if (!cacheError && cached) {
    if (cached.diagram) return cached.diagram as EncodingDiagram;
    const ageDays = (Date.now() - new Date(cached.created_at).getTime()) / (24 * 60 * 60 * 1000);
    if (ageDays < DIAGRAM_NEGATIVE_RETRY_DAYS) return null;
    // Stale negative — fall through and retry for real below, same as a
    // genuine cache miss.
  }

  // 3, not 5 — every candidate that survives fetchImageAsBase64 gets sent
  // as an image in the SAME verification call (getOrFetchDiagram below),
  // and each one is real input-token cost. 3 is still enough breadth for
  // Claude to pick a genuinely suitable diagram or correctly decide none
  // of them fit, at 40% less image cost per call.
  const candidates = await searchWikimediaImages(searchQuery, 3);
  if (!candidates.length) {
    await supabaseAdmin.from('encoding_diagrams').upsert({ diagram_key: diagramKey, diagram: null, created_at: new Date().toISOString() });
    return null;
  }

  const fetched = await Promise.allSettled(candidates.map((c) => fetchImageAsBase64(c.thumbUrl)));
  const usable = candidates
    .map((c, i) => ({ candidate: c, image: fetched[i].status === 'fulfilled' ? (fetched[i] as PromiseFulfilledResult<any>).value : null }))
    .filter((x) => x.image);

  if (!usable.length) {
    // Transient (network/size) failure across every candidate, not a
    // definitive "no suitable diagram exists" verdict — don't cache this,
    // let the next student's request try again fresh.
    return null;
  }

  const raw = await callClaudeJSONWithImages({
    model: MODELS.diagnosticTree,
    systemPrompt: DIAGRAM_VERIFICATION_PROMPT,
    userText: [
      `Subject: ${subject}`,
      `Qualification: ${qualification || 'unspecified'}`,
      `Exam board: ${examBoard || 'unspecified'}`,
      `Target concept this diagram is meant to illustrate: ${targetLabel}`,
    ].join('\n'),
    images: usable.map((u, i) => ({
      mediaType: u.image.mediaType,
      base64Data: u.image.base64Data,
      label: `Candidate ${i}: ${u.candidate.title}`,
    })),
    temperature: 0.2,
    maxTokens: 512,
  });

  let parsedVerdict: { chosenIndex: number | null; caption: string | null };
  try {
    parsedVerdict = JSON.parse(stripCodeFences(raw));
  } catch (err) {
    console.error('LastMind: diagram verification call returned invalid JSON.', { raw });
    return null;
  }

  if (parsedVerdict.chosenIndex === null || parsedVerdict.chosenIndex === undefined || !usable[parsedVerdict.chosenIndex]) {
    await supabaseAdmin.from('encoding_diagrams').upsert({ diagram_key: diagramKey, diagram: null, created_at: new Date().toISOString() });
    return null;
  }

  const chosen = usable[parsedVerdict.chosenIndex].candidate;
  const diagram: EncodingDiagram = {
    diagramUrl: chosen.thumbUrl,
    diagramCaption: parsedVerdict.caption || '',
    diagramAttribution: buildAttribution(chosen.artist, chosen.licenseShortName),
  };

  await supabaseAdmin.from('encoding_diagrams').upsert({ diagram_key: diagramKey, diagram, created_at: new Date().toISOString() });
  return diagram;
}

interface DraftStep {
  nodeId: string;
  label: string;
  type: EncodingStepType;
  text: string;
  checkQuestion?: string;
  diagnosisConceptKey: string;
  requiresCalculation?: boolean;
  expectedSolution?: string;
  chainNodes?: { id: string; label: string }[];
}

/**
 * Walks the drafted steps in order, sending a genuinely independent
 * verification/repair call — fresh eyes, no memory of drafting it — for
 * EVERY step, not just ones the batch generation itself flagged as
 * "confident: false". Originally gated behind that self-reported flag, but
 * the two specific failure modes this exists to catch (a stacked
 * scene-question-then-general-question in one step, and a step whose own
 * context hands the student the answer before asking) kept reaching
 * students anyway — the author's inline self-check was missing them even
 * though the generation prompt explicitly forbids both, most likely because
 * a leaked-answer step trivially LOOKS like an easy pass under "would the
 * student succeed", which is the only lens the self-check was applying.
 * Running this unconditionally is the only way to actually guarantee
 * coverage rather than hope improved wording changes what the model
 * self-reports. Only ever runs on a cache miss (see startEncodingLesson) —
 * once a concept's content is cached, every later student skips generation
 * (and this verification) entirely, so the added cost is still strictly
 * one-time-per-concept, not per-student.
 * Mutates each step's text/checkQuestion in place when a genuine revision
 * comes back.
 */
async function repairUncertainSteps(
  steps: DraftStep[],
  subject: string,
  qualification: string,
  examBoard: string
): Promise<void> {
  const establishedSoFar: { label: string; text: string }[] = [];

  for (const step of steps) {
    // A stacked-question step is mechanically detectable — a well-formed
    // question should end in exactly one "?" and never contain another one
    // earlier. Relying purely on the independent check to NOTICE this on
    // its own kept letting it through often enough that it was still
    // reaching students after that check became mandatory on every step —
    // so hand it hard evidence instead of hoping it spots the pattern
    // itself (see STEP_DERIVABILITY_CHECK_PROMPT's own handling of this
    // flag, which makes revision non-optional once given).
    //
    // The OPERATIVE field is "checkQuestion" for an "explain" step (that's
    // what the student actually answers — "text" is the explanation
    // itself, which legitimately doesn't end in a question at all) and
    // "text" for every other type — checking the wrong field here would
    // silently miss exactly half of all step types.
    const operativeField = step.type === 'explain' ? 'checkQuestion' : 'text';
    const operativeText = step.type === 'explain' ? (step.checkQuestion || '') : step.text;
    const questionMarkCount = (operativeText.match(/\?/g) || []).length;
    const flags: string[] = [];
    if (questionMarkCount >= 2) {
      flags.push(`AUTOMATED FLAG: a mechanical scan counted ${questionMarkCount} question marks in this step's "${operativeField}" — dimension 2 (stacked questions) has already failed; revision is mandatory.`);
    }
    // A DIFFERENT failure shape, specific to "explain" steps: "text" is
    // pure explanation and must contain ZERO question marks of its own
    // (rule 2's own exemption for this type) — an explanation that ends
    // with even one rhetorical "?" of its own, immediately followed by the
    // separate, required "checkQuestion", is the same stacked-question
    // problem spread across two adjacent rendered fields instead of one.
    const explainTextQuestionMarkCount = step.type === 'explain' ? (step.text.match(/\?/g) || []).length : 0;
    if (explainTextQuestionMarkCount >= 1) {
      flags.push(`AUTOMATED FLAG: a mechanical scan counted ${explainTextQuestionMarkCount} question mark(s) in this "explain" step's "text" — it must contain none (see rule 2's exemption for this type); the student sees "text" immediately followed by "checkQuestion", so a question mark here creates the same stacked-question problem as dimension 2, just split across two fields. Revise "text" to remove it — rephrase as a statement, or move the point into "checkQuestion" if that's actually where it belongs.`);
    }
    const automatedFlag = flags.length ? `\n${flags.join('\n')}` : '';
    try {
      const result = await callJSON<{
        needsRevision: boolean;
        revisedText: string | null;
        revisedCheckQuestion: string | null;
        revisedExpectedSolution: string | null;
      }>(
        STEP_DERIVABILITY_CHECK_PROMPT,
        [
          `Subject: ${subject}`,
          `Qualification: ${qualification || 'unspecified'}`,
          `Exam board: ${examBoard || 'unspecified'}`,
          `Established so far, in order: ${JSON.stringify(establishedSoFar)}`,
          `Step — type: ${step.type}, text: ${step.text}${step.checkQuestion ? `, checkQuestion: ${step.checkQuestion}` : ''}${
            step.requiresCalculation ? `, requiresCalculation: true, expectedSolution: ${step.expectedSolution || ''}` : ''
          }${automatedFlag}`,
        ].join('\n'),
        MODELS.diagnosticTree,
        0.2,
        // No output-size reason to change maxTokens — pass through the
        // 2048 default explicitly so cacheSystemPrompt can be set below.
        undefined,
        // STEP_DERIVABILITY_CHECK_PROMPT is fixed and byte-identical on
        // every call — every other step in this SAME repair loop hits
        // this within seconds, well inside the cache TTL, so this was
        // paying full input price per step for no reason. Same caching
        // win as every other fixed prompt in this file.
        true
      );
      if (result.needsRevision) {
        if (result.revisedText) step.text = result.revisedText;
        if (step.type === 'explain' && result.revisedCheckQuestion) step.checkQuestion = result.revisedCheckQuestion;
        if (step.requiresCalculation && result.revisedExpectedSolution) step.expectedSolution = result.revisedExpectedSolution;
      }
      // Each flag makes revision mandatory — if the model still didn't
      // comply (ignored a flag, or complied but that field's revised
      // counterpart never actually arrived), this step ships with the
      // known stacked-question bug intact. Loud, not thrown — same
      // best-effort posture as every other repair failure — but worth
      // surfacing, since a repeat of this in the logs is a sign the prompt
      // itself needs revisiting again, not just this one lesson.
      const revisedOperativeField = step.type === 'explain' ? result.revisedCheckQuestion : result.revisedText;
      const operativeFieldStillBroken = questionMarkCount >= 2 && (!result.needsRevision || !revisedOperativeField);
      const explainTextStillBroken = explainTextQuestionMarkCount >= 1 && (!result.needsRevision || !result.revisedText);
      if (operativeFieldStillBroken || explainTextStillBroken) {
        console.error('LastMind: stacked-question step survived a mandatory-revision flag — shipping with the bug intact.', { label: step.label, operativeField, operativeText, explainTextQuestionMarkCount, text: step.text });
      }
    } catch (err) {
      // A failed verification call just means the original draft ships
      // as-is — never block the whole lesson on this being a best-effort
      // quality pass, not a hard requirement.
      console.error('LastMind: step derivability check failed, keeping original draft.', err);
    }
    establishedSoFar.push({ label: step.label, text: step.text });
  }
}

/**
 * Starts a first-time "encoding" lesson. Shape: a novelty hook fact, a
 * short knowledge-check of the target concept's DIRECT prerequisites only
 * (assumed prior knowledge — verified, not re-taught), a scene + derivation
 * of the target concept itself, then 1-3 steps exploring its real
 * implications/trade-offs. Distant/foundational chain nodes are neither
 * tested nor individually walked — they're passed to the generation call
 * as background context only, so the lesson doesn't re-teach material
 * covered in earlier lessons or drift into testing prerequisites far from
 * the actual new content.
 *
 * `siblingConcepts` — the OTHER page titles (+ completion status) in the
 * same folder/subfolder as this lesson's own page — exists specifically so
 * a close prerequisite that happens to be one of the student's OWN
 * not-yet-completed pages gets taught inline rather than silently assumed
 * known just because it wasn't named in THIS page's own title (e.g. an
 * "Optimal choice" lesson assuming "Budget line" was already covered, when
 * the student's own Budget line page hadn't been done yet). See
 * matchesUnfinishedSibling. Always safe to omit/pass empty — falls back to
 * the original title-only heuristic.
 *
 * The generated content (hook fact + steps, including any resolved
 * diagram) is cached per concept+qualification+exam board (extended with a
 * forced-prerequisite fingerprint only when siblingConcepts actually forced
 * something — the common, well-ordered case keeps the exact same cache key
 * as before), same pattern as dependency_chains/encoding_diagrams — only
 * the first student to hit a given lesson IN A GIVEN teaching situation
 * pays for generation; everyone else gets an instant cache hit. The chain
 * fetch itself now always runs (even on a cache hit) since the close
 * prerequisites it reveals are needed to compute the cache key in the
 * first place — it's a fast, independently-cached read, not an LLM call,
 * so this costs one extra DB round trip per lesson start, not a Claude call.
 */
export interface EncodingLessonOutlineItem {
  nodeId: string;
  label: string;
  // True when this user already has SOME real concept_reviews history for
  // this exact node — it was itself taught/reviewed as its own page on
  // LastMind before, not just self-reported. See stripFsrsVerifiedChecks —
  // a single-node "check" step for a verified node is silently skipped in
  // the actual lesson (trust real practice history over re-asking a
  // question that's now redundant), so the frontend should skip showing it
  // in the self-assessment checklist too — there's nothing left to confirm.
  verifiedOnLastMind: boolean;
}

export interface EncodingLessonOutline {
  targetLabel: string;
  // Concept-specific factual/structural prerequisites. A single-node one
  // gets pre-tested via a "check" step UNLESS verifiedOnLastMind is true
  // (see stripFsrsVerifiedChecks), in which case it's silently trusted and
  // skipped; a multi-node chain always keeps its combined mechanistic_check
  // regardless (tracing the CONNECTION between nodes is the point, not just
  // individual recall, so real history on one node in the middle doesn't
  // make the whole chain's check redundant). Shown so the student can see
  // what's still actually being tested and flag one as shaky ahead of time
  // so it gets actually taught (see the selfReportedUnsureNodeIds path)
  // rather than just failed-then-remediated after the fact.
  groundingKnowledge: EncodingLessonOutlineItem[];
  // General, transferable mechanisms the lesson assumes fluent and
  // recruits directly into the target derivation WITHOUT a separate test
  // (see splitChainsByMechanism) — this is exactly the category where a
  // real gap can otherwise go completely undetected until the lesson is
  // already several steps deep into leaning on it (e.g. a Kc calculation
  // silently assuming the student can already balance the equation it's
  // built on) — flagging one here is the only way to catch that BEFORE
  // the lesson starts leaning on it, since nothing else ever asks.
  recruitedKnowledge: EncodingLessonOutlineItem[];
}

/**
 * Cheap, chain-only lookup (no lesson-content generation) for the
 * pre-lesson outline the frontend shows before a first-time encoding
 * lesson starts — see learn/index.html's outline+self-assessment step.
 * Reuses the SAME cached dependency graph startEncodingLesson itself will
 * read moments later, so the node ids returned here are guaranteed to
 * match whatever startEncodingLesson computes when the student's
 * self-reported unsure ids are passed back to it.
 */
export async function getEncodingLessonOutline(
  userId: string,
  conceptKey: string,
  subject: string,
  topic: string,
  concept: string,
  qualification = '',
  examBoard = '',
  customTitle = '',
  customDescription = ''
): Promise<EncodingLessonOutline> {
  const chainResult = await getOrGenerateChain(conceptKey, subject, topic, concept, qualification, examBoard, customTitle, customDescription);
  if (!chainResult.chain) {
    throw new Error('Could not generate a dependency chain for this concept.');
  }
  const chain = chainResult.chain as Chain;
  const target = chain.nodes[chain.nodes.length - 1];
  const allChains = buildPrerequisiteChains(chain, target);
  const { groundingChains, recruitedMechanismChains } = splitChainsByMechanism(allChains);

  // Same node can legitimately appear in more than one chain (a shared
  // deep ancestor of two direct prerequisites — see buildPrerequisiteChains'
  // own comment) — dedupe here since the student only needs to see and
  // self-assess it once, unlike the lesson-writing prompts which need each
  // chain's own complete, self-contained lineage.
  function toItems(chains: ChainNode[][], reviewedIds: Set<string>): EncodingLessonOutlineItem[] {
    const seen = new Set<string>();
    const items: EncodingLessonOutlineItem[] = [];
    for (const c of chains) {
      for (const n of c) {
        if (seen.has(n.id)) continue;
        seen.add(n.id);
        items.push({ nodeId: n.id, label: n.label, verifiedOnLastMind: reviewedIds.has(n.id) });
      }
    }
    return items;
  }

  // Only groundingKnowledge items are ever individually check-tested (see
  // stripFsrsVerifiedChecks) — recruitedMechanisms never get a separate
  // check step regardless of history, so there's nothing to look up for
  // them; pass an empty set through toItems for that side.
  const groundingIds = new Set(groundingChains.flat().map((n) => n.id));
  const reviewedIds = await getReviewedConceptIds(userId, Array.from(groundingIds));

  return {
    targetLabel: target.label,
    groundingKnowledge: toItems(groundingChains, reviewedIds),
    recruitedKnowledge: toItems(recruitedMechanismChains, new Set()),
  };
}

// Silently skips a single-node "check" step for a prerequisite this user
// already has real concept_reviews history for (see getReviewedConceptIds)
// — real practice evidence is trusted over re-asking a now-redundant
// question, and any future decay gets picked up by that concept's OWN
// spaced-repetition schedule elsewhere, not duplicated here. Deliberately
// does NOT touch "mechanistic_check" steps — those test the CONNECTION
// across an entire multi-node chain, not just recall of one node, so real
// history on one node in the middle doesn't make the whole chain's check
// redundant. Never strips down to zero steps — a cold-cache /start call
// may have only its own single first step to work with at this point, and
// leaving nothing to show would break the lesson rather than just skip one
// trivial question. Lesson CONTENT itself stays untouched and shared
// across every student (see encoding_lesson_content's whole caching
// model) — this filters the per-student RESPONSE only, after the cached
// content has already been read/generated, never what gets written back
// to the cache.
async function stripFsrsVerifiedChecks(userId: string, steps: EncodingStep[], forcedNodeIds: string[]): Promise<EncodingStep[]> {
  const forced = new Set(forcedNodeIds);
  const candidateIds = Array.from(new Set(
    steps.filter((s) => s.type === 'check' && !forced.has(s.diagnosisConceptKey)).map((s) => s.diagnosisConceptKey)
  ));
  if (!candidateIds.length) return steps;
  const reviewed = await getReviewedConceptIds(userId, candidateIds);
  if (!reviewed.size) return steps;
  const filtered = steps.filter((s) => !(s.type === 'check' && reviewed.has(s.diagnosisConceptKey) && !forced.has(s.diagnosisConceptKey)));
  return filtered.length ? filtered : steps;
}

export async function startEncodingLesson(
  userId: string,
  conceptKey: string,
  subject: string,
  topic: string,
  concept: string,
  qualification = '',
  examBoard = '',
  siblingConcepts: SiblingConcept[] = [],
  customTitle = '',
  customDescription = '',
  // Node ids the student themselves flagged as "not confident about" on
  // the pre-lesson outline (see getEncodingLessonOutline) — folded into
  // forceTeach exactly like matchesUnfinishedSibling/technique below.
  // Round-tripped through `state` (not re-derived) so continueEncodingLesson
  // computes the IDENTICAL forcedNodeIds/contentKey phase 1 already used.
  selfReportedUnsureNodeIds: string[] = []
): Promise<EncodingStartResult> {
  const chainResult = await getOrGenerateChain(conceptKey, subject, topic, concept, qualification, examBoard, customTitle, customDescription);
  if (!chainResult.chain) {
    throw new Error('Could not generate a dependency chain for this concept.');
  }
  const chain = chainResult.chain as Chain;

  const target = chain.nodes[chain.nodes.length - 1];
  // Separate linear chains, one per direct prerequisite — see
  // buildPrerequisiteChains. Replaces the old flat "closeNodes" list: each
  // chain gets its OWN combined mechanistic check spanning its whole
  // lineage (see the generation prompts), rather than one isolated
  // single-node check per direct prerequisite. Then split by whether each
  // chain's tip is a general, transferable mechanism (see
  // splitChainsByMechanism) — groundingChains get pre-tested exactly as
  // every chain used to be; recruitedMechanismChains instead get woven
  // into the target derivation's own beats as reasoning tools, never
  // separately tested up front. Computed before the split (not after,
  // as forcedNodeIds below is) since a self-reported-unsure node needs to
  // promote its WHOLE containing chain to groundingChains treatment, not
  // just flag itself for just-in-time teaching within a recruited-
  // mechanism chain it stays inside — see splitChainsByMechanism's
  // promoteIds param.
  const selfReportedUnsureIds = new Set(selfReportedUnsureNodeIds);
  const allChains = buildPrerequisiteChains(chain, target);
  const { groundingChains, recruitedMechanismChains } = splitChainsByMechanism(allChains, selfReportedUnsureIds);
  const chainNodes = allChains.flat();
  const coveredIds = new Set([...chainNodes.map((n) => n.id), target.id]);
  const backgroundNodes = chain.nodes.filter((n) => !coveredIds.has(n.id));

  // A prerequisite node gets force-taught (rather than merely covered by
  // its chain's mechanistic check as assumed prior knowledge) when EITHER
  // it matches one of the student's own not-yet-done sibling pages, OR
  // it's itself a technique node (see ChainNode.technique) — a
  // procedural/computational method, often from a different subject than
  // this lesson's own, that a typical student at this level is unlikely to
  // have already covered just because they're studying THIS subject (e.g.
  // partial derivatives for an Economics MRS lesson). Applied across every
  // node in every chain now, not just the direct-prerequisite tips —
  // folding into the SAME forcedNodeIds array (which also drives
  // contentKey below) means a concept that turns out to have a technique
  // prerequisite anywhere in its lineage automatically gets a fresh,
  // correctly-taught cache entry instead of forever serving whatever got
  // cached before this was recognized. Applies identically whether a node
  // sits in a groundingChain or a recruitedMechanismChain — forceTeach
  // means "actually teach this", independent of whether it also gets a
  // dedicated check step. A student's own "I'm not confident about this"
  // flag from the pre-lesson outline counts exactly the same way — it's
  // just as valid a signal that a node needs actual teaching as an
  // unfinished sibling page or a technique flag, and the AI-generated
  // dependency graph's own classification (grounding vs recruited
  // mechanism) can always be wrong for THIS specific student regardless of
  // what it's usually safe to assume. (selfReportedUnsureIds itself was
  // already computed above, before the split, so it can promote whole
  // chains — reused here as-is.)
  // A genuinely first-ever lesson in this subject (no target-level review
  // exists for anything in it yet) has no earlier course any prerequisite
  // could plausibly have come from — "usually assumed prior knowledge,
  // only verify it" is simply the wrong default here. Force-teach every
  // grounding node in that case, same mechanism as an unfinished-sibling
  // or technique match, just triggered subject-wide instead of node-by-
  // node. Must stay computed IDENTICALLY to the other call site (see the
  // comment above this function) so contentKey agrees across phase 1/2.
  // Reported bug this fixes: a first Chemistry lesson on "structure of
  // the atom" pre-testing "the nucleus" as if it were separate prior
  // knowledge, when there's no prior Chemistry lesson it could be from.
  const isFirstEverLessonInSubject = !(await hasAnySubjectHistory(userId, subject));
  const forcedNodeIds = chainNodes
    .filter(
      (n) =>
        isFirstEverLessonInSubject ||
        matchesUnfinishedSibling(n.label, siblingConcepts) ||
        !!n.technique ||
        selfReportedUnsureIds.has(n.id)
    )
    .map((n) => n.id)
    .sort();

  const customDigest = customContextDigest(customTitle, customDescription);
  const customSuffix = customDigest ? `::custom_${customDigest}` : '';
  const contentKey = forcedNodeIds.length
    ? `${conceptKey}::${clean(qualification)}::${clean(examBoard)}${customSuffix}::forced_${forcedNodeIds.join('_')}`
    : `${conceptKey}::${clean(qualification)}::${clean(examBoard)}${customSuffix}`;

  const { data: cachedContent, error: cacheError } = LESSON_CACHE_REUSE_ENABLED
    ? await supabaseAdmin
        .from('encoding_lesson_content')
        .select('hook_fact, steps')
        .eq('content_key', contentKey)
        .maybeSingle()
    : { data: null, error: null };

  let hookFact: string;
  let cachedSteps: CachedEncodingStep[];
  let contentReady: boolean;

  if (!cacheError && cachedContent) {
    hookFact = cachedContent.hook_fact;
    cachedSteps = cachedContent.steps as CachedEncodingStep[];
    contentReady = true;
  } else {
    // Cold cache — generate ONLY the first step (fast) so the student sees
    // a question immediately instead of waiting for the whole lesson.
    // Stash the full draft (including expectedSolution, if any) server-side
    // in encoding_lesson_pending, keyed by the same contentKey — the
    // background /encoding-lesson/continue call reads it back to assemble
    // and cache the complete lesson once phase 2 finishes. Never sent to
    // the client in between (see CachedEncodingStep).
    const generated = await generateFirstStep(
      conceptKey, subject, topic, concept, qualification, examBoard, chain, target, groundingChains, recruitedMechanismChains, backgroundNodes, forcedNodeIds, customTitle, customDescription
    );
    hookFact = generated.hookFact;
    cachedSteps = [generated.step];
    contentReady = false;
    // Must fail loudly here, not silently — if this write doesn't land,
    // /encoding-lesson/continue has nothing to read later and fails with a
    // confusing "no pending generation found" only once the student has
    // already answered the first step, instead of right now while it's
    // still obviously a /start problem.
    const { error: pendingInsertError } = await supabaseAdmin
      .from('encoding_lesson_pending')
      .upsert({ content_key: contentKey, hook_fact: hookFact, first_step: generated.step });
    if (pendingInsertError) {
      console.error('LastMind: failed to stash pending lesson generation.', pendingInsertError);
      throw pendingInsertError;
    }
  }

  if (!cachedSteps.length) {
    throw new Error('Could not generate lesson content for this concept.');
  }

  // Strip expectedSolution — the client holds and round-trips `state`
  // wholesale on every submit, so anything in here is visible in the
  // network response. Grading re-fetches the cache row by contentKey
  // instead (see submitEncodingAnswer).
  const rawSteps: EncodingStep[] = cachedSteps.map(({ expectedSolution, ...step }) => step);
  const steps = await stripFsrsVerifiedChecks(userId, rawSteps, forcedNodeIds);

  const state: EncodingLessonState = { conceptKey, subject, topic, siblingConcepts, steps, currentIndex: 0, coreStepScores: [], contentKey, qualification, examBoard, customTitle, customDescription, selfReportedUnsureNodeIds };
  return { done: false, hookFact, step: steps[0], state, contentReady };
}

/**
 * Phase 2 of a cold-cache lesson start (see startEncodingLesson above) —
 * fired by the frontend in the background as soon as the first step from
 * /encoding-lesson/start has rendered. Generates every remaining step,
 * given the already-generated first step as established context so it
 * continues the lesson rather than repeating its opening, assembles the
 * complete lesson, and caches it under the SAME contentKey so every later
 * student for this exact concept gets an ordinary single-call cache hit
 * from startEncodingLesson — this split only ever runs once per concept.
 *
 * Recomputes the chain/closeNodes/backgroundNodes/forcedNodeIds fresh
 * (cheap — the chain itself is already cached from the /start call that
 * preceded this one) rather than trusting anything client-supplied for
 * them, same as startEncodingLesson itself does.
 */
export async function continueEncodingLesson(
  userId: string,
  state: EncodingLessonState,
  topic: string,
  concept: string,
  siblingConcepts: SiblingConcept[] = []
): Promise<EncodingLessonState> {
  const { conceptKey, subject, qualification, examBoard, contentKey, customTitle = '', customDescription = '', selfReportedUnsureNodeIds = [] } = state;

  // Another concurrent cold-cache request for this exact concept may have
  // already finished and cached the full lesson — adopt it rather than
  // generating a second, redundant copy. Gated behind LESSON_CACHE_REUSE_ENABLED
  // for the same reason as startEncodingLesson's own read: while it's off,
  // this must not become a back door for adopting an OLD row from some
  // earlier, unrelated student's lesson (which is exactly the cross-student
  // reuse the flag exists to prevent) — only a genuinely concurrent request
  // would ever produce a same-key row in the first place, and while the
  // flag is off it's fine to just pay for a rare duplicate generation
  // instead of risking that.
  const { data: existing, error: existingError } = LESSON_CACHE_REUSE_ENABLED
    ? await supabaseAdmin
        .from('encoding_lesson_content')
        .select('steps')
        .eq('content_key', contentKey)
        .maybeSingle()
    : { data: null, error: null };
  if (!existingError && existing) {
    // forcedNodeIds isn't recomputed on this early-return path, but that's
    // fine here specifically: contentKey itself already encodes the exact
    // forced-node set (see startEncodingLesson's own contentKey), so any
    // forced node is already baked into `existing.steps` as a teach beat,
    // never a "check" step for its own diagnosisConceptKey — there's
    // nothing for an empty forced-set to wrongly strip.
    const rawSteps: EncodingStep[] = (existing.steps as CachedEncodingStep[]).map(({ expectedSolution, ...s }) => s);
    const steps = await stripFsrsVerifiedChecks(userId, rawSteps, []);
    return { ...state, steps };
  }

  const { data: pending, error: pendingError } = await supabaseAdmin
    .from('encoding_lesson_pending')
    .select('hook_fact, first_step')
    .eq('content_key', contentKey)
    .maybeSingle();
  if (pendingError || !pending) {
    throw new Error('No pending lesson generation found to continue — the lesson may need to be restarted.');
  }
  const firstStep = pending.first_step as CachedEncodingStep;

  const chainResult = await getOrGenerateChain(conceptKey, subject, topic, concept, qualification, examBoard, customTitle, customDescription);
  if (!chainResult.chain) {
    throw new Error('Could not generate a dependency chain for this concept.');
  }
  const chain = chainResult.chain as Chain;
  const target = chain.nodes[chain.nodes.length - 1];
  // Recomputed identically to startEncodingLesson's own call — same chain,
  // same target, same deterministic traversal — so this lands on the exact
  // same groundingChains/recruitedMechanismChains/forcedNodeIds/contentKey
  // the /start call used. selfReportedUnsureIds is computed before the
  // split (not after) so it can promote a self-reported-unsure node's WHOLE
  // containing chain to groundingChains treatment — see
  // splitChainsByMechanism's promoteIds param.
  const selfReportedUnsureIds = new Set(selfReportedUnsureNodeIds);
  const allChains = buildPrerequisiteChains(chain, target);
  const { groundingChains, recruitedMechanismChains } = splitChainsByMechanism(allChains, selfReportedUnsureIds);
  const chainNodes = allChains.flat();
  const coveredIds = new Set([...chainNodes.map((n) => n.id), target.id]);
  const backgroundNodes = chain.nodes.filter((n) => !coveredIds.has(n.id));
  // A genuinely first-ever lesson in this subject (no target-level review
  // exists for anything in it yet) has no earlier course any prerequisite
  // could plausibly have come from — "usually assumed prior knowledge,
  // only verify it" is simply the wrong default here. Force-teach every
  // grounding node in that case, same mechanism as an unfinished-sibling
  // or technique match, just triggered subject-wide instead of node-by-
  // node. Must stay computed IDENTICALLY to the other call site (see the
  // comment above this function) so contentKey agrees across phase 1/2.
  // Reported bug this fixes: a first Chemistry lesson on "structure of
  // the atom" pre-testing "the nucleus" as if it were separate prior
  // knowledge, when there's no prior Chemistry lesson it could be from.
  const isFirstEverLessonInSubject = !(await hasAnySubjectHistory(userId, subject));
  const forcedNodeIds = chainNodes
    .filter(
      (n) =>
        isFirstEverLessonInSubject ||
        matchesUnfinishedSibling(n.label, siblingConcepts) ||
        !!n.technique ||
        selfReportedUnsureIds.has(n.id)
    )
    .map((n) => n.id)
    .sort();

  const rest = await generateLessonContinuation(
    conceptKey, subject, topic, concept, qualification, examBoard, chain, target, groundingChains, recruitedMechanismChains, backgroundNodes, forcedNodeIds, firstStep, customTitle, customDescription
  );

  const allSteps: CachedEncodingStep[] = [firstStep, ...rest.steps];
  // Logged loudly, not thrown — this student already has their complete
  // step list in hand regardless of whether the cache write lands, so
  // failing the request here would break an otherwise-successful lesson
  // over what's purely a caching concern. But a silent failure here means
  // EVERY future student for this concept pays full generation cost again
  // too, forever, with nothing in the logs to explain why the cache never
  // seems to warm up — worth a loud error, not a swallowed one.
  //
  // upsert, not insert: this write must always succeed even when
  // LESSON_CACHE_REUSE_ENABLED is off and an earlier (now-superseded)
  // generation already occupies this exact content_key — fetchExpectedSolution
  // needs THIS lesson's own freshly-generated steps sitting under this key
  // for calculation-step grading to work, and a plain insert would throw a
  // duplicate-key error in that situation instead of overwriting it.
  const { error: contentInsertError } = await supabaseAdmin
    .from('encoding_lesson_content')
    .upsert({ content_key: contentKey, hook_fact: pending.hook_fact, steps: allSteps }, { onConflict: 'content_key' });
  if (contentInsertError) {
    console.error('LastMind: failed to cache completed lesson content — this concept will keep regenerating from scratch until this is fixed.', contentInsertError);
  }
  await supabaseAdmin.from('encoding_lesson_pending').delete().eq('content_key', contentKey);

  const rawSteps: EncodingStep[] = allSteps.map(({ expectedSolution, ...s }) => s);
  const steps = await stripFsrsVerifiedChecks(userId, rawSteps, forcedNodeIds);
  return { ...state, steps };
}

// Phase 1 of the two-phase cold-cache path — see startEncodingLesson and
// continueEncodingLesson above. Generates just the hook fact and the first
// step, small and fast, so the student has something on screen well before
// the rest of the lesson (generated by generateLessonContinuation) is
// ready.
async function generateFirstStep(
  conceptKey: string,
  subject: string,
  topic: string,
  concept: string,
  qualification: string,
  examBoard: string,
  chain: Chain,
  target: ChainNode,
  groundingChains: ChainNode[][],
  recruitedMechanismChains: ChainNode[][],
  backgroundNodes: ChainNode[],
  forcedNodeIds: string[],
  customTitle = '',
  customDescription = ''
): Promise<{ hookFact: string; step: CachedEncodingStep }> {
  const forcedIds = new Set(forcedNodeIds);
  const serializeChains = (chains: ChainNode[][]) => chains.map((c) => c.map((n) => ({ nodeId: n.id, label: n.label, forceTeach: forcedIds.has(n.id) })));
  const serializedGroundingChains = serializeChains(groundingChains);
  const serializedRecruitedMechanisms = serializeChains(recruitedMechanismChains);

  const result = await callJSON<{
    hookFact: string;
    step: {
      nodeId: string;
      type: EncodingStepType;
      text: string;
      checkQuestion?: string;
      requiresCalculation?: boolean;
      expectedSolution?: string;
    };
  }>(
    ENCODING_LESSON_FIRST_STEP_PROMPT,
    [
      `Subject: ${subject}`,
      `Topic: ${topic || 'unspecified'}`,
      `Qualification: ${qualification || 'unspecified'}`,
      `Exam board: ${examBoard || 'unspecified'}`,
      `Original lesson title, exactly as the student named it: ${concept}`,
      `groundingChains — concept-specific factual/structural prerequisites, a list of SEPARATE linear chains, each ordered foundational-first ending at that chain's own direct prerequisite of the target: ${JSON.stringify(serializedGroundingChains)}`,
      `recruitedMechanisms — general, transferable mechanisms/principles the target concept's own derivation will recruit as reasoning tools (NOT pre-tested here), same chain shape: ${JSON.stringify(serializedRecruitedMechanisms)}`,
      `backgroundContext (already covered earlier — reference only, do not test, do not write a step): ${JSON.stringify(backgroundNodes.map((n) => ({ nodeId: n.id, label: n.label })))}`,
      ...(customDescription
        ? [
            `Custom self-directed topic — not a formal qualification: "${customTitle}"`,
            `Student's own description of what they want to learn: ${customDescription}`,
            `THEORY ONLY — see the system prompt's custom-topic rule: teach the objective, established underlying theory only, never personal advice or a recommendation for the student's own situation.`,
          ]
        : []),
    ].join('\n'),
    MODELS.diagnosticTree,
    0.4,
    // Small on purpose — this is one step + a hook fact, not a whole
    // lesson; keeping the call itself lightweight is most of the latency
    // win here.
    2048,
    // ENCODING_LESSON_FIRST_STEP_PROMPT is fixed and identical for every
    // concept that ever hits this path — same caching win as the full
    // batch prompt.
    true
  );

  const nodesById = new Map(chain.nodes.map((n) => [n.id, n]));
  const s = result.step;
  const draftStep: DraftStep = {
    nodeId: s.nodeId,
    label: nodesById.get(s.nodeId)?.label || s.nodeId,
    type: s.type,
    text: s.text,
    checkQuestion: s.checkQuestion,
    diagnosisConceptKey: s.nodeId === target.id ? conceptKey : s.nodeId,
    requiresCalculation: !!s.requiresCalculation,
    expectedSolution: s.requiresCalculation ? s.expectedSolution : undefined,
  };
  attachChainNodes([draftStep], groundingChains);

  await repairUncertainSteps([draftStep], subject, qualification, examBoard);

  return { hookFact: result.hookFact, step: draftStep };
}

// Phase 2 — generates every step after the one generateFirstStep already
// produced, told exactly what that first step covered so it continues
// rather than repeats it. Only ever called from continueEncodingLesson.
async function generateLessonContinuation(
  conceptKey: string,
  subject: string,
  topic: string,
  concept: string,
  qualification: string,
  examBoard: string,
  chain: Chain,
  target: ChainNode,
  groundingChains: ChainNode[][],
  recruitedMechanismChains: ChainNode[][],
  backgroundNodes: ChainNode[],
  forcedNodeIds: string[],
  firstStep: CachedEncodingStep,
  customTitle = '',
  customDescription = ''
): Promise<{ steps: CachedEncodingStep[] }> {
  const targetDerivable = resolveDerivable(target);
  const forcedIds = new Set(forcedNodeIds);
  const serializeChains = (chains: ChainNode[][]) => chains.map((c) => c.map((n) => ({ nodeId: n.id, label: n.label, forceTeach: forcedIds.has(n.id) })));
  const serializedGroundingChains = serializeChains(groundingChains);
  const serializedRecruitedMechanisms = serializeChains(recruitedMechanismChains);

  const batch = await callJSON<{
    steps: {
      nodeId: string;
      type: EncodingStepType;
      text: string;
      checkQuestion?: string;
      requiresCalculation?: boolean;
      expectedSolution?: string;
    }[];
    diagram?: { needed: boolean; searchQuery: string | null; forNodeId?: string | null };
  }>(
    ENCODING_LESSON_CONTINUATION_PROMPT,
    [
      `Subject: ${subject}`,
      `Topic: ${topic || 'unspecified'}`,
      `Qualification: ${qualification || 'unspecified'}`,
      `Exam board: ${examBoard || 'unspecified'}`,
      `Target concept (this exact lesson — every step must build toward THIS, not a related or more general concept): ${target?.label || concept}`,
      `Original lesson title, exactly as the student named it: ${concept}`,
      `Target concept is derivable from its close prerequisites: ${targetDerivable}`,
      `groundingChains — concept-specific factual/structural prerequisites, a list of SEPARATE linear chains, each ordered foundational-first ending at that chain's own direct prerequisite of the target: ${JSON.stringify(serializedGroundingChains)}`,
      `recruitedMechanisms — general, transferable mechanisms/principles the target concept's own derivation should recruit as reasoning tools (NOT pre-tested — no check/mechanistic_check step for these), same chain shape: ${JSON.stringify(serializedRecruitedMechanisms)}`,
      `backgroundContext (already covered earlier — reference only, do not test, do not write a step): ${JSON.stringify(backgroundNodes.map((n) => ({ nodeId: n.id, label: n.label })))}`,
      `First step already generated and shown to (and answered by) the student — do not repeat it: ${JSON.stringify({ nodeId: firstStep.nodeId, type: firstStep.type, text: firstStep.text, checkQuestion: firstStep.checkQuestion })}`,
      ...(customDescription
        ? [
            `Custom self-directed topic — not a formal qualification: "${customTitle}"`,
            `Student's own description of what they want to learn: ${customDescription}`,
            `THEORY ONLY — see the system prompt's custom-topic rule: teach the objective, established underlying theory only, never personal advice or a recommendation for the student's own situation.`,
          ]
        : []),
    ].join('\n'),
    MODELS.diagnosticTree,
    0.4,
    8192,
    // ENCODING_LESSON_CONTINUATION_PROMPT is fixed too — same caching win.
    true
  );

  const nodesById = new Map(chain.nodes.map((n) => [n.id, n]));
  const draftSteps: DraftStep[] = (batch.steps || []).map((s) => ({
    nodeId: s.nodeId,
    label: nodesById.get(s.nodeId)?.label || (s.type === 'implication' ? `${target.label} — implications` : s.nodeId),
    type: s.type,
    text: s.text,
    checkQuestion: s.checkQuestion,
    diagnosisConceptKey: s.nodeId === target.id || s.type === 'implication' ? conceptKey : s.nodeId,
    requiresCalculation: !!s.requiresCalculation,
    expectedSolution: s.requiresCalculation ? s.expectedSolution : undefined,
  }));
  attachChainNodes(draftSteps, groundingChains);

  // "forNodeId" lets the diagram ground a STRUCTURAL/GROUNDING prerequisite
  // instead of always the target concept itself — see
  // ENCODING_LESSON_CONTINUATION_PROMPT's subject-dependent grounding rule:
  // for a subject where seeing what a structure actually looks like is what
  // makes the reasoning click (biology, anatomy, circuit diagrams), the
  // diagram is far more useful anchoring the grounding step that names and
  // locates that structure than illustrating the fully-derived target at
  // the very end. Falls back to the target itself when omitted/unmatched —
  // exactly today's behavior for subjects where that's still the right call.
  const diagramForNode = batch.diagram?.forNodeId ? nodesById.get(batch.diagram.forNodeId) : null;
  const diagramLabel = diagramForNode?.label || target.label;

  const diagramPromise =
    batch.diagram?.needed && batch.diagram.searchQuery
      ? withTimeout(
          getOrFetchDiagram(conceptKey, qualification, examBoard, subject, diagramLabel, batch.diagram.searchQuery).catch((err) => {
            console.error('LastMind: diagram lookup failed, proceeding without one.', err);
            return null;
          }),
          DIAGRAM_LOOKUP_TIMEOUT_MS
        )
      : Promise.resolve(null);

  const [, diagram] = await Promise.all([
    repairUncertainSteps(draftSteps, subject, qualification, examBoard),
    diagramPromise,
  ]);

  const steps: CachedEncodingStep[] = draftSteps;

  if (diagram) {
    const diagramNodeId = diagramForNode ? diagramForNode.id : target.id;
    // When the diagram illustrates the TARGET itself (the common,
    // no-forNodeId case), any step actually ABOUT the target counts as a
    // candidate — scene/derive/explain/implication beats all share the
    // target's own diagnosisConceptKey (see the draftSteps mapping
    // above), not just whichever one literally carries the target's raw
    // nodeId. An implication step, for instance, has a synthetic nodeId
    // of its own but is still squarely about the target — excluding it
    // here was silently throwing away a genuine hookup point most
    // lessons for a well-formed target actually still have.
    const candidateSteps = diagramForNode
      ? steps.filter((s) => s.nodeId === diagramNodeId)
      : steps.filter((s) => s.diagnosisConceptKey === conceptKey);
    const teachingBeats = candidateSteps.filter((s) => s.type === 'derive' || s.type === 'explain');
    const preferred = teachingBeats.length ? teachingBeats : candidateSteps;
    const chosenStep = preferred[preferred.length - 1];
    if (chosenStep) {
      chosenStep.diagram = diagram;
    } else {
      // Nothing in THIS call's own steps qualifies — the target's only
      // teaching beat was the very FIRST step, generated in phase 1
      // before this diagram decision even existed. Can't retroactively
      // patch what's already been sent to and rendered for THIS
      // student this run, but firstStep is the same object reference
      // continueEncodingLesson prepends when assembling the full,
      // CACHED step list — attaching here means every later student
      // hitting this concept from cache sees the diagram correctly,
      // instead of it being silently dropped every single time.
      const firstStepMatches = diagramForNode ? firstStep.nodeId === diagramNodeId : firstStep.diagnosisConceptKey === conceptKey;
      if (firstStepMatches) firstStep.diagram = diagram;
    }
  }

  return { steps };
}

// Re-fetches a calculation step's verified solution from the content
// cache — never round-tripped through the client (see CachedEncodingStep).
// Used both at grading time (below) and by the math error-localization
// diagnostic entry (diagnosticOrchestrator.ts's startMathDiagnosis), which
// needs the same ground truth to find where a student's working actually
// went wrong. null on any miss (cache row gone/changed since the lesson
// started, or the step somehow has none) — callers fall back rather than
// failing outright.
export async function fetchExpectedSolution(contentKey: string, stepIndex: number): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('encoding_lesson_content')
    .select('steps')
    .eq('content_key', contentKey)
    .maybeSingle();
  if (error || !data) return null;
  const cachedSteps = data.steps as CachedEncodingStep[];
  return cachedSteps[stepIndex]?.expectedSolution || null;
}

/**
 * Advances the lesson by one step. ALWAYS advances, regardless of the
 * answer's quality — this is a first-exposure lesson, not a gate, and a
 * student who gets stuck re-litigating one step with an AI grader can't
 * actually finish the lesson. Every step type is graded (one combined
 * call for verdict + feedback) — "check"/"scene"/"derive"/"implication"
 * against the prompt text itself, "explain" against its checkQuestion
 * (this is brand-new content with nothing for FSRS to have already
 * confirmed, so this is the only check that a thin/misunderstood
 * explanation doesn't silently become the shaky foundation for later
 * steps). The verdict only affects: (a) the feedback shown alongside that
 * step, and (b) the FSRS grade recorded for the whole concept once the
 * lesson finishes — any weak step drops the whole lesson to a lower grade,
 * which is exactly what surfaces it sooner in future spaced-repetition
 * sessions, rather than blocking progress now.
 */
export async function submitEncodingAnswer(userId: string, state: EncodingLessonState, answer: string, dontKnow = false, bypass = false): Promise<EncodingSubmitResult> {
  const currentStep = state.steps[state.currentIndex];
  if (!currentStep) {
    return { done: true, state };
  }

  // "I don't know" is an unambiguous verdict — skip the grading call
  // entirely (real cost saved every time this is used) rather than asking
  // Claude to grade an empty/absent answer.
  let correct: boolean;
  let feedback: string | null;
  // Only ever set by the two free-text grading paths below (mechanistic_check
  // and the ordinary path) — see ENCODING_ANSWER_CHECK_PROMPT/
  // MECHANISTIC_CHECK_ANSWER_PROMPT's own "misread" rules. Not attempted
  // for calculation steps (a precise numeric target is far less prone to
  // this specific failure, and ENCODING_MATH_ANSWER_CHECK_PROMPT already
  // grades against verified ground truth) or "I don't know" (unambiguous).
  let misread = false;
  // Same scope as `misread` above (the two free-text grading paths only) —
  // see ENCODING_ANSWER_CHECK_PROMPT/MECHANISTIC_CHECK_ANSWER_PROMPT's own
  // "partiallyUnderstood" rules. Deliberately left at its default for
  // calculation/bypass/"I don't know" answers — "explain what's missing"
  // doesn't map onto a numeric answer, and there's no real explanation to
  // give feedback on in the other two.
  let partiallyUnderstood = false;
  const gradingPrompt = currentStep.type === 'explain' ? (currentStep.checkQuestion || currentStep.text) : currentStep.text;
  const isCoreStep = currentStep.diagnosisConceptKey === state.conceptKey;

  // The student-facing "skip this — the question or grading itself seems
  // broken" escape hatch (see routes/encodingLesson.ts). Deliberately
  // treated as a clean pass, not a wrong answer or a no-op: this exists
  // specifically for cases like a genuine false-negative grading verdict,
  // where marking it wrong would be actively incorrect, and skipping the
  // grading call entirely means a broken/stuck question can't loop the
  // student forever waiting on a call that keeps getting it wrong.
  if (bypass) {
    correct = true;
    feedback = null;
  } else if (dontKnow) {
    correct = false;
    feedback = null;
  } else if (currentStep.requiresCalculation) {
    // Ground-truth-backed grading — the generation step already verified
    // this has a clean, correct solution (see ENCODING_LESSON_BATCH_PROMPT
    // rule 1c); check the student's own working against it rather than
    // judging plausibility alone. Sonnet, not Haiku, here specifically —
    // reliably judging numeric/algebraic equivalence is worth the step up.
    const expectedSolution = await fetchExpectedSolution(state.contentKey, state.currentIndex);
    if (expectedSolution) {
      const check = await callJSON<{ correct: boolean; feedback: string | null }>(
        ENCODING_MATH_ANSWER_CHECK_PROMPT,
        `Qualification: ${state.qualification || 'unspecified'}\nExam board: ${state.examBoard || 'unspecified'}\nConcept/step: ${currentStep.label}\nQuestion: ${gradingPrompt}\nVerified correct solution (reference only, never shown to the student): ${expectedSolution}\nStudent's working: ${answer}`,
        MODELS.diagnosticTree,
        0.1,
        4096,
        // Now well over Sonnet 5's ~1024-token cache minimum after adding
        // worked calibration examples (see the prompt's own comment) —
        // this system prompt is byte-identical across every grading call
        // app-wide, so it stays warm from ANY concurrent student's calls,
        // not just repeats of the same concept.
        true
      );
      correct = check.correct;
      feedback = check.feedback;
    } else {
      // Cache row gone/changed since this lesson started — fall back to
      // grading without ground truth rather than failing the submission.
      console.error('LastMind: expectedSolution missing for a calculation step, falling back to ungrounded grading.', { contentKey: state.contentKey, stepIndex: state.currentIndex });
      const check = await callJSON<{ correct: boolean; feedback: string | null }>(
        ENCODING_ANSWER_CHECK_PROMPT,
        `Concept/step: ${currentStep.label}\nPrompt: ${gradingPrompt}\nStudent's answer: ${answer}`,
        MODELS.simpleQuestion,
        0.2,
        4096,
        true
      );
      correct = check.correct;
      feedback = check.feedback;
    }
  } else if (currentStep.type === 'mechanistic_check') {
    // Deliberately pedantic (see MECHANISTIC_CHECK_ANSWER_PROMPT) — this
    // step exists specifically to catch pattern-matched/memorized answers
    // an ordinary generous check would let through, and to require jargon
    // be explained relative to the qualification level. diagnosticTree,
    // not simpleQuestion, here — that calibration judgment call is worth
    // the step up, same reasoning as the calculation-grading path above.
    const check = await callJSON<{ correct: boolean; misread?: boolean; partiallyUnderstood?: boolean; feedback: string | null }>(
      MECHANISTIC_CHECK_ANSWER_PROMPT,
      `Qualification: ${state.qualification || 'unspecified'}\nExam board: ${state.examBoard || 'unspecified'}\nConcept/step: ${currentStep.label}\nPrompt: ${gradingPrompt}\nStudent's answer: ${answer}`,
      MODELS.diagnosticTree,
      0.2,
      undefined,
      true
    );
    correct = check.correct;
    feedback = check.feedback;
    misread = !!check.misread;
    partiallyUnderstood = !!check.partiallyUnderstood;
  } else {
    const check = await callJSON<{ correct: boolean; misread?: boolean; partiallyUnderstood?: boolean; feedback: string | null }>(
      ENCODING_ANSWER_CHECK_PROMPT,
      `Concept/step: ${currentStep.label}\nPrompt: ${gradingPrompt}\nStudent's answer: ${answer}`,
      MODELS.simpleQuestion,
      0.2,
      undefined,
      true
    );
    correct = check.correct;
    feedback = check.feedback;
    misread = !!check.misread;
    partiallyUnderstood = !!check.partiallyUnderstood;
  }

  // Cap at exactly one reword attempt per step — see EncodingLessonState's
  // own comment on reframedStepIndex. A misread verdict on the RETRY of an
  // already-reworded step falls straight through to normal wrong-answer
  // handling below instead of rewording again.
  if (misread && state.reframedStepIndex !== state.currentIndex) {
    const isExplain = currentStep.type === 'explain';
    const reword = await callJSON<{ question: string }>(
      EXPLICIT_QUESTION_PROMPT,
      `Original question (${isExplain ? '"checkQuestion" field — the explanatory "text" stays untouched' : '"text" field'}): ${gradingPrompt}\nStudent's answer (shows what they thought was being asked): ${answer}`,
      MODELS.diagnosticTree,
      0.3,
      undefined,
      true
    );
    const rewordedStep: EncodingStep = isExplain
      ? { ...currentStep, checkQuestion: reword.question }
      : { ...currentStep, text: reword.question };
    const rewordedState: EncodingLessonState = {
      ...state,
      reframedStepIndex: state.currentIndex,
    };
    return { done: false, step: rewordedStep, state: rewordedState, misread: true };
  }

  // Cap at exactly one re-explain attempt per step — see
  // EncodingLessonState's own comment on partialReattemptStepIndex. The
  // student showed genuine partial understanding, so `feedback` reflects
  // back what landed and re-serves the SAME step once more for exactly the
  // missing piece, rather than this counting as a full wrong answer yet. A
  // student who still can't complete it on this retry falls through to
  // normal wrong-answer handling below — that's where the diagnostic
  // drill-down takes over.
  if (!correct && !misread && partiallyUnderstood && state.partialReattemptStepIndex !== state.currentIndex) {
    const reattemptState: EncodingLessonState = {
      ...state,
      partialReattemptStepIndex: state.currentIndex,
    };
    return { done: false, step: currentStep, state: reattemptState, feedback, partialFollowUp: true };
  }

  // Prerequisite/other-concept steps get their OWN independent FSRS grade
  // right here, at the exact point THEIR OWN correctness is finally known
  // — see EncodingLessonState's own comment on why this replaced folding
  // their wrongness into the target's aggregate (a single unrelated
  // prerequisite slip no longer drags the TARGET's own rating down, and
  // that prerequisite now gets a real concept_reviews history of its own
  // instead of never being individually recorded at all). Never for the
  // target itself (that's the single aggregate grade below, computed once
  // per lesson) and never for a bypassed step — bypass means "the
  // question/grading itself seemed broken", not genuine evidence about
  // what the student actually knows of that concept.
  if (!isCoreStep && !bypass) {
    await gradeAndRecordReview(userId, currentStep.diagnosisConceptKey, correct ? 'good' : 'again');
  }

  // A mechanistic_check step's whole point is tracing through a chain of
  // 2-3 nodes, not just landing on the tip — so alongside the tip's own
  // grade above, also grade each CONSECUTIVE EDGE in that traced chain.
  // Each node resolves to the student's own page for that concept when one
  // exists (Phase 0's resolveSiblingConceptId), same canonical id-space
  // Phase B's interleaving edges resolve into — so the SAME real link
  // tested either way accumulates in the SAME concept_reviews row. v1
  // grades every edge the same way as the overall verdict — no attempt to
  // localize which specific link broke on a wrong answer.
  if (!bypass && currentStep.type === 'mechanistic_check' && currentStep.chainNodes && currentStep.chainNodes.length >= 2) {
    const resolvedIds = currentStep.chainNodes.map(
      (n) => resolveSiblingConceptId(n.label, state.subject, state.topic, state.siblingConcepts) || n.id
    );
    const edgeGrades: Promise<unknown>[] = [];
    for (let i = 0; i < resolvedIds.length - 1; i++) {
      edgeGrades.push(gradeAndRecordReview(userId, `${resolvedIds[i]}->${resolvedIds[i + 1]}`, correct ? 'good' : 'again'));
    }
    await Promise.all(edgeGrades);
  }

  const nextIndex = state.currentIndex + 1;
  // Score THIS core step's final resolution now (never on the earlier
  // reword/reattempt returns above, which aren't final yet) — 1 clean,
  // 0.5 correct-only-after-a-retry, 0 wrong even after that retry. A step
  // "needed a retry" if it's the same index a reword or partial-reattempt
  // was already served for (reframedStepIndex/partialReattemptStepIndex
  // both still equal state.currentIndex on the retry submission itself).
  let coreStepScores = state.coreStepScores;
  if (isCoreStep) {
    const hadRetry = state.reframedStepIndex === state.currentIndex || state.partialReattemptStepIndex === state.currentIndex;
    const score = !correct ? 0 : hadRetry ? 0.5 : 1;
    coreStepScores = [...state.coreStepScores, score];
  }
  const nextState: EncodingLessonState = { ...state, currentIndex: nextIndex, coreStepScores };

  if (nextIndex >= state.steps.length) {
    // Skipped if a scene/derive/explain diagnostic drill-down already
    // graded this exact conceptKey mid-lesson (see
    // targetGradedViaDrillDown) — otherwise the concept gets FSRS-graded
    // twice in one session, artificially inflating its stability. Also
    // skipped in the (rare) case every core step somehow got bypassed —
    // nothing real to average, so nothing to grade rather than dividing by
    // zero or guessing.
    let fsrsUpdate: FsrsUpdateSummary | undefined;
    if (!state.targetGradedViaDrillDown && coreStepScores.length) {
      // Scoped ENTIRELY to the target's own performance — a wrong
      // prerequisite check elsewhere in the lesson never factors in here
      // (it already got its own dedicated grade above, on its own
      // concept_id). Proportional across every core step rather than "any
      // single one wrong forces Again" — a multi-step derivation with one
      // rough moment amid otherwise-clean steps is genuinely different
      // evidence than a lesson that was wrong throughout, and this reduces
      // to exactly the old behavior for a lesson with only one core step.
      // First-time encoding lessons still never emit "easy" — that's
      // reserved for the lightest retrieval tier, where a genuinely
      // comfortable pass is a meaningful signal rather than a guess.
      const index = coreStepScores.reduce((sum, s) => sum + s, 0) / coreStepScores.length;
      const rating: FsrsRatingKey = index >= 0.8 ? 'good' : index >= 0.5 ? 'hard' : 'again';
      const { previousRow, newState: fsrsRow } = await gradeAndRecordReview(userId, state.conceptKey, rating);
      fsrsUpdate = {
        rating,
        previous: previousRow
          ? { stability: previousRow.stability, difficulty: previousRow.difficulty, due: previousRow.due, reps: previousRow.reps, lapses: previousRow.lapses, state: previousRow.state }
          : null,
        updated: {
          stability: fsrsRow.stability,
          difficulty: fsrsRow.difficulty,
          due: fsrsRow.due,
          reps: fsrsRow.reps,
          lapses: fsrsRow.lapses,
          state: fsrsRow.state,
          scheduledDays: fsrsRow.scheduled_days,
          elapsedDays: fsrsRow.elapsed_days,
        },
      };
    }
    return { done: true, correct, feedback, state: nextState, fsrsUpdate };
  }

  return { done: false, correct, feedback, step: state.steps[nextIndex], state: nextState };
}

/**
 * Compiles a just-completed encoding lesson's transcript (hook fact +
 * every step's taught content) into standalone plain-text revision notes
 * for the page. Student-facing, opt-in (a checkbox at lesson completion)
 * — not cached, since it runs once per student per page, not once per
 * concept. Deliberately built from the LESSON CONTENT (what was actually
 * taught/derived), not from the student's own submitted answers — the
 * point is accurate notes to revise from, not a transcript of whatever
 * they happened to type.
 */
export interface NotesLessonInput {
  concept: string;
  hookFact: string;
  steps: Pick<EncodingStep, 'label' | 'type' | 'text' | 'checkQuestion'>[];
}

export async function generateNotesFromLesson(
  subject: string,
  pageTitle: string,
  lessons: NotesLessonInput[]
): Promise<string> {
  const raw = await callClaudeJSON({
    model: MODELS.diagnosticTree,
    systemPrompt: NOTES_FROM_LESSON_PROMPT,
    userContent: [
      `Subject: ${subject}`,
      `Page title: ${pageTitle}`,
      `Lessons on this page, in order: ${JSON.stringify(
        lessons.map((l) => ({
          concept: l.concept,
          hookFact: l.hookFact,
          steps: l.steps.map((s) => ({ label: s.label, type: s.type, text: s.text, checkQuestion: s.checkQuestion })),
        }))
      )}`,
    ].join('\n'),
    temperature: 0.3,
    // Scales with how many lessons this page covers — a single-lesson
    // page keeps the same headroom as before; a multi-lesson page needs
    // more room to cover every concept without truncating.
    maxTokens: Math.min(1024 * Math.max(1, lessons.length), 8192),
  });
  return raw.trim();
}

/**
 * Answers a student's own free-form question, asked from the "ask a
 * question" panel alongside an in-progress first-time encoding lesson —
 * see ASK_PANEL_PROMPT. Purely advisory and stateless: takes a read-only
 * copy of the lesson state (never mutated, never returned), makes no FSRS
 * or forceTeach update, and isn't itself graded — the student hasn't been
 * tested by asking, so this never counts as an encoding failure. The only
 * thing it needs from `state` is whatever step is CURRENTLY pending (the
 * one on screen, not yet answered) — see ASK_PANEL_PROMPT's own handling
 * of that as the sole thing this must avoid giving away.
 */
export async function answerLessonQuestion(state: EncodingLessonState, question: string): Promise<{ redirected: boolean; answer: string }> {
  const currentStep = state.steps[state.currentIndex];
  const currentQuestionText = currentStep
    ? currentStep.type === 'explain'
      ? `${currentStep.text}\n(checkQuestion, the part actually being answered: ${currentStep.checkQuestion || ''})`
      : currentStep.text
    : '(lesson already complete — nothing currently pending)';

  return callJSON<{ redirected: boolean; answer: string }>(
    ASK_PANEL_PROMPT,
    [
      `Subject: ${state.subject}`,
      `Qualification: ${state.qualification || 'unspecified'}`,
      `Exam board: ${state.examBoard || 'unspecified'}`,
      `Current step's own concept/label: ${currentStep ? currentStep.label : 'n/a'}`,
      `Current step's type: ${currentStep ? currentStep.type : 'n/a'}`,
      `Current step's own question (not yet answered by the student): ${currentQuestionText}`,
      `Student's question, asked from the side panel: ${question}`,
    ].join('\n'),
    MODELS.diagnosticTree,
    0.4,
    undefined,
    true
  );
}
