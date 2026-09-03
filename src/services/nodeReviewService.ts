import { supabaseAdmin } from './supabaseAdmin';
import { callClaudeJSON, MODELS } from './claudeClient';
import { parseModelJson } from './jsonParsing';
import { KNOWLEDGE_MAP_ANSWER_CHECK_PROMPT } from '../constants/knowledgeMapAnswerCheckPrompt';
import { AO1_REWORD_QUESTION_PROMPT, AO1_SLIP_CHECK_PROMPT, LINK_IDENTIFY_GRADE_PROMPT } from '../constants/nodeReviewPrompts';

// The node-level spaced review. A node's own AO1 concept_id is reused
// as-is for its reworded retrieval question (same concept, same FSRS
// history as its original encoding). The two per-link components below
// each get their OWN concept_id so they can genuinely have different
// stabilities - "identify" reuses the bare from->to key the diagnostic
// gate's own transfer/integration checks already write into (see
// chainDiagnosticService.ts's resolveComponent - the same underlying
// skill: has this student ever crossed this specific bridge), while
// "integration" gets a new suffixed key since it's a distinct, harder
// test of the same link that deserves its own schedule.
export function linkIdentifyConceptId(fromConceptId: string, toConceptId: string): string {
  return `${fromConceptId}->${toConceptId}`;
}
export function linkIntegrationConceptId(fromConceptId: string, toConceptId: string): string {
  return `${fromConceptId}->${toConceptId}::integration`;
}

interface NodeRow {
  id: string;
  label: string;
  concept_id: string;
}

// A node's own spaced review only exists once it has at least one direct
// downstream neighbor that's ALSO been encoded - testing a connection to
// something never taught yet tests nothing real (same reasoning as
// findMissingEncoding in routes/knowledgeMap.ts). "Direct" is automatic
// here: knowledge_map_edges only ever stores direct prerequisite links,
// never a transitive closure, so every edge returned already IS a direct
// link - across however many other chains/topics this node connects
// into, not just its own, all of them tested together in one session.
export interface QualifyingLink {
  fromNode: NodeRow;
  toNode: NodeRow;
}

export async function getQualifyingReviewLinks(userId: string, nodeId: string): Promise<QualifyingLink[]> {
  const { data: edges, error: edgeErr } = await supabaseAdmin
    .from('knowledge_map_edges')
    .select('from_node_id, to_node_id')
    .eq('from_node_id', nodeId);
  if (edgeErr) throw edgeErr;
  if (!edges || !edges.length) return [];

  const { data: fromNode, error: fromErr } = await supabaseAdmin
    .from('knowledge_map_nodes')
    .select('id, label, concept_id')
    .eq('id', nodeId)
    .maybeSingle<NodeRow>();
  if (fromErr) throw fromErr;
  if (!fromNode) return [];

  const targetIds = edges.map((e) => e.to_node_id as string);
  const { data: targetNodes, error: nodeErr } = await supabaseAdmin
    .from('knowledge_map_nodes')
    .select('id, label, concept_id')
    .in('id', targetIds);
  if (nodeErr) throw nodeErr;
  const targetById = new Map((targetNodes || []).map((n) => [n.id as string, n as NodeRow]));

  const targetConceptIds = Array.from(targetById.values()).map((n) => n.concept_id);
  const { data: reviewedRows, error: reviewErr } = await supabaseAdmin
    .from('concept_reviews')
    .select('concept_id')
    .eq('user_id', userId)
    .in('concept_id', targetConceptIds);
  if (reviewErr) throw reviewErr;
  const encodedConceptIds = new Set((reviewedRows || []).map((r) => r.concept_id as string));

  const links: QualifyingLink[] = [];
  edges.forEach((e) => {
    const target = targetById.get(e.to_node_id as string);
    if (target && encodedConceptIds.has(target.concept_id)) {
      links.push({ fromNode, toNode: target });
    }
  });
  return links;
}

