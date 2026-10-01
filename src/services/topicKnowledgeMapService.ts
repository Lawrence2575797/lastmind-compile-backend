// Generates a small knowledge-map graph for an arbitrary, free-text topic —
// the live counterpart to scripts/generate_knowledge_map.js's offline
// per-subject batch pipeline. Stored in the SAME knowledge_map_nodes/
// knowledge_map_edges tables every other subject uses, under the
// established "+Other" custom-subject convention (qualification: 'Other')
// already used for content with no real exam board — so once a topic's
// graph exists here, derivationGenericService.ts's existing per-node
// lesson generation (already subject-agnostic) can teach it with no
// changes of its own.
//
// NOT cached/shared across requests, by explicit product decision: every
// call to getOrCreateTopicKnowledgeMap generates a brand-new, private set
// of nodes, even if another student (or this same student, again later)
// typed the identical topic text before. The `exam_board` column (always
// '' for every other subject) is repurposed here as a short, random
// per-generation instance token so two independent generations of the
// same subject TEXT never collide on the table's real unique constraints
// (subject, qualification, exam_board, node_key) or on concept_id, without
// needing a schema change or an ownership column. A caller that already
// has a specific instance (the frontend's own `state.examBoard`, round-
// tripped from the original generation) passes it back in to extend that
// SAME instance further (see extendTopicMapBackward/Forward) — there is no
// way to "find" a topic by subject text alone any more, by design.
import { randomUUID } from 'crypto';
import { supabaseAdmin } from './supabaseAdmin';
import { callClaudeJSON, MODELS } from './claudeClient';
import { parseModelJson } from './jsonParsing';
import { TOPIC_KNOWLEDGE_MAP_PROMPT, TOPIC_MAP_EXTEND_BACKWARD_PROMPT, TOPIC_MAP_EXTEND_FORWARD_PROMPT } from '../constants/topicKnowledgeMapPrompt';
import { assertFreshGenerationWithinCap, recordFreshGenerationEvent } from './generationCapService';

export const TOPIC_QUALIFICATION = 'Other';
// Legacy constant: every topic map generated before caching was removed
// used this literal empty string as its exam_board. No longer used to
// generate new rows (see generateInstanceToken) — kept only because
// knowledgeMapAskService.ts's maybeAddGapNode used to compare against it;
// that comparison has been removed there (qualification alone is already
// the correct "is this a Cortex custom topic" signal, since exam_board is
// no longer a stable marker for one).
export const TOPIC_EXAM_BOARD = '';

// A short, URL-safe token identifying one specific generation instance of
// a custom topic. Not shown to the student anywhere - round-tripped
// opaquely through the frontend's own `state.examBoard` purely so a later
// extend-backward/extend-forward call can find the exact same instance
// again.
function generateInstanceToken(): string {
  return randomUUID().replace(/-/g, '').slice(0, 12);
}

export interface TopicMapNode {
  id: string;
  conceptId: string;
  label: string;
  description: string;
  // The generation prompt requires the LAST node in its own output to be the
  // final task/worked-example - but a DB read has no guaranteed row order
  // (no ORDER BY would reliably reconstruct "the model's last array
  // element" anyway, since a bulk insert can land several rows in the same
  // instant), so this is marked explicitly via the `theme` column at
  // insert time rather than left for a caller to infer from array position.
  isFinalTask: boolean;
}
export interface TopicMapEdge {
  from: string; // node id (not conceptId/uuid — matches the shape the frontend map UI already works with)
  to: string;
}
export interface TopicKnowledgeMap {
  subject: string;
  qualification: string;
  examBoard: string;
  nodes: TopicMapNode[];
  edges: TopicMapEdge[];
  cached: boolean;
}

