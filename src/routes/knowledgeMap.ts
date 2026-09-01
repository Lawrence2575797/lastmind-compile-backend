import { Router, Request, Response } from 'express';
import { requireAuth, requirePaidTier } from '../services/authMiddleware';
import { costlyEndpointLimiter } from '../services/rateLimiters';
import { getKnowledgeMapForFolder, getKnowledgeMapForSubject, FolderConcept } from '../services/knowledgeMapService';
import { supabaseAdmin } from '../services/supabaseAdmin';
import {
  findPrerequisiteGap,
  generateChainDiagnosticQuestion,
  gradeChainDiagnosticAnswer,
  generateSlipRetryQuestion,
  gradeSlipRetryAnswer,
  gradeComponentOutcome,
  redirectForComponent,
} from '../services/chainDiagnosticService';
import { gradeDiagramAnswer, DiagramSpec, DiagramAnswerSubmission } from '../services/diagramGradingService';
import { gradeCorrectness } from '../services/reviewService';
import { callClaudeJSON, MODELS } from '../services/claudeClient';
import { KNOWLEDGE_MAP_ANSWER_CHECK_PROMPT } from '../constants/knowledgeMapAnswerCheckPrompt';
import { VERIFY_LEARNING_PROMPT, buildVerifyQuestionText } from '../constants/verifyLearningPrompts';

const router = Router();

// POST /knowledge-map  { subject, qualification?, examBoard?, customTitle?, customDescription?, concepts: [{ topic, concept }] }
// -> { nodes: [{id,name}], edges: [{source,target}], mastery: {[nodeId]: 0|1|2} }
// Backs the "Your Progress" knowledge map (see learn/index.html's
// fetchKnowledgeMapData) — POST rather than GET because `concepts` is a
// list, not a scalar the querystring can carry cleanly. `concepts` is
// every page/lesson the student has actually added to this folder
// (already known client-side, see collectFolderConcepts) — the backend
// has no independent read path for a folder's own contents (folder sync
// stores one opaque JSON blob per folder, not parsed server-side), so the
// frontend supplies the concept list directly, the same way it already
// supplies subject/topic/concept to every other chain/lesson route rather
// than the backend re-deriving it.
router.post('/knowledge-map', requireAuth, costlyEndpointLimiter, async (req: Request, res: Response) => {
  const { subject, qualification, examBoard, customTitle, customDescription, concepts } = req.body ?? {};
  if (typeof subject !== 'string' || !subject.trim()) {
    return res.status(400).json({ error: 'subject is required' });
  }
  const cleanConcepts: FolderConcept[] = Array.isArray(concepts)
    ? concepts
        .filter((c) => c && typeof c.concept === 'string' && c.concept.trim())
        .map((c) => ({ topic: typeof c.topic === 'string' ? c.topic : '', concept: c.concept }))
    : [];

  try {
    const result = await getKnowledgeMapForFolder(
      req.userId as string,
      subject,
      typeof qualification === 'string' ? qualification : '',
      typeof examBoard === 'string' ? examBoard : '',
      typeof customTitle === 'string' ? customTitle : '',
      typeof customDescription === 'string' ? customDescription : '',
      cleanConcepts
    );
    res.json(result);
  } catch (err) {
    console.error('Knowledge map generation failed:', err);
    res.status(500).json({ error: 'could not build your progress map' });
  }
});

// GET /knowledge-map-v2?subject=&qualification=&examBoard=
// -> { nodes: [{id,conceptId,label,subtopic,theme}], edges: [{source,target}], mastery: {[nodeId]: 0|1|2}, masteryDetail }
// The api-generated, subject-wide map (see scripts/generate_knowledge_map.js
// + ingest_knowledge_map.js) - one shared graph per (subject, qualification,
// examBoard), not derived per-student like the /knowledge-map route above.
// Backs the new folder-click main-content view in learn/index.html,
// replacing the old "Your Progress" overlay for any subject this pipeline
// has actually been run for; a subject with no rows yet just returns an
// empty graph, which the frontend renders as an empty state.
router.get('/knowledge-map-v2', requireAuth, costlyEndpointLimiter, async (req: Request, res: Response) => {
  const { subject, qualification, examBoard } = req.query;
  if (typeof subject !== 'string' || !subject.trim()) {
    return res.status(400).json({ error: 'subject is required' });
  }
  try {
    const result = await getKnowledgeMapForSubject(
      req.userId as string,
      subject,
      typeof qualification === 'string' ? qualification : '',
      typeof examBoard === 'string' ? examBoard : ''
    );
    res.json(result);
  } catch (err) {
    console.error('Subject knowledge map lookup failed:', err);
    res.status(500).json({ error: 'could not load the knowledge map' });
  }
});

