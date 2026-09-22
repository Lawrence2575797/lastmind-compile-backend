import { Router, Request, Response } from 'express';
import { openFollowUp, followUpFromGrading } from '../services/followUp';
import { requireAuth, requirePaidTier, isUserPaid } from '../services/authMiddleware';
import { costlyEndpointLimiter, syncEndpointLimiter } from '../services/rateLimiters';
import { getKnowledgeMapForFolder, getKnowledgeMapForSubject, FolderConcept } from '../services/knowledgeMapService';
import { supabaseAdmin } from '../services/supabaseAdmin';
import {
  findPrerequisiteGap,
  buildPrerequisiteChains,
  generateChainQuestions,
  gradeChainAnswers,
  gradeStepCorrect,
  generateStepRetryQuestion,
  gradeStepRetryAnswer,
  buildGapFeedItems,
  ChainStep,
  GapResult,
} from '../services/chainDiagnosticService';
import { gradeDiagramAnswer, DiagramSpec, DiagramAnswerSubmission } from '../services/diagramGradingService';
import { gradeCorrectness, recordFirstTeachingSignals, DURABLE_RELEARNING_CRITERION, ReviewNotDueError } from '../services/reviewService';
import { callClaudeJSON, MODELS } from '../services/claudeClient';
import { parseCorrectFeedbackJson, parseModelJson } from '../services/jsonParsing';
import { KNOWLEDGE_MAP_ANSWER_CHECK_PROMPT, KNOWLEDGE_MAP_ANSWER_CHECK_NO_FOLLOW_UP_PROMPT, DAY1_CHECK_ANSWER_PROMPT, FILL_BLANK_LENIENCY_PROMPT, UNTRACKED_LESSON_GRADE_PROMPT } from '../constants/knowledgeMapAnswerCheckPrompt';
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
import { getNodeNoteBaseline, getNodeNoteForUser, saveNodeNoteEdit, getNodeNotes, getEdgeNoteBaseline, getEdgeNoteForUser, saveEdgeNoteEdit, getEdgeNotes, getNotesIndexForUser, getPersonalNote, savePersonalNote, checkWorkedExampleStep, markEdgeExplanationSeen } from '../services/knowledgeMapNotesService';
import { derivationKeyTermGraph, derivationCompletedStages, derivationQuick, ensureDerivationContent, derivationPlayerPayload, derivationConceptsOfStage, derivationNodeIds, derivationAnchorConcept, derivationSiblingConcepts } from '../services/derivationService';
import { derivationGenericLookup, derivationGenericGenerate, derivationContentForGenericNode, genericStageKey, derivationGenericPayloadForKey } from '../services/derivationGenericService';
import { generateAndCacheNodeLesson, generateAndCacheEdgeLesson, needsQuestionUpgrade, upgradeLessonQuestions } from '../services/lessonGenerationService';
import { isStructured, gradeStructured, clientView, lessonForClient, sealJson, openJson, closeEnough, StructuredQuestion } from '../services/questionFormats';
import { pickRotatingQuestion, poolEntry, poolOf, rotationPick, immediatePool } from '../services/reviewQuestionPool';
import { answerKnowledgeMapQuestion } from '../services/knowledgeMapAskService';
import { assertFreshGenerationWithinCap, recordFreshGenerationEvent, GenerationCapExceededError } from '../services/generationCapService';
import { InsufficientLocksError, assertLocksAvailable } from '../services/lockService';
import { recordPairwiseIntegrationOutcome } from '../services/chainMasteryService';
import { getOrCreateUserRecallTuning, getDifficultyAndCapability, nextRecallDelayMinutes, updateGammaAfterRecall, bumpBaseRecalls } from '../services/recallTuningService';
import { getQuestionForConceptId, getConceptDisplayInfo, orderDay1ChecksByLessonOrder, scheduleDay1Check } from '../services/day1CheckService';
import { biologyCurriculumStatus } from '../services/biologyCurriculum';
import { awardDay1Keys, awardSpacedReviewKeys } from '../services/keyEconomyService';
import { getExternalCoveredConceptIds } from '../services/externalCoverageService';

const router = Router();

// Public curriculum metadata only: no lesson answers or student information.
// Allows deployment/readiness checks without generating a paid lesson.
router.get('/knowledge-map-v2/curriculum/aqa-biology-higher', (_req, res) => {
  res.json(biologyCurriculumStatus());
});

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
// Law lessons written before the interactive question formats keep their explanation and get new-format questions, once.
async function upgradeIfLaw(nodeId: string, userId: string, content: any): Promise<any> {
  const { data: n } = await supabaseAdmin.from('knowledge_map_nodes').select('subject').eq('id', nodeId).maybeSingle();
  return n && needsQuestionUpgrade(n.subject as string, content) ? upgradeLessonQuestions(nodeId, userId, content) : content;
}

// Every call site that (re)generates a node's lesson - not just the main lesson route - needs to prefer the on-demand derivation
// format (Economics' precompiled bundle, or any other knowledge-mapped subject's stage generated on demand; see
// derivationGenericService.ts) over the old per-node text-lesson generator. Without this, a Day-1 check or a Notes-page
// regeneration for a node with no stored content yet would call the OLD generator directly and bring the old format straight
// back for a subject this app now teaches by derivation - a real reported bug (GET /day1-checks/due's own regeneration branch,
// below, used to do exactly that for Law, Biology, Chemistry, Maths, Italian and Spanish, not just Economics).
async function generateNodeLessonPreferringDerivation(nodeId: string, userId: string, hooks: { before: () => Promise<void>; after?: () => Promise<void> }): Promise<any | null> {
  const derived = await derivationQuick(nodeId);
  if (derived) return derived.content;   // ensureDerivationContent already refreshes the stored row in the background here
  try {
    const generic = await derivationGenericLookup(nodeId);
    if (generic) {
      let stage = generic.cached;
      if (!stage) {
        await hooks.before();
        stage = await derivationGenericGenerate(generic, userId);
        if (hooks.after) await hooks.after();
      }
      const content = derivationContentForGenericNode(generic, stage);
      if (content) {
        await supabaseAdmin.from('knowledge_map_node_lessons').upsert({ node_id: nodeId, encoding_content: content }, { onConflict: 'node_id' });
        return content;
      }
    }
  } catch (err) {
    if (err instanceof InsufficientLocksError || err instanceof GenerationCapExceededError) throw err;
    console.error('Generic derivation generation failed - falling back to the plain lesson generator:', err);
  }
  await hooks.before();
  const generated = await generateAndCacheNodeLesson(nodeId, userId);
  if (hooks.after) await hooks.after();
  return generated;
}