// Same convention as ingest_knowledge_map.js's clean()/conceptId, so a
// topic map's concept ids resolve through the exact same
// mastery/FSRS/practice-question lookups every other subject's nodes do.
// exported for knowledgeMapAskService.ts's own additive-only gap-node
// insertion, which needs the identical concept_id convention when it adds
// a single new node to an existing (qualification: 'Other' only) map.
export function clean(s: string): string {
  return (s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

// Builds this topic's concept_id for one specific generation instance -
// the exam_board token is embedded here (not just in the row's own
// exam_board column) because concept_id carries its own separate unique
// constraint and is the stable join key concept_reviews/FSRS key off; two
// independent generations of the same subject text must never collide on
// it, even though they'd otherwise pick the same model-chosen node ids
// (e.g. both generations' model output using "what_is_a_matrix").
function conceptId(subject: string, examBoard: string, nodeId: string): string {
  return `${clean(subject)}:${examBoard}:${clean(nodeId)}`;
}

// A student's free-text topic becomes the `subject` column verbatim
// (trimmed/collapsed) - purely a display/grouping label now that lookups
// are scoped by exam_board token rather than subject text, but still
// capped/collapsed the same way so an accidental huge paste doesn't become
// an oversized column value.
export function normalizeTopicSubject(rawTopic: string): string {
  return rawTopic.trim().replace(/\s+/g, ' ').slice(0, 120);
}

interface RawTopicNode { id?: unknown; label?: unknown; description?: unknown }
interface RawTopicEdge { from?: unknown; to?: unknown }
interface RawTopicGraph { nodes?: RawTopicNode[]; edges?: RawTopicEdge[] }

// Same DAG check scripts/generate_knowledge_map.js's validate() runs
// offline, ported here for a single live-generated graph: every edge must
// reference a real node, no duplicate ids, and no cycle. Returns the
// specific problem so the caller can retry with the model told exactly
// what broke, rather than silently accepting a broken graph.
function validateGraph(nodes: { id: string }[], edges: { from: string; to: string }[]): string | null {
  const ids = new Set(nodes.map((n) => n.id));
  const dupes = nodes.map((n) => n.id).filter((id, i, arr) => arr.indexOf(id) !== i);
  if (dupes.length) return `duplicate node id(s): ${[...new Set(dupes)].join(', ')}`;

  const orphaned = edges.filter((e) => !ids.has(e.from) || !ids.has(e.to));
  if (orphaned.length) return `edge(s) reference a node id that doesn't exist: ${orphaned.map((e) => `${e.from}->${e.to}`).join(', ')}`;

  const adjacency = new Map<string, string[]>();
  nodes.forEach((n) => adjacency.set(n.id, []));
  edges.forEach((e) => adjacency.get(e.from)?.push(e.to));
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>(nodes.map((n) => [n.id, WHITE]));
  let cyclePath: string[] | null = null;
  function dfs(u: string, path: string[]): boolean {
    color.set(u, GRAY);
    for (const v of adjacency.get(u) || []) {
      if (color.get(v) === GRAY) { cyclePath = [...path, u, v]; return true; }
      if (color.get(v) === WHITE && dfs(v, [...path, u])) return true;
    }
    color.set(u, BLACK);
    return false;
  }
  for (const n of nodes) if (color.get(n.id) === WHITE && dfs(n.id, [])) break;
  if (cyclePath) return `contains a cycle: ${(cyclePath as string[]).join(' -> ')}`;

  const rootExists = nodes.some((n) => !edges.some((e) => e.to === n.id));
  if (!rootExists) return 'every node has a prerequisite — there is no real starting point';

  return null;
}

function coerceGraph(raw: RawTopicGraph): { nodes: { id: string; label: string; description: string }[]; edges: { from: string; to: string }[] } {
  const nodes = (raw.nodes || [])
    .filter((n): n is { id: string; label: string; description?: string } => typeof n?.id === 'string' && typeof n?.label === 'string' && !!n.id.trim() && !!n.label.trim())
    .map((n) => ({ id: n.id.trim(), label: n.label.trim(), description: typeof n.description === 'string' ? n.description.trim() : '' }));
  const edges = (raw.edges || [])
    .filter((e): e is { from: string; to: string } => typeof e?.from === 'string' && typeof e?.to === 'string')
    .map((e) => ({ from: e.from.trim(), to: e.to.trim() }))
    .filter((e) => e.from !== e.to);
  return { nodes, edges };
}

// Up to 2 attempts: a first try, then one retry with the validator's own
// specific complaint appended — same "tell it exactly what broke, don't
// just start over" pattern derivationGenericService.ts's generate() uses.
async function generateTopicGraph(topic: string, userId: string): Promise<{ nodes: { id: string; label: string; description: string }[]; edges: { from: string; to: string }[] }> {
  let lastError: string | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const userContent = attempt === 0
      ? `Topic: ${topic}`
      : `Topic: ${topic}\n\nYour previous attempt was rejected for: ${lastError}\nReturn corrected JSON only, following every rule again.`;
    const raw = await callClaudeJSON({
      model: MODELS.diagnosticTree,
      systemPrompt: TOPIC_KNOWLEDGE_MAP_PROMPT,
      userContent,
      maxTokens: 4000,
      temperature: 0.3,
      userId,
      meteredReason: 'topic-knowledge-map-generation',
    });
    const parsed = parseModelJson<RawTopicGraph>(raw);
    const { nodes, edges } = coerceGraph(parsed);
    if (nodes.length < 6) { lastError = `only ${nodes.length} valid node(s) were returned — need at least 8`; continue; }
    const problem = validateGraph(nodes, edges);
    if (!problem) return { nodes, edges };
    lastError = problem;
  }
  throw new Error(`Could not generate a valid knowledge map for "${topic}": ${lastError}`);
}

// Same DAG check as validateGraph above, but scoped to a backward
// extension: new edges may only run new-node -> new-node or new-node ->
// an existing root id (never the other direction, never into any other
// existing node), so a cycle can only ever form among the new nodes
// themselves — an edge landing on an existing root is necessarily
// terminal for this check.
function validateBackwardExtension(
  newNodes: { id: string }[],
  newEdges: { from: string; to: string }[],
  existingRootIds: Set<string>,
  existingIds: Set<string>
): string | null {
  const newIds = new Set(newNodes.map((n) => n.id));
  const collisions = newNodes.filter((n) => existingIds.has(n.id));
  if (collisions.length) return `new node id(s) collide with existing nodes: ${collisions.map((n) => n.id).join(', ')}`;
  const dupes = newNodes.map((n) => n.id).filter((id, i, arr) => arr.indexOf(id) !== i);
  if (dupes.length) return `duplicate new node id(s): ${[...new Set(dupes)].join(', ')}`;

  for (const e of newEdges) {
    if (!newIds.has(e.from)) return `edge from "${e.from}" is not one of the new nodes`;
    if (!newIds.has(e.to) && !existingRootIds.has(e.to)) return `edge to "${e.to}" must be a new node or one of the given existing root ids`;
  }

  const adjacency = new Map<string, string[]>();
  newNodes.forEach((n) => adjacency.set(n.id, []));
  newEdges.forEach((e) => { if (newIds.has(e.to)) adjacency.get(e.from)?.push(e.to); });
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>(newNodes.map((n) => [n.id, WHITE]));
  let cycle = false;
  function dfs(u: string): boolean {
    color.set(u, GRAY);
    for (const v of adjacency.get(u) || []) {
      if (color.get(v) === GRAY) return true;
      if (color.get(v) === WHITE && dfs(v)) return true;
    }
    color.set(u, BLACK);
    return false;
  }
  for (const n of newNodes) if (color.get(n.id) === WHITE && dfs(n.id)) { cycle = true; break; }
  if (cycle) return 'new nodes contain a cycle';

  const hasNewRoot = newNodes.some((n) => !newEdges.some((e) => e.to === n.id));
  if (!hasNewRoot) return 'every new node has a prerequisite among the new nodes — none of them is a real new starting point';

  return null;
}

// Mirror of validateBackwardExtension for the forward direction: new edges
// may only run existing-leaf-id -> new-node or new-node -> new-node (never
// back into an existing node), every new node needs a real predecessor
// (an existing leaf or another new node — nothing is "free-floating"), and
// at least one new node must be a genuine new endpoint (no new node
// depends on it) to become the map's new final task.
function validateForwardExtension(
  newNodes: { id: string }[],
  newEdges: { from: string; to: string }[],
  existingLeafIds: Set<string>,
  existingIds: Set<string>
): string | null {
  const newIds = new Set(newNodes.map((n) => n.id));
  const collisions = newNodes.filter((n) => existingIds.has(n.id));
  if (collisions.length) return `new node id(s) collide with existing nodes: ${collisions.map((n) => n.id).join(', ')}`;
  const dupes = newNodes.map((n) => n.id).filter((id, i, arr) => arr.indexOf(id) !== i);
  if (dupes.length) return `duplicate new node id(s): ${[...new Set(dupes)].join(', ')}`;

  for (const e of newEdges) {
    if (!newIds.has(e.to)) return `edge to "${e.to}" must be one of the new nodes — never point back into an existing node`;
    if (!newIds.has(e.from) && !existingLeafIds.has(e.from)) return `edge from "${e.from}" must be a new node or one of the given existing endpoint ids`;
  }

  const adjacency = new Map<string, string[]>();
  newNodes.forEach((n) => adjacency.set(n.id, []));
  newEdges.forEach((e) => { if (newIds.has(e.from)) adjacency.get(e.from)?.push(e.to); });
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>(newNodes.map((n) => [n.id, WHITE]));
  let cycle = false;
  function dfs(u: string): boolean {
    color.set(u, GRAY);
    for (const v of adjacency.get(u) || []) {
      if (color.get(v) === GRAY) return true;
      if (color.get(v) === WHITE && dfs(v)) return true;
    }
    color.set(u, BLACK);
    return false;
  }
  for (const n of newNodes) if (color.get(n.id) === WHITE && dfs(n.id)) { cycle = true; break; }
  if (cycle) return 'new nodes contain a cycle';

  const disconnected = newNodes.filter((n) => !newEdges.some((e) => e.to === n.id));
  if (disconnected.length) return `new node(s) have no incoming edge from the given existing endpoint(s) or another new node: ${disconnected.map((n) => n.id).join(', ')}`;

  const hasNewSink = newNodes.some((n) => !newEdges.some((e) => e.from === n.id));
  if (!hasNewSink) return 'every new node has something building on it — none of them is a real new endpoint for the map';

  return null;
}

// Mirrors generateTopicGraph's up-to-2-attempt, tell-it-what-broke retry
// shape, against the narrower TOPIC_MAP_EXTEND_BACKWARD_PROMPT.
async function generateBackwardExtension(
  topic: string,
  existingRoots: { id: string; label: string; description: string }[],
  existingIds: Set<string>,
  userId: string
): Promise<{ nodes: { id: string; label: string; description: string }[]; edges: { from: string; to: string }[] }> {
  const rootIds = new Set(existingRoots.map((r) => r.id));
  let lastError: string | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const base = `Topic: ${topic}\n\nExisting root node(s) the student doesn't understand:\n${JSON.stringify(existingRoots)}`;
    const userContent = attempt === 0
      ? base
      : `${base}\n\nYour previous attempt was rejected for: ${lastError}\nReturn corrected JSON only, following every rule again.`;
    const raw = await callClaudeJSON({
      model: MODELS.diagnosticTree,
      systemPrompt: TOPIC_MAP_EXTEND_BACKWARD_PROMPT,
      userContent,
      maxTokens: 3000,
      temperature: 0.3,
      userId,
      meteredReason: 'topic-knowledge-map-extend-backward',
    });
    const parsed = parseModelJson<RawTopicGraph>(raw);
    const { nodes, edges } = coerceGraph(parsed);
    if (nodes.length < 2) { lastError = `only ${nodes.length} valid new node(s) were returned — need at least 2`; continue; }
    const problem = validateBackwardExtension(nodes, edges, rootIds, existingIds);
    if (!problem) return { nodes, edges };
    lastError = problem;
  }
  throw new Error(`Could not extend the knowledge map for "${topic}" backward: ${lastError}`);
}

