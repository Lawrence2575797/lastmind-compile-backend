import { supabaseAdmin } from './supabaseAdmin';
import { callClaudeJSON, MODELS } from './claudeClient';
import { parseModelJson, parseCorrectFeedbackJson } from './jsonParsing';
import { KNOWLEDGE_MAP_ANSWER_CHECK_PROMPT } from '../constants/knowledgeMapAnswerCheckPrompt';
import { AO1_REWORD_QUESTION_PROMPT, AO1_SLIP_CHECK_PROMPT } from '../constants/nodeReviewPrompts';

type NodeEncodingContent = {
  explanation?: string;
  practiceQuestion?: { questionText?: string; modality?: 'reading' | 'writing' | 'listening' | 'speaking'; audioText?: string };
  rewordedAo1Questions?: string[];
};

// The node-level spaced review. A node's own AO1 concept_id is reused
// as-is for its reworded retrieval question (same concept, same FSRS
// history as its original encoding). Each link's integration gets its
// own suffixed concept_id, distinct from the bare from->to key the
// diagnostic gate's own transfer check writes into (see
// chainDiagnosticService.ts's resolveComponent) - a different, harder
// test of the same link deserves its own schedule.
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

async function fetchNodeExplanationAndAo1(nodeId: string): Promise<{ explanation: string; questionText: string; rewordedPool: string[]; modality?: 'reading' | 'writing' | 'listening' | 'speaking'; audioText?: string } | null> {
  const { data: lesson } = await supabaseAdmin
    .from('knowledge_map_node_lessons')
    .select('encoding_content')
    .eq('node_id', nodeId)
    .maybeSingle();
  const content = lesson?.encoding_content as NodeEncodingContent | null;
  if (!content?.practiceQuestion?.questionText) return null;
  return {
    explanation: content.explanation || '',
    questionText: content.practiceQuestion.questionText,
    rewordedPool: Array.isArray(content.rewordedAo1Questions) ? content.rewordedAo1Questions : [],
    modality: content.practiceQuestion.modality,
    audioText: content.practiceQuestion.audioText,
  };
}

// Serves a random question from the node's cached reworded-question pool,
// generating and persisting that pool ONCE (on whichever review happens
// to be the first to need it) rather than calling Claude on every single
// review - see AO1_REWORD_QUESTION_PROMPT's own comment on why a fixed
// pool is enough. Picking uniformly at random (rather than tracking
// per-student "already seen" state) accepts an occasional immediate
// repeat as a small, acceptable cost for not needing any extra state.
export async function getRewordedAo1Question(nodeId: string): Promise<{ questionText: string; modality?: 'reading' | 'writing' | 'listening' | 'speaking'; audioText?: string } | null> {
  const source = await fetchNodeExplanationAndAo1(nodeId);
  if (!source) return null;
  let pool = source.rewordedPool;
  if (!pool.length) {
    const raw = await callClaudeJSON({
      model: MODELS.simpleQuestion,
      systemPrompt: AO1_REWORD_QUESTION_PROMPT,
      userContent: `Explanation: ${source.explanation}\n\nOriginal question: ${source.questionText}`,
      temperature: 0.4,
    });
    const generated = parseModelJson<{ questionTexts: string[] }>(raw);
    pool = generated?.questionTexts?.filter(Boolean) || [];
    if (!pool.length) return null;
    const { data: lesson } = await supabaseAdmin
      .from('knowledge_map_node_lessons')
      .select('encoding_content')
      .eq('node_id', nodeId)
      .maybeSingle();
    const content = (lesson?.encoding_content as NodeEncodingContent) || {};
    content.rewordedAo1Questions = pool;
    await supabaseAdmin.from('knowledge_map_node_lessons').update({ encoding_content: content }).eq('node_id', nodeId);
  }
  // The reword prompt only ever produces new question TEXT, never a new
  // audio phrase - so a "listening" original keeps testing the exact same
  // spoken phrase on every reworded retrieval attempt (still genuine
  // spaced repetition, just asked about differently each time). Modality
  // itself always carries over unchanged: it's a property of how this
  // concept is tested, not of the specific wording a reword happens to use.
  return {
    questionText: pool[Math.floor(Math.random() * pool.length)],
    modality: source.modality,
    audioText: source.modality === 'listening' ? source.audioText : undefined,
  };
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
  return parseCorrectFeedbackJson(raw);
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

export interface ResolvedEdge {
  id: string;
  fromNode: NodeRow;
  toNode: NodeRow;
  linkTeaching: string;
  integrationQuestion: { questionText?: string; markScheme?: string; diagramSpec?: unknown; answerInputType?: 'words' | 'math'; modality?: 'reading' | 'writing' | 'listening' | 'speaking'; audioText?: string } | null;
}

// Keyed off the endpoint node ids, same convention every other edge
// lookup in this app already uses (findMissingEncoding, text-question/
// submit, diagram-question/submit) - the frontend's subject-wide graph
// only ever carries source/target node ids, never a raw edge id.
export async function resolveEdgeForReview(fromNodeId: string, toNodeId: string): Promise<ResolvedEdge | null> {
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
    id: edge.id as string,
    fromNode,
    toNode,
    linkTeaching: (lesson?.link_teaching_content as string) || '',
    integrationQuestion: (lesson?.integration_question as ResolvedEdge['integrationQuestion']) || null,
  };
}

