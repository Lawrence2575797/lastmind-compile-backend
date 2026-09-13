import { Router, Request, Response } from 'express';
import { requireAuth, requirePaidTier, isUserPaid } from '../services/authMiddleware';
import { costlyEndpointLimiter, syncEndpointLimiter } from '../services/rateLimiters';
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
import { gradeCorrectness, DURABLE_RELEARNING_CRITERION, ReviewNotDueError } from '../services/reviewService';
import { payLessonCredits, KM_VERIFY_COEFFICIENT_FREE, KM_VERIFY_COEFFICIENT_PREMIUM } from '../services/creditService';
import { callClaudeJSON, MODELS } from '../services/claudeClient';
import { parseCorrectFeedbackJson, parseModelJson } from '../services/jsonParsing';
import { KNOWLEDGE_MAP_ANSWER_CHECK_PROMPT, DAY1_CHECK_ANSWER_PROMPT, FILL_BLANK_LENIENCY_PROMPT } from '../constants/knowledgeMapAnswerCheckPrompt';
import { VERIFY_LEARNING_PROMPT, buildVerifyQuestionText } from '../constants/verifyLearningPrompts';
import {
  getQualifyingReviewLinks,
  linkIntegrationConceptId,
  getRewordedAo1Question,
  gradeRewordedAo1Answer,
  checkAo1SlipCandidate,
  getIntegrationStepData,
  gradeIntegrationAnswer,
  assertNodeReviewDue,
  assertAo1ReviewDue,
} from '../services/nodeReviewService';
import { getNodeNoteBaseline, getNodeNoteForUser, saveNodeNoteEdit, getNodeNotes, getEdgeNoteBaseline, getEdgeNoteForUser, saveEdgeNoteEdit, getEdgeNotes, getNotesIndexForUser, getPersonalNote, savePersonalNote, checkWorkedExampleStep } from '../services/knowledgeMapNotesService';
import { generateAndCacheNodeLesson, generateAndCacheEdgeLesson } from '../services/lessonGenerationService';
import { answerKnowledgeMapQuestion } from '../services/knowledgeMapAskService';
import { assertFreshGenerationWithinCap, recordFreshGenerationEvent, GenerationCapExceededError } from '../services/generationCapService';
import { recordPairwiseIntegrationOutcome } from '../services/chainMasteryService';
import { getOrCreateUserRecallTuning, getDifficultyAndCapability, nextRecallDelayMinutes, updateGammaAfterRecall, bumpBaseRecalls } from '../services/recallTuningService';
import { getQuestionForConceptId, getConceptDisplayInfo, orderDay1ChecksByLessonOrder } from '../services/day1CheckService';

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
//
// syncEndpointLimiter, not costlyEndpointLimiter - this is a plain
// database read (getKnowledgeMapForSubject makes no Claude/AI call at
// all), same reasoning the sibling node-lesson route below already
// documents for why it isn't rate-limited like a real generation call.
// This matters more now than it used to: the short-form feed
// (sfComputeGlobalNextLesson) calls this once per subject on EVERY
// login, not just on a rare manual folder click - a student with a
// handful of subjects refreshing a couple of times could genuinely have
// hit the old 10/min "costly" cap on a route that never touches Claude.
router.get('/knowledge-map-v2', requireAuth, syncEndpointLimiter, async (req: Request, res: Response) => {
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
// { explanation, practiceQuestion } for one node.
// Generated on demand (see lessonGenerationService.ts) the first time any
// student's request finds no row yet, then served identically to every
// student from then on, same one-time-content-cost contract
// scripts/generate_lesson_content.js's offline Batches pipeline
// established - this just triggers it live instead of via a pre-generated
// batch, so a subject's lessons only ever get generated for nodes
// students actually reach. syncEndpointLimiter, not costlyEndpointLimiter
// - the overwhelming common case here is a cheap cached read (any node
// already reached by any student), and a real generation only ever
// happens once per node forever after, so the tight 10/min "every call
// costs money" limiter would just break a student legitimately browsing
// more than 10 concepts a minute on the knowledge map.
router.get('/knowledge-map-v2/node/:nodeId/lesson', requireAuth, syncEndpointLimiter, async (req: Request, res: Response) => {
  const { nodeId } = req.params;
  try {
    const { data, error } = await supabaseAdmin
      .from('knowledge_map_node_lessons')
      .select('encoding_content')
      .eq('node_id', nodeId)
      .maybeSingle();
    if (error) throw error;
    if (data) return res.json(data.encoding_content);

    // Cache miss - a real Sonnet generation is about to happen. Capped
    // BEFORE generating, not after, for BOTH tiers (free used to bypass
    // this entirely - see generationCapService.ts's own comment on why
    // that changed) - a cache hit above never reaches this check at all.
    const userId = req.userId as string;
    await assertFreshGenerationWithinCap(userId, await isUserPaid(userId), req.userCreatedAt ?? null);
    const generated = await generateAndCacheNodeLesson(nodeId, userId);
    if (!generated) return res.status(404).json({ error: 'concept not found' });
    await recordFreshGenerationEvent(userId);
    res.json(generated);
  } catch (err) {
    if (err instanceof GenerationCapExceededError) {
      // code: 'LOCK_LIMIT_REACHED' - a stable field the frontend keys off
      // to show the "Buy more Locks" action, rather than string-matching
      // the human-readable message (which is free to reword later).
      return res.status(429).json({ error: 'Lock limit reached', code: 'LOCK_LIMIT_REACHED', window: err.window, limit: err.limit });
    }
    console.error('Node lesson lookup/generation failed:', err);
    res.status(500).json({ error: 'could not load this lesson' });
  }
});

// POST /knowledge-map-v2/node/:nodeId/ask  { question }
// The "Ask Cortex" corner panel shown during a knowledge-map lesson - a
// place for genuine curiosity without derailing the lesson, and without
// the student having to leave it for their main Cortex chat (see
// KNOWLEDGE_MAP_ASK_PROMPT). Purely advisory: never touches FSRS,
// credits, or the practice question's own state - the student hasn't
// been tested on anything by asking. costlyEndpointLimiter, unlike the
// lesson-content route above - this is a live generation call every
// single time, never cached, since the question itself is never the same.
router.post('/knowledge-map-v2/node/:nodeId/ask', requireAuth, costlyEndpointLimiter, async (req: Request, res: Response) => {
  const { nodeId } = req.params;
  const { question } = (req.body ?? {}) as { question?: string };
  if (typeof question !== 'string' || !question.trim()) {
    return res.status(400).json({ error: 'a non-empty question is required' });
  }
  try {
    const result = await answerKnowledgeMapQuestion(nodeId, question.trim(), req.userId as string);
    if (!result) return res.status(404).json({ error: 'concept not found' });
    res.json(result);
  } catch (err) {
    console.error('Knowledge-map ask-panel question failed:', err);
    res.status(500).json({ error: 'could not answer that right now' });
  }
});

// GET /knowledge-map-v2/edge/:fromNodeId/:toNodeId/lesson -> the stored
// edge lesson { linkTeaching, transferQuestion, integrationQuestion } for
// the prerequisite relationship between two nodes. Same on-demand
// generate-and-cache contract as the node lesson route above - looks the
// edge up by its endpoints since the frontend graph only knows node ids,
// generating it live on a cache miss (generateAndCacheEdgeLesson returns
// null, and this 404s, if either endpoint isn't encoded yet - it
// structurally shouldn't be reachable before both are, per
// findMissingEncoding's own gate). syncEndpointLimiter for the same
// reason as the node lesson route above.
router.get('/knowledge-map-v2/edge/:fromNodeId/:toNodeId/lesson', requireAuth, syncEndpointLimiter, async (req: Request, res: Response) => {
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
    if (lessonRow) {
      return res.json({
        linkTeaching: lessonRow.link_teaching_content,
        transferQuestion: lessonRow.transfer_question,
        integrationQuestion: lessonRow.integration_question,
      });
    }

    const userId = req.userId as string;
    await assertFreshGenerationWithinCap(userId, await isUserPaid(userId), req.userCreatedAt ?? null);
    const generated = await generateAndCacheEdgeLesson(fromNodeId, toNodeId, userId);
    if (!generated) return res.status(404).json({ error: 'connection not found or not ready yet' });
    await recordFreshGenerationEvent(userId);
    res.json(generated);
  } catch (err) {
    if (err instanceof GenerationCapExceededError) {
      // code: 'LOCK_LIMIT_REACHED' - a stable field the frontend keys off
      // to show the "Buy more Locks" action, rather than string-matching
      // the human-readable message (which is free to reword later).
      return res.status(429).json({ error: 'Lock limit reached', code: 'LOCK_LIMIT_REACHED', window: err.window, limit: err.limit });
    }
    console.error('Edge lesson lookup/generation failed:', err);
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
  // Locked in once at /submit (the first point anything is actually
  // graded) rather than recomputed from isUserPaid on every later
  // round-trip - keeps the whole walk paying at one consistent rate even
  // if the student's tier changes mid-flow, and avoids an extra DB lookup
  // on every step.
  coefficient?: number;
  keysEarnedSoFar?: number;
}

async function finalizeChainDiagnostic(state: ChainDiagnosticState) {
  const genuineGapIds = state.genuineGapIds || [];
  const keysEarned = state.keysEarnedSoFar || 0;
  if (!genuineGapIds.length) return { passed: true as const, keysEarned };
  // First in chain order — pendingFailureIds/componentIds are already
  // topologically ordered, and genuineGapIds is appended in the same walk
  // order, so the earliest entry is the earliest real gap in the chain.
  const redirect = await redirectForComponent(genuineGapIds[0]);
  // Whatever was earned from the OTHER components that genuinely passed
  // still stands even though the chain as a whole is denied - a real gap
  // in one component doesn't undo a real pass on another.
  return { passed: false as const, denied: true as const, redirect, keysEarned };
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

    const { questionText } = await generateChainDiagnosticQuestion(gap.targetLabel, gap.componentIds, req.userId as string);
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
    // Locked in for the whole walk - see ChainDiagnosticState's own
    // comment on why this isn't recomputed on every later step.
    const coefficient = (await isUserPaid(userId)) ? KM_VERIFY_COEFFICIENT_PREMIUM : KM_VERIFY_COEFFICIENT_FREE;
    const outcomes = await gradeChainDiagnosticAnswer(state.componentIds, state.questionText, answer, userId);
    const failures = outcomes.filter((o) => !o.correct);
    const paidAmounts = await Promise.all(
      outcomes.filter((o) => o.correct).map((o) => gradeComponentOutcome(userId, o.componentId, 'correct', coefficient))
    );
    const keysEarned = paidAmounts.reduce((sum, paid) => sum + paid, 0);

    if (!failures.length) {
      return res.json({ passed: true, keysEarned });
    }

    const nextState: ChainDiagnosticState = {
      ...state,
      answer,
      pendingFailureIds: failures.map((f) => f.componentId),
      currentIndex: 0,
      failureFeedback: Object.fromEntries(failures.map((f) => [f.componentId, f.feedback])),
      genuineGapIds: [],
      coefficient,
      keysEarnedSoFar: keysEarned,
    };
    const first = failures[0];
    res.json({
      passed: false,
      currentFailure: { componentId: first.componentId, type: first.type, label: first.label, feedback: first.feedback },
      remaining: failures.length,
      keysEarned,
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
      const retryQuestionText = await generateSlipRetryQuestion(componentId, state.answer || '', state.failureFeedback?.[componentId] || '', userId);
      return res.json({ needsRetry: true, retryQuestionText, keysEarned: state.keysEarnedSoFar || 0, state: { ...state, retryQuestionText } });
    }

    // A genuine gap never pays (see gradeComponentOutcome) - coefficient
    // is irrelevant on this branch, just threaded through for signature
    // consistency.
    await gradeComponentOutcome(userId, componentId, 'genuine_gap', state.coefficient || 0);
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
        keysEarned: state.keysEarnedSoFar || 0,
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
    const { correct, feedback } = await gradeSlipRetryAnswer(componentId, state.retryQuestionText, answer, userId);
    const paidNow = await gradeComponentOutcome(userId, componentId, correct ? 'slip_confirmed' : 'genuine_gap', state.coefficient || 0);
    const genuineGapIds = correct ? state.genuineGapIds || [] : [...(state.genuineGapIds || []), componentId];
    const keysEarnedSoFar = (state.keysEarnedSoFar || 0) + paidNow;

    const nextIndex = idx + 1;
    if (nextIndex < pending.length) {
      const nextComponentId = pending[nextIndex];
      const nextState: ChainDiagnosticState = { ...state, currentIndex: nextIndex, genuineGapIds, retryQuestionText: undefined, keysEarnedSoFar };
      return res.json({
        retryFeedback: feedback,
        currentFailure: { componentId: nextComponentId, feedback: state.failureFeedback?.[nextComponentId] || '' },
        remaining: pending.length - nextIndex,
        keysEarned: keysEarnedSoFar,
        state: nextState,
      });
    }
    const result = await finalizeChainDiagnostic({ ...state, genuineGapIds, keysEarnedSoFar });
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
  const { nodeId, fromNodeId, toNodeId, questionType, answer, retryCount } = (req.body ?? {}) as {
    nodeId?: string;
    fromNodeId?: string;
    toNodeId?: string;
    questionType?: 'practice' | 'transfer' | 'integration';
    answer?: DiagramAnswerSubmission;
    retryCount?: number;
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
    const graded = await gradeCorrectness(userId, conceptId!, result.correct, questionType === 'practice' ? (Number(retryCount) || 0) : 0);
    const { paid: keysEarned } = await payLessonCredits(userId, questionType === 'practice', graded, 1.0, 'knowledge_map_lesson');
    // The frontend needs the fresh due date the moment this grades, not
    // only after a later /schedule refetch (e.g. on returning to the
    // dashboard) — see reviewService.ts's cardToRowFields for the fields.
    res.json({ ...result, schedule: scheduleWithMastery(conceptId!, graded), keysEarned });
  } catch (err) {
    console.error('Diagram question grading failed:', err);
    res.status(500).json({ error: 'could not grade this diagram' });
  }
});

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

// The map's node/link colouring (see the frontend's masteryProgressTier)
// is derived from spacedSuccessCount/isDurablyMastered, not from the FSRS
// card fields alone - every submit route below feeds its result straight
// back into the frontend's own in-memory graph data so the map updates
// the instant a lesson/review completes (see each route's own comment),
// so this needs to travel in the same `schedule` payload as the due date,
// not just `graded.newState` (the bare FSRS fields).
function scheduleWithMastery(conceptId: string, graded: Awaited<ReturnType<typeof gradeCorrectness>>) {
  return {
    conceptId,
    ...graded.newState,
    spacedSuccessCount: graded.spacedSuccessCount,
    isDurablyMastered: graded.spacedSuccessCount >= DURABLE_RELEARNING_CRITERION,
  };
}

// POST /knowledge-map-v2/text-question/submit
// { nodeId, questionType: 'practice' } or
// { fromNodeId, toNodeId, questionType: 'transfer'|'integration' }, plus
// { answer: string } - the free-text/worked-answer counterpart to the
// diagram-question route above, for every question that ISN'T a diagram.
// The question text and mark scheme are always re-fetched here, never
// trusted from the client, same discipline as every other grading route
// in this file.
// Strips accents/diacritics before comparing a submitted blank answer
// against its stored one - the same leniency KNOWLEDGE_MAP_ANSWER_CHECK_PROMPT
// applies for the AI-graded path (a student typing "tu" for "tú" on a
// standard English keyboard shouldn't be marked wrong), safe to apply
// unconditionally here since each blank is checked against ONE known,
// specific expected answer - unlike the free-text AI grader, there's no
// risk of confusing it with an unrelated different-meaning word.
function normalizeForBlankComparison(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

router.post('/knowledge-map-v2/text-question/submit', requireAuth, costlyEndpointLimiter, async (req: Request, res: Response) => {
  const { nodeId, fromNodeId, toNodeId, questionType, answer, answers, retryCount } = (req.body ?? {}) as {
    nodeId?: string;
    fromNodeId?: string;
    toNodeId?: string;
    questionType?: 'practice' | 'transfer' | 'integration';
    answer?: string;
    answers?: string[];
    retryCount?: number;
  };
  const isBlanksSubmission = Array.isArray(answers);
  if (!questionType || (isBlanksSubmission ? !answers!.length : (typeof answer !== 'string' || !answer.trim()))) {
    return res.status(400).json({ error: 'questionType and answer(s) are required' });
  }

  try {
    const userId = req.userId as string;
    let question: { questionText?: string; markScheme?: string; blanks?: { prompt: string; answer: string }[] } | undefined;
    let conceptId: string | undefined;

    if (questionType === 'practice') {
      if (!nodeId) return res.status(400).json({ error: 'nodeId is required for a practice question' });
      const [{ data: node }, { data: lesson }] = await Promise.all([
        supabaseAdmin.from('knowledge_map_nodes').select('concept_id').eq('id', nodeId).maybeSingle(),
        supabaseAdmin.from('knowledge_map_node_lessons').select('encoding_content').eq('node_id', nodeId).maybeSingle(),
      ]);
      if (!node) return res.status(404).json({ error: 'concept not found' });
      conceptId = node.concept_id as string;
      question = (lesson?.encoding_content as { practiceQuestion?: { questionText?: string; markScheme?: string; blanks?: { prompt: string; answer: string }[] } } | null)?.practiceQuestion;
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

    // Grouped fill-in-the-gaps questions (rule 4b/4c in
    // lessonGenerationPrompts.ts) are graded locally, per blank, against
    // the exact answer generated for each one - never routed through the
    // AI grader, since each blank already has ONE known correct string to
    // compare against (no free-text judgment call needed). Blanks are
    // re-fetched from the stored lesson here, same "never trust the
    // client" discipline as question/markScheme above.
    if (isBlanksSubmission) {
      if (questionType !== 'practice' || !question.blanks || !question.blanks.length) {
        return res.status(400).json({ error: 'this question has no separately-gradable blanks' });
      }
      const perBlankCorrect = question.blanks.map((b, i) => normalizeForBlankComparison(answers![i] || '') === normalizeForBlankComparison(b.answer));
      const correct = perBlankCorrect.every(Boolean);
      const feedback = correct ? 'All correct!' : 'Check the highlighted box(es) and try again.';
      if (!correct) {
        return res.json({ correct, feedback, perBlankCorrect, retryable: true });
      }
      const graded = await gradeCorrectness(userId, conceptId!, correct, Number(retryCount) || 0);
      const { paid: keysEarned } = await payLessonCredits(userId, true, graded, 1.0, 'knowledge_map_lesson');
      return res.json({ correct, feedback, perBlankCorrect, schedule: scheduleWithMastery(conceptId!, graded), keysEarned });
    }

    const raw = await callClaudeJSON({
      model: MODELS.simpleQuestion,
      systemPrompt: KNOWLEDGE_MAP_ANSWER_CHECK_PROMPT,
      userContent: `Question: ${question.questionText}\nMark scheme: ${question.markScheme || ''}\nStudent's answer: ${answer}`,
      temperature: 0.1,
      userId,
    });
    // parseCorrectFeedbackJson (not a bare JSON.parse) - see its own
    // comment: a stray sentence around otherwise-valid JSON, or an
    // unescaped internal quote in feedback (e.g. quoting "ceteris
    // paribus" back to the student), doesn't turn into a hard 500 (a
    // real, reported failure: submitting an answer repeatedly hit
    // "something went wrong" with no way through).
    const { correct, feedback } = parseCorrectFeedbackJson(raw);

    // See the identical comment on diagram-question/submit above: a wrong
    // first-time encoding attempt ('practice') is a learning rep, not a
    // real recall test - don't record an FSRS lapse for it, let the
    // student retry. Transfer/integration (a spaced review of an
    // already-encoded concept) still grades every attempt immediately.
    if (questionType === 'practice' && !correct) {
      return res.json({ correct, feedback, retryable: true });
    }
    const graded = await gradeCorrectness(userId, conceptId!, correct, questionType === 'practice' ? (Number(retryCount) || 0) : 0);
    const { paid: keysEarned } = await payLessonCredits(userId, questionType === 'practice', graded, 1.0, 'knowledge_map_lesson');
    // See the identical comment on diagram-question/submit above.
    res.json({ correct, feedback, schedule: scheduleWithMastery(conceptId!, graded), keysEarned });
  } catch (err) {
    console.error('Text question grading failed:', err);
    res.status(500).json({ error: 'could not grade this answer' });
  }
});

// Shape of one entry in encoding_content.recallChecks (see the
// "recallChecks" output field added to KNOWLEDGE_MAP_ENCODING_LESSON_PROMPT
// in lessonGenerationPrompts.ts) - generated once alongside the lesson
// itself, cached forever, never regenerated per recall.
interface RecallCheck {
  format: 'free_text' | 'fill_blank' | 'multiple_choice';
  questionText: string;
  markScheme?: string; // free_text only
  answer?: string; // fill_blank only
  options?: string[]; // multiple_choice only
  correctOptionIndex?: number; // multiple_choice only
}

// A missed recall is given up on permanently, not shown later - "if a
// student misses the window, we wait for the real Day-1 check" is an
// explicit product decision, not just a UX nicety, so it has to be
// enforced here (server-side, permanent) rather than only as a client-
// side timer - otherwise reopening the feed after missing the window
// would just re-fetch the same still-unresolved row and offer it again.
// Deliberately short (30 seconds total, 15 either side of the nominal
// due moment) - a recall is only ever meant to fire right around its
// own due moment; missing that narrow window means giving up on the
// WHOLE cascade, not just this one step (see the correct branch below,
// which never schedules a next recall for a missed one - there's
// nothing to continue since this row never resolves). Only the AFTER
// side is enforced here as an expiry (a recall isn't surfaced before
// its due_at at all - see sfScheduleRecallTimer - so a "before" grace
// period has nothing to apply to server-side).
const RECALL_GRACE_MS = 30 * 1000;

// GET /immediate-recalls/due
// Lists this user's still-catchable rows from immediate_recall_schedule
// (see scheduleImmediateRecall in reviewService.ts - a same-session "did
// you actually retain this" check fired 2 minutes after a concept's
// first-ever encoding, deliberately separate from real FSRS spaced
// review). Plain DB read, no AI call - the feed fetches this once on
// mount and again after each correctly-answered lesson (a fresh encoding
// schedules a new row), then times each one client-side against its own
// due_at rather than polling this endpoint.
router.get('/immediate-recalls/due', requireAuth, syncEndpointLimiter, async (req: Request, res: Response) => {
  try {
    const userId = req.userId as string;
    const { data: rows, error } = await supabaseAdmin
      .from('immediate_recall_schedule')
      .select('id, concept_id, due_at')
      .eq('user_id', userId)
      .eq('resolved', false);
    if (error) throw error;
    if (!rows || !rows.length) return res.json({ recalls: [] });

    const now = Date.now();
    const missed = rows.filter((r) => now - new Date(r.due_at as string).getTime() > RECALL_GRACE_MS);
    const stillCatchable = rows.filter((r) => now - new Date(r.due_at as string).getTime() <= RECALL_GRACE_MS);
    if (missed.length) {
      // Fire-and-forget - never block this response on cleaning up ones
      // the student already missed, and never let a failure here surface
      // as an error for a request that otherwise succeeded.
      supabaseAdmin
        .from('immediate_recall_schedule')
        .update({ resolved: true })
        .in('id', missed.map((r) => r.id))
        .then(({ error: expireError }) => {
          if (expireError) console.error('Expiring missed immediate recalls failed (non-fatal):', expireError);
        });
    }
    if (!stillCatchable.length) return res.json({ recalls: [] });

    const conceptIds = stillCatchable.map((r) => r.concept_id as string);
    const { data: nodes, error: nodeError } = await supabaseAdmin
      .from('knowledge_map_nodes')
      .select('id, concept_id, label, subject')
      .in('concept_id', conceptIds);
    if (nodeError) throw nodeError;
    const nodeByConceptId = new Map((nodes || []).map((n) => [n.concept_id as string, n]));

    const nodeIds = (nodes || []).map((n) => n.id as string);
    const { data: lessons, error: lessonError } = nodeIds.length
      ? await supabaseAdmin.from('knowledge_map_node_lessons').select('node_id, encoding_content').in('node_id', nodeIds)
      : { data: [] as { node_id: string; encoding_content: unknown }[], error: null };
    if (lessonError) throw lessonError;
    const lessonByNodeId = new Map((lessons || []).map((l) => [l.node_id as string, l.encoding_content]));

    const recalls = stillCatchable
      .map((r) => {
        const node = nodeByConceptId.get(r.concept_id as string);
        if (!node) return null; // concept since deleted/regenerated - nothing left to recall
        // Picks one of the node's own cached recall-check questions
        // (generated alongside the lesson itself - see recallChecks in
        // lessonGenerationPrompts.ts) rather than re-asking the main
        // practiceQuestion verbatim minutes later. Picked fresh at random
        // each time a recall is served, so the format/wording isn't
        // predictable across repeats. A node generated before this field
        // existed has no recallChecks yet - fall back to the main
        // practiceQuestion rather than offering nothing.
        const content = lessonByNodeId.get(node.id) as { recallChecks?: RecallCheck[]; practiceQuestion?: { questionText?: string; markScheme?: string } } | undefined;
        const checks = content?.recallChecks;
        let recallCheckIndex: number;
        let check: RecallCheck;
        if (checks && checks.length) {
          recallCheckIndex = Math.floor(Math.random() * checks.length);
          check = checks[recallCheckIndex];
        } else if (content?.practiceQuestion?.questionText) {
          recallCheckIndex = -1; // signals "the main practiceQuestion, not a cached recallCheck" to the submit route
          check = { format: 'free_text', questionText: content.practiceQuestion.questionText };
        } else {
          return null; // nothing generated yet for this node at all
        }
        return {
          recallId: r.id, nodeId: node.id, label: node.label, subject: node.subject, dueAt: r.due_at,
          recallCheckIndex, format: check.format, questionText: check.questionText,
          options: check.format === 'multiple_choice' ? check.options : undefined,
        };
      })
      .filter(Boolean);
    res.json({ recalls });
  } catch (err) {
    console.error('Fetching due immediate recalls failed:', err);
    res.status(500).json({ error: 'could not load recalls' });
  }
});

// POST /immediate-recalls/:id/submit
// Grades a same-session immediate recall's answer against ONE of the
// node's own cached recallChecks (recallCheckIndex, from the GET /due
// response above - re-fetched here server-side, never trusted from the
// client, same discipline as every other grading route in this file).
// "free_text" is graded by the EXACT SAME AI correctness check as a
// normal practice question; "fill_blank" and "multiple_choice" are
// graded locally with no AI call at all, since each has exactly one
// known correct answer to compare against. Deliberately does NOT call
// gradeCorrectness/gradeAndRecordReview regardless of format - this is
// a light, non-punitive retention check, not a real FSRS event, and
// must never advance or lapse the concept's actual spaced-review due
// date a second time (see scheduleImmediateRecall's own comment on
// exactly this). A wrong answer just returns correct:false with no
// state change at all - the student fixes it and the feed lets them
// try again (same shake-until-right UX as any other question slide);
// the schedule row is only marked resolved once genuinely answered
// correctly. If missed/ignored entirely, it just stays unresolved
// forever with zero side effects - whatever happens is left to the
// concept's own already-scheduled real review, exactly as if this
// feature didn't exist.
router.post('/immediate-recalls/:id/submit', requireAuth, costlyEndpointLimiter, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { recallCheckIndex, answer, selectedOptionIndex, retryCount } = (req.body ?? {}) as {
    recallCheckIndex?: number;
    answer?: string;
    selectedOptionIndex?: number;
    retryCount?: number;
  };
  if (typeof recallCheckIndex !== 'number') return res.status(400).json({ error: 'recallCheckIndex is required' });

  try {
    const userId = req.userId as string;
    const { data: row } = await supabaseAdmin
      .from('immediate_recall_schedule')
      .select('id, concept_id, resolved, recall_number, target_recalls')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();
    if (!row) return res.status(404).json({ error: 'recall not found' });
    if (row.resolved) return res.json({ correct: true, feedback: 'Already done.' });

    const { data: node } = await supabaseAdmin
      .from('knowledge_map_nodes')
      .select('id')
      .eq('concept_id', row.concept_id)
      .maybeSingle();
    if (!node) return res.status(404).json({ error: 'concept not found' });
    const { data: lesson } = await supabaseAdmin
      .from('knowledge_map_node_lessons')
      .select('encoding_content')
      .eq('node_id', node.id)
      .maybeSingle();
    const content = lesson?.encoding_content as { recallChecks?: RecallCheck[]; practiceQuestion?: { questionText?: string; markScheme?: string } } | null;
    // recallCheckIndex -1 is GET /due's own fallback for a node with no
    // recallChecks generated yet - re-derive the exact same fallback
    // here rather than trusting the client's copy of it.
    const check: RecallCheck | undefined = recallCheckIndex === -1
      ? (content?.practiceQuestion?.questionText ? { format: 'free_text', questionText: content.practiceQuestion.questionText, markScheme: content.practiceQuestion.markScheme } : undefined)
      : content?.recallChecks?.[recallCheckIndex];
    if (!check || !check.questionText) return res.status(404).json({ error: 'question not found' });

    let correct: boolean;
    let feedback: string | null = null;
    if (check.format === 'multiple_choice') {
      if (typeof selectedOptionIndex !== 'number') return res.status(400).json({ error: 'selectedOptionIndex is required' });
      correct = selectedOptionIndex === check.correctOptionIndex;
      feedback = correct ? null : 'Not quite - check the other options again.';
    } else if (check.format === 'fill_blank') {
      if (typeof answer !== 'string' || !answer.trim()) return res.status(400).json({ error: 'answer is required' });
      correct = normalizeForBlankComparison(answer) === normalizeForBlankComparison(check.answer || '');
      if (correct) {
        feedback = null;
      } else {
        // Not an exact match - genuinely different wording could still be
        // an acceptable synonym (see FILL_BLANK_LENIENCY_PROMPT's own
        // comment), so ask before giving up and calling it wrong with no
        // real guidance.
        const raw = await callClaudeJSON({
          model: MODELS.simpleQuestion,
          systemPrompt: FILL_BLANK_LENIENCY_PROMPT,
          userContent: `Sentence: ${check.questionText}\nExpected answer: ${check.answer || ''}\nStudent's answer: ${answer}`,
          temperature: 0.1,
          userId,
        });
        ({ correct, feedback } = parseCorrectFeedbackJson(raw));
      }
    } else {
      if (typeof answer !== 'string' || !answer.trim()) return res.status(400).json({ error: 'answer is required' });
      const raw = await callClaudeJSON({
        model: MODELS.simpleQuestion,
        systemPrompt: KNOWLEDGE_MAP_ANSWER_CHECK_PROMPT,
        userContent: `Question: ${check.questionText}\nMark scheme: ${check.markScheme || ''}\nStudent's answer: ${answer}`,
        temperature: 0.1,
        userId,
      });
      ({ correct, feedback } = parseCorrectFeedbackJson(raw));
    }

    // Gamma tunes off the FIRST attempt's own result only - a retry on
    // the same recall is the same underlying event, not a second data
    // point (see updateGammaAfterRecall's own comment on the exact
    // update rule this reproduces).
    if ((Number(retryCount) || 0) === 0) {
      await updateGammaAfterRecall(userId, correct);
    }

    if (correct) {
      const { error: updateError } = await supabaseAdmin.from('immediate_recall_schedule').update({ resolved: true }).eq('id', id);
      if (updateError) throw updateError;

      // Continue the cascade if this concept's own Rs hasn't been
      // reached yet - total successes so far = 1 (the original encoding/
      // first-integration pass) + every scheduled recall completed up to
      // and including this one. Works identically for a node's own
      // encoding concept or an edge's integration concept - a concept
      // with no difficulty score generated yet just stops here, same as
      // the original single-recall behaviour always did.
      const recallNumber = (row.recall_number as number) || 1;
      const targetRecalls = (row.target_recalls as number) || 2;
      if (1 + recallNumber < targetRecalls) {
        const dc = await getDifficultyAndCapability(row.concept_id as string, userId);
        if (dc) {
          const tuning = await getOrCreateUserRecallTuning(userId);
          const delayMinutes = nextRecallDelayMinutes(recallNumber + 1, dc.difficulty, dc.capability, tuning);
          const dueAt = new Date(Date.now() + delayMinutes * 60 * 1000).toISOString();
          const { error: nextError } = await supabaseAdmin.from('immediate_recall_schedule').insert({
            user_id: userId, concept_id: row.concept_id, due_at: dueAt, recall_number: recallNumber + 1, target_recalls: targetRecalls,
          });
          if (nextError) console.error('Scheduling next recall in cascade failed (non-fatal):', nextError);
        }
      }
    }
    res.json({ correct, feedback });
  } catch (err) {
    console.error('Immediate recall grading failed:', err);
    res.status(500).json({ error: 'could not grade this answer' });
  }
});

// GET /day1-checks/due
// Lists this user's due (or overdue - see day1CheckService.ts's own
// comment on why a missed one just stays due rather than expiring)
// Day-1 checks. Prioritised the same way a real spaced review is - see
// the frontend's own due-review priority computation, which this feeds
// into identically.
router.get('/day1-checks/due', requireAuth, syncEndpointLimiter, async (req: Request, res: Response) => {
  try {
    const userId = req.userId as string;
    const today = new Date().toISOString().slice(0, 10);
    const { data: rows, error } = await supabaseAdmin
      .from('day1_checks')
      .select('id, concept_id, due_date')
      .eq('user_id', userId)
      .eq('resolved', false)
      .lte('due_date', today);
    if (error) throw error;
    if (!rows || !rows.length) return res.json({ checks: [] });

    // Includes the actual question text up front (never the mark scheme)
    // so the feed can build the slide directly from this one response,
    // same pattern as GET /immediate-recalls/due.
    const withDisplay = await Promise.all(rows.map(async (r) => {
      const [info, question] = await Promise.all([
        getConceptDisplayInfo(r.concept_id as string),
        getQuestionForConceptId(r.concept_id as string),
      ]);
      if (!info || !question) return null;
      return { checkId: r.id, conceptId: r.concept_id, label: info.label, subject: info.subject, dueDate: r.due_date, questionText: question.questionText };
    }));
    const usable = withDisplay.filter((c): c is NonNullable<typeof c> => c !== null);
    // Ordered by where each concept sits in its subject's own teaching
    // sequence, not by due_date (which is usually identical - "today" -
    // for everything overdue, making it a meaningless tiebreaker) and
    // never by recall/FSRS priority - a Day-1 check has no recall
    // cascade of its own to prioritise by.
    const ordered = await orderDay1ChecksByLessonOrder(usable);
    res.json({ checks: ordered });
  } catch (err) {
    console.error('Fetching due Day-1 checks failed:', err);
    res.status(500).json({ error: 'could not load Day-1 checks' });
  }
});

// GET /day1-checks/pending
// Every concept_id (node OR edge/integration) with a not-yet-resolved
// Day-1 check, regardless of due_date - "integration must be after
// passing a Day-1 check" means the real AO1/qualifying-link spaced-
// review system should never offer a concept that hasn't cleared its
// Day-1 check yet, even if that check isn't due for another day. The
// feed's own recommendation logic (sfComputeFolderRecommendation) uses
// this to exclude such concepts from ever counting as "due for review".
//
// Concepts encoded before this system existed have no day1_checks row
// at all (scheduleDay1Check only ever fires on a concept's first-ever
// grade, which already happened for them) - deliberately NOT auto-
// backfilled here. A concept_reviews row already IS the "was this
// genuinely encoded" stamp (it's only ever written on a CORRECT answer
// to the encoding lesson's own practice question - see
// text-question/submit's practice branch, which returns early on a
// wrong answer without calling gradeAndRecordReview at all), so there's
// no need for a second, separate stamp - but a one-time manual fix is
// still needed per already-affected concept (see
// scripts/backfill_day1_checks_for_known_concepts.js) rather than
// silently backfilling every legacy concept across every subject on
// every fetch.
router.get('/day1-checks/pending', requireAuth, syncEndpointLimiter, async (req: Request, res: Response) => {
  try {
    const userId = req.userId as string;
    const { data: rows, error } = await supabaseAdmin
      .from('day1_checks')
      .select('concept_id')
      .eq('user_id', userId)
      .eq('resolved', false);
    if (error) throw error;
    res.json({ conceptIds: (rows || []).map((r) => r.concept_id) });
  } catch (err) {
    console.error('Fetching pending Day-1 checks failed:', err);
    res.status(500).json({ error: 'could not load pending Day-1 checks' });
  }
});

// POST /day1-checks/:id/submit
// A genuine Day-1 failure bumps the student's base recall count (Rb,o)
// up by one for every future concept - the simpler operational rule
// chosen over estimating alpha from Ra/Rs directly (see
// recallTuningService.ts's bumpBaseRecalls). "Genuine" excludes a
// careless slip: the FIRST wrong answer is classified by
// DAY1_CHECK_ANSWER_PROMPT, and if it's flagged as a silly mistake, the
// student gets exactly one re-ask of the SAME question
// (retryAfterSillyMistake:true on the resubmit) - that retry's own
// result is final either way, correct or not, silly or not.
router.post('/day1-checks/:id/submit', requireAuth, costlyEndpointLimiter, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { answer, retryAfterSillyMistake } = (req.body ?? {}) as { answer?: string; retryAfterSillyMistake?: boolean };
  if (typeof answer !== 'string' || !answer.trim()) return res.status(400).json({ error: 'answer is required' });

  try {
    const userId = req.userId as string;
    const { data: row } = await supabaseAdmin
      .from('day1_checks')
      .select('id, concept_id, resolved')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();
    if (!row) return res.status(404).json({ error: 'check not found' });
    if (row.resolved) return res.json({ correct: true, feedback: 'Already done.' });

    const question = await getQuestionForConceptId(row.concept_id as string);
    if (!question) return res.status(404).json({ error: 'question not found' });

    const raw = await callClaudeJSON({
      model: MODELS.simpleQuestion,
      systemPrompt: DAY1_CHECK_ANSWER_PROMPT,
      userContent: `Question: ${question.questionText}\nMark scheme: ${question.markScheme}\nStudent's answer: ${answer}`,
      temperature: 0.1,
      userId,
    });
    const { correct, feedback, sillyMistake } = parseModelJson<{ correct: boolean; feedback: string; sillyMistake?: boolean }>(raw);

    if (correct) {
      const { error: updateError } = await supabaseAdmin.from('day1_checks').update({ resolved: true }).eq('id', id);
      if (updateError) throw updateError;
      return res.json({ correct: true, feedback });
    }

    if (!retryAfterSillyMistake && sillyMistake) {
      // Deferred - not resolved, no Rb bump yet. The student gets one
      // more attempt at the exact same question.
      return res.json({ correct: false, sillyMistake: true, feedback });
    }

    // A genuine failure (or a still-wrong/second attempt after the one
    // reask already given) - resolve it and bump the base recall count.
    const { error: updateError } = await supabaseAdmin.from('day1_checks').update({ resolved: true }).eq('id', id);
    if (updateError) throw updateError;
    await bumpBaseRecalls(userId);
    res.json({ correct: false, sillyMistake: false, feedback });
  } catch (err) {
    console.error('Day-1 check grading failed:', err);
    res.status(500).json({ error: 'could not grade this answer' });
  }
});

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
      userId,
    });
    // See the identical comment on text-question/submit above.
    const { correct, feedback } = parseCorrectFeedbackJson(raw);

    // retryCount=0 — Verify uses the SAME rating derivation a real lesson
    // does (deriveCorrectRating in reviewService.ts), so a clean pass can
    // genuinely earn 'good'/'easy' and progress spaced_success_count,
    // rather than always being forced to 'hard' (which would reset that
    // counter to 0 every time and make durable mastery via Verify alone
    // impossible — found while wiring up its credit payout).
    const graded = await gradeCorrectness(userId, conceptId, correct, 0);
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
// neighbor that's also encoded, its spaced review tests a reworded AO1
// followed by the integration question for every qualifying link, one
// combined session. FSRS runs on the node PLUS one row per qualifying
// link's integration - the node's overall due date is whichever of
// those is soonest. Neither AO1 nor integration ever fails the student -
// a wrong answer just retries with the grading call's own feedback as
// an escalating hint (see AO1's slip-check and integration/submit
// below) - and a link's genuinely first-ever integration attempt is
// "prompted" (shown the link's own teaching content first) while every
// later spaced review is unprompted cold recall (see getIntegrationStepData).

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
    await assertAo1ReviewDue(req.userId as string, nodeId);
    const question = await getRewordedAo1Question(nodeId, req.userId as string);
    if (!question) return res.status(404).json({ error: 'no lesson generated for this concept yet' });
    res.json(question);
  } catch (err) {
    if (err instanceof ReviewNotDueError) {
      return res.status(403).json({ error: 'This review isn\'t due yet.', dueDate: err.dueDate });
    }
    console.error('AO1 reword generation failed:', err);
    res.status(500).json({ error: 'could not prepare this review question' });
  }
});