router.get('/knowledge-map-v2/node/:nodeId/lesson', requireAuth, syncEndpointLimiter, async (req: Request, res: Response) => {
  const { nodeId } = req.params;
  const userId = req.userId as string;
  try {
    // Economics: taught by a derivation lesson. The stored old text lesson is replaced, and nothing is generated.
    const derived = await derivationQuick(nodeId);
    if (derived) return res.json({ ...lessonForClient(derived.content), derivation: { stage: derived.stage, payload: derived.payload } });

    // Any other subject with a real knowledge map: the same derivation lesson, generated live the first time a student reaches
    // its stage (see derivationGenericService.ts) instead of precompiled offline - the checker, prompt and rules are identical.
    try {
      const generic = await derivationGenericLookup(nodeId);
      if (generic) {
        let stage = generic.cached;
        if (!stage) {
          await assertFreshGenerationWithinCap(userId, await isUserPaid(userId), req.userCreatedAt ?? null, req.userEmail);
          stage = await derivationGenericGenerate(generic, userId);
          await recordFreshGenerationEvent(userId);
        }
        const content = derivationContentForGenericNode(generic, stage);
        if (content) {
          await supabaseAdmin.from('knowledge_map_node_lessons').upsert({ node_id: nodeId, encoding_content: content }, { onConflict: 'node_id' });
          return res.json({ ...lessonForClient(content), derivation: { stage: genericStageKey(generic.subject, generic.qualification, generic.examBoard, generic.stageIndex), payload: { terms: stage.terms, stage: stage.stage } } });
        }
      }
    } catch (genErr) {
      // A real cap/balance limit is a genuine stop, not something to silently paper over by falling back to the old
      // generator (which would just spend another generation the student is already capped or out of Locks for).
      if (genErr instanceof InsufficientLocksError || genErr instanceof GenerationCapExceededError) throw genErr;
      console.error('Generic derivation generation failed - falling back to the plain lesson generator:', genErr);
    }

    const { data, error } = await supabaseAdmin
      .from('knowledge_map_node_lessons')
      .select('encoding_content')
      .eq('node_id', nodeId)
      .maybeSingle();
    if (error) throw error;
    if (data) {
      let content = data.encoding_content as any;
      if (content && content.formatVersion !== 2) content = await upgradeIfLaw(nodeId, req.userId as string, content);
      return res.json(lessonForClient(content));
    }

    // Cache miss - a real Sonnet generation is about to happen. Capped
    // BEFORE generating, not after, for BOTH tiers (free used to bypass
    // this entirely - see generationCapService.ts's own comment on why
    // that changed) - a cache hit above never reaches this check at all.
    await assertFreshGenerationWithinCap(userId, await isUserPaid(userId), req.userCreatedAt ?? null, req.userEmail);
    const generated = await generateAndCacheNodeLesson(nodeId, userId);
    if (!generated) return res.status(404).json({ error: 'concept not found' });
    await recordFreshGenerationEvent(userId);
    res.json(lessonForClient(generated));
  } catch (err) {
    if (err instanceof InsufficientLocksError) {
      return res.status(402).json({ error: 'Lock limit reached', code: 'LOCK_LIMIT_REACHED', detail: "You're out of Locks for now." });
    }
    if (err instanceof GenerationCapExceededError) {
      // code: 'GENERATION_RATE_LIMIT' - deliberately distinct from Locks'
      // own 'LOCK_LIMIT_REACHED' (routes/credits.ts is gone, but
      // routes/locks.ts's real InsufficientLocksError still uses that
      // code) - a real, reported bug: this is a completely unrelated
      // fresh-generation rate limit (generationCapService.ts), not the
      // Locks balance shown in the topbar at all, but reusing the same
      // code made the frontend show "Buy more Locks" for it, which
      // genuinely cannot help (there's nothing to buy - it resets on its
      // own) and left a student with a huge, untouched Locks balance
      // confused about why they were blocked at all.
      return res.status(429).json({ error: 'Generation limit reached', code: 'GENERATION_RATE_LIMIT', window: err.window, limit: err.limit });
    }
    console.error('Node lesson lookup/generation failed:', err);
    res.status(500).json({ error: 'could not load this lesson' });
  }
});

// GET /derivation/stage/:stage -> the compiled derivation lesson (terms, graph, steps) the client player teaches. A generic (non-
// Economics) stage's id is a "g:..." string rather than a bare index (see derivationGenericService.ts's genericStageKey) - this is
// only ever hit as a fallback, since the lesson response already carries the payload inline the first time (see sfBuildDerivationSlides).
router.get('/derivation/stage/:stage', requireAuth, syncEndpointLimiter, async (req: Request, res: Response) => {
  if (req.params.stage.startsWith('g:')) {
    const payload = await derivationGenericPayloadForKey(req.params.stage);
    if (!payload) return res.status(404).json({ error: 'lesson not found' });
    return res.json(payload);
  }
  const payload = derivationPlayerPayload(Number(req.params.stage));
  if (!payload) return res.status(404).json({ error: 'lesson not found' });
  res.json(payload);
});

// GET /derivation/my-map -> the key-term graphs of every lesson this student has completed (their own growing key-term map).
router.get('/derivation/my-map', requireAuth, syncEndpointLimiter, async (req: Request, res: Response) => {
  try {
    res.json({ stages: await derivationCompletedStages(req.userId as string) });
  } catch (err) {
    console.error('Key-term map lookup failed:', err);
    res.status(500).json({ error: 'could not load your key-term map' });
  }
});

// POST /knowledge-map-v2/derivation/complete { stage, retryCount? }
// The student rebuilt the whole derivation from memory (its final test), so every concept in that stage counts as taught: each gets its
// first schedule entry exactly as a correct first attempt at the old practice question did.
router.post('/knowledge-map-v2/derivation/complete', requireAuth, syncEndpointLimiter, async (req: Request, res: Response) => {
  const stage = Number((req.body ?? {}).stage);
  const concepts = derivationConceptsOfStage(stage);
  if (!concepts.length) return res.status(404).json({ error: 'lesson not found' });
  try {
    const userId = req.userId as string;
    const schedules: any[] = [];
    for (const conceptId of concepts) {
      try {
        const graded = await gradeCorrectness(userId, conceptId, true, Number((req.body ?? {}).retryCount) || 0);
        // Economics has no quick (2-minute) recall. The Day-1 check belongs to the whole lesson, so only its anchor concept carries it.
        if (!graded.previousRow && conceptId === derivationAnchorConcept(stage)) await scheduleDay1Check(userId, conceptId);
        schedules.push(scheduleWithMastery(conceptId, graded));
      } catch (err) {
        if (!(err instanceof ReviewNotDueError)) throw err; // already learned and not due yet: nothing to record
      }
    }
    (await derivationNodeIds(stage)).forEach((id) => { ensureDerivationContent(id).catch((e) => console.error('LastMind: derivation content refresh failed', id, e)); });
    res.json({ schedules });
  } catch (err) {
    console.error('Derivation completion failed:', err);
    res.status(500).json({ error: 'could not record this lesson' });
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
    await assertFreshGenerationWithinCap(userId, await isUserPaid(userId), req.userCreatedAt ?? null, req.userEmail);
    const generated = await generateAndCacheEdgeLesson(fromNodeId, toNodeId, userId);
    if (!generated) return res.status(404).json({ error: 'connection not found or not ready yet' });
    await recordFreshGenerationEvent(userId);
    res.json(generated);
  } catch (err) {
    if (err instanceof InsufficientLocksError) {
      return res.status(402).json({ error: 'Lock limit reached', code: 'LOCK_LIMIT_REACHED', detail: "You're out of Locks for now." });
    }
    if (err instanceof GenerationCapExceededError) {
      // code: 'GENERATION_RATE_LIMIT' - deliberately distinct from Locks'
      // own 'LOCK_LIMIT_REACHED' (routes/credits.ts is gone, but
      // routes/locks.ts's real InsufficientLocksError still uses that
      // code) - a real, reported bug: this is a completely unrelated
      // fresh-generation rate limit (generationCapService.ts), not the
      // Locks balance shown in the topbar at all, but reusing the same
      // code made the frontend show "Buy more Locks" for it, which
      // genuinely cannot help (there's nothing to buy - it resets on its
      // own) and left a student with a huge, untouched Locks balance
      // confused about why they were blocked at all.
      return res.status(429).json({ error: 'Generation limit reached', code: 'GENERATION_RATE_LIMIT', window: err.window, limit: err.limit });
    }
    console.error('Edge lesson lookup/generation failed:', err);
    res.status(500).json({ error: 'could not load this lesson' });
  }
});

// ---- Prerequisite check: the "jump ahead" gate ----
// State is round-tripped through the client, same convention as
// diagnosticOrchestrator.ts's OrchestratorState — but see
// chainDiagnosticService.ts's own comment on why ground truth (node
// explanations / edge link-teaching) never travels in it, only ids.
interface PrereqCheckState {
  targetNodeId: string;
  gap: GapResult;
  chains: ChainStep[][];
  keys?: string;   // sealed answer keys for the interactive questions (see sealJson)
}
const keysOf = (state: PrereqCheckState): Record<string, StructuredQuestion> => (state.keys ? openJson<Record<string, StructuredQuestion>>(state.keys) : null) || {};