// GET /knowledge-map-v2/node/:nodeId/lesson -> the stored encoding lesson
// { explanation, practiceQuestion } for one node (see
// scripts/generate_lesson_content.js + create_knowledge_map_node_lessons.sql).
// Read-only lookup by uuid - no generation happens here, this pipeline is
// one-time/offline by design (see the lesson-generation prompts' own
// comment on why lessons are never generated live).
router.get('/knowledge-map-v2/node/:nodeId/lesson', requireAuth, async (req: Request, res: Response) => {
  const { nodeId } = req.params;
  try {
    const { data, error } = await supabaseAdmin
      .from('knowledge_map_node_lessons')
      .select('encoding_content')
      .eq('node_id', nodeId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'no lesson generated for this concept yet' });
    res.json(data.encoding_content);
  } catch (err) {
    console.error('Node lesson lookup failed:', err);
    res.status(500).json({ error: 'could not load this lesson' });
  }
});

// GET /knowledge-map-v2/edge/:fromNodeId/:toNodeId/lesson -> the stored
// edge lesson { linkTeaching, transferQuestion, integrationQuestion } for
// the prerequisite relationship between two nodes (see
// scripts/generate_edge_lessons_haiku_fast.js + create_knowledge_map_edge_lessons.sql).
// Same read-only, one-time-generation contract as the node lesson route
// above - looks the edge up by its endpoints since the frontend graph
// only knows node ids, then joins to its lesson row.
router.get('/knowledge-map-v2/edge/:fromNodeId/:toNodeId/lesson', requireAuth, async (req: Request, res: Response) => {
  const { fromNodeId, toNodeId } = req.params;
  try {
    const { data, error } = await supabaseAdmin
      .from('knowledge_map_edges')
      .select('id, knowledge_map_edge_lessons(link_teaching_content, transfer_question, integration_question)')
      .eq('from_node_id', fromNodeId)
      .eq('to_node_id', toNodeId)
      .maybeSingle();
    if (error) throw error;
    const lessonRow = Array.isArray(data?.knowledge_map_edge_lessons)
      ? data?.knowledge_map_edge_lessons[0]
      : data?.knowledge_map_edge_lessons;
    if (!data || !lessonRow) return res.status(404).json({ error: 'no lesson generated for this connection yet' });
    res.json({
      linkTeaching: lessonRow.link_teaching_content,
      transferQuestion: lessonRow.transfer_question,
      integrationQuestion: lessonRow.integration_question,
    });
  } catch (err) {
    console.error('Edge lesson lookup failed:', err);
    res.status(500).json({ error: 'could not load this lesson' });
  }
});

// ---- Chain diagnostic: the "jump ahead" gate ----
// State is round-tripped through the client, same convention as
// diagnosticOrchestrator.ts's OrchestratorState — but see
// chainDiagnosticService.ts's own comment on why ground truth (node
// explanations / edge link-teaching) never travels in it, only ids and
// the student's own text.
interface ChainDiagnosticState {
  targetNodeId: string;
  componentIds: string[];
  questionText: string;
  answer?: string;
  pendingFailureIds?: string[];
  currentIndex?: number;
  failureFeedback?: Record<string, string>;
  genuineGapIds?: string[];
  retryQuestionText?: string;
}