// Shared by both AO1 finalization routes below (a clean pass, and a slip
// correction that turned out right) - both only ever reach here once the
// answer is genuinely correct, so this always records a pass; retryCount
// (how many wrong attempts came before this one, this same review) feeds
// the FSRS rating the same way integration/submit's does — see
// deriveCorrectRating for the exact 0/1/2+ thresholds.
async function finalizeAo1Grade(userId: string, conceptId: string, feedback: string, retryCount: number) {
  const result = await gradeCorrectness(userId, conceptId, true, retryCount);
  const { paid: keysEarned } = await payLessonCredits(userId, false, result, 1.0, 'node_review_ao1');
  return { correct: true, feedback, schedule: scheduleWithMastery(conceptId, result), keysEarned };
}

router.post('/knowledge-map-v2/node-review/ao1/submit', requireAuth, costlyEndpointLimiter, async (req: Request, res: Response) => {
  const { nodeId, questionText, answer, retryCount } = (req.body ?? {}) as {
    nodeId?: string; questionText?: string; answer?: string; retryCount?: number;
  };
  if (!nodeId || !questionText || typeof answer !== 'string' || !answer.trim()) {
    return res.status(400).json({ error: 'nodeId, questionText and answer are required' });
  }
  try {
    const userId = req.userId as string;
    const { data: node } = await supabaseAdmin.from('knowledge_map_nodes').select('concept_id').eq('id', nodeId).maybeSingle();
    if (!node) return res.status(404).json({ error: 'concept not found' });
    const graded = await gradeRewordedAo1Answer(nodeId, questionText, answer, userId);
    if (!graded) return res.status(404).json({ error: 'no lesson generated for this concept yet' });
    if (graded.correct) {
      return res.json(await finalizeAo1Grade(userId, node.concept_id as string, graded.feedback, Number(retryCount) || 0));
    }
    // Wrong - never fails the lesson (see this section's top comment).
    // Check whether this reads as a one-word slip so the UI can highlight
    // just the flagged word (see AO1_SLIP_CHECK_PROMPT) rather than a
    // generic retry; either way nothing is recorded yet - it's just a
    // retry with the grading call's own feedback as a hint.
    const slip = await checkAo1SlipCandidate(nodeId, questionText, answer, userId);
    if (slip?.isSlip && slip.wrongPhrase) {
      return res.json({ correct: false, feedback: graded.feedback, retryable: true, isSlipCandidate: true, wrongPhrase: slip.wrongPhrase });
    }
    res.json({ correct: false, feedback: graded.feedback, retryable: true });
  } catch (err) {
    console.error('AO1 reworded grading failed:', err);
    res.status(500).json({ error: 'could not grade this answer' });
  }
});

