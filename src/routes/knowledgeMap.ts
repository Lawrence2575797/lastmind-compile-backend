import { Router, Request, Response } from 'express';
import { requireAuth, requirePaidTier, isUserPaid } from '../services/authMiddleware';
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
import { adjustCredits, payMasteryInstallment, ENCODING_LESSON_COMPLETION_KEYS, MASTERY_INSTALLMENT_KEYS } from '../services/creditService';
import { callClaudeJSON, MODELS } from '../services/claudeClient';
import { KNOWLEDGE_MAP_ANSWER_CHECK_PROMPT } from '../constants/knowledgeMapAnswerCheckPrompt';
import { VERIFY_LEARNING_PROMPT, buildVerifyQuestionText } from '../constants/verifyLearningPrompts';
import {
  getQualifyingReviewLinks,
  linkIdentifyConceptId,
  linkIntegrationConceptId,
  generateRewordedAo1Question,
  gradeRewordedAo1Answer,
  checkAo1SlipCandidate,
  getLinkTeachingText,
  gradeLinkRestatement,
  getIntegrationQuestionText,
  gradeIntegrationAnswer,
} from '../services/nodeReviewService';

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
  const { nodeId, fromNodeId, toNodeId, questionType, answer, hadRetry } = (req.body ?? {}) as {
    nodeId?: string;
    fromNodeId?: string;
    toNodeId?: string;
    questionType?: 'practice' | 'transfer' | 'integration';
    answer?: DiagramAnswerSubmission;
    hadRetry?: boolean;
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

    // A first-time encoding attempt (questionType 'practice') is a
    // learning rep, not a real recall test yet - a wrong attempt here
    // shouldn't record an FSRS lapse (or let the student move on thinking
    // they've "reviewed" something they never actually got right). Only
    // transfer/integration (an already-encoded concept's spaced review)
    // grades every attempt immediately - see deriveCorrectRating's own
    // comment on why a genuine lapse there must never be softened.
    if (questionType === 'practice' && !result.correct) {
      return res.json({ ...result, retryable: true });
    }
    const graded = await gradeCorrectness(userId, conceptId!, result.correct, questionType === 'practice' ? !!hadRetry : false);
    const { paid: keysEarned } = await payLessonCredits(userId, questionType === 'practice', graded, 1.0, 'knowledge_map_lesson');
    // The frontend needs the fresh due date the moment this grades, not
    // only after a later /schedule refetch (e.g. on returning to the
    // dashboard) — see reviewService.ts's cardToRowFields for the fields.
    res.json({ ...result, schedule: { conceptId, ...graded.newState }, keysEarned });
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

// Pays the same credit amounts the older encoding/spaced-lesson engines
// already use (see creditService.ts) — a first-time encoding ('practice'
// for a node, 'ao1' for Verify's node-level check) is a flat one-off
// payment, matching encodingLessonService.ts's own
// ENCODING_LESSON_COMPLETION_KEYS payout on a first-time pass; a
// transfer/integration pass is a genuine spaced review of an already-
// encoded edge, paid via the same per-milestone installment schedule
// spacedLessonEngine.ts uses as spaced_success_count climbs toward durable
// mastery. `coefficient` is 1.0 for an actual lesson/review, or Verify's
// free/premium discount (see knowledgeMap.ts's verify/submit) — Verify is
// graded through the exact same gradeCorrectness path as a real lesson
// (no artificial rating cap), so it earns toward the same milestones, just
// at a reduced rate. Returns both the amount actually paid AND the
// un-discounted base, so a caller can show a student exactly how much
// they left on the table by verifying instead of doing the lesson.
// `graded` is gradeCorrectness's own return value — its `previousRow`
// carries spaced_success_count at runtime, just narrower on its declared
// type (see gradeAndRecordReview's own comment in reviewService.ts).
async function payLessonCredits(
  userId: string,
  isFirstTimeEncoding: boolean,
  graded: Awaited<ReturnType<typeof gradeCorrectness>>,
  coefficient: number,
  reasonPrefix: string
): Promise<{ paid: number; base: number }> {
  if (isFirstTimeEncoding) {
    const base = ENCODING_LESSON_COMPLETION_KEYS;
    const paid = Math.round(base * coefficient);
    if (paid > 0) await adjustCredits(userId, paid, `${reasonPrefix}_encoding_completed`);
    return { paid, base };
  }
  const priorSpacedSuccessCount = (graded.previousRow as { spaced_success_count?: number } | null)?.spaced_success_count ?? 0;
  const newCount = graded.spacedSuccessCount;
  // Same milestone gate payMasteryInstallment applies internally —
  // duplicated here (rather than changing that shared function's return
  // type, which has three other call sites) purely so `base` is knowable
  // even when nothing was actually paid.
  if (newCount <= priorSpacedSuccessCount || newCount < 1 || newCount > MASTERY_INSTALLMENT_KEYS.length) return { paid: 0, base: 0 };
  const base = MASTERY_INSTALLMENT_KEYS[newCount - 1];
  const paid = await payMasteryInstallment(userId, priorSpacedSuccessCount, newCount, coefficient, `${reasonPrefix}_mastery_${newCount}`);
  return { paid, base };
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
  const { nodeId, fromNodeId, toNodeId, questionType, answer, hadRetry } = (req.body ?? {}) as {
    nodeId?: string;
    fromNodeId?: string;
    toNodeId?: string;
    questionType?: 'practice' | 'transfer' | 'integration';
    answer?: string;
    hadRetry?: boolean;
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

    // See the identical comment on diagram-question/submit above: a wrong
    // first-time encoding attempt ('practice') is a learning rep, not a
    // real recall test - don't record an FSRS lapse for it, let the
    // student retry. Transfer/integration (a spaced review of an
    // already-encoded concept) still grades every attempt immediately.
    if (questionType === 'practice' && !correct) {
      return res.json({ correct, feedback, retryable: true });
    }
    const graded = await gradeCorrectness(userId, conceptId!, correct, questionType === 'practice' ? !!hadRetry : false);
    const { paid: keysEarned } = await payLessonCredits(userId, questionType === 'practice', graded, 1.0, 'knowledge_map_lesson');
    // See the identical comment on diagram-question/submit above.
    res.json({ correct, feedback, schedule: { conceptId, ...graded.newState }, keysEarned });
  } catch (err) {
    console.error('Text question grading failed:', err);
    res.status(500).json({ error: 'could not grade this answer' });
  }
});