async function finalizeChainDiagnostic(state: ChainDiagnosticState) {
  const genuineGapIds = state.genuineGapIds || [];
  if (!genuineGapIds.length) return { passed: true as const };
  // First in chain order — pendingFailureIds/componentIds are already
  // topologically ordered, and genuineGapIds is appended in the same walk
  // order, so the earliest entry is the earliest real gap in the chain.
  const redirect = await redirectForComponent(genuineGapIds[0]);
  return { passed: false as const, denied: true as const, redirect };
}

// POST /knowledge-map-v2/chain-diagnostic/start  { targetNodeId, subject, qualification, examBoard }
// -> { requiresDiagnostic: false } if every prerequisite is already
//    mastered (straight into the lesson, no gate), or
//    { requiresDiagnostic: true, questionText, state } otherwise.
router.post('/knowledge-map-v2/chain-diagnostic/start', requireAuth, costlyEndpointLimiter, async (req: Request, res: Response) => {
  const { targetNodeId, subject, qualification, examBoard } = req.body ?? {};
  if (typeof targetNodeId !== 'string' || !targetNodeId) {
    return res.status(400).json({ error: 'targetNodeId is required' });
  }
  try {
    const gap = await findPrerequisiteGap(
      req.userId as string,
      targetNodeId,
      typeof subject === 'string' ? subject : '',
      typeof qualification === 'string' ? qualification : '',
      typeof examBoard === 'string' ? examBoard : ''
    );
    if (!gap) return res.status(404).json({ error: 'concept not found' });
    if (!gap.componentIds.length) return res.json({ requiresDiagnostic: false });

    const { questionText } = await generateChainDiagnosticQuestion(gap.targetLabel, gap.componentIds);
    const state: ChainDiagnosticState = { targetNodeId, componentIds: gap.componentIds, questionText };
    res.json({ requiresDiagnostic: true, questionText, state });
  } catch (err) {
    console.error('Chain diagnostic start failed:', err);
    res.status(500).json({ error: 'could not prepare the prerequisite check' });
  }
});

// POST /knowledge-map-v2/chain-diagnostic/submit  { state, answer }
// Grades every component from the ONE combined answer. Anything correct
// is graded into FSRS right away; anything wrong is queued for the
// slip-vs-genuine-gap walk below rather than graded yet (its eventual
// rating depends on how that resolves).
router.post('/knowledge-map-v2/chain-diagnostic/submit', requireAuth, costlyEndpointLimiter, async (req: Request, res: Response) => {
  const { state, answer } = (req.body ?? {}) as { state?: ChainDiagnosticState; answer?: string };
  if (!state || !Array.isArray(state.componentIds) || typeof answer !== 'string' || !answer.trim()) {
    return res.status(400).json({ error: 'state and answer are required' });
  }
  try {
    const userId = req.userId as string;
    const outcomes = await gradeChainDiagnosticAnswer(state.componentIds, state.questionText, answer);
    const failures = outcomes.filter((o) => !o.correct);
    await Promise.all(outcomes.filter((o) => o.correct).map((o) => gradeComponentOutcome(userId, o.componentId, 'correct')));

    if (!failures.length) {
      return res.json({ passed: true });
    }

    const nextState: ChainDiagnosticState = {
      ...state,
      answer,
      pendingFailureIds: failures.map((f) => f.componentId),
      currentIndex: 0,
      failureFeedback: Object.fromEntries(failures.map((f) => [f.componentId, f.feedback])),
      genuineGapIds: [],
    };
    const first = failures[0];
    res.json({
      passed: false,
      currentFailure: { componentId: first.componentId, type: first.type, label: first.label, feedback: first.feedback },
      remaining: failures.length,
      state: nextState,
    });
  } catch (err) {
    console.error('Chain diagnostic grading failed:', err);
    res.status(500).json({ error: 'could not grade that answer' });
  }
});