// The narrow one-shot fix for a flagged slip - the student edits only the
// wrong word/phrase, and this re-grades the RECONSTRUCTED full answer
// (original answer with wrongPhrase replaced by their correction) through
// the exact same check a clean first-time answer goes through. Never
// finalizes as a failure either way - a still-wrong correction, or a
// decline ("No, I didn't know this"), both drop back into a normal
// free-text retry with feedback as the hint rather than another narrow
// slip-fix attempt; only a genuinely correct answer records anything.
router.post('/knowledge-map-v2/node-review/ao1/submit-slip-correction', requireAuth, costlyEndpointLimiter, async (req: Request, res: Response) => {
  const { nodeId, questionText, originalAnswer, wrongPhrase, correction, declined, originalFeedback, retryCount } = (req.body ?? {}) as {
    nodeId?: string; questionText?: string; originalAnswer?: string; wrongPhrase?: string; correction?: string;
    declined?: boolean; originalFeedback?: string; retryCount?: number;
  };
  if (!nodeId || !questionText || !originalAnswer || !wrongPhrase) {
    return res.status(400).json({ error: 'nodeId, questionText, originalAnswer and wrongPhrase are required' });
  }
  try {
    const userId = req.userId as string;
    const { data: node } = await supabaseAdmin.from('knowledge_map_nodes').select('concept_id').eq('id', nodeId).maybeSingle();
    if (!node) return res.status(404).json({ error: 'concept not found' });
    // "No, I didn't know this" - not a slip after all; nothing to
    // re-grade, just hand back the original feedback as the retry hint.
    if (declined) {
      return res.json({ correct: false, feedback: originalFeedback || '', retryable: true });
    }
    if (typeof correction !== 'string' || !correction.trim()) {
      return res.status(400).json({ error: 'correction is required unless declined' });
    }
    const correctedAnswer = originalAnswer.replace(wrongPhrase, correction.trim());
    const graded = await gradeRewordedAo1Answer(nodeId, questionText, correctedAnswer, userId);
    if (!graded) return res.status(404).json({ error: 'no lesson generated for this concept yet' });
    if (!graded.correct) {
      return res.json({ correct: false, feedback: graded.feedback, retryable: true });
    }
    // retryCount as sent by the frontend already counts the miss that
    // triggered this slip-check (it's incremented BEFORE the slip-check
    // UI is ever shown) - this correction, once confirmed right, is that
    // same review's final answer, not a second miss on top of it.
    res.json(await finalizeAo1Grade(userId, node.concept_id as string, graded.feedback, Math.max(1, Number(retryCount) || 0)));
  } catch (err) {
    console.error('AO1 slip-correction grading failed:', err);
    res.status(500).json({ error: 'could not grade this answer' });
  }
});

