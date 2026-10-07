// Derivation lessons, generated on demand, for any subject that already has a knowledge map - not just Economics (which is precompiled
// offline into src/data/derivationEconomics.json; see derivationService.ts). This follows the exact contract the old per-node text
// lesson generator already established (see the comment above GET /knowledge-map-v2/node/:nodeId/lesson in routes/knowledgeMap.ts):
// a real generation only ever happens once, the first time any student reaches a given group of concepts ("a stage"), and every
// student after that gets the cached result. The only difference from Economics is WHERE the compiled stage is cached (a small
// Supabase table here, instead of one file built offline) and WHEN it's generated (the first request, instead of ahead of time).
//
// Grouping concepts into stages reuses scripts/derivation/plan_stages.js's own algorithm (the same one that planned Economics),
// run live against whatever nodes/edges this subject actually has instead of a hand-exported map file. Generating one stage reuses
// scripts/derivation/prompt.js's system prompt and scripts/derivation/build.js's checker (validate) and compiler (build) unchanged -
// so every rule already enforced for Economics (no leaked answers, atomicity/microatomic chunks, the 28-word question cap, one
// milestone per 4 new terms, ...) applies here for free, because it's the same checker rejecting the same mistakes.
import { supabaseAdmin } from './supabaseAdmin';
import { callClaudeJSONUnmetered, MODELS, ClaudeCallUsage } from './claudeClient';
import { chargeForClaudeCall } from './generationCostService';
import { Stage, StageTerm, derivationContentForStage } from './derivationService';

// scripts/derivation is plain JS, outside src/ (see tsconfig's rootDir) - required at runtime like any other JS module, not compiled
// by tsc. The compiled dist/services/*.js sits at the same depth under the repo root as src/services/*.ts, so this relative path
// resolves correctly both in ts-node and after a real build.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { plan } = require('../../scripts/derivation/plan_stages');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { validate, build, isSoftError } = require('../../scripts/derivation/build');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SYSTEM, user: userPrompt } = require('../../scripts/derivation/prompt');

// Languages are acquisition/practice subjects, not mechanisms to derive.
// This tail deliberately overrides the general derivation instructions
// above while retaining the same validated player-compatible JSON shape.
const LANGUAGE_SYSTEM = `${SYSTEM}

LANGUAGE LESSON OVERRIDE — THESE RULES SUPERSEDE EVERY CONFLICTING DERIVATION RULE ABOVE.
This is a language-acquisition lesson. Do NOT manufacture a causal chain, ask the learner to derive vocabulary from common sense, or hide a word until after a mechanistic question. The learner needs comprehensible INPUT first, followed by active practice.

1. Begin with 2-4 consecutive "read" steps. Each read is a clean model-language input card covering ONE useful word, phrase, sound, or grammar pattern. Its "text" MUST be 3-5 short teaching lines separated by literal newline characters, never one paragraph. Put one idea on each line and keep each line to roughly 18 words or fewer. For pronunciation, use this exact progression: (1) introduce the target word and its English meaning; (2) identify the relevant letters and compare their sound with familiar English; (3) give a plain-English approximation of how the whole word sounds; (4) finish with the reusable pronunciation rule. Example structure: "Take the word 'bagno'. This means bathroom in Italian.\nThe 'gn' in 'bagno' is pronounced like the 'ny' in 'canyon'.\nSo it reads more like 'banyo'.\nSo 'gn' in Italian sounds like 'ny' in English." For vocabulary or grammar, adapt the same reveal order: target example and meaning; what its parts do; when it is used; reusable pattern. These read cards must cover every item that later questions test.
2. Follow those input cards with a "recap" question covering EVERY item just introduced, not a single convenient example. For a pronunciation/sound stage, the right and wrong options must each display a complete set of all introduced spellings mapped to their English-like sounds, with at least one plausible mismatch in the wrong set. For vocabulary or grammar, make it genuine language practice: choosing the word/form that completes a visible gap; choosing natural agreement; spotting which short sentence fits an English meaning; or selecting the correct response in a mini-dialogue. Put the target-language sentence with ___ directly in "q" when doing a gap. This closes the input chunk without pretending its items form a causal chain.
3. Use "translate" ONLY for a vocabulary/phrase stage that has explicitly taught enough words or fixed phrases to assemble one natural sentence. Every entry in "answer" must be a word or fixed phrase visibly introduced in the preceding read cards; never import an untaught article, pronoun, verb, preposition, ending, or filler word just to make the sentence grammatical. A pronunciation, spelling, alphabet, isolated-sound, or letter-pattern lesson MUST end on its comprehensive recap and MUST NOT contain sentence ordering at all. Sentence building is a useful activity only when sentence-ready language was actually taught; it is not a compulsory ending for every language lesson. Never finish a language lesson with "derive".
4. Do not create filler support terms merely to reach an atomicity count. Use the real words/forms in the supplied nodes; when a node is a closed set, split its actual members into separate input cards. Use "recap" only as another language question, never to imply a causal relationship.
5. Title and subtitle describe what the learner will understand or SAY (for example, "Ordering politely"), never what they will derive. Keep the lesson short: input, then practice.
6. Maintain a strict taught-item ledger while writing the lesson. A target-language word, pronoun, conjugated form, preposition, article, adjective, idiom, ending, or construction counts as taught ONLY when an earlier read card explicitly names it and explains its meaning or job. Merely placing it inside a translated example sentence does NOT teach it. No question, answer option, distractor, or surrounding sentence may introduce or test an item that is absent from that ledger.
7. Explain WHY a grammar form is the right one, not just the mapping. For example, explain that English "am" is a form of "to be", so Italian uses the matching first-person form of "essere"; "sono" is that form for "io". Also explain natural omissions, such as Italian often dropping "io" because "sono" already identifies the speaker. Do not state "essere becomes sono" without making this grammatical connection clear.
8. Treat expressions as expressions. Every meaningful new part of an example must be glossed, and non-literal combinations must be identified explicitly. For example, teach "in ritardo" together as the normal expression meaning "late" or "behind schedule"; explain that "in" often means "in", but Italian packages this idea as the fixed phrase "in ritardo". Never leave a small word unexplained or imply that a whole expression translates word-for-word when it does not.
9. For a conjugation set, introduce EVERY pronoun/form pair before practice uses that pair. For Italian "essere", for example, io/sono, tu/sei, lui or lei/è, noi/siamo, voi/siete, and loro/sono must each be explicitly taught before a recap can mention it. Never ask about "loro" (or any other member of a paradigm) before its own explanation. For a set larger than four, teach the first four, recap only those four, then teach the remaining items and recap only that new block. This preserves the four-item milestone limit without testing later forms early.
10. Before returning JSON, audit every target-language token in every question and option against the taught-item ledger. If any item is new, either add an earlier explanation or remove it from the practice. Questions test only established language; they never teach by surprise.

The required JSON schema and term bookkeeping remain unchanged. Return JSON only.`;

