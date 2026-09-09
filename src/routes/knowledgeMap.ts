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
import { parseCorrectFeedbackJson } from '../services/jsonParsing';
import { KNOWLEDGE_MAP_ANSWER_CHECK_PROMPT } from '../constants/knowledgeMapAnswerCheckPrompt';
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
} from '../services/nodeReviewService';
import { compileNodeNotes, getNodeNotes, compileEdgeNotes, compileEdgeNotesContent, getEdgeNotes, getNotesIndexForUser, getPersonalNote, savePersonalNote, checkWorkedExampleStep } from '../services/knowledgeMapNotesService';
import { generateAndCacheNodeLesson, generateAndCacheEdgeLesson } from '../services/lessonGenerationService';
import { answerKnowledgeMapQuestion } from '../services/knowledgeMapAskService';
import { assertFreshGenerationWithinCap, recordFreshGenerationEvent, GenerationCapExceededError } from '../services/generationCapService';

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
    // (Premium only) BEFORE generating, not after - see
    // generationCapService.ts for the actual windows/limits and why a
    // cache hit above never reaches this check at all.
    const userId = req.userId as string;
    if (await isUserPaid(userId)) {
      await assertFreshGenerationWithinCap(userId);
    }
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
    if (await isUserPaid(userId)) {
      await assertFreshGenerationWithinCap(userId);
    }
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
router.post('/knowledge-map-v2/text-question/submit', requireAuth, costlyEndpointLimiter, async (req: Request, res: Response) => {
  const { nodeId, fromNodeId, toNodeId, questionType, answer, retryCount } = (req.body ?? {}) as {
    nodeId?: string;
    fromNodeId?: string;
    toNodeId?: string;
    questionType?: 'practice' | 'transfer' | 'integration';
    answer?: string;
    retryCount?: number;
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
    await assertNodeReviewDue(req.userId as string, nodeId);
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
    const step = await getIntegrationStepData(userId, fromNodeId, toNodeId);
    if (!step) return res.json({ unavailable: true });
    // The dual-coding visual is only ever relevant alongside linkTeaching
    // itself - shown once, on a genuine first attempt, never on a later
    // spaced review (see IntegrationStepData's own comment on why
    // linkTeaching is withheld then too). compileEdgeNotesContent has no
    // per-user unlock side effect - the separate Notes page's "earned"
    // unlock still only happens on an actual pass (renderNodeReviewSummary).
    const notes = step.isFirstAttempt ? await compileEdgeNotesContent(fromNodeId, toNodeId, userId) : null;
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
      return res.json({ correct: false, feedback: graded.feedback, retryable: true });
    }

    const conceptId = linkIntegrationConceptId(fromNode.concept_id as string, toNode.concept_id as string);
    const result = await gradeCorrectness(userId, conceptId, true, Number(retryCount) || 0);
    const { paid: keysEarned } = await payLessonCredits(userId, false, result, 1.0, 'node_review_integration');
    res.json({ correct: true, feedback: graded.feedback, schedule: scheduleWithMastery(conceptId, result), keysEarned });
  } catch (err) {
    console.error('Integration grading failed:', err);
    res.status(500).json({ error: 'could not grade this answer' });
  }
});

// ---- Knowledge-map Notes page (see learn/index.html's openNotesPage) ----
// Compiled straight from a node's/edge's own ground truth (never a
// student's own answer), cached once and shared across every student who's
// earned it - see knowledgeMapNotesService.ts's own top comment.

router.post('/knowledge-map-v2/node/:nodeId/notes/compile', requireAuth, costlyEndpointLimiter, async (req: Request, res: Response) => {
  try {
    const notes = await compileNodeNotes(req.params.nodeId, req.userId as string);
    if (!notes) return res.status(404).json({ error: 'no lesson generated for this concept yet' });
    res.json(notes);
  } catch (err) {
    console.error('Node notes compile failed:', err);
    res.status(500).json({ error: 'could not compile notes for this concept' });
  }
});

router.get('/knowledge-map-v2/node/:nodeId/notes', requireAuth, async (req: Request, res: Response) => {
  try {
    const notes = await getNodeNotes(req.params.nodeId);
    if (!notes) return res.status(404).json({ error: 'no notes compiled for this concept yet' });
    res.json(notes);
  } catch (err) {
    console.error('Node notes lookup failed:', err);
    res.status(500).json({ error: 'could not load these notes' });
  }
});

router.post('/knowledge-map-v2/edge/:fromNodeId/:toNodeId/notes/compile', requireAuth, costlyEndpointLimiter, async (req: Request, res: Response) => {
  try {
    const notes = await compileEdgeNotes(req.userId as string, req.params.fromNodeId, req.params.toNodeId);
    if (!notes) return res.status(404).json({ error: 'connection not found' });
    res.json(notes);
  } catch (err) {
    console.error('Edge notes compile failed:', err);
    res.status(500).json({ error: 'could not compile notes for this connection' });
  }
});

router.get('/knowledge-map-v2/edge/:fromNodeId/:toNodeId/notes', requireAuth, async (req: Request, res: Response) => {
  try {
    const notes = await getEdgeNotes(req.params.fromNodeId, req.params.toNodeId);
    if (!notes) return res.status(404).json({ error: 'no notes compiled for this connection yet' });
    res.json(notes);
  } catch (err) {
    console.error('Edge notes lookup failed:', err);
    res.status(500).json({ error: 'could not load these notes' });
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