// linkTeaching is only ever included when isFirstAttempt is true (see
// getIntegrationStepData) - a genuinely first-ever review of this link
// shows it up front ("prompted"), every later spaced review omits it,
// cold recall.
router.post('/knowledge-map-v2/node-review/integration/start', requireAuth, costlyEndpointLimiter, async (req: Request, res: Response) => {
  const { fromNodeId, toNodeId } = (req.body ?? {}) as { fromNodeId?: string; toNodeId?: string };
  if (!fromNodeId || !toNodeId) return res.status(400).json({ error: 'fromNodeId and toNodeId are required' });
  try {
    const userId = req.userId as string;
    // Same session-level gate as ao1/start, checked again here since a
    // client could reach this route directly (resuming a session,
    // stepping through links) without re-hitting ao1/start first.
    await assertNodeReviewDue(userId, fromNodeId);
    let step = await getIntegrationStepData(userId, fromNodeId, toNodeId);
    if (!step) {
      // getIntegrationStepData returns null for two very different
      // reasons - a genuinely diagram-typed/unteachable link (real
      // "unavailable"), or an edge lesson that was simply never
      // generated yet at all. The short-form feed's own review path
      // (unlike the graph view's separate edge-notes viewer, which
      // triggers generation when a student opens that specific link
      // directly) had no prior reason to ever generate one before a
      // review actually needed it - so a link an already-encoded node
      // qualifies for could sit permanently "due" with nothing behind
      // it to actually show, blocking new lessons from ever being
      // recommended instead (reviews outrank lessons in priority).
      // Distinguish the two cases and generate on demand for the second,
      // same on-demand contract as GET /knowledge-map-v2/edge/:from/:to/lesson
      // above, then retry once.
      const { data: edgeRow } = await supabaseAdmin
        .from('knowledge_map_edges')
        .select('id, knowledge_map_edge_lessons(edge_id)')
        .eq('from_node_id', fromNodeId)
        .eq('to_node_id', toNodeId)
        .maybeSingle();
      const lessonRows = edgeRow?.knowledge_map_edge_lessons;
      const hasLessonRow = Array.isArray(lessonRows) ? lessonRows.length > 0 : !!lessonRows;
      if (edgeRow && !hasLessonRow) {
        await assertFreshGenerationWithinCap(userId, await isUserPaid(userId), req.userCreatedAt ?? null);
        const generated = await generateAndCacheEdgeLesson(fromNodeId, toNodeId, userId);
        if (generated) {
          await recordFreshGenerationEvent(userId);
          step = await getIntegrationStepData(userId, fromNodeId, toNodeId);
        }
      }
    }
    if (!step) return res.json({ unavailable: true });
    // The dual-coding visual is only ever relevant alongside linkTeaching
    // itself - shown once, on a genuine first attempt, never on a later
    // spaced review (see IntegrationStepData's own comment on why
    // linkTeaching is withheld then too). getEdgeNoteBaseline has no
    // per-user side effect (no AI call, nothing to unlock) - the separate
    // Notes page's own "earned" unlock still only happens on an actual
    // pass, via getEdgeNoteForUser.
    const notes = step.isFirstAttempt ? await getEdgeNoteBaseline(fromNodeId, toNodeId) : null;
    res.json({
      questionText: step.questionText,
      isFirstAttempt: step.isFirstAttempt,
      linkTeaching: step.isFirstAttempt ? step.linkTeaching : null,
      answerInputType: step.answerInputType || null,
      modality: step.modality || null,
      audioText: step.audioText || null,
      notes: notes ? { heading: notes.heading, paragraphs: notes.paragraphs, visual: notes.visual } : null,
    });
  } catch (err) {
    if (err instanceof ReviewNotDueError) {
      return res.status(403).json({ error: 'This review isn\'t due yet.', dueDate: err.dueDate });
    }
    if (err instanceof GenerationCapExceededError) {
      return res.status(429).json({ error: 'Lock limit reached', code: 'LOCK_LIMIT_REACHED', window: err.window, limit: err.limit });
    }
    console.error('Integration question lookup failed:', err);
    res.status(500).json({ error: 'could not load this question' });
  }
});