interface MapNode { id: string; label: string; subtopic: string }
interface MapEdge { from: string; to: string }
interface PlannedStage { subtopic: string; nodes: string[]; edges: [string, string][]; given: string[]; givenEdges: [string, string][]; later: number; subject?: string }

const PLAN_TTL_MS = 15 * 60 * 1000;
const planCache = new Map<string, { stages: PlannedStage[]; byId: Record<string, MapNode>; ts: number }>();
const stageCache = new Map<string, Stage>();

// Thrown ONLY by the prerequisite-stage check below, before any Claude
// call - distinguished from a genuine checker-rejection failure so the
// route calling this (GET /knowledge-map-v2/node/:nodeId/lesson) knows
// NOT to fall back to the old, unrelated plain-lesson generator. That
// fallback exists for a node that was never eligible for a derivation
// lesson at all; falling back to it here would just be a second real,
// paid generation for content the frontend can't even use in the right
// format, every single time a node happened to be requested out of
// order - a real, confirmed cost bug (this class exists specifically to
// stop it).
export class DerivationStageNotReadyError extends Error {}

// Thrown when the student (or their browser) gave up while a lesson was being generated: nothing more is spent on it, and nothing is
// charged. Distinct from a failure so the route does not report it as one.
export class DerivationGenerationAbortedError extends Error {}

// Real, confirmed reliability problem this fixes: a transient failure (a
// network blip, a Claude 5xx/timeout) thrown by the API call itself used to
// propagate straight out of the generation loop below, aborting ALL
// remaining attempts immediately - burning the whole retry budget on one
// bad network moment, then surfacing to the student as the exact same
// "couldn't generate this lesson yet" message as a genuine 3x content
// rejection. Thrown only when every transient retry for one content
// attempt is exhausted (see derivationGenericGenerate), so the route can
// tell a student "try again in a moment" (an infra problem) apart from
// "try an earlier concept" (the content genuinely didn't work out).
export class DerivationGenerationInfraError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Real, confirmed gap this fixes: a failed generation previously vanished
// into a plain console.error with no persisted trace at all - every past
// reliability fix in this file had to be found by reading code, never by
// looking at real failure data, because none existed. Logged to a plain
// table (see scripts/add_generation_failures_table.sql), never throws
// itself - a logging failure must never be the reason a real error doesn't
// reach the student.
async function logGenerationFailure(info: GenericLookup, reason: string): Promise<void> {
  try {
    await supabaseAdmin.from('generation_failures').insert({
      subject: info.subject,
      qualification: info.qualification,
      exam_board: info.examBoard,
      stage_index: info.stageIndex,
      reason,
    });
  } catch (err) {
    console.error('LastMind: could not log a generation failure (non-fatal).', err);
  }
}

function mapKey(subject: string, qualification: string, examBoard: string): string {
  return `${subject}|${qualification}|${examBoard}`;
}

// Real, confirmed bug this fixes: extending a topic map backward/forward
// (see topicKnowledgeMapService.ts's extendTopicMapBackward/Forward) adds
// real new rows to knowledge_map_nodes/edges, but planFor's own 15-minute
// TTL cache had no way to know that - a student who extended a map within
// that window kept getting the STALE pre-extension plan, so the newly
// taught concept and its genuine neighbours (e.g. "eigenvalues and
// eigenvectors" after a backward extension added "matrices as arrays" in
// front of it) weren't in any planned stage at all, and derivationGenericLookup
// fell through to the unrelated old per-node generator - the actual cause
// of "Couldn't generate an interactive lesson for this yet", not a genuine
// generation failure. Called right after a successful extension insert, so
// the very next lesson request re-plans against the extended graph.
//
// Also clears any already-compiled stages for this (subject, qualification,
// examBoard) - both the in-memory stageCache and the persisted
// derivation_generated_stages rows - since an extension renumbers stage
// indices (stage 0's own concept grouping genuinely changes once earlier
// nodes exist), so a stale row at the same index would otherwise be
// served back under a now-wrong concept set. Nothing is lost: each stage
// is just regenerated once, on its next real request, same as any other
// fresh generation.
export async function invalidatePlanCache(subject: string, qualification: string, examBoard: string): Promise<void> {
  planCache.delete(mapKey(subject, qualification, examBoard));
  const prefix = `${subject}|${qualification}|${examBoard}|`;
  Array.from(stageCache.keys()).forEach((k) => { if (k.startsWith(prefix)) stageCache.delete(k); });
  const { error } = await supabaseAdmin
    .from('derivation_generated_stages')
    .delete()
    .eq('subject', subject).eq('qualification', qualification).eq('exam_board', examBoard);
  if (error) console.error('LastMind: could not clear stale compiled stages after a map extension.', error);
}