// POST /knowledge-map-v2/chain-diagnostic/resolve-slip  { state, wasSlip }
// The self-report step: "was that a silly slip, or do you not know this?"
// A slip earns one focused retry; anything else is a genuine gap.
router.post('/knowledge-map-v2/chain-diagnostic/resolve-slip', requireAuth, costlyEndpointLimiter, async (req: Request, res: Response) => {
  const { state, wasSlip } = (req.body ?? {}) as { state?: ChainDiagnosticState; wasSlip?: boolean };
  const pending = state?.pendingFailureIds || [];
  const idx = state?.currentIndex ?? -1;
  if (!state || idx < 0 || idx >= pending.length) {
    return res.status(400).json({ error: 'invalid diagnostic state' });
  }
  const componentId = pending[idx];
  try {
    const userId = req.userId as string;

    if (wasSlip) {
      const retryQuestionText = await generateSlipRetryQuestion(componentId, state.answer || '', state.failureFeedback?.[componentId] || '');
      return res.json({ needsRetry: true, retryQuestionText, state: { ...state, retryQuestionText } });
    }

    await gradeComponentOutcome(userId, componentId, 'genuine_gap');
    const genuineGapIds = [...(state.genuineGapIds || []), componentId];
    const nextIndex = idx + 1;
    if (nextIndex < pending.length) {
      const nextComponentId = pending[nextIndex];
      const nextState: ChainDiagnosticState = { ...state, currentIndex: nextIndex, genuineGapIds };
      return res.json({
        currentFailure: {
          componentId: nextComponentId,
          feedback: state.failureFeedback?.[nextComponentId] || '',
        },
        remaining: pending.length - nextIndex,
        state: nextState,
      });
    }
    res.json(await finalizeChainDiagnostic({ ...state, genuineGapIds }));
  } catch (err) {
    console.error('Chain diagnostic slip resolution failed:', err);
    res.status(500).json({ error: 'could not process that' });
  }
});

// POST /knowledge-map-v2/chain-diagnostic/submit-retry  { state, answer }
// Grades the one focused retry after a slip claim. Correct -> 'hard' via
// gradeCorrectness's retry path (see chainDiagnosticService.gradeComponentOutcome);
// wrong -> genuine gap after all.
router.post('/knowledge-map-v2/chain-diagnostic/submit-retry', requireAuth, costlyEndpointLimiter, async (req: Request, res: Response) => {
  const { state, answer } = (req.body ?? {}) as { state?: ChainDiagnosticState; answer?: string };
  const pending = state?.pendingFailureIds || [];
  const idx = state?.currentIndex ?? -1;
  if (!state || idx < 0 || idx >= pending.length || typeof answer !== 'string' || !answer.trim() || !state.retryQuestionText) {
    return res.status(400).json({ error: 'invalid diagnostic state' });
  }
  const componentId = pending[idx];
  try {
    const userId = req.userId as string;
    const { correct, feedback } = await gradeSlipRetryAnswer(componentId, state.retryQuestionText, answer);
    await gradeComponentOutcome(userId, componentId, correct ? 'slip_confirmed' : 'genuine_gap');
    const genuineGapIds = correct ? state.genuineGapIds || [] : [...(state.genuineGapIds || []), componentId];

    const nextIndex = idx + 1;
    if (nextIndex < pending.length) {
      const nextComponentId = pending[nextIndex];
      const nextState: ChainDiagnosticState = { ...state, currentIndex: nextIndex, genuineGapIds, retryQuestionText: undefined };
      return res.json({
        retryFeedback: feedback,
        currentFailure: { componentId: nextComponentId, feedback: state.failureFeedback?.[nextComponentId] || '' },
        remaining: pending.length - nextIndex,
        state: nextState,
      });
    }
    const result = await finalizeChainDiagnostic({ ...state, genuineGapIds });
    res.json({ ...result, retryFeedback: feedback });
  } catch (err) {
    console.error('Chain diagnostic retry grading failed:', err);
    res.status(500).json({ error: 'could not grade that answer' });
  }
});