// Wrong answers here are NEVER FSRS-graded - same "a wrong attempt with a
// prompted retry is a learning rep, not a real recall test" convention as
// AO1's own slip-check and a first-time encoding elsewhere in this app
// (see renderTextQuestionWidget's own comment in learn/index.html) - no
// separate "identify the link" step exists any more (see this file's own
// comment above the node-review section), integration alone is the real,
// sufficient gate. Only the FINAL correct pass grades, with retryCount
// (how many wrong attempts came before it) deciding hard vs again — see
// deriveCorrectRating.
router.post('/knowledge-map-v2/node-review/integration/submit', requireAuth, costlyEndpointLimiter, async (req: Request, res: Response) => {
  const { fromNodeId, toNodeId, questionText, answer, retryCount } = (req.body ?? {}) as {
    fromNodeId?: string; toNodeId?: string; questionText?: string; answer?: string; retryCount?: number;
  };
  if (!fromNodeId || !toNodeId || !questionText || typeof answer !== 'string' || !answer.trim()) {
    return res.status(400).json({ error: 'fromNodeId, toNodeId, questionText and answer are required' });
  }
  try {
    const userId = req.userId as string;
    const [{ data: fromNode }, { data: toNode }] = await Promise.all([
      supabaseAdmin.from('knowledge_map_nodes').select('concept_id').eq('id', fromNodeId).maybeSingle(),
      supabaseAdmin.from('knowledge_map_nodes').select('concept_id').eq('id', toNodeId).maybeSingle(),
    ]);
    if (!fromNode || !toNode) return res.status(404).json({ error: 'connection not found' });

    // questionText is the exact reworded question the student was shown
    // (see getIntegrationStepData/getRewordedIntegrationQuestion) - grading
    // itself always runs against the edge's own stored mark scheme, never
    // the original question text, so this only affects what's shown back
    // to the grading model as context.
    const graded = await gradeIntegrationAnswer(fromNodeId, toNodeId, questionText, answer, userId);
    if (!graded) return res.status(404).json({ error: 'no integration question available for this connection' });

    if (!graded.correct) {
      await recordPairwiseIntegrationOutcome(userId, fromNode.concept_id as string, toNode.concept_id as string, false);
      return res.json({ correct: false, feedback: graded.feedback, retryable: true });
    }

    const conceptId = linkIntegrationConceptId(fromNode.concept_id as string, toNode.concept_id as string);
    const result = await gradeCorrectness(userId, conceptId, true, Number(retryCount) || 0);
    const { paid: keysEarned } = await payLessonCredits(userId, false, result, 1.0, 'node_review_integration');
    await recordPairwiseIntegrationOutcome(userId, fromNode.concept_id as string, toNode.concept_id as string, (Number(retryCount) || 0) === 0);
    res.json({ correct: true, feedback: graded.feedback, schedule: scheduleWithMastery(conceptId, result), keysEarned });
  } catch (err) {
    console.error('Integration grading failed:', err);
    res.status(500).json({ error: 'could not grade this answer' });
  }
});