// Mirror of generateBackwardExtension for the forward direction.
async function generateForwardExtension(
  topic: string,
  existingLeaves: { id: string; label: string; description: string }[],
  existingIds: Set<string>,
  userId: string
): Promise<{ nodes: { id: string; label: string; description: string }[]; edges: { from: string; to: string }[] }> {
  const leafIds = new Set(existingLeaves.map((r) => r.id));
  let lastError: string | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const base = `Topic: ${topic}\n\nExisting endpoint node(s) to build forward from:\n${JSON.stringify(existingLeaves)}`;
    const userContent = attempt === 0
      ? base
      : `${base}\n\nYour previous attempt was rejected for: ${lastError}\nReturn corrected JSON only, following every rule again.`;
    const raw = await callClaudeJSON({
      model: MODELS.diagnosticTree,
      systemPrompt: TOPIC_MAP_EXTEND_FORWARD_PROMPT,
      userContent,
      maxTokens: 3000,
      temperature: 0.3,
      userId,
      meteredReason: 'topic-knowledge-map-extend-forward',
    });
    const parsed = parseModelJson<RawTopicGraph>(raw);
    const { nodes, edges } = coerceGraph(parsed);
    if (nodes.length < 2) { lastError = `only ${nodes.length} valid new node(s) were returned — need at least 2`; continue; }
    const problem = validateForwardExtension(nodes, edges, leafIds, existingIds);
    if (!problem) return { nodes, edges };
    lastError = problem;
  }
  throw new Error(`Could not extend the knowledge map for "${topic}" forward: ${lastError}`);
}