async function fetchNodeExplanationAndAo1(nodeId: string): Promise<{ explanation: string; questionText: string } | null> {
  const { data: lesson } = await supabaseAdmin
    .from('knowledge_map_node_lessons')
    .select('encoding_content')
    .eq('node_id', nodeId)
    .maybeSingle();
  const content = lesson?.encoding_content as { explanation?: string; practiceQuestion?: { questionText?: string } } | null;
  if (!content?.practiceQuestion?.questionText) return null;
  return { explanation: content.explanation || '', questionText: content.practiceQuestion.questionText };
}

export async function generateRewordedAo1Question(nodeId: string): Promise<{ questionText: string } | null> {
  const source = await fetchNodeExplanationAndAo1(nodeId);
  if (!source) return null;
  const raw = await callClaudeJSON({
    model: MODELS.simpleQuestion,
    systemPrompt: AO1_REWORD_QUESTION_PROMPT,
    userContent: `Explanation: ${source.explanation}\n\nOriginal question: ${source.questionText}`,
    temperature: 0.4,
  });
  return parseModelJson<{ questionText: string }>(raw);
}

export async function gradeRewordedAo1Answer(nodeId: string, questionText: string, answer: string): Promise<{ correct: boolean; feedback: string } | null> {
  const source = await fetchNodeExplanationAndAo1(nodeId);
  if (!source) return null;
  const raw = await callClaudeJSON({
    model: MODELS.simpleQuestion,
    systemPrompt: KNOWLEDGE_MAP_ANSWER_CHECK_PROMPT,
    userContent: `Question: ${questionText}\nMark scheme: ${source.explanation}\nStudent's answer: ${answer}`,
    temperature: 0.1,
  });
  return parseModelJson<{ correct: boolean; feedback: string }>(raw);
}

// Only ever called on a WRONG AO1 answer, before any FSRS lapse is
// recorded (see routes/knowledgeMap.ts's ao1/submit) - distinguishes a
// one-word slip from a genuine gap, see AO1_SLIP_CHECK_PROMPT's own
// comment for the narrow bar. The caller re-grades the corrected answer
// through gradeRewordedAo1Answer itself once the student fixes the
// flagged word, rather than duplicating that grading logic here.
export async function checkAo1SlipCandidate(nodeId: string, questionText: string, answer: string): Promise<{ isSlip: boolean; wrongPhrase: string } | null> {
  const source = await fetchNodeExplanationAndAo1(nodeId);
  if (!source) return null;
  const raw = await callClaudeJSON({
    model: MODELS.simpleQuestion,
    systemPrompt: AO1_SLIP_CHECK_PROMPT,
    userContent: `Question: ${questionText}\nExplanation (ground truth): ${source.explanation}\nStudent's wrong answer: ${answer}`,
    temperature: 0.1,
  });
  return parseModelJson<{ isSlip: boolean; wrongPhrase: string }>(raw);
}

interface ResolvedEdge {
  fromNode: NodeRow;
  toNode: NodeRow;
  linkTeaching: string;
  integrationQuestion: { questionText?: string; markScheme?: string; diagramSpec?: unknown } | null;
}

// Keyed off the endpoint node ids, same convention every other edge
// lookup in this app already uses (findMissingEncoding, text-question/
// submit, diagram-question/submit) - the frontend's subject-wide graph
// only ever carries source/target node ids, never a raw edge id.
async function resolveEdgeForReview(fromNodeId: string, toNodeId: string): Promise<ResolvedEdge | null> {
  const { data: edge } = await supabaseAdmin
    .from('knowledge_map_edges')
    .select('id, from_node_id, to_node_id')
    .eq('from_node_id', fromNodeId)
    .eq('to_node_id', toNodeId)
    .maybeSingle();
  if (!edge) return null;
  const [{ data: fromNode }, { data: toNode }, { data: lesson }] = await Promise.all([
    supabaseAdmin.from('knowledge_map_nodes').select('id, label, concept_id').eq('id', edge.from_node_id).maybeSingle<NodeRow>(),
    supabaseAdmin.from('knowledge_map_nodes').select('id, label, concept_id').eq('id', edge.to_node_id).maybeSingle<NodeRow>(),
    supabaseAdmin.from('knowledge_map_edge_lessons').select('link_teaching_content, integration_question').eq('edge_id', edge.id).maybeSingle(),
  ]);
  if (!fromNode || !toNode) return null;
  return {
    fromNode,
    toNode,
    linkTeaching: (lesson?.link_teaching_content as string) || '',
    integrationQuestion: (lesson?.integration_question as ResolvedEdge['integrationQuestion']) || null,
  };
}