// ---- Knowledge-map Notes page (see learn/index.html's openNotesPage) ----
// Compiled straight from a node's/edge's own ground truth (never a
// student's own answer, and never an AI call any more - see
// knowledgeMapNotesService.ts's own top comment), automatically, the
// moment a note is shown - there's no separate "compile" trigger left to
// gate. Premium-only still, per the existing free/premium product
// decision - unrelated to generation cost (there isn't any left), this
// stays a Premium perk on its own product terms. Free students keep their
// own PERSONAL notes (personal-notes routes further down - never gated,
// never calls Claude) unaffected.

router.post('/knowledge-map-v2/node/:nodeId/notes/compile', requireAuth, requirePaidTier, async (req: Request, res: Response) => {
  try {
    const notes = await getNodeNoteForUser(req.params.nodeId, req.userId as string);
    if (!notes) return res.status(404).json({ error: 'no lesson generated for this concept yet' });
    res.json(notes);
  } catch (err) {
    console.error('Node notes lookup failed:', err);
    res.status(500).json({ error: 'could not load notes for this concept' });
  }
});

router.get('/knowledge-map-v2/node/:nodeId/notes', requireAuth, requirePaidTier, async (req: Request, res: Response) => {
  try {
    const notes = await getNodeNoteForUser(req.params.nodeId, req.userId as string);
    if (!notes) return res.status(404).json({ error: 'no notes available for this concept yet' });
    res.json(notes);
  } catch (err) {
    console.error('Node notes lookup failed:', err);
    res.status(500).json({ error: 'could not load these notes' });
  }
});