// POST /knowledge-map-v2/prereq-check/start  { targetNodeId, subject, qualification, examBoard }
// -> { requiresCheck: false } if every prerequisite is already encoded
//    (straight into the lesson, no gate), or
//    { requiresCheck: true, targetLabel, chains, state } otherwise —
//    chains is one array per vertical prerequisite chain, each entry a
//    { componentId, type, label, fromLabel?, toLabel?, questionText }
//    step, earliest-prerequisite-first (render bottom-to-top).
router.post('/knowledge-map-v2/prereq-check/start', requireAuth, costlyEndpointLimiter, async (req: Request, res: Response) => {
  const { targetNodeId, subject, qualification, examBoard } = req.body ?? {};
  if (typeof targetNodeId !== 'string' || !targetNodeId) {
    return res.status(400).json({ error: 'targetNodeId is required' });
  }
  try {
    const userId = req.userId as string;
    const gap = await findPrerequisiteGap(
      userId,
      targetNodeId,
      typeof subject === 'string' ? subject : '',
      typeof qualification === 'string' ? qualification : '',
      typeof examBoard === 'string' ? examBoard : ''
    );
    if (!gap) return res.status(404).json({ error: 'concept not found' });
    if (!gap.gapNodeIds.length) return res.json({ requiresCheck: false });

    const chains = buildPrerequisiteChains(gap);
    const generated = await generateChainQuestions(gap.targetLabel, chains, userId);
    const chainsForClient = generated.chains;
    const state: PrereqCheckState = { targetNodeId, gap, chains, keys: sealJson(generated.keys) };
    res.json({ requiresCheck: true, targetLabel: gap.targetLabel, chains: chainsForClient, state });
  } catch (err) {
    console.error('Prerequisite check start failed:', err);
    res.status(500).json({ error: 'could not prepare the prerequisite check' });
  }
});

// POST /knowledge-map-v2/prereq-check/submit  { state, answers: {componentId: answerText} }
// Grades every step's own separate answer at once. Anything correct is
// graded into FSRS right away — exactly a first-time-correct answer's
// usual 'good' rating, which is what schedules its Day-1 check (see
// gradeChainAnswers). Anything wrong is left completely ungraded — no
// premature 'again' — since a genuine gap only ever enters FSRS later,
// via its own fresh lesson once fed into the main feed (see finalize
// below), never from this check itself.
router.post('/knowledge-map-v2/prereq-check/submit', requireAuth, costlyEndpointLimiter, async (req: Request, res: Response) => {
  const { state, answers } = (req.body ?? {}) as { state?: PrereqCheckState; answers?: Record<string, unknown> };
  if (!state || !Array.isArray(state.chains) || !answers || typeof answers !== 'object') {
    return res.status(400).json({ error: 'state and answers are required' });
  }
  try {
    const userId = req.userId as string;
    const results = await gradeChainAnswers(state.chains, answers, userId, keysOf(state));
    res.json({ results, allCorrect: results.every((r) => r.correct) });
  } catch (err) {
    console.error('Prerequisite check grading failed:', err);
    res.status(500).json({ error: 'could not grade that answer' });
  }
});

// POST /knowledge-map-v2/prereq-check/retry-steps  { state, items: [{componentId, originalAnswer, originalFeedback}] }
// One narrow re-ask per step the student ticked "I think this was a
// silly mistake" on — batched into one call per request, but each step
// gets its own genuinely distinct question.
router.post('/knowledge-map-v2/prereq-check/retry-steps', requireAuth, costlyEndpointLimiter, async (req: Request, res: Response) => {
  const { state, items } = (req.body ?? {}) as {
    state?: PrereqCheckState;
    items?: { componentId: string; originalAnswer: string; originalFeedback: string }[];
  };
  if (!state || !Array.isArray(state.chains) || !Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'state and items are required' });
  }
  try {
    const userId = req.userId as string;
    const flatSteps = state.chains.flat();
    const retries = await Promise.all(
      items.map(async (item) => {
        const step = flatSteps.find((s) => s.componentId === item.componentId);
        if (!step) return null;
        const key = keysOf(state)[item.componentId];
        if (key) return { componentId: item.componentId, questionText: key.questionText, structured: clientView(key) };
        const questionText = await generateStepRetryQuestion(step, item.originalAnswer || '', item.originalFeedback || '', userId);
        return { componentId: item.componentId, questionText };
      })
    );
    res.json({ retries: retries.filter((r) => !!r) });
  } catch (err) {
    console.error('Prerequisite check retry-question generation failed:', err);
    res.status(500).json({ error: 'could not prepare that retry' });
  }
});

// POST /knowledge-map-v2/prereq-check/submit-retry-steps  { state, items: [{componentId, questionText, answer}] }
// Grades each retry independently. Correct -> 'hard' via gradeStepCorrect's
// retry path (retryCount=1) — a corrected-then-confirmed pass is still
// weaker evidence than a clean first-try answer, but still genuine. Wrong
// -> stays a genuine gap, no grade recorded here either.
router.post('/knowledge-map-v2/prereq-check/submit-retry-steps', requireAuth, costlyEndpointLimiter, async (req: Request, res: Response) => {
  const { state, items } = (req.body ?? {}) as {
    state?: PrereqCheckState;
    items?: { componentId: string; questionText: string; answer: unknown }[];
  };
  if (!state || !Array.isArray(state.chains) || !Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'state and items are required' });
  }
  try {
    const userId = req.userId as string;
    const flatSteps = state.chains.flat();
    const results = await Promise.all(
      items.map(async (item) => {
        const step = flatSteps.find((s) => s.componentId === item.componentId);
        if (!step) return { componentId: item.componentId, correct: false, feedback: '' };
        const key = keysOf(state)[item.componentId];
        if (key) {
          const g = gradeStructured(key, item.answer);
          if (g.correct) await gradeStepCorrect(userId, step, 1);
          return { componentId: item.componentId, correct: g.correct, feedback: g.feedback, detail: g.detail, reveal: g.reveal };
        }
        const { correct, feedback } = await gradeStepRetryAnswer(step, item.questionText || '', String(item.answer || ''), userId);
        if (correct) await gradeStepCorrect(userId, step, 1);
        return { componentId: item.componentId, correct, feedback };
      })
    );
    res.json({ results });
  } catch (err) {
    console.error('Prerequisite check retry grading failed:', err);
    res.status(500).json({ error: 'could not grade that answer' });
  }
});