// POST /knowledge-map-v2/diagram-question/submit
// { nodeId, questionType: 'practice' } for a node's own diagram question
// (MECHANISTIC - build the whole diagram from scratch), or
// { fromNodeId, toNodeId, questionType: 'transfer'|'integration' } for an
// edge's (ATOMIC - the prerequisite's diagram is already given/fixed, only
// the new element this edge represents is graded - see
// diagramGradingService.ts's own DiagramSpec.given). The diagram_spec
// itself is NEVER sent to or trusted from the client - always re-fetched
// here by id, same discipline as the chain-diagnostic gate above.
router.post('/knowledge-map-v2/diagram-question/submit', requireAuth, costlyEndpointLimiter, async (req: Request, res: Response) => {
  const { nodeId, fromNodeId, toNodeId, questionType, answer } = (req.body ?? {}) as {
    nodeId?: string;
    fromNodeId?: string;
    toNodeId?: string;
    questionType?: 'practice' | 'transfer' | 'integration';
    answer?: DiagramAnswerSubmission;
  };
  if (!answer || !questionType) return res.status(400).json({ error: 'questionType and answer are required' });

  try {
    const userId = req.userId as string;
    let diagramSpec: DiagramSpec | undefined;
    let conceptId: string | undefined;

    if (questionType === 'practice') {
      if (!nodeId) return res.status(400).json({ error: 'nodeId is required for a practice question' });
      const [{ data: node }, { data: lesson }] = await Promise.all([
        supabaseAdmin.from('knowledge_map_nodes').select('concept_id').eq('id', nodeId).maybeSingle(),
        supabaseAdmin.from('knowledge_map_node_lessons').select('encoding_content').eq('node_id', nodeId).maybeSingle(),
      ]);
      if (!node) return res.status(404).json({ error: 'concept not found' });
      conceptId = node.concept_id as string;
      diagramSpec = (lesson?.encoding_content as { practiceQuestion?: { diagramSpec?: DiagramSpec } } | null)?.practiceQuestion?.diagramSpec;
    } else {
      if (!fromNodeId || !toNodeId) return res.status(400).json({ error: 'fromNodeId and toNodeId are required for a transfer/integration question' });
      const [{ data: fromNode }, { data: toNode }, { data: edgeRow }] = await Promise.all([
        supabaseAdmin.from('knowledge_map_nodes').select('id, label, concept_id').eq('id', fromNodeId).maybeSingle(),
        supabaseAdmin.from('knowledge_map_nodes').select('id, label, concept_id').eq('id', toNodeId).maybeSingle(),
        supabaseAdmin.from('knowledge_map_edges').select('id').eq('from_node_id', fromNodeId).eq('to_node_id', toNodeId).maybeSingle(),
      ]);
      if (!fromNode || !toNode || !edgeRow) return res.status(404).json({ error: 'connection not found' });

      const missing = await findMissingEncoding(userId, [fromNode, toNode]);
      if (missing) return res.json({ requiresEncoding: true, redirect: missing });

      conceptId = `${fromNode.concept_id}->${toNode.concept_id}`;
      const { data: lesson } = await supabaseAdmin
        .from('knowledge_map_edge_lessons')
        .select('transfer_question, integration_question')
        .eq('edge_id', edgeRow.id)
        .maybeSingle();
      const field = questionType === 'transfer' ? lesson?.transfer_question : lesson?.integration_question;
      diagramSpec = (field as { diagramSpec?: DiagramSpec } | null)?.diagramSpec;
    }

    if (!diagramSpec) return res.status(404).json({ error: 'this question has no diagram to grade' });

    const result = gradeDiagramAnswer(diagramSpec, answer);
    await gradeCorrectness(userId, conceptId!, result.correct);
    res.json(result);
  } catch (err) {
    console.error('Diagram question grading failed:', err);
    res.status(500).json({ error: 'could not grade this diagram' });
  }
});

function stripCodeFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}