// Purely additive insert: new nodes plus edges that may terminate on an
// already-existing root (resolved via existingRootDbIdByNodeKey) — never
// touches an existing node row or any edge already in the table.
async function insertBackwardExtension(
  subject: string,
  examBoard: string,
  ownerUserId: string,
  nodes: { id: string; label: string; description: string }[],
  edges: { from: string; to: string }[],
  existingRootDbIdByNodeKey: Map<string, string>
): Promise<void> {
  const nodeRows = nodes.map((n) => ({
    concept_id: conceptId(subject, examBoard, n.id),
    subject,
    qualification: TOPIC_QUALIFICATION,
    exam_board: examBoard,
    owner_user_id: ownerUserId,
    node_key: n.id,
    label: n.label,
    subtopic: n.description,
    theme: null,
    difficulty: null,
  }));
  const { error: insertNodesErr } = await supabaseAdmin.from('knowledge_map_nodes').insert(nodeRows);
  if (insertNodesErr) throw insertNodesErr;

  const { data: insertedNodes, error: selectErr } = await supabaseAdmin
    .from('knowledge_map_nodes')
    .select('id, node_key')
    .eq('subject', subject).eq('qualification', TOPIC_QUALIFICATION).eq('exam_board', examBoard);
  if (selectErr) throw selectErr;
  const dbIdByNodeKey = new Map((insertedNodes || []).map((r: any) => [r.node_key as string, r.id as string]));
  existingRootDbIdByNodeKey.forEach((v, k) => dbIdByNodeKey.set(k, v));

  const edgeRows = edges
    .map((e) => ({ from_node_id: dbIdByNodeKey.get(e.from), to_node_id: dbIdByNodeKey.get(e.to) }))
    .filter((e): e is { from_node_id: string; to_node_id: string } => !!e.from_node_id && !!e.to_node_id);
  if (edgeRows.length) {
    const { error: insertEdgesErr } = await supabaseAdmin.from('knowledge_map_edges').insert(edgeRows);
    if (insertEdgesErr) throw insertEdgesErr;
  }
}

