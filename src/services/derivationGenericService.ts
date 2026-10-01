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
const { validate, build } = require('../../scripts/derivation/build');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SYSTEM, user: userPrompt } = require('../../scripts/derivation/prompt');

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
  const isCustomTopic = examBoard === '';
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
  return {
    subject: node.subject as string, qualification: node.qualification as string, examBoard: node.exam_board as string,
    stageIndex, stages: planned.stages, byId: planned.byId,
    node: { id: node.id as string, concept_id: node.concept_id as string, label: node.label as string },
    cached,
  };
}

function stageKeyRow(subject: string, qualification: string, examBoard: string, stageIndex: number): string {
  return `${subject}|${qualification}|${examBoard}|${stageIndex}`;
}

function toSpec(stage: PlannedStage, out: any, byId: Record<string, MapNode>) {
  const terms: Record<string, { label: string }> = { ...out.terms };
  (stage.given || []).forEach((g) => { terms[g] = terms[g] || { label: byId[g].label }; });
  const given = (stage.given || []).slice(0, 4);
  return {
    id: 'gen', subject: stage.subject, title: out.stage.title, terms,
    stages: [{
      ...out.stage, given, needs: stage.given, builds: given, nodes: stage.nodes,
      dropped: out.dropEdges || [],
      edges: stage.edges.concat(stage.givenEdges)
        .filter(([a, b]: [string, string]) => !(out.dropEdges || []).some(([x, y]: [string, string]) => x === a && y === b))
        .concat(out.extraEdges || []),
    }],
  };
}

function check(stage: PlannedStage, text: string, byId: Record<string, MapNode>): { spec?: any; errs?: string[] } {
  try {
    const out = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    const spec = toSpec(stage, out, byId);
    const errs = validate(spec, stage.given);
    return errs.length ? { errs } : { spec };
  } catch (e: any) { return { errs: ['not valid JSON: ' + e.message] }; }
}

// Generates one stage live (2-3 short Claude calls at most: one attempt, then up to two retries with the checker's own feedback -
// the same shape generate.js's offline sequential mode uses), validates it with the exact same checker Economics is held to, then
// caches the compiled result forever. Charged to the requesting student's Locks like any other generation (see callClaudeJSON) -
// the route calling this is responsible for the same fresh-generation rate cap the old per-node generator already enforces.
export async function derivationGenericGenerate(info: GenericLookup, userId: string): Promise<Stage> {
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
    const missing = stage.given.filter((g: string) => !knownSet.has(g));
    if (missing.length) throw new DerivationStageNotReadyError(`Cannot generate stage ${info.stageIndex} yet - its prerequisite stage(s) for [${missing.join(', ')}] have not been generated first.`);
    known = [...knownSet];
  }

  let prompt = userPrompt(stage, info.byId, {});
  let result: { spec?: any; errs?: string[] } = {};
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
  for (let attempt = 0; attempt < 3; attempt++) {
    const userContent = attempt === 0 ? prompt : `${prompt}\n\nA previous attempt at this stage was rejected by the checker for:\n- ${(result.errs || []).join('\n- ')}\nReturn the corrected JSON only.`;
    const { text, usage } = await callClaudeJSONUnmetered({
      model: MODELS.diagnosticTree,
      systemPrompt: SYSTEM,
      userContent,
      maxTokens: 4000,
      cacheSystemPrompt: true,
    });
    totalUsage.input_tokens += usage.input_tokens || 0;
    totalUsage.output_tokens += usage.output_tokens || 0;
    totalUsage.cache_creation_input_tokens = (totalUsage.cache_creation_input_tokens || 0) + (usage.cache_creation_input_tokens || 0);
    totalUsage.cache_read_input_tokens = (totalUsage.cache_read_input_tokens || 0) + (usage.cache_read_input_tokens || 0);
    result = check(stage, text, info.byId);
    if (result.spec) break;
  }
  if (!result.spec) throw new Error('derivation generation failed the checker after 3 attempts: ' + (result.errs || []).join('; '));
  await chargeForClaudeCall(userId, MODELS.diagnosticTree, totalUsage, 'derivation-lesson-generation');
  if (stage.given?.length) result.spec.known = known;
  const built = build(result.spec);
  const terms: Record<string, StageTerm> = {};
  Object.keys(built.TERMS).forEach((k) => { terms[k] = built.TERMS[k]; });
  const compiled: Stage = { i: info.stageIndex, name: stage.nodes.join(','), edges: stage.edges, nodes: stage.nodes, concepts: stage.nodes, terms, stage: built.stages[0] };
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
export async function derivationGenericPayloadForKey(key: string): Promise<{ terms: Record<string, StageTerm>; stage: any } | null> {
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
  return { terms: stage.terms, stage: stage.stage };
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