// The narrow prerequisite check for an edge's transfer/integration
// retrieval - deliberately different from the chain-diagnostic gate
// above (which tests a whole unmastered ANCESTOR CHAIN via one combined
// free-text/diagram question before starting a node's own lesson). This
// is just an existence check: has each endpoint of THIS edge ever been
// encoded at all (any concept_reviews row, regardless of mastery level)?
// Testing the connection between two concepts means nothing if one of
// them was never actually taught yet - redirect to encode whichever one
// is missing instead of grading against a concept the student has no
// real basis for.
async function findMissingEncoding(
  userId: string,
  candidates: { id: string; label: string; concept_id: string }[]
): Promise<{ nodeId: string; label: string } | null> {
  const { data, error } = await supabaseAdmin
    .from('concept_reviews')
    .select('concept_id')
    .eq('user_id', userId)
    .in('concept_id', candidates.map((n) => n.concept_id));
  if (error) throw error;
  const encoded = new Set((data || []).map((r) => r.concept_id as string));
  const missing = candidates.find((n) => !encoded.has(n.concept_id));
  return missing ? { nodeId: missing.id, label: missing.label } : null;
}

// POST /knowledge-map-v2/text-question/submit
// { nodeId, questionType: 'practice' } or
// { fromNodeId, toNodeId, questionType: 'transfer'|'integration' }, plus
// { answer: string } - the free-text/worked-answer counterpart to the
// diagram-question route above, for every question that ISN'T a diagram.
// The question text and mark scheme are always re-fetched here, never
// trusted from the client, same discipline as every other grading route
// in this file.
router.post('/knowledge-map-v2/text-question/submit', requireAuth, costlyEndpointLimiter, async (req: Request, res: Response) => {
  const { nodeId, fromNodeId, toNodeId, questionType, answer } = (req.body ?? {}) as {
    nodeId?: string;
    fromNodeId?: string;
    toNodeId?: string;
    questionType?: 'practice' | 'transfer' | 'integration';
    answer?: string;
  };
  if (!questionType || typeof answer !== 'string' || !answer.trim()) return res.status(400).json({ error: 'questionType and answer are required' });

  try {
    const userId = req.userId as string;
    let question: { questionText?: string; markScheme?: string } | undefined;
    let conceptId: string | undefined;

    if (questionType === 'practice') {
      if (!nodeId) return res.status(400).json({ error: 'nodeId is required for a practice question' });
      const [{ data: node }, { data: lesson }] = await Promise.all([
        supabaseAdmin.from('knowledge_map_nodes').select('concept_id').eq('id', nodeId).maybeSingle(),
        supabaseAdmin.from('knowledge_map_node_lessons').select('encoding_content').eq('node_id', nodeId).maybeSingle(),
      ]);
      if (!node) return res.status(404).json({ error: 'concept not found' });
      conceptId = node.concept_id as string;
      question = (lesson?.encoding_content as { practiceQuestion?: { questionText?: string; markScheme?: string } } | null)?.practiceQuestion;
    } else {
      if (!fromNodeId || !toNodeId) return res.status(400).json({ error: 'fromNodeId and toNodeId are required for a transfer/integration question' });
      const [{ data: fromNode }, { data: toNode }, { data: edgeRow }] = await Promise.all([
        supabaseAdmin.from('knowledge_map_nodes').select('id, label, concept_id').eq('id', fromNodeId).maybeSingle(),
        supabaseAdmin.from('knowledge_map_nodes').select('id, label, concept_id').eq('id', toNodeId).maybeSingle(),
        supabaseAdmin.from('knowledge_map_edges').select('id').eq('from_node_id', fromNodeId).eq('to_node_id', toNodeId).maybeSingle(),
      ]);
      if (!fromNode || !toNode || !edgeRow) return res.status(404).json({ error: 'connection not found' });

      const missing = await findMissingEncoding(req.userId as string, [fromNode, toNode]);
      if (missing) return res.json({ requiresEncoding: true, redirect: missing });

      conceptId = `${fromNode.concept_id}->${toNode.concept_id}`;
      const { data: lesson } = await supabaseAdmin
        .from('knowledge_map_edge_lessons')
        .select('transfer_question, integration_question')
        .eq('edge_id', edgeRow.id)
        .maybeSingle();
      question = (questionType === 'transfer' ? lesson?.transfer_question : lesson?.integration_question) as { questionText?: string; markScheme?: string } | undefined;
    }

    if (!question || !question.questionText) return res.status(404).json({ error: 'question not found' });

    const raw = await callClaudeJSON({
      model: MODELS.simpleQuestion,
      systemPrompt: KNOWLEDGE_MAP_ANSWER_CHECK_PROMPT,
      userContent: `Question: ${question.questionText}\nMark scheme: ${question.markScheme || ''}\nStudent's answer: ${answer}`,
      temperature: 0.1,
    });
    const { correct, feedback } = JSON.parse(stripCodeFences(raw)) as { correct: boolean; feedback: string };

    await gradeCorrectness(userId, conceptId!, correct);
    res.json({ correct, feedback });
  } catch (err) {
    console.error('Text question grading failed:', err);
    res.status(500).json({ error: 'could not grade this answer' });
  }
});

