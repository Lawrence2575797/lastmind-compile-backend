// Generates (or reuses a cached) small knowledge-map graph for an
// arbitrary, free-text topic — the live counterpart to
// scripts/generate_knowledge_map.js's offline per-subject batch pipeline.
// Stored in the SAME knowledge_map_nodes/knowledge_map_edges tables every
// other subject uses, under the established "+Other" custom-subject
// convention (qualification: 'Other', examBoard: '') already used for
// content with no real exam board (see the Italian knowledge map built
// the same way) — so once a topic's graph exists here,
// derivationGenericService.ts's existing per-node lesson generation
// (already subject-agnostic) can teach it with no changes of its own.
//
// The first student to ask for a given topic pays the one-time generation
// cost (charged automatically through callClaudeJSON's Locks metering);
// every later request for the same topic (matched case-insensitively) is
// a plain cached DB read, same contract as every other on-demand
// generation in this codebase.
import { supabaseAdmin } from './supabaseAdmin';
import { callClaudeJSON, MODELS } from './claudeClient';
import { parseModelJson } from './jsonParsing';
import { TOPIC_KNOWLEDGE_MAP_PROMPT } from '../constants/topicKnowledgeMapPrompt';
import { assertFreshGenerationWithinCap, recordFreshGenerationEvent } from './generationCapService';

export const TOPIC_QUALIFICATION = 'Other';
export const TOPIC_EXAM_BOARD = '';

export interface TopicMapNode {
  id: string;
  conceptId: string;
  label: string;
  description: string;
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
function clean(s: string): string {
  return (s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

// A student's free-text topic becomes the `subject` column verbatim
// (trimmed/collapsed), so "teach me the envelope theorem" and "Envelope
// Theorem" resolve to the same cached row via the case-insensitive lookup
// below, without silently merging genuinely different topics together.
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

async function findExistingTopicMap(subject: string): Promise<TopicKnowledgeMap | null> {
  const { data: nodeRows, error: nodeErr } = await supabaseAdmin
    .from('knowledge_map_nodes')
    .select('id, concept_id, node_key, label, subtopic')
    .ilike('subject', subject)
    .eq('qualification', TOPIC_QUALIFICATION)
    .eq('exam_board', TOPIC_EXAM_BOARD);
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
    examBoard: TOPIC_EXAM_BOARD,
    nodes: nodeRows.map((r: any) => ({ id: r.node_key as string, conceptId: r.concept_id as string, label: r.label as string, description: (r.subtopic as string) || '' })),
    edges: (edgeRows || [])
      .map((e: any) => ({ from: idByDbId.get(e.from_node_id), to: idByDbId.get(e.to_node_id) }))
      .filter((e: any): e is TopicMapEdge => !!e.from && !!e.to),
    cached: true,
  };
}

// Inserts a freshly generated, already-validated graph, then re-selects
// the DB-assigned uuids to wire edges — same two-step shape
// ingest_knowledge_map.js uses (a node's real id isn't known until after
// insert). `description` is stored in the `subtopic` column: this table
// has no free-text description column of its own, and subtopic is
// unused/empty for an ad-hoc topic anyway (there's no real curriculum
// subtopic to group by), so it's a safe, honest reuse rather than a new
// migration for a single extra string field.
async function insertTopicGraph(subject: string, nodes: { id: string; label: string; description: string }[], edges: { from: string; to: string }[]): Promise<TopicKnowledgeMap> {
  const nodeRows = nodes.map((n) => ({
    concept_id: `${clean(subject)}:${clean(n.id)}`,
    subject,
    qualification: TOPIC_QUALIFICATION,
    exam_board: TOPIC_EXAM_BOARD,
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
    .eq('subject', subject).eq('qualification', TOPIC_QUALIFICATION).eq('exam_board', TOPIC_EXAM_BOARD);
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
    examBoard: TOPIC_EXAM_BOARD,
    nodes: nodes.map((n) => ({ id: n.id, conceptId: `${clean(subject)}:${clean(n.id)}`, label: n.label, description: n.description })),
    edges,
    cached: false,
  };
}

// Orchestrates the whole cached-or-generate flow. `isPaid`/`accountCreatedAt`/`email`
// are threaded through exactly as the existing node-lesson route already
// does (see GET /knowledge-map-v2/node/:nodeId/lesson) — this reuses the
// same Locks-gated cap, not a new one, so a topic-map generation costs
// exactly like any other fresh generation already does.
export async function getOrCreateTopicKnowledgeMap(
  rawTopic: string,
  userId: string,
  isPaid: boolean,
  accountCreatedAt: string | null,
  email?: string | null
): Promise<TopicKnowledgeMap> {
  const subject = normalizeTopicSubject(rawTopic);
  if (!subject) throw new Error('topic is required');

  const existing = await findExistingTopicMap(subject);
  if (existing) return existing;

  await assertFreshGenerationWithinCap(userId, isPaid, accountCreatedAt, email);
  const { nodes, edges } = await generateTopicGraph(subject, userId);
  const result = await insertTopicGraph(subject, nodes, edges);
  await recordFreshGenerationEvent(userId);
  return result;
}