// Text-only by design (see nodeReviewPrompts.ts's own comment) - an edge
// whose stored integration question is diagram-typed (some Economics
// content) has nothing this step can ask, so the caller skips it for
// that edge rather than rendering a broken text box.
//
// "isFirstAttempt" (has this user never once recorded a concept_reviews
// row for this link's integration concept) decides whether linkTeaching
// is included - shown once, as the "prompted" first pass per
// nodeReviewPrompts.ts's own comment, then withheld on every later
// spaced review so the recall is genuinely cold.
export interface IntegrationStepData {
  questionText: string;
  markScheme: string;
  linkTeaching: string;
  isFirstAttempt: boolean;
  // Undefined for any edge lesson generated before this field existed -
  // the caller falls back to its own looksLikeCalculationQuestion regex
  // heuristic in that case, same as every other question type already did
  // before diagramSpec/answerInputType-style fields existed.
  answerInputType?: 'words' | 'math';
  // Undefined for the same pre-existing-content reason as answerInputType.
  modality?: 'reading' | 'writing' | 'listening' | 'speaking';
  audioText?: string;
}

export async function getIntegrationStepData(userId: string, fromNodeId: string, toNodeId: string): Promise<IntegrationStepData | null> {
  const edge = await resolveEdgeForReview(fromNodeId, toNodeId);
  if (!edge?.integrationQuestion?.questionText || edge.integrationQuestion.diagramSpec) return null;

  const conceptId = linkIntegrationConceptId(edge.fromNode.concept_id, edge.toNode.concept_id);
  const { data: existing } = await supabaseAdmin
    .from('concept_reviews')
    .select('concept_id')
    .eq('user_id', userId)
    .eq('concept_id', conceptId)
    .maybeSingle();

  return {
    questionText: edge.integrationQuestion.questionText,
    markScheme: edge.integrationQuestion.markScheme || '',
    linkTeaching: edge.linkTeaching,
    isFirstAttempt: !existing,
    answerInputType: edge.integrationQuestion.answerInputType,
    modality: edge.integrationQuestion.modality,
    audioText: edge.integrationQuestion.audioText,
  };
}

export async function gradeIntegrationAnswer(fromNodeId: string, toNodeId: string, answer: string): Promise<{ correct: boolean; feedback: string } | null> {
  const edge = await resolveEdgeForReview(fromNodeId, toNodeId);
  if (!edge?.integrationQuestion?.questionText || edge.integrationQuestion.diagramSpec) return null;
  const raw = await callClaudeJSON({
    model: MODELS.simpleQuestion,
    systemPrompt: KNOWLEDGE_MAP_ANSWER_CHECK_PROMPT,
    userContent: `Question: ${edge.integrationQuestion.questionText}\nMark scheme: ${edge.integrationQuestion.markScheme || ''}\nStudent's answer: ${answer}`,
    temperature: 0.1,
  });
  return parseCorrectFeedbackJson(raw);
}