// POST /knowledge-map-v2/prereq-check/finalize  { state, genuineGapComponentIds: string[] }
// Orders whatever's still a genuine gap (never resolved correct, whether
// on the first pass or a silly-mistake retry) into real prerequisite
// order for the main feed — every gap node's own fresh encoding lesson,
// and every gap edge's own fresh integration lesson, exactly the SAME
// lesson flows a brand-new concept already goes through, just seeded in
// one sequence ending at the target the student originally picked. Pure
// DB read + list ordering, no AI call — see buildGapFeedItems.
router.post('/knowledge-map-v2/prereq-check/finalize', requireAuth, syncEndpointLimiter, async (req: Request, res: Response) => {
  const { state, genuineGapComponentIds } = (req.body ?? {}) as { state?: PrereqCheckState; genuineGapComponentIds?: string[] };
  if (!state || !state.gap) {
    return res.status(400).json({ error: 'state is required' });
  }
  try {
    const items = await buildGapFeedItems(state.gap, new Set(genuineGapComponentIds || []));
    res.json({ items });
  } catch (err) {
    console.error('Prerequisite check finalize failed:', err);
    res.status(500).json({ error: 'could not finish that' });
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
    // A concept's genuinely first-ever grade only means "just taught"
    // when it came through practice (node encoding) or integration (a
    // link's first-ever session, prompted with its own teaching content) -
    // never transfer, which is a softer preliminary check. See
    // recordFirstTeachingSignals' own comment for why this must be an
    // explicit call here rather than automatic inside gradeAndRecordReview.
    if (!graded.previousRow && (questionType === 'practice' || questionType === 'integration')) {
      await recordFirstTeachingSignals(userId, conceptId!);
    }
    // The frontend needs the fresh due date the moment this grades, not
    // only after a later /schedule refetch (e.g. on returning to the
    // dashboard) — see reviewService.ts's cardToRowFields for the fields.
    res.json({ ...result, schedule: scheduleWithMastery(conceptId!, graded) });
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
  const external = await getExternalCoveredConceptIds(userId);
  external.forEach((conceptId) => encoded.add(conceptId));
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
  const { nodeId, fromNodeId, toNodeId, questionType, answer, answers, retryCount, followUpToken, structured, checkRef } = (req.body ?? {}) as {
    checkRef?: number;   // answer one of this lesson's cued recall checks in place of an open-text practice question
    structured?: unknown;
    followUpToken?: string;
    nodeId?: string;
    fromNodeId?: string;
    toNodeId?: string;
    questionType?: 'practice' | 'transfer' | 'integration';
    answer?: string;
    answers?: string[];
    retryCount?: number;
  };
  const isBlanksSubmission = Array.isArray(answers);
  const isStructuredSubmission = structured !== undefined && structured !== null;
  if (!questionType || (isStructuredSubmission ? false : isBlanksSubmission ? !answers!.length : (typeof answer !== 'string' || !answer.trim()))) {
    return res.status(400).json({ error: 'questionType and answer(s) are required' });
  }

  try {
    const userId = req.userId as string;
    let question: any;
    let conceptId: string | undefined;

    if (questionType === 'practice') {
      if (!nodeId) return res.status(400).json({ error: 'nodeId is required for a practice question' });
      const [{ data: node }, { data: lesson }] = await Promise.all([
        supabaseAdmin.from('knowledge_map_nodes').select('concept_id').eq('id', nodeId).maybeSingle(),
        supabaseAdmin.from('knowledge_map_node_lessons').select('encoding_content').eq('node_id', nodeId).maybeSingle(),
      ]);
      if (!node) return res.status(404).json({ error: 'concept not found' });
      conceptId = node.concept_id as string;
      const lessonContent = lesson?.encoding_content as any;
      question = lessonContent?.practiceQuestion;
      if (typeof checkRef === 'number' && lessonContent?.recallChecks?.[checkRef]) question = lessonContent.recallChecks[checkRef];
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

    // A cued check answered in place of an open-text practice question: multiple choice or a short fill-in, both with one right answer.
    if (typeof checkRef === 'number' && questionType === 'practice' && (question.format === 'multiple_choice' || question.format === 'fill_blank')) {
      const sub = structured as any;
      const right = question.format === 'multiple_choice' ? Number(sub?.option) === question.correctOptionIndex : closeEnough(String(sub?.answer ?? ''), String(question.answer || ''));
      if (!right) return res.json({ correct: false, feedback: question.format === 'multiple_choice' ? 'Not quite - look at the other options again.' : 'Not quite - check the term and try again.', retryable: true });
      const gradedC = await gradeCorrectness(userId, conceptId!, true, Number(retryCount) || 0);
      if (!gradedC.previousRow) await recordFirstTeachingSignals(userId, conceptId!);
      return res.json({ correct: true, feedback: 'Correct.', schedule: scheduleWithMastery(conceptId!, gradedC) });
    }

    // Interactive formats (spot the mistake, match, order) have exactly one right answer, so they are graded here with no AI
    // call. A wrong practice attempt is a learning rep, not a lapse: nothing is recorded until it is right (same as free text).
    if (isStructured(question) || isStructuredSubmission) {
      if (questionType !== 'practice' || !isStructured(question) || !isStructuredSubmission) return res.status(400).json({ error: 'this question is answered in a different way' });
      const g = gradeStructured(question, structured);
      if (!g.correct) return res.json({ correct: false, feedback: g.feedback, detail: g.detail, retryable: true });
      const gradedS = await gradeCorrectness(userId, conceptId!, true, Number(retryCount) || 0);
      if (!gradedS.previousRow) await recordFirstTeachingSignals(userId, conceptId!);
      return res.json({ correct: true, feedback: g.feedback, reveal: g.reveal, schedule: scheduleWithMastery(conceptId!, gradedS) });
    }

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
      const perBlankCorrect = question.blanks.map((b: { prompt: string; answer: string }, i: number) => normalizeForBlankComparison(answers![i] || '') === normalizeForBlankComparison(b.answer));
      const correct = perBlankCorrect.every(Boolean);
      const feedback = correct ? 'All correct!' : 'Check the highlighted box(es) and try again.';
      if (!correct) {
        return res.json({ correct, feedback, perBlankCorrect, retryable: true });
      }
      const graded = await gradeCorrectness(userId, conceptId!, correct, Number(retryCount) || 0);
      // Blanks submissions are always questionType 'practice' (see the
      // guard above) - see the identical comment on diagram-question/submit.
      if (!graded.previousRow) await recordFirstTeachingSignals(userId, conceptId!);
      return res.json({ correct, feedback, perBlankCorrect, schedule: scheduleWithMastery(conceptId!, graded) });
    }

    // A retry after a wrong answer is graded against the follow-up question the
    // marker set (see services/followUp.ts) rather than the original.
    const followUpQ = openFollowUp(userId, followUpToken);
    const gradedQuestionText = followUpQ ? followUpQ.questionText : question.questionText;
    const gradedMarkScheme = followUpQ ? followUpQ.markScheme : (question.markScheme || '');
    const raw = await callClaudeJSON({
      model: MODELS.simpleQuestion,
      systemPrompt: questionType === 'practice' ? KNOWLEDGE_MAP_ANSWER_CHECK_PROMPT : KNOWLEDGE_MAP_ANSWER_CHECK_NO_FOLLOW_UP_PROMPT,
      userContent: `Question: ${gradedQuestionText}\nMark scheme: ${gradedMarkScheme}\nStudent's answer: ${answer}`,
      temperature: 0.1,
      userId,
      // questionType is 'practice' (initial encoding), 'transfer', or
      // 'integration' - split by it so the Locks ledger can tell these
      // three genuinely different grading calls apart instead of
      // blending them into one bucket.
      meteredReason: `knowledge-map-v2-${questionType}-grade`,
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
      return res.json({ correct, feedback, retryable: true, followUp: followUpFromGrading(userId, raw) });
    }
    const graded = await gradeCorrectness(userId, conceptId!, correct, questionType === 'practice' ? (Number(retryCount) || 0) : 0);
    // See the identical comment on diagram-question/submit above.
    if (!graded.previousRow && (questionType === 'practice' || questionType === 'integration')) {
      await recordFirstTeachingSignals(userId, conceptId!);
    }
    res.json({ correct, feedback, schedule: scheduleWithMastery(conceptId!, graded) });
  } catch (err) {
    console.error('Text question grading failed:', err);
    res.status(500).json({ error: 'could not grade this answer' });
  }
});

// POST /knowledge-map-v2/node/:nodeId/untracked-submit  { answer } or { answers: [...] }
// "LastMind Untracked" - grades this node's own practice question exactly
// like text-question/submit's 'practice' branch above, but never calls
// gradeCorrectness/gradeAndRecordReview at all: no concept_reviews row,
// no immediate-recall or Day-1 scheduling, this node is never marked
// "encoded" by this route. A student trying a concept this way still sees
// it as untouched afterward - its real scheduled lesson (whenever they
// actually start it for real) runs completely fresh. A wrong answer gets
// a real Socratic hint (see UNTRACKED_LESSON_GRADE_PROMPT) instead of a
// blunt fail, and is always retryable - there's no retry-count-based FSRS
// rating to protect here, so the student can simply keep trying.
router.post('/knowledge-map-v2/node/:nodeId/untracked-submit', requireAuth, costlyEndpointLimiter, async (req: Request, res: Response) => {
  const { nodeId } = req.params;
  const body = (req.body ?? {}) as { answer?: string | DiagramAnswerSubmission; answers?: string[]; structured?: unknown };
  if (body.answer === undefined && !Array.isArray(body.answers) && !body.structured) {
    return res.status(400).json({ error: 'answer(s) required' });
  }
  try {
    const { data: lesson, error } = await supabaseAdmin
      .from('knowledge_map_node_lessons')
      .select('encoding_content')
      .eq('node_id', nodeId)
      .maybeSingle();
    if (error) throw error;
    const question = (lesson?.encoding_content as {
      practiceQuestion?: {
        questionText?: string;
        markScheme?: string;
        blanks?: { prompt: string; answer: string }[];
        diagramSpec?: DiagramSpec;
      };
    } | null)?.practiceQuestion;
    if (!question || !question.questionText) return res.status(404).json({ error: 'question not found' });

    if (isStructured(question)) {
      if (!body.structured) return res.status(400).json({ error: 'answer is required' });
      const g = gradeStructured(question, body.structured);
      return res.json({ correct: g.correct, feedback: g.feedback, detail: g.detail, reveal: g.reveal, retryable: !g.correct });
    }

    if (question.diagramSpec) {
      if (!body.answer) return res.status(400).json({ error: 'answer is required' });
      const result = gradeDiagramAnswer(question.diagramSpec, body.answer as DiagramAnswerSubmission);
      return res.json({ ...result, retryable: !result.correct });
    }

    if (Array.isArray(body.answers)) {
      if (!question.blanks || !question.blanks.length) {
        return res.status(400).json({ error: 'this question has no separately-gradable blanks' });
      }
      const answers = body.answers;
      const perBlankCorrect = question.blanks.map((b, i) => normalizeForBlankComparison(answers[i] || '') === normalizeForBlankComparison(b.answer));
      const correct = perBlankCorrect.every(Boolean);
      const feedback = correct ? 'All correct!' : 'Check the highlighted box(es) and try again.';
      return res.json({ correct, feedback, perBlankCorrect, retryable: !correct });
    }

    if (typeof body.answer !== 'string' || !body.answer.trim()) {
      return res.status(400).json({ error: 'answer is required' });
    }
    const untrackedFollowUp = openFollowUp(req.userId as string, (body as { followUpToken?: string }).followUpToken);
    const raw = await callClaudeJSON({
      model: MODELS.simpleQuestion,
      systemPrompt: UNTRACKED_LESSON_GRADE_PROMPT,
      userContent: `Question: ${untrackedFollowUp ? untrackedFollowUp.questionText : question.questionText}\nMark scheme: ${untrackedFollowUp ? untrackedFollowUp.markScheme : (question.markScheme || '')}\nStudent's answer: ${body.answer}`,
      temperature: 0.2,
      userId: req.userId,
      meteredReason: 'knowledge-map-v2-untracked-grade',
    });
    const { correct, feedback, hint } = parseModelJson<{ correct: boolean; feedback: string; hint?: string }>(raw);
    res.json({ correct, feedback, hint: correct ? undefined : hint, retryable: !correct, followUp: correct ? undefined : followUpFromGrading(req.userId as string, raw) });
  } catch (err) {
    console.error('Untracked lesson grading failed:', err);
    res.status(500).json({ error: 'could not grade this answer' });
  }
});

// Shape of one entry in encoding_content.recallChecks (see the
// "recallChecks" output field added to KNOWLEDGE_MAP_ENCODING_LESSON_PROMPT
// in lessonGenerationPrompts.ts) - generated once alongside the lesson
// itself, cached forever, never regenerated per recall.
interface RecallCheck {
  format: 'free_text' | 'fill_blank' | 'multiple_choice' | 'spot_mistake' | 'match' | 'order';
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
// The 2-minute clock starts when the concept's own immediate check is answered
// correctly. A recall can only be taken in the 30 seconds after it falls due -
// the same window the pop-up nudge stays on screen. Anything later has expired
// (the concept's real review picks it up). Recalls due in the next few minutes
// are returned too, so the feed can time each nudge.
const RECALL_EXPIRY_MS = 30 * 1000;
const RECALL_LOOKAHEAD_MS = 30 * 60 * 1000;

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
      .select('id, concept_id, due_at, recall_number')
      .eq('user_id', userId)
      .eq('resolved', false);
    if (error) throw error;
    if (!rows || !rows.length) return res.json({ recalls: [] });

    const now = Date.now();
    // msSinceDue is NEGATIVE for a recall whose due_at hasn't arrived yet
    // (the common case - most rows in this table at any moment are
    // scheduled minutes into the future). stillCatchable used to only
    // check the upper bound (<= RECALL_GRACE_MS), which a large negative
    // number always satisfies - a real bug that served every not-yet-due
    // recall as due immediately, the first time this endpoint was polled
    // after it was scheduled. The >= 0 check is what actually means "its
    // moment has arrived": not due yet is neither missed nor catchable,
    // just left alone until a later poll.
    const msSinceDue = (r: { due_at: unknown }) => now - new Date(r.due_at as string).getTime();
    const missed = rows.filter((r) => msSinceDue(r) > RECALL_EXPIRY_MS);
    const stillCatchable = rows.filter((r) => msSinceDue(r) >= -RECALL_LOOKAHEAD_MS && msSinceDue(r) <= RECALL_EXPIRY_MS);
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

    // A link's first integration schedules the same recall cascade as a
    // concept's first encoding - its "concept" is the ::integration key, not a
    // node, so it is resolved through the edge's integration question instead.
    const integrationRecalls = await Promise.all(stillCatchable
      .filter((r) => (r.concept_id as string).endsWith('::integration'))
      .map(async (r) => {
        const [info, question] = await Promise.all([
          getConceptDisplayInfo(r.concept_id as string),
          getQuestionForConceptId(r.concept_id as string),
        ]);
        if (!info || !question) return null;
        return {
          recallId: r.id, nodeId: info.nodeId, label: info.label, subject: info.subject, dueAt: r.due_at,
          recallCheckIndex: -1, format: 'free_text' as const, questionText: question.questionText, options: undefined,
        };
      }));

    const nodeRecalls = stillCatchable
      .filter((r) => !(r.concept_id as string).endsWith('::integration'))
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
        const v2pool = content ? immediatePool(content) : [];
        if (v2pool.length) {
          // Current-format lessons: the step decides which question, in turn (see reviewQuestionPool.ts).
          const e = rotationPick(v2pool, Number((r as any).recall_number) || 1);
          recallCheckIndex = e.ref; check = e.question as RecallCheck;
        } else if (checks && checks.length) {
          recallCheckIndex = Math.floor(Math.random() * checks.length);
          check = checks[recallCheckIndex];
        } else if (content?.practiceQuestion?.questionText) {
          recallCheckIndex = -1; // signals "the main practiceQuestion, not a cached recallCheck" to the submit route
          check = { format: 'free_text', questionText: content.practiceQuestion.questionText };
        } else {
          return null; // nothing generated yet for this node at all
        }
        return {
          recallId: r.id, nodeId: node.id, conceptId: node.concept_id, label: node.label, subject: node.subject, dueAt: r.due_at,
          recallCheckIndex, format: check.format, questionText: check.questionText,
          options: check.format === 'multiple_choice' ? check.options : undefined,
          // Interactive formats send the puzzle (segments / lefts and shuffled rights / shuffled items), never the key.
          ...(isStructured(check) ? (({ format: _f, questionText: _q, ...rest }) => rest)(clientView(check) as Record<string, unknown>) : {}),
        };
      })
      .filter(Boolean);
    const recalls = [...nodeRecalls, ...integrationRecalls.filter(Boolean)]
      .sort((a, b) => new Date((a as { dueAt: string }).dueAt).getTime() - new Date((b as { dueAt: string }).dueAt).getTime());
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
  const { recallCheckIndex, answer, selectedOptionIndex, retryCount, followUpToken, structured } = (req.body ?? {}) as {
    structured?: unknown;
    followUpToken?: string;
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

    let check: RecallCheck | undefined;
    if ((row.concept_id as string).endsWith('::integration')) {
      // A link's own recall: graded against the edge's integration question.
      const q = await getQuestionForConceptId(row.concept_id as string);
      check = q ? { format: 'free_text', questionText: q.questionText, markScheme: q.markScheme } : undefined;
    } else {
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
      const pqq: any = content?.practiceQuestion;
      check = recallCheckIndex === -1
        ? (pqq?.questionText ? (isStructured(pqq) ? (pqq as RecallCheck) : { format: 'free_text', questionText: pqq.questionText, markScheme: pqq.markScheme }) : undefined)
        : content?.recallChecks?.[recallCheckIndex];
    }
    if (!check || !check.questionText) return res.status(404).json({ error: 'question not found' });

    let correct: boolean;
    let feedback: string | null = null;
    let recallFollowUpOut: ReturnType<typeof followUpFromGrading>;
    let structuredDetail: boolean[] | undefined;
    let structuredReveal: string | undefined;
    if (isStructured(check)) {
      if (structured === undefined || structured === null) return res.status(400).json({ error: 'structured answer is required' });
      const g = gradeStructured(check, structured);
      correct = g.correct; feedback = g.correct ? null : g.feedback; structuredDetail = g.detail; structuredReveal = g.reveal;
    } else if (check.format === 'multiple_choice') {
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
          meteredReason: 'immediate-recall-fill-blank-leniency',
        });
        ({ correct, feedback } = parseCorrectFeedbackJson(raw));
      }
    } else {
      if (typeof answer !== 'string' || !answer.trim()) return res.status(400).json({ error: 'answer is required' });
      const recallFollowUp = openFollowUp(userId, followUpToken);
      const raw = await callClaudeJSON({
        model: MODELS.simpleQuestion,
        systemPrompt: KNOWLEDGE_MAP_ANSWER_CHECK_PROMPT,
        userContent: `Question: ${recallFollowUp ? recallFollowUp.questionText : check.questionText}\nMark scheme: ${recallFollowUp ? recallFollowUp.markScheme : (check.markScheme || '')}\nStudent's answer: ${answer}`,
        temperature: 0.1,
        userId,
        meteredReason: 'immediate-recall-grade',
      });
      ({ correct, feedback } = parseCorrectFeedbackJson(raw));
      if (!correct) recallFollowUpOut = followUpFromGrading(userId, raw);
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
          // Upsert (see reviewService.ts's scheduleImmediateRecall for the
          // full reasoning) - a duplicate submit of this same recall
          // (resolved is checked above, but a genuine race between two
          // concurrent submits could both pass that check before either
          // writes) must not schedule two copies of the next cascade step.
          const { error: nextError } = await supabaseAdmin.from('immediate_recall_schedule').upsert(
            { user_id: userId, concept_id: row.concept_id, due_at: dueAt, recall_number: recallNumber + 1, target_recalls: targetRecalls },
            { onConflict: 'user_id,concept_id,recall_number', ignoreDuplicates: true }
          );
          if (nextError) console.error('Scheduling next recall in cascade failed (non-fatal):', nextError);
        }
      }
    }
    res.json({ correct, feedback, followUp: recallFollowUpOut, detail: structuredDetail, reveal: structuredReveal });
  } catch (err) {
    console.error('Immediate recall grading failed:', err);
    res.status(500).json({ error: 'could not grade this answer' });
  }
});