// A generic stage's public id, threaded through the frontend exactly like Economics' own bare numeric stage index (see
// sfBuildDerivationSlides' Number.isInteger check and the checkpoint key it builds from `stage`) - a plain string works for both.
export function genericStageKey(subject: string, qualification: string, examBoard: string, stageIndex: number): string {
  return `g:${encodeURIComponent(subject)}:${encodeURIComponent(qualification)}:${encodeURIComponent(examBoard)}:${stageIndex}`;
}
export function parseGenericStageKey(key: string): { subject: string; qualification: string; examBoard: string; stageIndex: number } | null {
  const m = /^g:([^:]*):([^:]*):([^:]*):(\d+)$/.exec(key);
  if (!m) return null;
  return { subject: decodeURIComponent(m[1]), qualification: decodeURIComponent(m[2]), examBoard: decodeURIComponent(m[3]), stageIndex: Number(m[4]) };
}

// Every node and every edge of one subject's knowledge map, in the {nodes,edges} shape plan_stages.js expects - node ids are the
// real concept_id already stored on knowledge_map_nodes (never re-derived), so a generated stage's term keys ARE concept ids and
// nothing needs mapping back and forth between two id schemes the way the offline Economics export has to.
async function loadGraph(subject: string, qualification: string, examBoard: string): Promise<{ nodes: MapNode[]; edges: MapEdge[] } | null> {
  // Real, confirmed root cause of Cortex "teach me X" lessons generating a
  // map fine and then failing (after a real, paid, multi-attempt Claude
  // call) once the student actually starts one: a custom topic's own
  // per-node DESCRIPTION is stored in this very `subtopic` column
  // (topicKnowledgeMapService.ts's own comment - that table has no
  // free-text description column of its own), but plan_stages.js uses
  // `subtopic` as a GROUPING key: several nodes sharing one label, exactly
  // how a curated subject's map is authored. Every custom-topic node's
  // subtopic being unique meant no two of its nodes were ever "the same
  // subtopic", so plan_stages.js's own thin-stage merge (its own comment:
  // "so a lesson is never a lone definition") could never fire - every
  // custom topic silently decomposed into one stage per node, each of
  // which then had to satisfy build.js's atomicity rule (4+ new terms, a
  // 2+-link chain) via entirely FABRICATED support terms for what's often
  // a single, genuinely atomic phrase or fact - confirmed live: "order a
  // spaghetti bolognese in Italian" (13 real, edge-connected nodes)
  // produced 13 separate single-node stages; folding every node into one
  // shared subtopic here (verified via the same synthetic plan_stages.js
  // test used to catch the earlier rule-1a bug) regrouped it into 4
  // properly-sized stages instead, using plan_stages.js's real edge-
  // connectivity chunking the way it works for every curated subject.
  // Curated language courses intentionally use a blank exam board too; that
  // does not make them one-off custom topics. Collapsing Italian/Spanish here
  // erased their A1/A2/B1 grouping and was the root cause of advanced forms
  // being planned before greetings and foundations.
  const isCustomTopic = examBoard === '' && !isLanguageSubject(subject);
  const nodes: MapNode[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin
      .from('knowledge_map_nodes')
      .select('concept_id, label, subtopic')
      .eq('subject', subject).eq('qualification', qualification).eq('exam_board', examBoard)
      .range(from, from + 999);
    if (error) throw error;
    (data || []).forEach((n: any) => nodes.push({ id: n.concept_id, label: n.label, subtopic: isCustomTopic ? subject : (n.subtopic || '') }));
    if (!data || data.length < 1000) break;
  }
  if (nodes.length < 3) return null;   // too small to be a real knowledge map worth deriving lessons from
  const byNodeId = new Map<string, string>();   // knowledge_map_nodes.id (uuid) -> concept_id
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin
      .from('knowledge_map_nodes')
      .select('id, concept_id')
      .eq('subject', subject).eq('qualification', qualification).eq('exam_board', examBoard)
      .range(from, from + 999);
    if (error) throw error;
    (data || []).forEach((n: any) => byNodeId.set(n.id, n.concept_id));
    if (!data || data.length < 1000) break;
  }
  const ids = [...byNodeId.keys()];
  const edges: MapEdge[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data, error } = await supabaseAdmin.from('knowledge_map_edges').select('from_node_id, to_node_id').in('from_node_id', chunk);
    if (error) throw error;
    (data || []).forEach((e: any) => {
      const from = byNodeId.get(e.from_node_id), to = byNodeId.get(e.to_node_id);
      if (from && to) edges.push({ from, to });
    });
  }
  return { nodes, edges };
}

async function planFor(subject: string, qualification: string, examBoard: string): Promise<{ stages: PlannedStage[]; byId: Record<string, MapNode> } | null> {
  const key = mapKey(subject, qualification, examBoard);
  const cached = planCache.get(key);
  if (cached && Date.now() - cached.ts < PLAN_TTL_MS) return cached;
  const graph = await loadGraph(subject, qualification, examBoard);
  if (!graph) return null;
  const { stages, byId } = plan({ subject, nodes: graph.nodes, edges: graph.edges });
  stages.forEach((s: PlannedStage) => { s.subject = subject; });
  const entry = { stages, byId, ts: Date.now() };
  planCache.set(key, entry);
  return entry;
}

export interface GenericLookup {
  subject: string; qualification: string; examBoard: string;
  stageIndex: number; stages: PlannedStage[]; byId: Record<string, MapNode>;
  node: { id: string; concept_id: string; label: string };
  cached: Stage | null;
  staleCached: Stage | null;
}