// Mirror of insertBackwardExtension for the forward direction, plus moving
// the "final task" marker: whichever existing node held it is no longer
// the map's true endpoint once something is added after it, and exactly
// one of the new nodes (the real new endpoint the validator required) is
// marked instead.
async function insertForwardExtension(
  subject: string,
  examBoard: string,
  ownerUserId: string,
  nodes: { id: string; label: string; description: string }[],
  edges: { from: string; to: string }[],
  existingLeafDbIdByNodeKey: Map<string, string>,
  oldFinalTaskDbId: string | null
): Promise<void> {
  const newSinkIds = new Set(nodes.filter((n) => !edges.some((e) => e.from === n.id)).map((n) => n.id));
  let newFinalTaskId: string | null = null;
  for (let i = nodes.length - 1; i >= 0; i--) {
    if (newSinkIds.has(nodes[i].id)) { newFinalTaskId = nodes[i].id; break; }
  }

  const nodeRows = nodes.map((n) => ({
    concept_id: conceptId(subject, examBoard, n.id),
    subject,
    qualification: TOPIC_QUALIFICATION,
    exam_board: examBoard,
    owner_user_id: ownerUserId,
    node_key: n.id,
    label: n.label,
    subtopic: n.description,
    theme: n.id === newFinalTaskId ? 'final_task' : null,
    difficulty: null,
  }));
  const { error: insertNodesErr } = await supabaseAdmin.from('knowledge_map_nodes').insert(nodeRows);
  if (insertNodesErr) throw insertNodesErr;

  const { data: insertedNodes, error: selectErr } = await supabaseAdmin
    .from('knowledge_map_nodes')
    .select('id, node_key')
    .eq('subject', subject).eq('qualification', TOPIC_QUALIFICATION).eq('exam_board', examBoard);
  if (selectErr) throw selectErr;
  const dbIdByNodeKey = new Map((insertedNodes || []).map((r: any) => [r.node_key as string, r.id as string]));
  existingLeafDbIdByNodeKey.forEach((v, k) => dbIdByNodeKey.set(k, v));

  const edgeRows = edges
    .map((e) => ({ from_node_id: dbIdByNodeKey.get(e.from), to_node_id: dbIdByNodeKey.get(e.to) }))
    .filter((e): e is { from_node_id: string; to_node_id: string } => !!e.from_node_id && !!e.to_node_id);
  if (edgeRows.length) {
    const { error: insertEdgesErr } = await supabaseAdmin.from('knowledge_map_edges').insert(edgeRows);
    if (insertEdgesErr) throw insertEdgesErr;
  }

  if (oldFinalTaskDbId && newFinalTaskId) {
    const { error: clearErr } = await supabaseAdmin.from('knowledge_map_nodes').update({ theme: null }).eq('id', oldFinalTaskDbId);
    if (clearErr) throw clearErr;
  }
}

