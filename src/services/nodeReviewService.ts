import { supabaseAdmin } from './supabaseAdmin';
import { callClaudeJSON, MODELS } from './claudeClient';
import { parseModelJson, parseCorrectFeedbackJson } from './jsonParsing';
import { KNOWLEDGE_MAP_ANSWER_CHECK_PROMPT } from '../constants/knowledgeMapAnswerCheckPrompt';
import { AO1_REWORD_QUESTION_PROMPT, AO1_SLIP_CHECK_PROMPT, INTEGRATION_REWORD_QUESTION_PROMPT } from '../constants/nodeReviewPrompts';
import { isDueByCalendarDay, ReviewNotDueError } from './reviewService';

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

// Node's own AO1 recall specifically - deliberately narrower than
// assertNodeReviewDue below (which bundles AO1 with every qualifying
// link). A brand-new qualifying link with no integration attempt yet
// counts as "due" in that bundle check (correct - it genuinely does need
// testing once), but that used to also unlock re-asking AO1 itself, even
// days before AO1's OWN schedule said it was due - a real reported bug
// (the review flow re-tested a base concept's recall on nothing but an
// unrelated link becoming newly qualifying). This keeps AO1 locked to its
// own due date regardless of what else about this node's review just
// became due.
export async function assertAo1ReviewDue(userId: string, nodeId: string): Promise<void> {
  const { data: node, error: nodeErr } = await supabaseAdmin
    .from('knowledge_map_nodes')
    .select('id, concept_id')
    .eq('id', nodeId)
    .maybeSingle<{ id: string; concept_id: string }>();
  if (nodeErr) throw nodeErr;
  if (!node) return; // the route's own 404 check handles a missing node

  const { data: row, error: rowErr } = await supabaseAdmin
    .from('concept_reviews')
    .select('due')
    .eq('user_id', userId)
    .eq('concept_id', node.concept_id)
    .maybeSingle();
  if (rowErr) throw rowErr;
  const due = (row?.due as string | undefined) ?? null;
  if (due && !isDueByCalendarDay(due)) throw new ReviewNotDueError(due);
}