// Verify's free/premium discount coefficients — see MASTERY_INSTALLMENT_KEYS'
// own comment in creditService.ts. Premium gets the smaller discount (0.8
// vs free's 0.6) since a paying user opening the app at all, even just to
// verify, is worth more encouraging than a free one's equivalent action.
const KM_VERIFY_COEFFICIENT_FREE = 0.6;
const KM_VERIFY_COEFFICIENT_PREMIUM = 0.8;

// POST /knowledge-map-v2/verify/submit
// "Test out" shortcut, available on both tiers, offered alongside Start
// lesson (a node's own AO1) and Review connection (an edge's transfer/
// integration): one weakly-prompted free-text answer instead of the full
// lesson/question. Graded through the EXACT SAME gradeCorrectness path a
// real lesson uses (no artificial rating cap) — a pass genuinely
// progresses spaced_success_count toward durable mastery and gets a real
// FSRS due date scheduled, same concept_id row a full lesson/review would
// update. The only difference from a real lesson is economic, not
// mechanical: credits are paid at a coefficient (see above) rather than in
// full, since this learning didn't happen on LastMind. Question text is
// generated from re-fetched labels, never trusted from the client, same
// discipline as every other grading route in this file.
router.post('/knowledge-map-v2/verify/submit', requireAuth, costlyEndpointLimiter, async (req: Request, res: Response) => {
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

    // hadRetry=false — Verify uses the SAME rating derivation a real lesson
    // does (deriveCorrectRating in reviewService.ts), so a clean pass can
    // genuinely earn 'good'/'easy' and progress spaced_success_count,
    // rather than always being forced to 'hard' (which would reset that
    // counter to 0 every time and make durable mastery via Verify alone
    // impossible — found while wiring up its credit payout).
    const graded = await gradeCorrectness(userId, conceptId, correct, false);
    const coefficient = (await isUserPaid(userId)) ? KM_VERIFY_COEFFICIENT_PREMIUM : KM_VERIFY_COEFFICIENT_FREE;
    const { paid: keysEarned, base: keysBase } = correct
      ? await payLessonCredits(userId, questionType === 'ao1', graded, coefficient, 'knowledge_map_verify')
      : { paid: 0, base: 0 };
    res.json({ correct, feedback, keysEarned, keysBase, verifyCoefficient: coefficient });
  } catch (err) {
    console.error('Verify grading failed:', err);
    res.status(500).json({ error: 'could not grade this answer' });
  }
});