// Adds new, earlier prerequisite nodes in front of an existing topic map
// INSTANCE's current root(s) — the fix for a map that was generated
// assuming too much starting knowledge (rule 8 in TOPIC_KNOWLEDGE_MAP_PROMPT
// tries to avoid this up front, but a student is still the real authority
// on whether a given root is actually common-sense to THEM). `examBoard`
// identifies the exact generation instance to extend (round-tripped from
// that instance's own original response) — not a subject-text lookup,
// since nothing is shared/cached any more. Throws if that instance doesn't
// exist — there is nothing to extend.
export async function extendTopicMapBackward(
  rawTopic: string,
  examBoard: string,
  userId: string,
  isPaid: boolean,
  accountCreatedAt: string | null,
  email?: string | null
): Promise<TopicKnowledgeMap> {
  const subject = normalizeTopicSubject(rawTopic);
  if (!subject) throw new Error('topic is required');
  if (!examBoard) throw new Error('a specific map instance is required');

  const existing = await findExistingTopicMap(subject, examBoard);
  if (!existing) throw new Error(`no existing knowledge map found for "${subject}"`);

  const existingIds = new Set(existing.nodes.map((n) => n.id));
  const rootIds = existing.nodes.map((n) => n.id).filter((id) => !existing.edges.some((e) => e.to === id));
  const existingRoots = existing.nodes.filter((n) => rootIds.includes(n.id)).map((n) => ({ id: n.id, label: n.label, description: n.description }));
  if (!existingRoots.length) throw new Error('could not find a root node to extend from');

  await assertFreshGenerationWithinCap(userId, isPaid, accountCreatedAt, email);
  const { nodes, edges } = await generateBackwardExtension(subject, existingRoots, existingIds, userId);

  const { data: rootRows, error: rootErr } = await supabaseAdmin
    .from('knowledge_map_nodes')
    .select('id, node_key')
    .eq('subject', subject).eq('qualification', TOPIC_QUALIFICATION).eq('exam_board', examBoard)
    .in('node_key', rootIds);
  if (rootErr) throw rootErr;
  const existingRootDbIdByNodeKey = new Map((rootRows || []).map((r: any) => [r.node_key as string, r.id as string]));

  await insertBackwardExtension(subject, examBoard, userId, nodes, edges, existingRootDbIdByNodeKey);
  await recordFreshGenerationEvent(userId);

  const updated = await findExistingTopicMap(subject, examBoard);
  if (!updated) throw new Error('extension succeeded but the map could not be re-read');
  return updated;
}

