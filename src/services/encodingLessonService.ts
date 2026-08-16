import { callClaudeJSON, callClaudeJSONWithImages, MODELS } from './claudeClient';
import { getOrGenerateChain, customContextDigest } from './chainService';
import { gradeAndRecordReview, FsrsRatingKey } from './reviewService';
import { searchWikimediaImages, fetchImageAsBase64 } from './wikimediaService';
import { supabaseAdmin } from './supabaseAdmin';
import {
  ENCODING_LESSON_FIRST_STEP_PROMPT,
  ENCODING_LESSON_CONTINUATION_PROMPT,
  ENCODING_ANSWER_CHECK_PROMPT,
  MECHANISTIC_CHECK_ANSWER_PROMPT,
  ENCODING_MATH_ANSWER_CHECK_PROMPT,
  DIAGRAM_VERIFICATION_PROMPT,
  STEP_DERIVABILITY_CHECK_PROMPT,
  NOTES_FROM_LESSON_PROMPT,
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

interface ChainEdge { node_id: string; relationship: 'definitional' | 'reasoning'; }
// technique — see CHAIN_GENERATION_PROMPT rule 11/12: true for a node that
// exists specifically because computing/applying the target requires a
// procedural/computational method (often from a different subject than the
// lesson's own). A student is unlikely to have already covered a technique
// like this just because they're studying THIS subject — see
// forceTeachIds below, where this forces it to be actually taught rather
// than merely checked as assumed prior knowledge.
interface ChainNode { id: string; label: string; derivable?: boolean; technique?: boolean; depends_on: ChainEdge[]; }
interface Chain { concept_id: string; subject: string; nodes: ChainNode[]; }

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
  steps: EncodingStep[];
  currentIndex: number;
  // Split from a single "anyWeakSoFar" boolean so the completion grade can
  // tell a genuinely core failure apart from a lesser one — see
  // submitEncodingAnswer's rating derivation. "Core" means a step whose
  // diagnosisConceptKey equals this lesson's own conceptKey (the scene,
  // target-derivation beats, and implications) — a wrong prerequisite
  // check/teaching beat is real but lesser than getting the actual target
  // wrong.
  anyCoreStepWrong: boolean;
  anyOtherStepWrong: boolean;
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
function buildPrerequisiteChains(chain: Chain, target: ChainNode, maxChains = 3): ChainNode[][] {
  const byId = new Map(chain.nodes.map((n) => [n.id, n]));
  const directPrereqIds = (target.depends_on || []).map((d) => d.node_id).slice(0, maxChains);

  return directPrereqIds
    .map((tipId) => {
      const visited = new Set<string>();
      const ordered: ChainNode[] = [];
      function visit(id: string) {
        if (visited.has(id)) return;
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

/**
 * Looks up (or fetches + verifies + caches) a diagram for one concept, keyed
 * by concept + qualification + exam board so only the first student per
 * combination pays the search+vision cost — everyone after gets an instant
 * cache hit, including a cached "nothing suitable" negative. Never throws:
 * any failure just means no diagram, since a missing diagram is harmless
 * but a wrong one would actively mislead a student.
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
    .select('diagram')
    .eq('diagram_key', diagramKey)
    .maybeSingle();
  if (!cacheError && cached) {
    return (cached.diagram as EncodingDiagram | null) ?? null;
  }

  // 3, not 5 — every candidate that survives fetchImageAsBase64 gets sent
  // as an image in the SAME verification call (getOrFetchDiagram below),
  // and each one is real input-token cost. 3 is still enough breadth for
  // Claude to pick a genuinely suitable diagram or correctly decide none
  // of them fit, at 40% less image cost per call.
  const candidates = await searchWikimediaImages(searchQuery, 3);
  if (!candidates.length) {
    await supabaseAdmin.from('encoding_diagrams').insert({ diagram_key: diagramKey, diagram: null });
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
    await supabaseAdmin.from('encoding_diagrams').insert({ diagram_key: diagramKey, diagram: null });
    return null;
  }

  const chosen = usable[parsedVerdict.chosenIndex].candidate;
  const diagram: EncodingDiagram = {
    diagramUrl: chosen.thumbUrl,
    diagramCaption: parsedVerdict.caption || '',
    diagramAttribution: buildAttribution(chosen.artist, chosen.licenseShortName),
  };

  await supabaseAdmin.from('encoding_diagrams').insert({ diagram_key: diagramKey, diagram });
  return diagram;
}

interface DraftStep {
  nodeId: string;
  label: string;
  type: EncodingStepType;
  text: string;
  checkQuestion?: string;
  diagnosisConceptKey: string;
  confident?: boolean;
  requiresCalculation?: boolean;
  expectedSolution?: string;
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
        0.2
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
export async function startEncodingLesson(
  conceptKey: string,
  subject: string,
  topic: string,
  concept: string,
  qualification = '',
  examBoard = '',
  siblingConcepts: SiblingConcept[] = [],
  customTitle = '',
  customDescription = ''
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
  // single-node check per direct prerequisite.
  const prerequisiteChains = buildPrerequisiteChains(chain, target);
  const chainNodes = prerequisiteChains.flat();
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
  // cached before this was recognized.
  const forcedNodeIds = chainNodes
    .filter((n) => matchesUnfinishedSibling(n.label, siblingConcepts) || !!n.technique)
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
      conceptKey, subject, topic, concept, qualification, examBoard, chain, target, prerequisiteChains, backgroundNodes, forcedNodeIds, customTitle, customDescription
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
  const steps: EncodingStep[] = cachedSteps.map(({ expectedSolution, ...step }) => step);

  const state: EncodingLessonState = { conceptKey, subject, steps, currentIndex: 0, anyCoreStepWrong: false, anyOtherStepWrong: false, contentKey, qualification, examBoard, customTitle, customDescription };
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
  state: EncodingLessonState,
  topic: string,
  concept: string,
  siblingConcepts: SiblingConcept[] = []
): Promise<EncodingLessonState> {
  const { conceptKey, subject, qualification, examBoard, contentKey, customTitle = '', customDescription = '' } = state;

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
    const steps: EncodingStep[] = (existing.steps as CachedEncodingStep[]).map(({ expectedSolution, ...s }) => s);
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
  // same prerequisiteChains/forcedNodeIds/contentKey the /start call used.
  const prerequisiteChains = buildPrerequisiteChains(chain, target);
  const chainNodes = prerequisiteChains.flat();
  const coveredIds = new Set([...chainNodes.map((n) => n.id), target.id]);
  const backgroundNodes = chain.nodes.filter((n) => !coveredIds.has(n.id));
  const forcedNodeIds = chainNodes
    .filter((n) => matchesUnfinishedSibling(n.label, siblingConcepts) || !!n.technique)
    .map((n) => n.id)
    .sort();

  const rest = await generateLessonContinuation(
    conceptKey, subject, topic, concept, qualification, examBoard, chain, target, prerequisiteChains, backgroundNodes, forcedNodeIds, firstStep, customTitle, customDescription
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

  const steps: EncodingStep[] = allSteps.map(({ expectedSolution, ...s }) => s);
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
  prerequisiteChains: ChainNode[][],
  backgroundNodes: ChainNode[],
  forcedNodeIds: string[],
  customTitle = '',
  customDescription = ''
): Promise<{ hookFact: string; step: CachedEncodingStep }> {
  const forcedIds = new Set(forcedNodeIds);
  const serializedChains = prerequisiteChains.map((c) => c.map((n) => ({ nodeId: n.id, label: n.label, forceTeach: forcedIds.has(n.id) })));

  const result = await callJSON<{
    hookFact: string;
    step: {
      nodeId: string;
      type: EncodingStepType;
      text: string;
      checkQuestion?: string;
      confident?: boolean;
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
      `prerequisiteChains — a list of SEPARATE linear chains, each ordered foundational-first ending at that chain's own direct prerequisite of the target: ${JSON.stringify(serializedChains)}`,
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
    confident: s.confident,
    requiresCalculation: !!s.requiresCalculation,
    expectedSolution: s.requiresCalculation ? s.expectedSolution : undefined,
  };

  await repairUncertainSteps([draftStep], subject, qualification, examBoard);

  const { confident, ...step } = draftStep;
  return { hookFact: result.hookFact, step };
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
  prerequisiteChains: ChainNode[][],
  backgroundNodes: ChainNode[],
  forcedNodeIds: string[],
  firstStep: CachedEncodingStep,
  customTitle = '',
  customDescription = ''
): Promise<{ steps: CachedEncodingStep[] }> {
  const targetDerivable = resolveDerivable(target);
  const forcedIds = new Set(forcedNodeIds);
  const serializedChains = prerequisiteChains.map((c) => c.map((n) => ({ nodeId: n.id, label: n.label, forceTeach: forcedIds.has(n.id) })));

  const batch = await callJSON<{
    steps: {
      nodeId: string;
      type: EncodingStepType;
      text: string;
      checkQuestion?: string;
      confident?: boolean;
      requiresCalculation?: boolean;
      expectedSolution?: string;
    }[];
    diagram?: { needed: boolean; searchQuery: string | null };
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
      `prerequisiteChains — a list of SEPARATE linear chains, each ordered foundational-first ending at that chain's own direct prerequisite of the target: ${JSON.stringify(serializedChains)}`,
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
    confident: s.confident,
    requiresCalculation: !!s.requiresCalculation,
    expectedSolution: s.requiresCalculation ? s.expectedSolution : undefined,
  }));

  const diagramPromise =
    batch.diagram?.needed && batch.diagram.searchQuery
      ? withTimeout(
          getOrFetchDiagram(conceptKey, qualification, examBoard, subject, target.label, batch.diagram.searchQuery).catch((err) => {
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

  const steps: CachedEncodingStep[] = draftSteps.map(({ confident, ...step }) => step);

  if (steps.length && diagram) {
    const targetSteps = steps.filter((s) => s.nodeId === target.id && (s.type === 'derive' || s.type === 'explain'));
    const targetStep = targetSteps[targetSteps.length - 1];
    if (targetStep) targetStep.diagram = diagram;
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
export async function submitEncodingAnswer(userId: string, state: EncodingLessonState, answer: string, dontKnow = false): Promise<EncodingSubmitResult> {
  const currentStep = state.steps[state.currentIndex];
  if (!currentStep) {
    return { done: true, state };
  }

  // "I don't know" is an unambiguous verdict — skip the grading call
  // entirely (real cost saved every time this is used) rather than asking
  // Claude to grade an empty/absent answer.
  let correct: boolean;
  let feedback: string | null;
  const gradingPrompt = currentStep.type === 'explain' ? (currentStep.checkQuestion || currentStep.text) : currentStep.text;

  if (dontKnow) {
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
        `Concept/step: ${currentStep.label}\nQuestion: ${gradingPrompt}\nVerified correct solution (reference only, never shown to the student): ${expectedSolution}\nStudent's working: ${answer}`,
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
    const check = await callJSON<{ correct: boolean; feedback: string | null }>(
      MECHANISTIC_CHECK_ANSWER_PROMPT,
      `Qualification: ${state.qualification || 'unspecified'}\nExam board: ${state.examBoard || 'unspecified'}\nConcept/step: ${currentStep.label}\nPrompt: ${gradingPrompt}\nStudent's answer: ${answer}`,
      MODELS.diagnosticTree,
      0.2,
      undefined,
      true
    );
    correct = check.correct;
    feedback = check.feedback;
  } else {
    const check = await callJSON<{ correct: boolean; feedback: string | null }>(
      ENCODING_ANSWER_CHECK_PROMPT,
      `Concept/step: ${currentStep.label}\nPrompt: ${gradingPrompt}\nStudent's answer: ${answer}`,
      MODELS.simpleQuestion,
      0.2,
      undefined,
      true
    );
    correct = check.correct;
    feedback = check.feedback;
  }

  const nextIndex = state.currentIndex + 1;
  const isCoreStep = currentStep.diagnosisConceptKey === state.conceptKey;
  const anyCoreStepWrong = state.anyCoreStepWrong || (isCoreStep && !correct);
  const anyOtherStepWrong = state.anyOtherStepWrong || (!isCoreStep && !correct);
  const nextState: EncodingLessonState = { ...state, currentIndex: nextIndex, anyCoreStepWrong, anyOtherStepWrong };

  if (nextIndex >= state.steps.length) {
    // Skipped if a scene/derive/explain diagnostic drill-down already
    // graded this exact conceptKey mid-lesson (see
    // targetGradedViaDrillDown) — otherwise the concept gets FSRS-graded
    // twice in one session, artificially inflating its stability.
    let fsrsUpdate: FsrsUpdateSummary | undefined;
    if (!state.targetGradedViaDrillDown) {
      // A wrong answer on the TARGET itself (the scene/derivation/
      // implication beats, not a prerequisite check) is a genuine failure
      // to encode the core concept — "again", FSRS's dedicated lapse
      // formula, not just a worse "hard". A wrong prerequisite step with
      // the target itself right is real but lesser — "hard". A clean pass
      // is "good" — first-time encoding lessons never emit "easy"; that's
      // reserved for the lightest retrieval tier, where a genuinely
      // comfortable pass is a meaningful signal rather than a guess.
      const rating: FsrsRatingKey = anyCoreStepWrong ? 'again' : anyOtherStepWrong ? 'hard' : 'good';
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