// Finds which stage (if any) a node belongs to, and whether that stage has already been generated - null means this subject has
// no knowledge map worth deriving from, or this node isn't on it (a caller falls back to the old per-node generator either way).
export async function derivationGenericLookup(nodeId: string): Promise<GenericLookup | null> {
  const { data: node } = await supabaseAdmin.from('knowledge_map_nodes').select('id, concept_id, label, subject, qualification, exam_board').eq('id', nodeId).maybeSingle();
  // exam_board == null (not !node.exam_board) - a Cortex custom topic's
  // exam_board is DELIBERATELY '' (see topicKnowledgeMapService.ts's own
  // TOPIC_EXAM_BOARD constant), a real, intentional value, not a missing
  // one. The falsy check here was rejecting every single custom-topic
  // node unconditionally, before planFor was ever even called - a real,
  // confirmed bug: every "teach me X" lesson request for as long as this
  // has existed fell through to the mismatched plain-lesson generator
  // instead of ever reaching the derivation pipeline at all, which is
  // what every "doesn't have an interactive lesson ready" failure this
  // session actually was, not a stage-ordering problem.
  if (!node || !node.subject || !node.qualification || node.exam_board == null) return null;
  const planned = await planFor(node.subject as string, node.qualification as string, node.exam_board as string);
  if (!planned) return null;
  const stageIndex = planned.stages.findIndex((s) => s.nodes.includes(node.concept_id as string));
  if (stageIndex < 0) return null;
  const key = stageKeyRow(node.subject as string, node.qualification as string, node.exam_board as string, stageIndex);
  let cached = stageCache.get(key) || null;
  if (!cached) {
    const { data: row } = await supabaseAdmin
      .from('derivation_generated_stages').select('compiled')
      .eq('subject', node.subject).eq('qualification', node.qualification).eq('exam_board', node.exam_board).eq('stage_index', stageIndex)
      .maybeSingle();
    if (row?.compiled) { cached = row.compiled as Stage; stageCache.set(key, cached); }
  }
  // Earlier language stages either used the mechanistic prompt or packed
  // their input into one dense paragraph. Treat them as cache misses once
  // so the next request replaces them with the line-by-line V5 cards and
  // the strict taught-item ledger (including every conjugation and phrase part).
  // Keep the old compiled stage as a playable fallback: a content upgrade
  // must never turn a lesson that used to open into a dead knowledge-map node.
  const staleCached = cached && isLanguageSubject(node.subject as string) && !(cached as any).languageInputV5 ? cached : null;
  if (staleCached) cached = null;
  return {
    subject: node.subject as string, qualification: node.qualification as string, examBoard: node.exam_board as string,
    stageIndex, stages: planned.stages, byId: planned.byId,
    node: { id: node.id as string, concept_id: node.concept_id as string, label: node.label as string },
    cached, staleCached,
  };
}

function stageKeyRow(subject: string, qualification: string, examBoard: string, stageIndex: number): string {
  return `${subject}|${qualification}|${examBoard}|${stageIndex}`;
}

// Lessons in a language teach the target-language words themselves, so those words necessarily appear in the situations and the answers; the leak
// rules would reject nearly every natural example, so they are switched off for language subjects. The structural checks and the reading-length
// rules still apply.
const LANGUAGE_SUBJECT = /\b(italian|french|spanish|german|latin|greek|mandarin|chinese|cantonese|japanese|korean|arabic|russian|portuguese|welsh|dutch|polish|turkish|hindi|urdu|hebrew|swedish|norwegian|danish|irish|gaelic|language)\b/i;
export const isLanguageSubject = (subject?: string): boolean => LANGUAGE_SUBJECT.test(String(subject || ''));

function toSpec(stage: PlannedStage, out: any, byId: Record<string, MapNode>) {
  const terms: Record<string, { label: string }> = { ...out.terms };
  (stage.given || []).forEach((g) => { terms[g] = terms[g] || { label: byId[g].label }; });
  const given = (stage.given || []).slice(0, 4);
  return {
    id: 'gen', subject: stage.subject, title: out.stage.title, terms, noLeakCheck: isLanguageSubject(stage.subject), languageLesson: isLanguageSubject(stage.subject),
    stages: [{
      ...out.stage, given, needs: stage.given, builds: given, nodes: stage.nodes,
      dropped: out.dropEdges || [],
      edges: stage.edges.concat(stage.givenEdges)
        .filter(([a, b]: [string, string]) => !(out.dropEdges || []).some(([x, y]: [string, string]) => x === a && y === b))
        .concat(out.extraEdges || []),
    }],
  };
}

const INTRO_TYPES = new Set(['read', 'ask', 'calc']);
const MILESTONE_TYPES = new Set(['order', 'chains', 'recap']);
const milestoneTerms = (s: any): string[] => (s.type === 'chains' ? (s.lanes || []).flatMap((l: any) => l.terms || []) : (s.terms || []));