// Mirror of extendTopicMapBackward for the forward direction: adds new,
// more advanced nodes beyond the instance's current leaf/final-task
// node(s), moving the "final task" marker onto the new real endpoint.
export async function extendTopicMapForward(
  rawTopic: string,
  examBoard: string,
  userId: string,
  isPaid: boolean,
  accountCreatedAt: string | null,
  email?: string | null
): Promise<TopicKnowledgeMap> {
  const subject = normalizeTopicSubject(rawTopic);
  if (!subject) throw new Error('topic is required');
  if (!examBoard) throw new Error('a specific map instance is required');

  const existing = await findExistingTopicMap(subject, examBoard);
  if (!existing) throw new Error(`no existing knowledge map found for "${subject}"`);

  const existingIds = new Set(existing.nodes.map((n) => n.id));
  const leafIds = existing.nodes.map((n) => n.id).filter((id) => !existing.edges.some((e) => e.from === id));
  const existingLeaves = existing.nodes.filter((n) => leafIds.includes(n.id)).map((n) => ({ id: n.id, label: n.label, description: n.description }));
  if (!existingLeaves.length) throw new Error('could not find an endpoint node to extend from');

  await assertFreshGenerationWithinCap(userId, isPaid, accountCreatedAt, email);
  const { nodes, edges } = await generateForwardExtension(subject, existingLeaves, existingIds, userId);

  const { data: leafRows, error: leafErr } = await supabaseAdmin
    .from('knowledge_map_nodes')
    .select('id, node_key, theme')
    .eq('subject', subject).eq('qualification', TOPIC_QUALIFICATION).eq('exam_board', examBoard)
    .in('node_key', leafIds);
  if (leafErr) throw leafErr;
  const existingLeafDbIdByNodeKey = new Map((leafRows || []).map((r: any) => [r.node_key as string, r.id as string]));
  const oldFinalTaskRow = (leafRows || []).find((r: any) => r.theme === 'final_task');
  const oldFinalTaskDbId = oldFinalTaskRow ? (oldFinalTaskRow.id as string) : null;

  await insertForwardExtension(subject, examBoard, userId, nodes, edges, existingLeafDbIdByNodeKey, oldFinalTaskDbId);
  await recordFreshGenerationEvent(userId);

  const updated = await findExistingTopicMap(subject, examBoard);
  if (!updated) throw new Error('extension succeeded but the map could not be re-read');
  return updated;
}

async function findExistingTopicMap(subject: string, examBoard: string): Promise<TopicKnowledgeMap | null> {
  const { data: nodeRows, error: nodeErr } = await supabaseAdmin
    .from('knowledge_map_nodes')
    .select('id, concept_id, node_key, label, subtopic, theme')
    .eq('subject', subject)
    .eq('qualification', TOPIC_QUALIFICATION)
    .eq('exam_board', examBoard);
  if (nodeErr) throw nodeErr;
  if (!nodeRows || nodeRows.length < 3) return null;

  const idByDbId = new Map(nodeRows.map((r: any) => [r.id as string, r.node_key as string]));
  const { data: edgeRows, error: edgeErr } = await supabaseAdmin
    .from('knowledge_map_edges')
    .select('from_node_id, to_node_id')
    .in('from_node_id', nodeRows.map((r: any) => r.id));
  if (edgeErr) throw edgeErr;

  return {
    subject,
    qualification: TOPIC_QUALIFICATION,
    examBoard,
    nodes: nodeRows.map((r: any) => ({ id: r.node_key as string, conceptId: r.concept_id as string, label: r.label as string, description: (r.subtopic as string) || '', isFinalTask: r.theme === 'final_task' })),
    edges: (edgeRows || [])
      .map((e: any) => ({ from: idByDbId.get(e.from_node_id), to: idByDbId.get(e.to_node_id) }))
      .filter((e: any): e is TopicMapEdge => !!e.from && !!e.to),
    cached: true,
  };
}