// POST /knowledge-map-v2/verify/submit
// Premium "test out" shortcut, offered alongside Start lesson (a node's
// own AO1) and Review connection (an edge's transfer/integration): one
// weakly-prompted free-text answer instead of the full lesson/question.
// A pass still updates the SAME concept_id FSRS row a full lesson/review
// would (never a parallel tracking system), but always with hadRetry=true
// so deriveCorrectRating never grants 'good'/'easy' here — a Verify pass
// is deliberately worth less confidence than actually doing the lesson.
// Question text is generated from re-fetched labels, never trusted from
// the client, same discipline as every other grading route in this file.
router.post('/knowledge-map-v2/verify/submit', requireAuth, requirePaidTier, costlyEndpointLimiter, async (req: Request, res: Response) => {
  const { nodeId, fromNodeId, toNodeId, questionType, answer } = (req.body ?? {}) as {
    nodeId?: string;
    fromNodeId?: string;
    toNodeId?: string;
    questionType?: 'ao1' | 'transfer' | 'integration';
    answer?: string;
  };
  if (!questionType || typeof answer !== 'string' || !answer.trim()) return res.status(400).json({ error: 'questionType and answer are required' });

  try {
    const userId = req.userId as string;
    let conceptId: string;
    let questionText: string;

    if (questionType === 'ao1') {
      if (!nodeId) return res.status(400).json({ error: 'nodeId is required for an ao1 verify' });
      const { data: node } = await supabaseAdmin.from('knowledge_map_nodes').select('concept_id, label').eq('id', nodeId).maybeSingle();
      if (!node) return res.status(404).json({ error: 'concept not found' });
      conceptId = node.concept_id as string;
      questionText = buildVerifyQuestionText('ao1', node.label as string);
    } else {
      if (!fromNodeId || !toNodeId) return res.status(400).json({ error: 'fromNodeId and toNodeId are required for a transfer/integration verify' });
      const [{ data: fromNode }, { data: toNode }] = await Promise.all([
        supabaseAdmin.from('knowledge_map_nodes').select('id, label, concept_id').eq('id', fromNodeId).maybeSingle(),
        supabaseAdmin.from('knowledge_map_nodes').select('id, label, concept_id').eq('id', toNodeId).maybeSingle(),
      ]);
      if (!fromNode || !toNode) return res.status(404).json({ error: 'connection not found' });

      const missing = await findMissingEncoding(userId, [fromNode, toNode]);
      if (missing) return res.json({ requiresEncoding: true, redirect: missing });

      conceptId = `${fromNode.concept_id}->${toNode.concept_id}`;
      questionText = buildVerifyQuestionText(questionType, fromNode.label as string, toNode.label as string);
    }

    const raw = await callClaudeJSON({
      model: MODELS.simpleQuestion,
      systemPrompt: VERIFY_LEARNING_PROMPT,
      userContent: `Question: ${questionText}\nStudent's answer: ${answer}`,
      temperature: 0.1,
    });
    const { correct, feedback } = JSON.parse(stripCodeFences(raw)) as { correct: boolean; feedback: string };

    await gradeCorrectness(userId, conceptId, correct, true);
    res.json({ correct, feedback });
  } catch (err) {
    console.error('Verify grading failed:', err);
    res.status(500).json({ error: 'could not grade this answer' });
  }
});

export default router;
