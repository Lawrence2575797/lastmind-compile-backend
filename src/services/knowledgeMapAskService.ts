// Backs the "Ask Cortex" corner panel shown during a knowledge-map
// lesson (see routes/knowledgeMap.ts's POST .../ask). Purely advisory
// and stateless — reads a node's own already-generated content for
// context, never writes anything, never touches FSRS or credits.
import { supabaseAdmin } from './supabaseAdmin';
import { callClaudeJSON, MODELS } from './claudeClient';
import { parseModelJson } from './jsonParsing';
import { KNOWLEDGE_MAP_ASK_PROMPT } from '../constants/knowledgeMapAskPrompt';
import { clean, TOPIC_QUALIFICATION, TOPIC_EXAM_BOARD } from './topicKnowledgeMapService';

interface NodeEncodingContentForAsk {
  explanation?: string;
  practiceQuestion?: { questionText?: string };
}

export interface KnowledgeMapAskResult {
  redirected: boolean;
  answer: string;
  // Set only when the student's question revealed a genuine prerequisite
  // gap and it was actually added (see maybeAddGapNode) - never set for a
  // curated official subject, only ever for a Cortex-generated custom
  // topic (qualification 'Other'), and always additive: a brand new node
  // wired in as a prerequisite of the current one, nothing existing is
  // ever edited or removed.
  addedNode?: { id: string; label: string };
}

interface RawGapNode { id?: unknown; label?: unknown; description?: unknown }

// Wires a proposed gap-fill node into an EXISTING custom-topic map, purely
// additively: a new node (or an already-existing one with the same id, so
// two students asking about the same gap converge on one node rather than
// duplicating it) plus exactly one new edge into the node the question was
// asked from. Never touches any other node or edge. Silently declines (does
// not throw) for anything that isn't a Cortex-generated custom topic
// (qualification !== 'Other') - the curated official subject maps
// (Economics, AQA Biology, ...) are never mutated by a student's own
// question, no matter what the model proposes.
async function maybeAddGapNode(
  targetNodeId: string,
  subject: string,
  qualification: string,
  examBoard: string,
  raw: RawGapNode | undefined
): Promise<{ id: string; label: string } | null> {
  if (!raw || qualification !== TOPIC_QUALIFICATION || examBoard !== TOPIC_EXAM_BOARD) return null;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  const label = typeof raw.label === 'string' ? raw.label.trim() : '';
  const description = typeof raw.description === 'string' ? raw.description.trim() : '';
  if (!id || !label) return null;

  const { data: existing } = await supabaseAdmin
    .from('knowledge_map_nodes').select('id, label')
    .eq('subject', subject).eq('qualification', qualification).eq('exam_board', examBoard).eq('node_key', id)
    .maybeSingle();

  let gapDbId: string, gapLabel: string;
  if (existing) {
    // Reusing an already-present node (two students' questions converged on
    // the same gap) is the one case that can create a cycle: if that node
    // is already reachable FROM targetNodeId (some existing path
    // targetNodeId -> ... -> existing already exists), adding existing ->
    // targetNodeId on top would close a loop. A brand-new insert below can
    // never do this - a node with no prior edges cannot already be part of
    // any path. Cheap BFS over just this one subject's edges, not the
    // whole table.
    const { data: subjNodes } = await supabaseAdmin.from('knowledge_map_nodes').select('id').eq('subject', subject).eq('qualification', qualification).eq('exam_board', examBoard);
    const ids = (subjNodes || []).map((r: any) => r.id as string);
    const { data: subjEdges } = ids.length ? await supabaseAdmin.from('knowledge_map_edges').select('from_node_id, to_node_id').in('from_node_id', ids) : { data: [] as any[] };
    const adj = new Map<string, string[]>();
    (subjEdges || []).forEach((e: any) => {
      if (!adj.has(e.from_node_id)) adj.set(e.from_node_id, []);
      adj.get(e.from_node_id)!.push(e.to_node_id);
    });
    const seen = new Set<string>(), stack = [targetNodeId];
    let wouldCycle = false;
    while (stack.length) {
      const n = stack.pop()!;
      if (n === (existing.id as string)) { wouldCycle = true; break; }
      if (seen.has(n)) continue;
      seen.add(n);
      (adj.get(n) || []).forEach((m) => stack.push(m));
    }
    if (wouldCycle) return null; // decline silently rather than corrupt the map's DAG property
    gapDbId = existing.id as string; gapLabel = existing.label as string;
  } else {
    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('knowledge_map_nodes')
      .insert({ concept_id: `${clean(subject)}:${clean(id)}`, subject, qualification, exam_board: examBoard, node_key: id, label, subtopic: description, theme: null, difficulty: null })
      .select('id, label').single();
    if (insertErr || !inserted) { console.error('Gap-node insert failed:', insertErr); return null; }
    gapDbId = inserted.id as string; gapLabel = inserted.label as string;
  }

  const { data: edgeExists } = await supabaseAdmin
    .from('knowledge_map_edges').select('id').eq('from_node_id', gapDbId).eq('to_node_id', targetNodeId).maybeSingle();
  if (!edgeExists) {
    const { error: edgeErr } = await supabaseAdmin.from('knowledge_map_edges').insert({ from_node_id: gapDbId, to_node_id: targetNodeId, difficulty: null });
    if (edgeErr) console.error('Gap-node edge insert failed:', edgeErr);
  }
  return { id, label: gapLabel };
}

// Returns null only if the node itself doesn't exist (caller 404s) — a
// node with no lesson content yet still gets an answer, just without the
// explanation/current-question context (subject/qualification/label
// alone are still enough for the off-subject check and a general answer).
export async function answerKnowledgeMapQuestion(nodeId: string, question: string, userId: string): Promise<KnowledgeMapAskResult | null> {
  const [{ data: node }, { data: lesson }] = await Promise.all([
    supabaseAdmin.from('knowledge_map_nodes').select('label, subtopic, subject, qualification, exam_board').eq('id', nodeId).maybeSingle(),
    supabaseAdmin.from('knowledge_map_node_lessons').select('encoding_content').eq('node_id', nodeId).maybeSingle(),
  ]);
  if (!node) return null;
  const content = lesson?.encoding_content as NodeEncodingContentForAsk | null;

  const userContent = [
    `Subject: ${node.subject}`,
    `Qualification: ${node.qualification || 'unspecified'}`,
    `Exam board: ${node.exam_board || 'unspecified'}`,
    `This lesson's own concept: ${node.label}`,
    content?.explanation ? `Its own explanation:\n${content.explanation}` : null,
    content?.practiceQuestion?.questionText
      ? `Current on-screen question (not yet answered by the student): ${content.practiceQuestion.questionText}`
      : '(no practice question currently on screen)',
    '',
    `Student's question, asked from the corner panel: ${question}`,
  ].filter(Boolean).join('\n');

  const raw = await callClaudeJSON({
    model: MODELS.diagnosticTree,
    systemPrompt: KNOWLEDGE_MAP_ASK_PROMPT,
    userContent,
    temperature: 0.4,
    userId,
    meteredReason: 'knowledge-map-v2-ask-cortex',
  });
  const parsed = parseModelJson<KnowledgeMapAskResult & { gapNode?: RawGapNode }>(raw);
  const { gapNode, ...result } = parsed;
  if (!parsed.redirected && gapNode) {
    const added = await maybeAddGapNode(nodeId, node.subject as string, node.qualification as string, node.exam_board as string, gapNode);
    if (added) result.addedNode = added;
  }
  return result;
}