// Inserts a freshly generated, already-validated graph under its own
// brand-new instance token, then re-selects the DB-assigned uuids to wire
// edges — same two-step shape ingest_knowledge_map.js uses (a node's real
// id isn't known until after insert). `description` is stored in the
// `subtopic` column: this table has no free-text description column of
// its own, and subtopic is unused/empty for an ad-hoc topic anyway (there's
// no real curriculum subtopic to group by), so it's a safe, honest reuse
// rather than a new migration for a single extra string field.
async function insertTopicGraph(subject: string, examBoard: string, ownerUserId: string, nodes: { id: string; label: string; description: string }[], edges: { from: string; to: string }[]): Promise<TopicKnowledgeMap> {
  const nodeRows = nodes.map((n, i) => ({
    concept_id: conceptId(subject, examBoard, n.id),
    subject,
    qualification: TOPIC_QUALIFICATION,
    exam_board: examBoard,
    owner_user_id: ownerUserId,
    node_key: n.id,
    label: n.label,
    subtopic: n.description,
    theme: i === nodes.length - 1 ? 'final_task' : null,
    difficulty: null,
  }));
  const { error: insertNodesErr } = await supabaseAdmin.from('knowledge_map_nodes').insert(nodeRows);
  if (insertNodesErr) throw insertNodesErr;

  const { data: insertedNodes, error: selectErr } = await supabaseAdmin
    .from('knowledge_map_nodes')
    .select('id, node_key')
    .eq('subject', subject).eq('qualification', TOPIC_QUALIFICATION).eq('exam_board', examBoard);
  if (selectErr) throw selectErr;
  const dbIdByNodeKey = new Map((insertedNodes || []).map((r: any) => [r.node_key as string, r.id as string]));

  const edgeRows = edges
    .map((e) => ({ from_node_id: dbIdByNodeKey.get(e.from), to_node_id: dbIdByNodeKey.get(e.to) }))
    .filter((e): e is { from_node_id: string; to_node_id: string } => !!e.from_node_id && !!e.to_node_id);
  if (edgeRows.length) {
    const { error: insertEdgesErr } = await supabaseAdmin.from('knowledge_map_edges').insert(edgeRows);
    if (insertEdgesErr) throw insertEdgesErr;
  }

  return {
    subject,
    qualification: TOPIC_QUALIFICATION,
    examBoard,
    nodes: nodes.map((n, i) => ({ id: n.id, conceptId: conceptId(subject, examBoard, n.id), label: n.label, description: n.description, isFinalTask: i === nodes.length - 1 })),
    edges,
    cached: false,
  };
}

// Always generates a brand-new, private map instance — see this file's own
// top comment for why nothing is looked up/reused by subject text any
// more. `isPaid`/`accountCreatedAt`/`email` are threaded through exactly
// as the existing node-lesson route already does (see GET
// /knowledge-map-v2/node/:nodeId/lesson) — this reuses the same
// Locks-gated cap, not a new one, so a topic-map generation costs exactly
// like any other fresh generation already does (and now applies on EVERY
// call, not just a cache miss, since every call is one).
export async function getOrCreateTopicKnowledgeMap(
  rawTopic: string,
  userId: string,
  isPaid: boolean,
  accountCreatedAt: string | null,
  email?: string | null
): Promise<TopicKnowledgeMap> {
  const subject = normalizeTopicSubject(rawTopic);
  if (!subject) throw new Error('topic is required');

  await assertFreshGenerationWithinCap(userId, isPaid, accountCreatedAt, email);
  const examBoard = generateInstanceToken();
  const { nodes, edges } = await generateTopicGraph(subject, userId);
  const result = await insertTopicGraph(subject, examBoard, userId, nodes, edges);
  await recordFreshGenerationEvent(userId);
  return result;
}

export interface MyCustomTopicSummary {
  subject: string;
  examBoard: string;
  nodeCount: number;
}

// Lists this student's own Cortex-built custom topics, so they can be
// surfaced in the "Your Mind" tab even before any real progress
// (concept_reviews rows) exists for them - the unified cross-subject view
// (getUnifiedKnowledgeMapForUser) only shows concepts with actual review
// history, so a freshly-built, not-yet-started map would otherwise be
// invisible outside the Cortex chat that built it. Grouped by (subject,
// examBoard) since each generation is now its own private instance (see
// this file's own top comment) - the same subject text typed twice is two
// separate rows here, not one.
export async function listMyCustomTopics(userId: string): Promise<MyCustomTopicSummary[]> {
  const { data, error } = await supabaseAdmin
    .from('knowledge_map_nodes')
    .select('subject, exam_board')
    .eq('qualification', TOPIC_QUALIFICATION)
    .eq('owner_user_id', userId);
  if (error) throw error;

  const counts = new Map<string, MyCustomTopicSummary>();
  (data || []).forEach((r: any) => {
    const key = `${r.subject}\u0000${r.exam_board}`;
    const existing = counts.get(key);
    if (existing) existing.nodeCount += 1;
    else counts.set(key, { subject: r.subject as string, examBoard: r.exam_board as string, nodeCount: 1 });
  });
  return Array.from(counts.values()).sort((a, b) => b.nodeCount - a.nodeCount);
}