// Repairs the one kind of mistake the model makes over and over and that is pure bookkeeping, not teaching: a milestone placed after the
// 5th new term when it covers the first 4 (so "more than 4 new terms since the last milestone" and "covers 4 terms but 5 were
// introduced"), or a milestone whose list of terms is not exactly the terms introduced since the last one. In the first case the extra
// step is moved to just after the milestone; in the second the list is corrected. Only kept if it leaves fewer errors than before.
export function repairMilestones(out: any): any | null {
  const fixed = JSON.parse(JSON.stringify(out));
  if (!fixed || !fixed.stage || !Array.isArray(fixed.stage.steps)) return null;
  const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((t) => b.includes(t));
  let changedAny = false;
  for (let pass = 0; pass < 8; pass++) {
    let steps: any[] = fixed.stage.steps, chunk: number[] = [], changed = false;
    for (let i = 0; i < steps.length && !changed; i++) {
      const s = steps[i];
      if (INTRO_TYPES.has(s.type)) { chunk.push(i); continue; }
      if (!MILESTONE_TYPES.has(s.type)) continue;
      const listed = milestoneTerms(s), introduced = chunk.map((k) => steps[k].term);
      if (!sameSet(listed, introduced)) {
        const n = listed.length;
        if (n >= 1 && n < introduced.length && sameSet(listed, introduced.slice(0, n))) {
          const late = new Set(chunk.slice(n));
          const moving = steps.filter((_, idx) => late.has(idx));
          const keep = steps.filter((_, idx) => !late.has(idx));
          keep.splice(keep.indexOf(s) + 1, 0, ...moving);
          fixed.stage.steps = keep; changed = true;
        } else if (introduced.length >= 1 && introduced.length <= 4 && s.type !== 'chains') {
          s.terms = introduced;
          if (s.type === 'order' && typeof s.prompt === 'string') s.prompt = s.prompt.replace(/^Drag and drop the \d+ key terms/, `Drag and drop the ${introduced.length} key terms`);
          changed = true;
        }
      }
      chunk = [];
    }
    if (!changed) break;
    changedAny = true;
  }
  return changedAny ? fixed : null;
}

// A plain, numbered account of a rejected attempt: each step, what it introduces, and the running count of new terms since the last
// milestone. Handed back with the checker's complaint so a retry can see exactly where the count went wrong instead of guessing.
export function stepLedger(out: any): string {
  const steps = out && out.stage && out.stage.steps;
  if (!Array.isArray(steps)) return '';
  let chunk = 0;
  return steps.map((s: any, i: number) => {
    if (INTRO_TYPES.has(s.type)) { chunk++; return `${i + 1}. ${s.type} introduces "${s.term}" (new term ${chunk} since the last milestone)`; }
    if (MILESTONE_TYPES.has(s.type)) { const line = `${i + 1}. ${s.type} milestone listing [${milestoneTerms(s).join(', ')}] - ${chunk} new term(s) were actually introduced since the last milestone`; chunk = 0; return line; }
    return `${i + 1}. ${s.type}`;
  }).join('\n');
}

// What to do about the specific complaints that keep recurring, so a retry fixes the cause and not only the wording of the one cited.
function retryAdvice(errs: string[], out: any): string {
  const all = errs.join('\n'), tips: string[] = [];
  if (/just names|shows ".*", a term that comes later|contains the term/.test(all)) tips.push('An option was rejected for naming a term. Rewrite that option as what the student would observe, hear, see or do in the situation (for a pronunciation, how it sounds compared with a familiar word), never as the term\'s label or a phrase containing all of its words. Both options must still be the same length and shape.');
  if (/new terms since the last milestone|introduced since the last milestone/.test(all)) tips.push('Milestone counting went wrong. A milestone must come immediately after the 4th new term since the previous one, and list exactly those terms. Here is your last attempt, step by step:\n' + stepLedger(out));
  return tips.length ? '\n\nHow to fix it:\n' + tips.join('\n') : '';
}

export function checkDerivationText(stage: PlannedStage, text: string, byId: Record<string, MapNode>): { spec?: any; errs?: string[]; out?: any; softSpec?: any } {
  try {
    const out = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    const spec = toSpec(stage, out, byId);
    const errs = validate(spec, stage.given);
    if (!errs.length) return { spec, out };
    let bestOut = out, bestSpec = spec, bestErrs: string[] = errs;
    // Bookkeeping slips are repaired in code rather than spending another long generation on them.
    const repaired = repairMilestones(out);
    if (repaired) {
      const spec2 = toSpec(stage, repaired, byId), errs2: string[] = validate(spec2, stage.given);
      if (errs2.length < errs.length) {
        if (!errs2.length) return { spec: spec2, out: repaired };
        bestOut = repaired; bestSpec = spec2; bestErrs = errs2;
      }
    }
    // Only wording problems left (never a structural one): the lesson would still work, so a usable spec is handed back for the caller to accept.
    const hard = bestErrs.filter((m) => !isSoftError(m));
    return { errs: bestErrs, out: bestOut, ...(hard.length ? {} : { softSpec: bestSpec }) };
  } catch (e: any) { return { errs: ['not valid JSON: ' + e.message] }; }
}

// Errors about the shape of the whole lesson (milestone bookkeeping, unknown or repeated terms, a bad diagram...) cannot be cured by rewriting one step.
const STRUCTURAL_ERR = /milestone|covers \d+ terms|not introduced yet|introduced twice|new terms since|unknown term|prompt must start|read step after the first question|diagram/i;

// Which steps to rewrite when ONLY individual steps broke a rule (each error names its step and none is structural), or null when the whole
// stage has to be generated again. Rewriting 1-8 steps costs a fraction of a whole new stage.
export function patchableSteps(errs: string[], out: any): number[] | null {
  const steps = out && out.stage && out.stage.steps;
  if (!Array.isArray(steps) || !errs.length) return null;
  const nums = new Set<number>();
  for (const e of errs) {
    const m = /step (\d+):/.exec(e);
    if (!m || STRUCTURAL_ERR.test(e)) return null;
    const n = Number(m[1]);
    if (n < 1 || n > steps.length) return null;
    nums.add(n);
  }
  return nums.size >= 1 && nums.size <= 8 ? [...nums].sort((x, y) => x - y) : null;
}