// ---- Node-level spaced review ----
// Only nodes are ever launchable, never a link on its own (see
// nodeReviewService.ts) - once a node has at least one direct downstream
// neighbor that's also encoded, its spaced review tests all three:
// a reworded AO1, then "identify the link" (prompted retry until
// correct) followed by the integration question, for every qualifying
// link, one combined session. FSRS runs on the node PLUS one row per
// qualifying link's identify/integration - the node's overall due date is
// whichever of those is soonest.

router.get('/knowledge-map-v2/node-review/:nodeId/qualifying-links', requireAuth, async (req: Request, res: Response) => {
  try {
    const links = await getQualifyingReviewLinks(req.userId as string, req.params.nodeId);
    res.json({ links: links.map((l) => ({ toNodeId: l.toNode.id, toLabel: l.toNode.label })) });
  } catch (err) {
    console.error('Qualifying review links lookup failed:', err);
    res.status(500).json({ error: 'could not check this concept\'s links' });
  }
});

router.post('/knowledge-map-v2/node-review/ao1/start', requireAuth, costlyEndpointLimiter, async (req: Request, res: Response) => {
  const { nodeId } = (req.body ?? {}) as { nodeId?: string };
  if (!nodeId) return res.status(400).json({ error: 'nodeId is required' });
  try {
    const question = await generateRewordedAo1Question(nodeId);
    if (!question) return res.status(404).json({ error: 'no lesson generated for this concept yet' });
    res.json(question);
  } catch (err) {
    console.error('AO1 reword generation failed:', err);
    res.status(500).json({ error: 'could not prepare this review question' });
  }
});

// Shared by both AO1 finalization routes below (a clean pass, and a slip
// correction that turned out right or wrong) - the only two things a
// non-slip-candidate wrong answer and a resolved slip attempt both need:
// record the FSRS outcome and shape the response the same way.
async function finalizeAo1Grade(userId: string, conceptId: string, correct: boolean, feedback: string) {
  const result = await gradeCorrectness(userId, conceptId, correct, false);
  const { paid: keysEarned } = await payLessonCredits(userId, false, result, 1.0, 'node_review_ao1');
  return { correct, feedback, schedule: { conceptId, ...result.newState }, keysEarned };
}

router.post('/knowledge-map-v2/node-review/ao1/submit', requireAuth, costlyEndpointLimiter, async (req: Request, res: Response) => {
  const { nodeId, questionText, answer } = (req.body ?? {}) as { nodeId?: string; questionText?: string; answer?: string };
  if (!nodeId || !questionText || typeof answer !== 'string' || !answer.trim()) {
    return res.status(400).json({ error: 'nodeId, questionText and answer are required' });
  }
  try {
    const userId = req.userId as string;
    const { data: node } = await supabaseAdmin.from('knowledge_map_nodes').select('concept_id').eq('id', nodeId).maybeSingle();
    if (!node) return res.status(404).json({ error: 'concept not found' });
    const graded = await gradeRewordedAo1Answer(nodeId, questionText, answer);
    if (!graded) return res.status(404).json({ error: 'no lesson generated for this concept yet' });
    if (graded.correct) {
      return res.json(await finalizeAo1Grade(userId, node.concept_id as string, true, graded.feedback));
    }
    // Wrong - before recording a real lapse, check whether this is a
    // one-word slip rather than a genuine gap (see AO1_SLIP_CHECK_PROMPT).
    // A slip candidate gets ONE narrow chance to fix just the flagged
    // word (see submit-slip-correction below) with nothing recorded yet;
    // anything else finalizes as a real wrong answer immediately, same as
    // before.
    const slip = await checkAo1SlipCandidate(nodeId, questionText, answer);
    if (slip?.isSlip && slip.wrongPhrase) {
      return res.json({ correct: false, feedback: graded.feedback, retryable: true, isSlipCandidate: true, wrongPhrase: slip.wrongPhrase });
    }
    res.json(await finalizeAo1Grade(userId, node.concept_id as string, false, graded.feedback));
  } catch (err) {
    console.error('AO1 reworded grading failed:', err);
    res.status(500).json({ error: 'could not grade this answer' });
  }
});