// A student's own edit to their compiled note - overwrites the live-
// filtered baseline entirely from then on (see saveNodeNoteEdit's own
// comment). Not gated behind requirePaidTier's sibling routes' generation
// cost (there is none), but the note being edited is still only ever
// shown on the Premium Notes page in the first place.
router.put('/knowledge-map-v2/node/:nodeId/notes', requireAuth, requirePaidTier, async (req: Request, res: Response) => {
  const { paragraphs } = (req.body ?? {}) as { paragraphs?: string[] };
  if (!Array.isArray(paragraphs) || !paragraphs.every((p) => typeof p === 'string')) {
    return res.status(400).json({ error: 'paragraphs (string[]) is required' });
  }
  try {
    await saveNodeNoteEdit(req.userId as string, req.params.nodeId, paragraphs);
    res.json({ ok: true });
  } catch (err) {
    console.error('Node notes edit save failed:', err);
    res.status(500).json({ error: 'could not save this edit' });
  }
});

router.post('/knowledge-map-v2/edge/:fromNodeId/:toNodeId/notes/compile', requireAuth, requirePaidTier, async (req: Request, res: Response) => {
  try {
    const notes = await getEdgeNoteForUser(req.userId as string, req.params.fromNodeId, req.params.toNodeId);
    if (!notes) return res.status(404).json({ error: 'connection not found' });
    res.json(notes);
  } catch (err) {
    console.error('Edge notes lookup failed:', err);
    res.status(500).json({ error: 'could not load notes for this connection' });
  }
});