// What the model is asked to do instead of regenerating: the earlier output goes back with just the broken steps to redo.
export function patchPrompt(prompt: string, out: any, errs: string[], steps: number[]): string {
  const list = steps.map((n) => `Step ${n}: ${errs.filter((e) => new RegExp(`step ${n}:`).test(e)).map((e) => e.replace(/^.*?step \d+:\s*/, '')).join('; ')}`).join('\n');
  return `${prompt}\n\nYour previous output for this stage is below. Its structure is fine, but the checker rejected the individual steps listed after it. Do NOT rewrite the stage. Rewrite ONLY the listed steps: fix exactly the stated problems and change nothing else in them (keep each step's "type" and "term"). For this request ignore the usual output shape and return JSON only, in exactly this form: {"steps": {"<step number>": { ...the complete corrected step object... }}}\n\nPREVIOUS OUTPUT:\n${JSON.stringify(out)}\n\nSTEPS TO FIX:\n${list}`;
}

// Puts the rewritten steps back into the earlier output (type and term are never taken from the model's reply). Null when nothing usable came back.
export function applyStepPatch(out: any, patchText: string): any | null {
  try {
    const patch = JSON.parse(patchText.slice(patchText.indexOf('{'), patchText.lastIndexOf('}') + 1));
    const incoming = patch && (patch.steps && typeof patch.steps === 'object' ? patch.steps : patch);
    if (!incoming || typeof incoming !== 'object') return null;
    const fixed = JSON.parse(JSON.stringify(out));
    let changed = 0;
    for (const [k, v] of Object.entries(incoming)) {
      const i = Number(k) - 1, old = fixed.stage.steps[i];
      if (!old || !v || typeof v !== 'object') continue;
      fixed.stage.steps[i] = { ...old, ...(v as object), type: old.type, term: old.term };
      changed++;
    }
    return changed ? fixed : null;
  } catch { return null; }
}

// Generates one stage live (2-3 short Claude calls at most: one attempt, then up to two retries with the checker's own feedback -
// the same shape generate.js's offline sequential mode uses), validates it with the exact same checker Economics is held to, then
// caches the compiled result forever. Charged to the requesting student's Locks like any other generation (see callClaudeJSON) -
// the route calling this is responsible for the same fresh-generation rate cap the old per-node generator already enforces.
// One generation per stage at a time. A second request for a stage that is already being generated (a double click, "try again" pressed
// while it is still working, two tabs) shares the one in flight instead of starting - and paying for - another. If every request waiting
// on it goes away, the generation itself is stopped.
const inFlight = new Map<string, { promise: Promise<Stage>; waiters: number; controller: AbortController }>();

export async function derivationGenericGenerate(info: GenericLookup, userId: string, signal?: AbortSignal): Promise<Stage> {
  const key = stageKeyRow(info.subject, info.qualification, info.examBoard, info.stageIndex);
  if (signal?.aborted) throw new DerivationGenerationAbortedError('cancelled before it started');
  let entry = inFlight.get(key);
  if (!entry) {
    const controller = new AbortController();
    const promise = derivationGenericGenerateOnce(info, userId, controller.signal).finally(() => { inFlight.delete(key); });
    promise.catch(() => { /* reported to every waiter below; this only stops an unhandled-rejection warning when nobody is left waiting */ });
    entry = { promise, waiters: 0, controller };
    inFlight.set(key, entry);
  } else {
    console.log(`LastMind: derivation stage ${info.stageIndex} for "${info.subject}" is already being generated; sharing it rather than starting another.`);
  }
  const shared = entry;
  shared.waiters++;
  let released = false;
  const release = () => { if (released) return; released = true; shared.waiters--; if (shared.waiters <= 0) shared.controller.abort(); };
  let onAbort: (() => void) | undefined;
  const gone = new Promise<never>((_, reject) => {
    if (!signal) return;
    onAbort = () => { release(); reject(new DerivationGenerationAbortedError('the student stopped waiting')); };
    signal.addEventListener('abort', onAbort, { once: true });
  });
  gone.catch(() => { /* handled by the race below */ });
  try {
    return await Promise.race([shared.promise, gone]);
  } finally {
    if (signal && onAbort) signal.removeEventListener('abort', onAbort);
    release();
  }
}