// "Identify the link" used to hide the edge's own link-teaching text
// behind a freshly LLM-generated disguised question - unreliable in
// practice, since the model would often write something that read as an
// "explain" question, integration's own job. A later version showed the
// text outright and asked for a full restatement, which fixed that but
// created a new version of the same overlap: graded against the FULL
// link-teaching text (which itself states WHY the link exists), a
// correct short answer kept getting marked down for "not explaining
// more" - identify nagging for integration's own depth again, just from
// the mark scheme instead of the question wording. Now it's a plain
// one-word/short-phrase naming check with nothing shown up front (a
// real recall test, not a "read this and repeat it" exercise) - see
// LINK_IDENTIFY_GRADE_PROMPT for the grading side, which explicitly
// forbids expecting explanation at all. getEdgeLabelsForIdentify only
// confirms the edge exists and has something to identify (never sends
// the link-teaching text to the client - showing it would give away
// exactly what this step is meant to test).
export async function getEdgeLabelsForIdentify(fromNodeId: string, toNodeId: string): Promise<{ fromLabel: string; toLabel: string } | null> {
  const edge = await resolveEdgeForReview(fromNodeId, toNodeId);
  if (!edge || !edge.linkTeaching) return null;
  return { fromLabel: edge.fromNode.label, toLabel: edge.toNode.label };
}

export async function gradeLinkIdentifyAnswer(fromNodeId: string, toNodeId: string, answer: string): Promise<{ correct: boolean; feedback: string } | null> {
  const edge = await resolveEdgeForReview(fromNodeId, toNodeId);
  if (!edge || !edge.linkTeaching) return null;
  const raw = await callClaudeJSON({
    model: MODELS.simpleQuestion,
    systemPrompt: LINK_IDENTIFY_GRADE_PROMPT,
    userContent: `Concept A: ${edge.fromNode.label}\nConcept B: ${edge.toNode.label}\nReference (ground truth, never reveal): ${edge.linkTeaching}\nStudent's answer: ${answer}`,
    temperature: 0.1,
  });
  return parseModelJson<{ correct: boolean; feedback: string }>(raw);
}

// Text-only by design (see nodeReviewPrompts.ts's own comment) - an edge
// whose stored integration question is diagram-typed (some Economics
// content) has nothing this step can ask, so the caller skips it for
// that edge rather than rendering a broken text box.
export async function getIntegrationQuestionText(fromNodeId: string, toNodeId: string): Promise<{ questionText: string; markScheme: string } | null> {
  const edge = await resolveEdgeForReview(fromNodeId, toNodeId);
  if (!edge?.integrationQuestion?.questionText || edge.integrationQuestion.diagramSpec) return null;
  return { questionText: edge.integrationQuestion.questionText, markScheme: edge.integrationQuestion.markScheme || '' };
}

export async function gradeIntegrationAnswer(fromNodeId: string, toNodeId: string, answer: string): Promise<{ correct: boolean; feedback: string } | null> {
  const question = await getIntegrationQuestionText(fromNodeId, toNodeId);
  if (!question) return null;
  const raw = await callClaudeJSON({
    model: MODELS.simpleQuestion,
    systemPrompt: KNOWLEDGE_MAP_ANSWER_CHECK_PROMPT,
    userContent: `Question: ${question.questionText}\nMark scheme: ${question.markScheme}\nStudent's answer: ${answer}`,
    temperature: 0.1,
  });
  return parseModelJson<{ correct: boolean; feedback: string }>(raw);
}