// The narrow one-shot fix for a flagged slip - the student edits only the
// wrong word/phrase, and this re-grades the RECONSTRUCTED full answer
// (original answer with wrongPhrase replaced by their correction) through
// the exact same check a clean first-time answer goes through. Whichever
// way it lands, THIS is what finally gets recorded - the original wrong
// attempt never was.
router.post('/knowledge-map-v2/node-review/ao1/submit-slip-correction', requireAuth, costlyEndpointLimiter, async (req: Request, res: Response) => {
  const { nodeId, questionText, originalAnswer, wrongPhrase, correction, declined, originalFeedback } = (req.body ?? {}) as {
    nodeId?: string; questionText?: string; originalAnswer?: string; wrongPhrase?: string; correction?: string;
    declined?: boolean; originalFeedback?: string;
  };
  if (!nodeId || !questionText || !originalAnswer || !wrongPhrase) {
    return res.status(400).json({ error: 'nodeId, questionText, originalAnswer and wrongPhrase are required' });
  }
  try {
    const userId = req.userId as string;
    const { data: node } = await supabaseAdmin.from('knowledge_map_nodes').select('concept_id').eq('id', nodeId).maybeSingle();
    if (!node) return res.status(404).json({ error: 'concept not found' });
    // "No, I didn't know this" - finalize as wrong right away, no need to
    // re-run grading on an answer the student isn't changing.
    if (declined) {
      return res.json(await finalizeAo1Grade(userId, node.concept_id as string, false, originalFeedback || ''));
    }
    if (typeof correction !== 'string' || !correction.trim()) {
      return res.status(400).json({ error: 'correction is required unless declined' });
    }
    const correctedAnswer = originalAnswer.replace(wrongPhrase, correction.trim());
    const graded = await gradeRewordedAo1Answer(nodeId, questionText, correctedAnswer);
    if (!graded) return res.status(404).json({ error: 'no lesson generated for this concept yet' });
    res.json(await finalizeAo1Grade(userId, node.concept_id as string, graded.correct, graded.feedback));
  } catch (err) {
    console.error('AO1 slip-correction grading failed:', err);
    res.status(500).json({ error: 'could not grade this answer' });
  }
});

router.post('/knowledge-map-v2/node-review/link-identify/start', requireAuth, costlyEndpointLimiter, async (req: Request, res: Response) => {
  const { fromNodeId, toNodeId } = (req.body ?? {}) as { fromNodeId?: string; toNodeId?: string };
  if (!fromNodeId || !toNodeId) return res.status(400).json({ error: 'fromNodeId and toNodeId are required' });
  try {
    const edge = await getLinkTeachingText(fromNodeId, toNodeId);
    if (!edge) return res.status(404).json({ error: 'connection not found' });
    res.json(edge);
  } catch (err) {
    console.error('Link-teaching lookup failed:', err);
    res.status(500).json({ error: 'could not load this connection' });
  }
});