router.get('/knowledge-map-v2/edge/:fromNodeId/:toNodeId/notes', requireAuth, requirePaidTier, async (req: Request, res: Response) => {
  try {
    const notes = await getEdgeNoteForUser(req.userId as string, req.params.fromNodeId, req.params.toNodeId);
    if (!notes) return res.status(404).json({ error: 'no notes available for this connection yet' });
    res.json(notes);
  } catch (err) {
    console.error('Edge notes lookup failed:', err);
    res.status(500).json({ error: 'could not load these notes' });
  }
});

router.put('/knowledge-map-v2/edge/:fromNodeId/:toNodeId/notes', requireAuth, requirePaidTier, async (req: Request, res: Response) => {
  const { paragraphs } = (req.body ?? {}) as { paragraphs?: string[] };
  if (!Array.isArray(paragraphs) || !paragraphs.every((p) => typeof p === 'string')) {
    return res.status(400).json({ error: 'paragraphs (string[]) is required' });
  }
  try {
    await saveEdgeNoteEdit(req.userId as string, req.params.fromNodeId, req.params.toNodeId, paragraphs);
    res.json({ ok: true });
  } catch (err) {
    console.error('Edge notes edit save failed:', err);
    res.status(500).json({ error: 'could not save this edit' });
  }
});

// POST /knowledge-map-v2/node/:nodeId/worked-example-step/check
// { stepIndex, answer } -> { correct, feedback } - checks one line of a
// student's own attempt at the interactive worked-example walkthrough
// against the already-compiled ground truth (see renderNodeNoteBlock's
// workedExample branch). The visual must already be compiled (a student
// reaches this only after opening the node, which always compiles notes
// first) - a 404 here means genuinely nothing to check against, not a
// transient miss worth retrying with a fresh generation.
router.post('/knowledge-map-v2/node/:nodeId/worked-example-step/check', requireAuth, costlyEndpointLimiter, async (req: Request, res: Response) => {
  const { stepIndex, answer } = (req.body ?? {}) as { stepIndex?: number; answer?: string };
  if (typeof stepIndex !== 'number' || typeof answer !== 'string' || !answer.trim()) {
    return res.status(400).json({ error: 'stepIndex and answer are required' });
  }
  try {
    const notes = await getNodeNotes(req.params.nodeId);
    const steps = notes?.visual.type === 'workedExample' ? notes.visual.steps : null;
    if (!steps || !steps[stepIndex]) return res.status(404).json({ error: 'no worked example step found at that index' });
    const result = await checkWorkedExampleStep(steps, stepIndex, answer, req.userId as string);
    res.json(result);
  } catch (err) {
    console.error('Worked example step check failed:', err);
    res.status(500).json({ error: 'could not check this step' });
  }
});

// Same contract as the node route above, for an edge's own workedExample
// visual (see EDGE_NOTES_COMPILE_PROMPT).
router.post('/knowledge-map-v2/edge/:fromNodeId/:toNodeId/worked-example-step/check', requireAuth, costlyEndpointLimiter, async (req: Request, res: Response) => {
  const { stepIndex, answer } = (req.body ?? {}) as { stepIndex?: number; answer?: string };
  if (typeof stepIndex !== 'number' || typeof answer !== 'string' || !answer.trim()) {
    return res.status(400).json({ error: 'stepIndex and answer are required' });
  }
  try {
    const notes = await getEdgeNotes(req.params.fromNodeId, req.params.toNodeId);
    const steps = notes?.visual.type === 'workedExample' ? notes.visual.steps : null;
    if (!steps || !steps[stepIndex]) return res.status(404).json({ error: 'no worked example step found at that index' });
    const result = await checkWorkedExampleStep(steps, stepIndex, answer, req.userId as string);
    res.json(result);
  } catch (err) {
    console.error('Worked example step check failed:', err);
    res.status(500).json({ error: 'could not check this step' });
  }
});

router.get('/knowledge-map-v2/notes-index', requireAuth, async (req: Request, res: Response) => {
  try {
    const index = await getNotesIndexForUser(req.userId as string);
    res.json(index);
  } catch (err) {
    console.error('Notes index lookup failed:', err);
    res.status(500).json({ error: 'could not load your notes' });
  }
});

// A student's own hand-written note for a node - see
// knowledgeMapNotesService.ts's PersonalNoteContent. No costlyEndpointLimiter:
// this never calls Claude, it's just reading/writing the student's own text.
router.get('/knowledge-map-v2/node/:nodeId/personal-notes', requireAuth, async (req: Request, res: Response) => {
  try {
    const note = await getPersonalNote(req.userId as string, req.params.nodeId);
    if (!note) return res.status(404).json({ error: 'no personal note saved for this concept yet' });
    res.json(note);
  } catch (err) {
    console.error('Personal note lookup failed:', err);
    res.status(500).json({ error: 'could not load your note' });
  }
});

router.put('/knowledge-map-v2/node/:nodeId/personal-notes', requireAuth, async (req: Request, res: Response) => {
  try {
    const { mode, heading, body, diagram, sections, contrastText, exampleText, quickNotes } = req.body || {};
    if (mode !== 'freeText' && mode !== 'template') return res.status(400).json({ error: 'invalid note mode' });
    if (typeof body !== 'string') return res.status(400).json({ error: 'note body is required' });
    await savePersonalNote(req.userId as string, req.params.nodeId, { mode, heading, body, diagram, sections, contrastText, exampleText, quickNotes });
    res.json({ saved: true });
  } catch (err) {
    console.error('Personal note save failed:', err);
    res.status(500).json({ error: 'could not save your note' });
  }
});

export default router;