// Server-side mirror of learn/index.html's own isNodeReviewDue — the
// client already disables its "Start review" button until this is true,
// but that's UX only, not enforcement: ao1/start and integration/start
// below are both real backend routes a session could reach directly.
// Due if ANY component of the combined session still needs testing - the
// node's own AO1 concept, or any qualifying link's integration - same
// "whichever comes first" convention the client's own due-badge uses.
// Called with the SESSION's from-node, not per-link, since AO1 and every
// qualifying link's integration are one combined review (see this file's
// own top-of-section comment in knowledgeMap.ts) - starting the session
// early because one component happens to be due defeats the point of
// gating it at all. AO1 ITSELF is gated more narrowly - see
// assertAo1ReviewDue above - this bundle check is now only used to admit
// a session into integration/start.
export async function assertNodeReviewDue(userId: string, nodeId: string): Promise<void> {
  const { data: node, error: nodeErr } = await supabaseAdmin
    .from('knowledge_map_nodes')
    .select('id, label, concept_id')
    .eq('id', nodeId)
    .maybeSingle<NodeRow>();
  if (nodeErr) throw nodeErr;
  if (!node) return; // the route's own 404 check handles a missing node

  const links = await getQualifyingReviewLinks(userId, nodeId);
  const conceptIds = [
    node.concept_id,
    ...links.map((l) => linkIntegrationConceptId(l.fromNode.concept_id, l.toNode.concept_id)),
  ];

  const { data: rows, error: rowErr } = await supabaseAdmin
    .from('concept_reviews')
    .select('concept_id, due')
    .eq('user_id', userId)
    .in('concept_id', conceptIds);
  if (rowErr) throw rowErr;
  const dueByConceptId = new Map((rows || []).map((r) => [r.concept_id as string, r.due as string]));

  let anyDue = false;
  let earliestDue: string | null = null;
  for (const id of conceptIds) {
    const due = dueByConceptId.get(id) ?? null;
    if (!due || isDueByCalendarDay(due)) { anyDue = true; break; }
    if (!earliestDue || new Date(due) < new Date(earliestDue)) earliestDue = due;
  }
  if (!anyDue) throw new ReviewNotDueError(earliestDue);
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
export async function getRewordedAo1Question(nodeId: string, userId: string): Promise<{ questionText: string; modality?: 'reading' | 'writing' | 'listening' | 'speaking'; audioText?: string } | null> {
  const source = await fetchNodeExplanationAndAo1(nodeId);
  if (!source) return null;
  let pool = source.rewordedPool;
  if (!pool.length) {
    const raw = await callClaudeJSON({
      model: MODELS.simpleQuestion,
      systemPrompt: AO1_REWORD_QUESTION_PROMPT,
      userContent: `Explanation: ${source.explanation}\n\nOriginal question: ${source.questionText}`,
      temperature: 0.4,
      userId,
      meteredReason: 'node-review-ao1-reword',
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

export async function gradeRewordedAo1Answer(nodeId: string, questionText: string, answer: string, userId: string): Promise<{ correct: boolean; feedback: string } | null> {
  const source = await fetchNodeExplanationAndAo1(nodeId);
  if (!source) return null;
  const raw = await callClaudeJSON({
    model: MODELS.simpleQuestion,
    systemPrompt: KNOWLEDGE_MAP_ANSWER_CHECK_PROMPT,
    userContent: `Question: ${questionText}\nMark scheme: ${source.explanation}\nStudent's answer: ${answer}`,
    temperature: 0.1,
    userId,
    meteredReason: 'node-review-ao1-grade',
  });
  return parseCorrectFeedbackJson(raw);
}

// Only ever called on a WRONG AO1 answer, before any FSRS lapse is
// recorded (see routes/knowledgeMap.ts's ao1/submit) - distinguishes a
// one-word slip from a genuine gap, see AO1_SLIP_CHECK_PROMPT's own
// comment for the narrow bar. The caller re-grades the corrected answer
// through gradeRewordedAo1Answer itself once the student fixes the
// flagged word, rather than duplicating that grading logic here.
export async function checkAo1SlipCandidate(nodeId: string, questionText: string, answer: string, userId: string): Promise<{ isSlip: boolean; wrongPhrase: string } | null> {
  const source = await fetchNodeExplanationAndAo1(nodeId);
  if (!source) return null;
  const raw = await callClaudeJSON({
    model: MODELS.simpleQuestion,
    systemPrompt: AO1_SLIP_CHECK_PROMPT,
    userContent: `Question: ${questionText}\nExplanation (ground truth): ${source.explanation}\nStudent's wrong answer: ${answer}`,
    temperature: 0.1,
    userId,
    meteredReason: 'node-review-ao1-slip-check',
  });
  return parseModelJson<{ isSlip: boolean; wrongPhrase: string }>(raw);
}

export interface ResolvedEdge {
  id: string;
  fromNode: NodeRow;
  toNode: NodeRow;
  linkTeaching: string;
  integrationQuestion: { questionText?: string; markScheme?: string; diagramSpec?: unknown; answerInputType?: 'words' | 'math'; modality?: 'reading' | 'writing' | 'listening' | 'speaking'; audioText?: string; rewordedIntegrationQuestions?: string[] } | null;
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

// Same pool-generate-and-cache pattern as getRewordedAo1Question above,
// for an edge's integration question - see INTEGRATION_REWORD_QUESTION_PROMPT's
// own comment. Grounded on the link's own teaching content rather than a
// node's explanation, and cached inside knowledge_map_edge_lessons'
// integration_question blob (rewordedIntegrationQuestions) rather than a
// node lesson's encoding_content - same idea, different table, since an
// edge's own question data already lives there. Called unconditionally
// on every review (first attempt included), same as AO1's own reword -
// isFirstAttempt only ever decided whether linkTeaching is ALSO shown
// alongside it, never which question gets asked.
export async function getRewordedIntegrationQuestion(fromNodeId: string, toNodeId: string, userId: string): Promise<{ questionText: string; modality?: 'reading' | 'writing' | 'listening' | 'speaking'; audioText?: string } | null> {
  const edge = await resolveEdgeForReview(fromNodeId, toNodeId);
  if (!edge?.integrationQuestion?.questionText || edge.integrationQuestion.diagramSpec) return null;

  let pool = Array.isArray(edge.integrationQuestion.rewordedIntegrationQuestions) ? edge.integrationQuestion.rewordedIntegrationQuestions : [];
  if (!pool.length) {
    const raw = await callClaudeJSON({
      model: MODELS.simpleQuestion,
      systemPrompt: INTEGRATION_REWORD_QUESTION_PROMPT,
      userContent: `Link teaching: ${edge.linkTeaching}\n\nOriginal question: ${edge.integrationQuestion.questionText}`,
      temperature: 0.4,
      userId,
      meteredReason: 'node-review-integration-reword',
    });
    const generated = parseModelJson<{ questionTexts: string[] }>(raw);
    pool = generated?.questionTexts?.filter(Boolean) || [];
    if (!pool.length) return null;
    const { data: lesson } = await supabaseAdmin
      .from('knowledge_map_edge_lessons')
      .select('integration_question')
      .eq('edge_id', edge.id)
      .maybeSingle();
    const question = (lesson?.integration_question as ResolvedEdge['integrationQuestion']) || {};
    question.rewordedIntegrationQuestions = pool;
    await supabaseAdmin.from('knowledge_map_edge_lessons').update({ integration_question: question }).eq('edge_id', edge.id);
  }
  // Same reasoning as getRewordedAo1Question's own comment - the reword
  // pool only ever varies question TEXT, never the audio phrase or
  // modality, both of which are properties of how the link is tested,
  // not of the specific wording a reword happens to use.
  return {
    questionText: pool[Math.floor(Math.random() * pool.length)],
    modality: edge.integrationQuestion.modality,
    audioText: edge.integrationQuestion.modality === 'listening' ? edge.integrationQuestion.audioText : undefined,
  };
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

  const reworded = await getRewordedIntegrationQuestion(fromNodeId, toNodeId, userId);

  return {
    questionText: reworded?.questionText || edge.integrationQuestion.questionText,
    markScheme: edge.integrationQuestion.markScheme || '',
    linkTeaching: edge.linkTeaching,
    isFirstAttempt: !existing,
    answerInputType: edge.integrationQuestion.answerInputType,
    modality: edge.integrationQuestion.modality,
    audioText: edge.integrationQuestion.audioText,
  };
}

// `questionText` is the exact reworded question the student was actually
// shown (see ao1/submit's own identical pattern with gradeRewordedAo1Answer) -
// grading always runs against the edge's own stored mark scheme (the
// ground truth for the link), never against the original question text,
// so a reworded phrasing grades exactly as accurately as the original did.
export async function gradeIntegrationAnswer(fromNodeId: string, toNodeId: string, questionText: string, answer: string, userId: string): Promise<{ correct: boolean; feedback: string } | null> {
  const edge = await resolveEdgeForReview(fromNodeId, toNodeId);
  if (!edge?.integrationQuestion?.questionText || edge.integrationQuestion.diagramSpec) return null;
  const raw = await callClaudeJSON({
    model: MODELS.simpleQuestion,
    systemPrompt: KNOWLEDGE_MAP_ANSWER_CHECK_PROMPT,
    userContent: `Question: ${questionText}\nMark scheme: ${edge.integrationQuestion.markScheme || ''}\nStudent's answer: ${answer}`,
    temperature: 0.1,
    userId,
    meteredReason: 'node-review-integration-grade',
  });
  return parseCorrectFeedbackJson(raw);
}