async function derivationGenericGenerateOnce(info: GenericLookup, userId: string, signal: AbortSignal): Promise<Stage> {
  const key = stageKeyRow(info.subject, info.qualification, info.examBoard, info.stageIndex);
  const stage = info.stages[info.stageIndex];

  // Checked BEFORE any Claude call, not after - this used to run after the
  // full (up to 3-attempt) generation loop below, discarding an already-
  // PAID-FOR generation the moment it turned out a prerequisite stage
  // wasn't ready. Real, confirmed cost bug: every rejected node was a real
  // Locks charge for nothing usable. build()'s own validate() reads
  // spec.known to check every given/needs term was "introduced by an
  // earlier stage" - a stage with a real cross-stage prerequisite
  // (stage.given non-empty) is structurally guaranteed to fail that check
  // unless every prerequisite stage already exists, so there is nothing to
  // gain by generating first and finding out after.
  let known: string[] = [];
  if (stage.given?.length) {
    const { data: priorStages } = await supabaseAdmin
      .from('derivation_generated_stages').select('concept_ids')
      .eq('subject', info.subject).eq('qualification', info.qualification).eq('exam_board', info.examBoard)
      .lt('stage_index', info.stageIndex);
    const knownSet = new Set<string>();
    (priorStages || []).forEach((row: any) => (row.concept_ids || []).forEach((c: string) => knownSet.add(c)));
    // A prerequisite counts as known when an EARLIER PLANNED stage teaches it, whether or not anyone has had that earlier lesson generated yet.
    // The lesson only treats the given concepts as assumed knowledge (toSpec lists them as given terms, and the prompt never reads the earlier
    // lesson), so insisting that the earlier lesson already exists made a student who had marked those concepts as already covered, or who
    // skipped one that would not build, unable to open any lesson that depended on it ("try an earlier concept first", forever). Only a
    // given concept that NO earlier stage teaches is a genuine ordering problem.
    const plannedEarlier = new Set<string>();
    info.stages.slice(0, info.stageIndex).forEach((s) => (s.nodes || []).forEach((n: string) => plannedEarlier.add(n)));
    const missing = stage.given.filter((g: string) => !knownSet.has(g) && !plannedEarlier.has(g));
    if (missing.length) throw new DerivationStageNotReadyError(`Cannot generate stage ${info.stageIndex} yet - its prerequisite stage(s) for [${missing.join(', ')}] have not been generated first.`);
    stage.given.forEach((g: string) => { if (plannedEarlier.has(g)) knownSet.add(g); });
    known = [...knownSet];
  }

  let prompt = userPrompt(stage, info.byId, {});
  let result: { spec?: any; errs?: string[]; out?: any; softSpec?: any } = {};
  let best: { spec: any; errs: string[] } | null = null;
  // Real, reported billing bug: this used to call the metered callClaudeJSON
  // on every attempt, so a stage that failed the checker on all 3 tries
  // charged the student's Locks 3 times for a lesson that was never
  // actually delivered - a real API cost, but one that should never have
  // been passed through for a product that didn't work. Now accumulates
  // usage across every attempt unmetered, and charges exactly once, only if
  // a usable lesson actually comes out the other end (below) - for the
  // total real cost of however many tries it took to get the one that
  // worked, never for a total failure.
  const totalUsage: ClaudeCallUsage = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
  const CONTENT_ATTEMPTS = 2;
  const TRANSIENT_RETRIES_PER_ATTEMPT = 2;
  for (let attempt = 0; attempt < CONTENT_ATTEMPTS; attempt++) {
    if (signal.aborted) throw new DerivationGenerationAbortedError('stopped before attempt ' + (attempt + 1));
    const patchSteps = attempt === 0 ? null : patchableSteps(result.errs || [], result.out);
    const mode: 'full' | 'patch' = patchSteps ? 'patch' : 'full';
    const userContent = attempt === 0 ? prompt
      : mode === 'patch' ? patchPrompt(prompt, result.out, result.errs || [], patchSteps!)
      : `${prompt}\n\nA previous attempt at this stage was rejected by the checker for:\n- ${(result.errs || []).join('\n- ')}${retryAdvice(result.errs || [], result.out)}\n\nReturn the corrected JSON only.`;
    const attemptStarted = Date.now();
    // Real, confirmed reliability bug this fixes: a transient failure here
    // (a network blip, a Claude 5xx/timeout) used to propagate straight out
    // of this loop, aborting every remaining content attempt immediately -
    // one bad network moment burned the whole retry budget. Retried up to
    // TRANSIENT_RETRIES_PER_ATTEMPT times, with a short backoff, before
    // counting this as a real content attempt at all - only genuine
    // checker rejections (a real response that `check()` validates and
    // rejects) consume the CONTENT_ATTEMPTS budget.
    let text: string | undefined, usage: ClaudeCallUsage | undefined;
    let lastTransientErr: unknown = null;
    for (let transientTry = 0; transientTry <= TRANSIENT_RETRIES_PER_ATTEMPT; transientTry++) {
      try {
        // Slightly higher temperature on each successive CONTENT attempt
        // (not transient retry) - real, confirmed problem: every retry
        // reused the exact same temperature, so a model that mis-shaped
        // the stage structurally (wrong capstone type, wrong grouping) had
        // no actual signal to try a different approach, only to patch the
        // literally-cited error on top of the same underlying attempt.
        ({ text, usage } = await callClaudeJSONUnmetered({
          model: MODELS.diagnosticTree,
          systemPrompt: isLanguageSubject(info.subject) ? LANGUAGE_SYSTEM : SYSTEM,
          userContent,
          maxTokens: mode === 'patch' ? 1800 : 4000,
          temperature: attempt === 0 ? undefined : mode === 'patch' ? 0.2 : Math.min(0.3 + attempt * 0.2, 0.7),
          cacheSystemPrompt: true,
          signal,
        }));
        lastTransientErr = null;
        break;
      } catch (err) {
        if (signal.aborted) throw new DerivationGenerationAbortedError('stopped while waiting for Claude');
        lastTransientErr = err;
        console.error(`LastMind: derivation generation call failed (content attempt ${attempt + 1}/${CONTENT_ATTEMPTS}, transient retry ${transientTry + 1}/${TRANSIENT_RETRIES_PER_ATTEMPT + 1}).`, err);
        if (transientTry < TRANSIENT_RETRIES_PER_ATTEMPT) await sleep(500 * (transientTry + 1));
      }
    }
    if (lastTransientErr) {
      await logGenerationFailure(info, `infra error after ${TRANSIENT_RETRIES_PER_ATTEMPT + 1} tries: ${lastTransientErr instanceof Error ? lastTransientErr.message : String(lastTransientErr)}`);
      throw new DerivationGenerationInfraError('Could not reach the generation service after several tries.', lastTransientErr);
    }
    totalUsage.input_tokens += usage!.input_tokens || 0;
    totalUsage.output_tokens += usage!.output_tokens || 0;
    totalUsage.cache_creation_input_tokens = (totalUsage.cache_creation_input_tokens || 0) + (usage!.cache_creation_input_tokens || 0);
    totalUsage.cache_read_input_tokens = (totalUsage.cache_read_input_tokens || 0) + (usage!.cache_read_input_tokens || 0);
    if (mode === 'patch') {
      const merged = applyStepPatch(result.out, text!);
      // An unusable reply leaves the earlier attempt (and its problems) as it was.
      if (merged) result = checkDerivationText(stage, JSON.stringify(merged), info.byId);
    } else result = checkDerivationText(stage, text!, info.byId);
    if (!result.spec && result.softSpec && (!best || (result.errs || []).length < best.errs.length)) best = { spec: result.softSpec, errs: result.errs || [] };
    console.log(`LastMind: derivation attempt ${attempt + 1}/${CONTENT_ATTEMPTS} (${mode === 'patch' ? 'rewriting ' + patchSteps!.length + ' step(s)' : 'whole stage'}) for "${info.subject}" stage ${info.stageIndex} took ${((Date.now() - attemptStarted) / 1000).toFixed(1)}s, ${usage!.output_tokens} output tokens, ${result.spec ? 'accepted' : 'rejected: ' + (result.errs || []).length + ' problem(s)'}.`);
    if (result.spec) break;
  }
  // Only wording problems (never a structural one) left in the closest attempt: a lesson that works beats no lesson, so it is kept and the problems logged.
  if (!result.spec && best) {
    best.spec.allowSoft = true;
    await logGenerationFailure(info, `accepted after ${CONTENT_ATTEMPTS} attempts with ${best.errs.length} wording problem(s): ${best.errs.join('; ')}`);
    result = { spec: best.spec, errs: best.errs };
  }
  if (!result.spec) {
    await logGenerationFailure(info, `checker rejected after ${CONTENT_ATTEMPTS} attempts: ${(result.errs || []).join('; ')}`);
    throw new Error(`derivation generation failed the checker after ${CONTENT_ATTEMPTS} attempts: ` + (result.errs || []).join('; '));
  }
  await chargeForClaudeCall(userId, MODELS.diagnosticTree, totalUsage, 'derivation-lesson-generation');
  if (stage.given?.length) result.spec.known = known;
  const built = build(result.spec);
  const terms: Record<string, StageTerm> = {};
  Object.keys(built.TERMS).forEach((k) => { terms[k] = built.TERMS[k]; });
  const compiled: Stage = { i: info.stageIndex, name: stage.nodes.join(','), edges: stage.edges, nodes: stage.nodes, concepts: stage.nodes, terms, stage: built.stages[0], ...(isLanguageSubject(info.subject) ? { languageInputV2: true, languageInputV3: true, languageInputV4: true, languageInputV5: true } : {}) } as Stage;
  const { error } = await supabaseAdmin.from('derivation_generated_stages').upsert({
    subject: info.subject, qualification: info.qualification, exam_board: info.examBoard, stage_index: info.stageIndex,
    concept_ids: stage.nodes, compiled,
  }, { onConflict: 'subject,qualification,exam_board,stage_index' });
  if (error) throw error;
  stageCache.set(key, compiled);
  return compiled;
}