// Wrong answers here are NEVER FSRS-graded - same "a wrong attempt with a
// prompted retry is a learning rep, not a real recall test" convention as
// a first-time encoding elsewhere in this app (see renderTextQuestionWidget's
// own comment in learn/index.html). Only the FINAL correct pass grades,
// with hadRetry reflecting whether any retry was needed along the way. No
// hint is generated on a wrong attempt - the link-teaching text stays
// visible on screen throughout (see learn/index.html's renderNodeReviewIdentify),
// so there's nothing a separate hint would add.
router.post('/knowledge-map-v2/node-review/link-identify/submit', requireAuth, costlyEndpointLimiter, async (req: Request, res: Response) => {
  const { fromNodeId, toNodeId, answer, hadRetry } = (req.body ?? {}) as {
    fromNodeId?: string; toNodeId?: string; answer?: string; hadRetry?: boolean;
  };
  if (!fromNodeId || !toNodeId || typeof answer !== 'string' || !answer.trim()) {
    return res.status(400).json({ error: 'fromNodeId, toNodeId and answer are required' });
  }
  try {
    const userId = req.userId as string;
    const [{ data: fromNode }, { data: toNode }] = await Promise.all([
      supabaseAdmin.from('knowledge_map_nodes').select('concept_id').eq('id', fromNodeId).maybeSingle(),
      supabaseAdmin.from('knowledge_map_nodes').select('concept_id').eq('id', toNodeId).maybeSingle(),
    ]);
    if (!fromNode || !toNode) return res.status(404).json({ error: 'connection not found' });

    const graded = await gradeLinkRestatement(fromNodeId, toNodeId, answer);
    if (!graded) return res.status(404).json({ error: 'connection not found' });

    if (!graded.correct) {
      return res.json({ correct: false, feedback: graded.feedback, retryable: true });
    }

    const conceptId = linkIdentifyConceptId(fromNode.concept_id as string, toNode.concept_id as string);
    const result = await gradeCorrectness(userId, conceptId, true, !!hadRetry);
    const { paid: keysEarned } = await payLessonCredits(userId, false, result, 1.0, 'node_review_identify');
    res.json({ correct: true, feedback: graded.feedback, schedule: { conceptId, ...result.newState }, keysEarned });
  } catch (err) {
    console.error('Link-identify grading failed:', err);
    res.status(500).json({ error: 'could not grade this answer' });
  }
});

router.post('/knowledge-map-v2/node-review/integration/start', requireAuth, costlyEndpointLimiter, async (req: Request, res: Response) => {
  const { fromNodeId, toNodeId } = (req.body ?? {}) as { fromNodeId?: string; toNodeId?: string };
  if (!fromNodeId || !toNodeId) return res.status(400).json({ error: 'fromNodeId and toNodeId are required' });
  try {
    const question = await getIntegrationQuestionText(fromNodeId, toNodeId);
    if (!question) return res.json({ unavailable: true });
    res.json({ questionText: question.questionText });
  } catch (err) {
    console.error('Integration question lookup failed:', err);
    res.status(500).json({ error: 'could not load this question' });
  }
});

router.post('/knowledge-map-v2/node-review/integration/submit', requireAuth, costlyEndpointLimiter, async (req: Request, res: Response) => {
  const { fromNodeId, toNodeId, answer } = (req.body ?? {}) as { fromNodeId?: string; toNodeId?: string; answer?: string };
  if (!fromNodeId || !toNodeId || typeof answer !== 'string' || !answer.trim()) {
    return res.status(400).json({ error: 'fromNodeId, toNodeId and answer are required' });
  }
  try {
    const userId = req.userId as string;
    const [{ data: fromNode }, { data: toNode }] = await Promise.all([
      supabaseAdmin.from('knowledge_map_nodes').select('concept_id').eq('id', fromNodeId).maybeSingle(),
      supabaseAdmin.from('knowledge_map_nodes').select('concept_id').eq('id', toNodeId).maybeSingle(),
    ]);
    if (!fromNode || !toNode) return res.status(404).json({ error: 'connection not found' });

    const graded = await gradeIntegrationAnswer(fromNodeId, toNodeId, answer);
    if (!graded) return res.status(404).json({ error: 'no integration question available for this connection' });

    const conceptId = linkIntegrationConceptId(fromNode.concept_id as string, toNode.concept_id as string);
    const result = await gradeCorrectness(userId, conceptId, graded.correct, false);
    const { paid: keysEarned } = await payLessonCredits(userId, false, result, 1.0, 'node_review_integration');
    res.json({ correct: graded.correct, feedback: graded.feedback, schedule: { conceptId, ...result.newState }, keysEarned });
  } catch (err) {
    console.error('Integration grading failed:', err);
    res.status(500).json({ error: 'could not grade this answer' });
  }
});

export default router;