// POST /immediate-recalls/:id/give-up
// Two wrong attempts at a 2-minute recall means the concept has not been encoded yet, so instead of asking again the recall is closed and
// the concept goes back to un-encoded: its saved review state and any pending recalls or Day-1 check are cleared, and the next lesson the
// feed offers is that concept's lesson again (a fresh encoding, which starts a fresh recall cascade).
router.post('/immediate-recalls/:id/give-up', requireAuth, syncEndpointLimiter, async (req: Request, res: Response) => {
  try {
    const userId = req.userId as string;
    const { data: row } = await supabaseAdmin.from('immediate_recall_schedule').select('id, concept_id').eq('id', req.params.id).eq('user_id', userId).maybeSingle();
    if (!row) return res.status(404).json({ error: 'recall not found' });
    const conceptId = row.concept_id as string;
    const { error: e1 } = await supabaseAdmin.from('immediate_recall_schedule').delete().eq('user_id', userId).eq('concept_id', conceptId).eq('resolved', false);
    if (e1) throw e1;
    const { error: e2 } = await supabaseAdmin.from('day1_checks').delete().eq('user_id', userId).eq('concept_id', conceptId).eq('resolved', false);
    if (e2) throw e2;
    const { error: e3 } = await supabaseAdmin.from('concept_reviews').delete().eq('user_id', userId).eq('concept_id', conceptId);
    if (e3) throw e3;
    res.json({ rescheduled: true, conceptId });
  } catch (err) {
    console.error('Giving up an immediate recall failed:', err);
    res.status(500).json({ error: 'could not reschedule this concept' });
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
    const infos = await Promise.all(rows.map(async (r) => {
      const [info, question] = await Promise.all([
        getConceptDisplayInfo(r.concept_id as string),
        getQuestionForConceptId(r.concept_id as string, userId),
      ]);
      return { r, info, question };
    }));
    // A Day-1 check whose lesson isn't stored (its cached lesson was cleared, or
    // never generated) has no question to ask and used to be skipped silently,
    // so the queue dried up after the first few. Keep it one step ahead: when
    // fewer than two are ready, regenerate the lesson for the next one in
    // teaching order (charged to the student's Locks like any generation).
    const missing = infos.filter((x) => x.info && !x.question && !(x.r.concept_id as string).endsWith('::integration'));
    const readyCount = infos.filter((x) => x.info && x.question).length;
    if (readyCount < 2 && missing.length) {
      const regenerateNext = async () => {
        try {
          const [next] = await orderDay1ChecksByLessonOrder(missing.map((x) => ({ conceptId: x.r.concept_id as string, item: x })));
          await generateNodeLessonPreferringDerivation(next.item.info!.nodeId, userId, {
            before: async () => { await assertFreshGenerationWithinCap(userId, await isUserPaid(userId), req.userCreatedAt ?? null, req.userEmail); },
            after: () => recordFreshGenerationEvent(userId),
          });
          next.item.question = await getQuestionForConceptId(next.item.r.concept_id as string, userId);
        } catch (err) {
          console.error('Regenerating a lesson for a Day-1 check failed (non-fatal):', err);
        }
      };
      // A regeneration is a full Claude lesson call (tens of seconds). Only wait for it
      // when there is nothing to show at all; otherwise answer straight away with the
      // checks that are ready and let it finish in the background, ready for next time.
      if (readyCount === 0) await regenerateNext();
      else void regenerateNext();
    }
    const withDisplay = infos.map(({ r, info, question }) => {
      if (!info || !question) return null;
      return { checkId: r.id, conceptId: r.concept_id, nodeId: info.nodeId, label: info.label, subject: info.subject, dueDate: r.due_date, questionText: question.questionText, ...(question.structured ? clientView(question.structured) : {}) };
    });
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

router.get('/day1-checks/completed', requireAuth, syncEndpointLimiter, async (req: Request, res: Response) => {
  try {
    const { data: rows, error } = await supabaseAdmin
      .from('day1_checks')
      .select('concept_id')
      .eq('user_id', req.userId as string)
      .eq('resolved', true);
    if (error) throw error;
    res.json({ conceptIds: (rows || []).map((r) => r.concept_id) });
  } catch (err) {
    console.error('Fetching completed Day-1 checks failed:', err);
    res.status(500).json({ error: 'could not load completed Day-1 checks' });
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
//
// Also grades this concept's real FSRS card (gradeCorrectness) - a real
// bug found live: the concept's very first FSRS due date is set back at
// its FIRST-EVER grade (the original encoding/integration pass, via
// gradeAndRecordReview's !existingRow branch), which is the SAME event
// that schedules this Day-1 check for +1 day. FSRS's own minimum first
// interval (enable_short_term:false forces at least a full day) then
// lands on that exact same day, so the "real" spaced review was already
// due the moment the Day-1 check was - passing the check looked like it
// immediately triggered a same-day review, when really the two were
// just coincidentally scheduled together from the same origin event.
// Grading the Day-1 outcome here makes it a genuine SECOND FSRS review
// (stability already exists from the first grade), so the interval FSRS
// computes from here is a real spaced gap, not another same-day one -
// exactly the "shouldn't be on the same day" behaviour asked for. A
// slip-then-correct retry grades as a clean pass (retryCount 0), not a
// harder one - "a slip is a statement about execution, not about
// whether the concept itself is known" (see fsrsService.ts's own
// gradeReview docstring), the same reasoning the encoding lessons
// already apply.
router.post('/day1-checks/:id/submit', requireAuth, costlyEndpointLimiter, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { answer, retryAfterSillyMistake, structured } = (req.body ?? {}) as { answer?: string; retryAfterSillyMistake?: boolean; structured?: unknown };
  if (structured === undefined && (typeof answer !== 'string' || !answer.trim())) return res.status(400).json({ error: 'answer is required' });

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
    const conceptId = row.concept_id as string;

    const question = await getQuestionForConceptId(conceptId, userId);
    if (!question) return res.status(404).json({ error: 'question not found' });
    if (!!question.structured !== (structured !== undefined)) return res.status(400).json({ error: 'this check is answered in a different way' });

    let correct: boolean; let feedback: string; let sillyMistake: boolean | undefined; let detail: boolean[] | undefined;
    if (question.structured) {
      // An interactive check is graded exactly. The first miss gets one re-ask (a mis-tap is a slip); the second is final.
      const g = gradeStructured(question.structured, structured);
      correct = g.correct; feedback = g.feedback; sillyMistake = !g.correct; detail = g.detail;
    } else {
      const raw = await callClaudeJSON({
        model: MODELS.simpleQuestion,
        systemPrompt: DAY1_CHECK_ANSWER_PROMPT,
        userContent: `Question: ${question.questionText}\nMark scheme: ${question.markScheme}\nStudent's answer: ${answer}`,
        temperature: 0.1,
        userId,
        meteredReason: 'day1-check-grade',
      });
      ({ correct, feedback, sillyMistake } = parseModelJson<{ correct: boolean; feedback: string; sillyMistake?: boolean }>(raw));
    }

    // A section check (Economics) decides the schedule of every concept in that lesson, not just the one it hangs from.
    const gradeSiblings = async (ok: boolean): Promise<any[]> => {
      const out: any[] = [];
      for (const sib of derivationSiblingConcepts(conceptId)) {
        if (sib === conceptId) continue;
        try { out.push(scheduleWithMastery(sib, await gradeCorrectness(userId, sib, ok, 0))); } catch (e) { if (!(e instanceof ReviewNotDueError)) throw e; }
      }
      return out;
    };

    if (correct) {
      const graded = await gradeCorrectness(userId, conceptId, true, 0);
      const schedules = await gradeSiblings(true);
      const { error: updateError } = await supabaseAdmin.from('day1_checks').update({ resolved: true }).eq('id', id);
      if (updateError) throw updateError;
      const keys = await awardDay1Keys(userId, conceptId, id, !retryAfterSillyMistake);
      return res.json({ correct: true, feedback, schedule: scheduleWithMastery(conceptId, graded), schedules, keysAwarded: keys.awarded, keyBalance: keys.balance });
    }

    if (!retryAfterSillyMistake && sillyMistake) {
      // Deferred - not resolved, no Rb bump and no FSRS grade yet. The
      // student gets one more attempt at the exact same question. A cloze
      // section check's first miss also gets a small nudge: the initial
      // letter of each word of every still-wrong term ("Finite stock" ->
      // "F    S"), enough to jog memory without just handing the answer
      // over - never sent on the SECOND (final) attempt.
      const hints = (question.structured?.format === 'cloze' || question.structured?.format === 'diagram') && detail
        ? (question.structured.blanks || []).map((b: any, i: number) => (detail![i] ? null : String(b.answer || '').split(' ').map((w: string) => w[0] || '').join('    ')))
        : undefined;
      return res.json({ correct: false, sillyMistake: true, feedback, detail, hints });
    }

    // A genuine failure (or a still-wrong/second attempt after the one
    // reask already given) - resolve it, grade the FSRS card as a lapse,
    // and bump the base recall count.
    const graded = await gradeCorrectness(userId, conceptId, false, 0);
    const schedules = await gradeSiblings(false);
    const { error: updateError } = await supabaseAdmin.from('day1_checks').update({ resolved: true }).eq('id', id);
    if (updateError) throw updateError;
    await bumpBaseRecalls(userId);
    res.json({ correct: false, sillyMistake: false, feedback, detail, schedule: scheduleWithMastery(conceptId, graded), schedules });
  } catch (err) {
    console.error('Day-1 check grading failed:', err);
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
    // A Law lesson from before the interactive formats gets its new questions first (its explanation is untouched).
    const { data: lessonRow } = await supabaseAdmin.from('knowledge_map_node_lessons').select('encoding_content').eq('node_id', nodeId).maybeSingle();
    if (lessonRow?.encoding_content && (lessonRow.encoding_content as any).formatVersion !== 2) await upgradeIfLaw(nodeId, req.userId as string, lessonRow.encoding_content);
    const { data: nodeRow } = await supabaseAdmin.from('knowledge_map_nodes').select('concept_id').eq('id', nodeId).maybeSingle();
    const rotated = nodeRow ? await pickRotatingQuestion(req.userId as string, nodeId, nodeRow.concept_id as string) : null;
    if (rotated) {
      const q = rotated.question;
      return res.json(isStructured(q) ? { ...clientView(q), poolRef: rotated.ref, modality: 'writing' } : { questionText: q.questionText, poolRef: rotated.ref, modality: 'writing' });
    }
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
  const keys = await awardSpacedReviewKeys(userId, conceptId, result.previousRow?.reps || 0, retryCount);
  return { correct: true, feedback, schedule: scheduleWithMastery(conceptId, result), keysAwarded: keys.awarded, keyBalance: keys.balance };
}

router.post('/knowledge-map-v2/node-review/ao1/submit', requireAuth, costlyEndpointLimiter, async (req: Request, res: Response) => {
  const { nodeId, questionText, answer, retryCount, structured, poolRef } = (req.body ?? {}) as {
    nodeId?: string; questionText?: string; answer?: string; retryCount?: number; structured?: unknown; poolRef?: number;
  };
  const isStructuredAnswer = structured !== undefined && structured !== null;
  if (!nodeId || (!isStructuredAnswer && (!questionText || typeof answer !== 'string' || !answer.trim()))) {
    return res.status(400).json({ error: 'nodeId, questionText and answer are required' });
  }
  try {
    const userId = req.userId as string;
    const { data: node } = await supabaseAdmin.from('knowledge_map_nodes').select('concept_id').eq('id', nodeId).maybeSingle();
    if (!node) return res.status(404).json({ error: 'concept not found' });
    if (isStructuredAnswer) {
      const entry = typeof poolRef === 'number' ? await poolEntry(nodeId, poolRef) : null;
      if (!entry || !isStructured(entry.question)) return res.status(404).json({ error: 'question not found' });
      const g = gradeStructured(entry.question, structured);
      if (!g.correct) return res.json({ correct: false, feedback: g.feedback, detail: g.detail, retryable: true });
      return res.json({ ...(await finalizeAo1Grade(userId, node.concept_id as string, g.feedback, Number(retryCount) || 0)), reveal: g.reveal });
    }
    if (!questionText || typeof answer !== 'string' || !answer.trim()) return res.status(400).json({ error: 'questionText and answer are required' });
    const followUpToken = (req.body as { followUpToken?: string }).followUpToken;
    const graded = await gradeRewordedAo1Answer(nodeId, questionText, answer, userId, followUpToken);
    if (!graded) return res.status(404).json({ error: 'no lesson generated for this concept yet' });
    if (graded.correct) {
      return res.json(await finalizeAo1Grade(userId, node.concept_id as string, graded.feedback, Number(retryCount) || 0));
    }
    // Wrong - never fails the lesson (see this section's top comment).
    // Check whether this reads as a one-word slip so the UI can highlight
    // just the flagged word (see AO1_SLIP_CHECK_PROMPT) rather than a
    // generic retry; either way nothing is recorded yet - it's just a
    // retry with the grading call's own feedback as a hint.
    // Skipped while answering a follow-up question: the slip check compares against
    // the original answer's wording, which no longer applies.
    const slip = followUpToken ? null : await checkAo1SlipCandidate(nodeId, questionText, answer, userId);
    if (slip?.isSlip && slip.wrongPhrase) {
      return res.json({ correct: false, feedback: graded.feedback, retryable: true, isSlipCandidate: true, wrongPhrase: slip.wrongPhrase });
    }
    res.json({ correct: false, feedback: graded.feedback, retryable: true, followUp: graded.followUp });
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
      return res.json({ correct: false, feedback: graded.feedback, retryable: true, followUp: graded.followUp });
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
    // stepping through links) without re-hitting ao1/start first - BUT
    // only when this specific link has actually been tested before. A
    // link with no concept_reviews row at all yet is always safe to
    // teach right now regardless of whatever else about the FROM node's
    // own review bundle is or isn't due today - the due-check exists to
    // stop RE-testing something too early, not to gate a genuine first
    // encounter (see this file's own "brand-new qualifying link... counts
    // as due" reasoning). Real bug this fixes: the knowledge-map
    // prerequisite check (see prereq-check/finalize) can feed a link
    // into this exact route the moment its FROM node is freshly encoded
    // mid-remediation - which schedules a real future due date for that
    // node's own AO1 immediately, so the old unconditional due-check
    // rejected a link that had never been taught at all with a 403.
    const [{ data: fromNodeForGate }, { data: toNodeForGate }] = await Promise.all([
      supabaseAdmin.from('knowledge_map_nodes').select('concept_id').eq('id', fromNodeId).maybeSingle(),
      supabaseAdmin.from('knowledge_map_nodes').select('concept_id').eq('id', toNodeId).maybeSingle(),
    ]);
    if (fromNodeForGate && toNodeForGate) {
      const linkConceptId = linkIntegrationConceptId(fromNodeForGate.concept_id as string, toNodeForGate.concept_id as string);
      const { data: existingLinkReview } = await supabaseAdmin
        .from('concept_reviews')
        .select('concept_id')
        .eq('user_id', userId)
        .eq('concept_id', linkConceptId)
        .maybeSingle();
      if (existingLinkReview) {
        await assertNodeReviewDue(userId, fromNodeId);
      } else {
        const endpointConceptIds = [fromNodeForGate.concept_id as string, toNodeForGate.concept_id as string];
        const { data: completedChecks, error: completedError } = await supabaseAdmin
          .from('day1_checks')
          .select('concept_id')
          .eq('user_id', userId)
          .eq('resolved', true)
          .in('concept_id', endpointConceptIds);
        if (completedError) throw completedError;
        const completedIds = new Set((completedChecks || []).map((row) => row.concept_id as string));
        const externalIds = await getExternalCoveredConceptIds(userId);
        const ready = endpointConceptIds.every((conceptId) => completedIds.has(conceptId) || externalIds.has(conceptId));
        const learnedOnLastMind = endpointConceptIds.some((conceptId) => completedIds.has(conceptId));
        if (!ready || !learnedOnLastMind) {
          return res.status(403).json({ error: 'complete both concept Day-1 checks before starting this integration lesson', code: 'INTEGRATION_DAY1_REQUIRED' });
        }
      }
    }
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
        await assertFreshGenerationWithinCap(userId, await isUserPaid(userId), req.userCreatedAt ?? null, req.userEmail);
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
    // linkTeaching is withheld then too). This is also the moment the
    // Notes page unlocks this link's own notes (markEdgeExplanationSeen) -
    // deliberately not waiting for a correct pass, since the note is
    // compiled from this same explanation, already shown in full right
    // here regardless of how the question itself goes.
    if (step.isFirstAttempt) await markEdgeExplanationSeen(userId, fromNodeId, toNodeId);
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
    if (err instanceof InsufficientLocksError) {
      return res.status(402).json({ error: 'Lock limit reached', code: 'LOCK_LIMIT_REACHED', detail: "You're out of Locks for now." });
    }
    if (err instanceof GenerationCapExceededError) {
      // See the identical comment on the node-lesson route above -
      // GENERATION_RATE_LIMIT, deliberately distinct from Locks' own
      // LOCK_LIMIT_REACHED.
      return res.status(429).json({ error: 'Generation limit reached', code: 'GENERATION_RATE_LIMIT', window: err.window, limit: err.limit });
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
    const graded = await gradeIntegrationAnswer(fromNodeId, toNodeId, questionText, answer, userId, (req.body as { followUpToken?: string }).followUpToken);
    if (!graded) return res.status(404).json({ error: 'no integration question available for this connection' });

    if (!graded.correct) {
      await recordPairwiseIntegrationOutcome(userId, fromNode.concept_id as string, toNode.concept_id as string, false);
      return res.json({ correct: false, feedback: graded.feedback, retryable: true, followUp: graded.followUp });
    }

    const conceptId = linkIntegrationConceptId(fromNode.concept_id as string, toNode.concept_id as string);
    const result = await gradeCorrectness(userId, conceptId, true, Number(retryCount) || 0);
    // This is the "prompted first attempt" integration session referenced
    // in the node-review comment above - see recordFirstTeachingSignals'
    // own comment for why this must be an explicit call here.
    if (!result.previousRow) await recordFirstTeachingSignals(userId, conceptId);
    await recordPairwiseIntegrationOutcome(userId, fromNode.concept_id as string, toNode.concept_id as string, (Number(retryCount) || 0) === 0);
    const keys = await awardSpacedReviewKeys(userId, conceptId, result.previousRow?.reps || 0, Number(retryCount) || 0);
    res.json({ correct: true, feedback: graded.feedback, schedule: scheduleWithMastery(conceptId, result), keysAwarded: keys.awarded, keyBalance: keys.balance });
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


// Notes are built from a concept's stored lesson. A student who has encoded a
// concept whose stored lesson is gone (cleared or never cached) would otherwise
// see no notes for something they have learned - so regenerate it on demand,
// once, charged to their Locks like any other generation. Never for a concept
// they haven't encoded (Notes lists every concept, and clicking an unstarted one
// must not spend anything).
async function regenerateLessonForEncodedNode(nodeId: string, userId: string): Promise<boolean> {
  const { data: node } = await supabaseAdmin.from('knowledge_map_nodes').select('concept_id').eq('id', nodeId).maybeSingle();
  if (!node) return false;
  const { data: review } = await supabaseAdmin.from('concept_reviews').select('concept_id').eq('user_id', userId).eq('concept_id', node.concept_id as string).maybeSingle();
  if (!review) return false;
  const content = await generateNodeLessonPreferringDerivation(nodeId, userId, { before: () => assertLocksAvailable(userId) });
  return !!content;
}

router.post('/knowledge-map-v2/node/:nodeId/notes/compile', requireAuth, async (req: Request, res: Response) => {
  try {
    let notes = await getNodeNoteForUser(req.params.nodeId, req.userId as string);
    if (!notes && await regenerateLessonForEncodedNode(req.params.nodeId, req.userId as string)) notes = await getNodeNoteForUser(req.params.nodeId, req.userId as string);
    if (!notes) return res.status(404).json({ error: 'no lesson generated for this concept yet' });
    res.json(notes);
  } catch (err) {
    console.error('Node notes lookup failed:', err);
    res.status(500).json({ error: 'could not load notes for this concept' });
  }
});

router.get('/knowledge-map-v2/node/:nodeId/notes', requireAuth, async (req: Request, res: Response) => {
  try {
    let notes = await getNodeNoteForUser(req.params.nodeId, req.userId as string);
    if (!notes && await regenerateLessonForEncodedNode(req.params.nodeId, req.userId as string)) notes = await getNodeNoteForUser(req.params.nodeId, req.userId as string);
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
router.put('/knowledge-map-v2/node/:nodeId/notes', requireAuth, async (req: Request, res: Response) => {
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

router.post('/knowledge-map-v2/edge/:fromNodeId/:toNodeId/notes/compile', requireAuth, async (req: Request, res: Response) => {
  try {
    const notes = await getEdgeNoteForUser(req.userId as string, req.params.fromNodeId, req.params.toNodeId);
    if (!notes) return res.status(404).json({ error: 'connection not found' });
    res.json(notes);
  } catch (err) {
    console.error('Edge notes lookup failed:', err);
    res.status(500).json({ error: 'could not load notes for this connection' });
  }
});

router.get('/knowledge-map-v2/edge/:fromNodeId/:toNodeId/notes', requireAuth, async (req: Request, res: Response) => {
  try {
    const notes = await getEdgeNoteForUser(req.userId as string, req.params.fromNodeId, req.params.toNodeId);
    if (!notes) return res.status(404).json({ error: 'no notes available for this connection yet' });
    res.json(notes);
  } catch (err) {
    console.error('Edge notes lookup failed:', err);
    res.status(500).json({ error: 'could not load these notes' });
  }
});

router.put('/knowledge-map-v2/edge/:fromNodeId/:toNodeId/notes', requireAuth, async (req: Request, res: Response) => {
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