// Same stored-lesson shape derivationContentForNode returns for Economics, built from a generic (already generated) stage.
export function derivationContentForGenericNode(info: GenericLookup, stage: Stage): any | null {
  return derivationContentForStage(stage, info.node.concept_id, genericStageKey(info.subject, info.qualification, info.examBoard, info.stageIndex));
}

// GET /derivation/stage/:key fallback path for a generic key (see routes/knowledgeMap.ts) - the payload is normally sent inline
// with the lesson itself, so this is only ever hit if the frontend has to re-fetch it separately.
export async function derivationGenericPayloadForKey(key: string): Promise<{ terms: Record<string, StageTerm>; stage: any; languageInputV2?: boolean; languageInputV3?: boolean; languageInputV4?: boolean; languageInputV5?: boolean } | null> {
  const parsed = parseGenericStageKey(key);
  if (!parsed) return null;
  const cacheKey = stageKeyRow(parsed.subject, parsed.qualification, parsed.examBoard, parsed.stageIndex);
  let stage = stageCache.get(cacheKey) || null;
  if (!stage) {
    const { data: row } = await supabaseAdmin
      .from('derivation_generated_stages').select('compiled')
      .eq('subject', parsed.subject).eq('qualification', parsed.qualification).eq('exam_board', parsed.examBoard).eq('stage_index', parsed.stageIndex)
      .maybeSingle();
    if (!row?.compiled) return null;
    stage = row.compiled as Stage;
    stageCache.set(cacheKey, stage);
  }
  return { terms: stage.terms, stage: stage.stage, ...((stage as any).languageInputV2 ? { languageInputV2: true } : {}), ...((stage as any).languageInputV3 ? { languageInputV3: true } : {}), ...((stage as any).languageInputV4 ? { languageInputV4: true } : {}), ...((stage as any).languageInputV5 ? { languageInputV5: true } : {}) };
}

// Completion uses the same public g:... key as the player. Return every
// map concept taught by that generated stage so the route can schedule
// them together, exactly as the precompiled Economics path does.
export async function derivationGenericConceptsForKey(key: string): Promise<string[]> {
  const parsed = parseGenericStageKey(key);
  if (!parsed) return [];
  const cacheKey = stageKeyRow(parsed.subject, parsed.qualification, parsed.examBoard, parsed.stageIndex);
  let stage = stageCache.get(cacheKey) || null;
  if (!stage) {
    const { data: row } = await supabaseAdmin
      .from('derivation_generated_stages').select('compiled, concept_ids')
      .eq('subject', parsed.subject).eq('qualification', parsed.qualification).eq('exam_board', parsed.examBoard).eq('stage_index', parsed.stageIndex)
      .maybeSingle();
    if (!row) return [];
    if (row.compiled) { stage = row.compiled as Stage; stageCache.set(cacheKey, stage); }
    if (!stage && Array.isArray(row.concept_ids)) return row.concept_ids as string[];
  }
  return stage?.concepts || [];
}
