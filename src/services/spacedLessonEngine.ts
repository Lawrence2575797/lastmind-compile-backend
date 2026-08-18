import { callClaudeJSON, MODELS } from './claudeClient';
import { gradeAndRecordReview, getMasteryStatus, listEligibleSiblingConcepts, FsrsRatingKey, DURABLE_RELEARNING_CRITERION } from './reviewService';
import { getOrGenerateChain } from './chainService';
import { retrievalLessonPromptForTier, RETRIEVAL_ANSWER_CHECK_PROMPT, RETRIEVAL_MECHANISTIC_CHECK_PROMPT } from '../constants/retrievalLessonPrompts';
import { ASK_PANEL_PROMPT } from '../constants/encodingLessonPrompts';

function stripCodeFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}

async function callJSON<T>(systemPrompt: string, userContent: string, model: string, temperature = 0, maxTokens?: number, cacheSystemPrompt = false): Promise<T> {
  const raw = await callClaudeJSON({ model, systemPrompt, userContent, temperature, maxTokens, cacheSystemPrompt });
  return JSON.parse(stripCodeFences(raw)) as T;
}

interface ChainEdge { node_id: string; relationship: 'definitional' | 'reasoning'; }
interface ChainNode { id: string; label: string; depends_on: ChainEdge[]; }
interface Chain { concept_id: string; subject: string; nodes: ChainNode[]; }

export type RetrievalTier = 0 | 1 | 2 | 3;

// How many steps a session gets at each tier — deliberately SHORTER as the
// concept gets more consolidated: a well-known concept needs less review
// time than a shaky one, and fewer steps at the harder tiers also means
// fewer Claude calls exactly where each individual call is already doing
// more (interleaving, mechanistic tracing), keeping cost roughly level
// rather than compounding as difficulty rises.
const STEPS_PER_TIER: Record<RetrievalTier, number> = { 0: 3, 1: 2, 2: 2, 3: 1 };

// Stability ceiling (days) treated as "fully consolidated" for the purpose
// of this ramp — not a real FSRS constant, a product tuning knob. Log
// scale because FSRS stability itself grows roughly multiplicatively per
// successful review, so a raw linear ramp would saturate almost
// immediately; log keeps the tier progression feeling gradual in practice.
const MECHANISTIC_READINESS_S_MAX_DAYS = 120;

// A single lucky "easy" grade can already earn a nontrivial stability
// figure under FSRS — this floor requires genuinely repeated, CORRECTLY
// SPACED practice (see reviewService.ts's DURABLE_RELEARNING_CRITERION/
// computeSpacedSuccessUpdate — the same criterion used for the "durably
// mastered" flag, reused here rather than inventing a second number)
// before the difficulty ramp is allowed to reach its higher tiers. This
// used to gate on raw FSRS `reps` — reps counts any grading event ever,
// including two correct answers in the same sitting, which is exactly
// the distinction successive-relearning research says doesn't predict
// durable retention; spacedSuccessCount only counts correct answers that
// landed on separate, on-schedule days.
const MECHANISTIC_READINESS_SPACED_SUCCESS_FLOOR = DURABLE_RELEARNING_CRITERION;

/**
 * A single scalar in [0, 1] — how ready this concept is, for THIS student,
 * to be tested mechanistically/interleaved rather than with heavy
 * scaffolding. Deliberately built from FSRS's own stability (a
 * difficulty-adjusted, already-computed consolidation signal) rather than
 * a raw review count, which treats a run of "easy" grades identically to a
 * run of narrowly-passed ones. See tierForM for how this gets discretized
 * into the four prompt tiers actually used for generation — the tiers,
 * not this continuous value, are what stay cacheable.
 */
export function computeMechanisticReadiness(stability: number, spacedSuccessCount: number): number {
  const stabilityRamp = Math.log(1 + Math.max(0, stability)) / Math.log(1 + MECHANISTIC_READINESS_S_MAX_DAYS);
  const spacedSuccessGate = Math.min(1, spacedSuccessCount / MECHANISTIC_READINESS_SPACED_SUCCESS_FLOOR);
  return Math.max(0, Math.min(1, stabilityRamp * spacedSuccessGate));
}

export function tierForM(m: number): RetrievalTier {
  if (m >= 0.75) return 3;
  if (m >= 0.5) return 2;
  if (m >= 0.25) return 1;
  return 0;
}

export type RetrievalStepType = 'guided' | 'mechanistic_check';

export interface RetrievalStep {
  type: RetrievalStepType;
  text: string;
  requiresCalculation?: boolean;
  interleavedConcepts?: string[];
}

export interface RetrievalLessonState {
  conceptKey: string;
  subject: string;
  topic: string;
  concept: string;
  qualification: string;
  examBoard: string;
  tier: RetrievalTier;
  totalSteps: number;
  siblings: string[];
  closePrerequisiteLabels: string[];
  steps: RetrievalStep[];
  currentIndex: number;
  anyWeakSoFar: boolean;
}

export interface RetrievalStartResult {
  done: false;
  step: RetrievalStep;
  state: RetrievalLessonState;
  contentReady: boolean;
}

export interface FsrsUpdateSummary {
  rating: FsrsRatingKey;
  previous: { stability: number; difficulty: number; due: string; reps: number; lapses: number; state: number } | null;
  updated: { stability: number; difficulty: number; due: string; reps: number; lapses: number; state: number; scheduledDays: number; elapsedDays: number };
}

export interface RetrievalSubmitResult {
  done: boolean;
  correct?: boolean;
  feedback?: string | null;
  step?: RetrievalStep;
  state: RetrievalLessonState;
  fsrsUpdate?: FsrsUpdateSummary;
}

interface RawGeneratedStep {
  type: RetrievalStepType;
  text: string;
  confident?: boolean;
  requiresCalculation?: boolean;
  interleavedConcepts?: string[];
}

/**
 * Generates `stepsNeeded` NEW steps for a session already holding
 * `alreadyGenerated` — the same prompt (per tier) serves both the fast
 * first-step call and the batched background continuation, distinguished
 * only by which of these two args is non-empty. See
 * retrievalLessonPrompts.ts's own comment on why this is one prompt per
 * tier rather than a separate first-step/continuation pair like encoding.
 */
async function generateRetrievalSteps(
  tier: RetrievalTier,
  subject: string,
  topic: string,
  concept: string,
  qualification: string,
  examBoard: string,
  closePrerequisiteLabels: string[],
  siblings: string[],
  alreadyGenerated: RetrievalStep[],
  stepsNeeded: number
): Promise<RetrievalStep[]> {
  const result = await callJSON<{ steps: RawGeneratedStep[] }>(
    retrievalLessonPromptForTier(tier),
    [
      `Subject: ${subject}`,
      `Topic: ${topic || 'unspecified'}`,
      `Qualification: ${qualification || 'unspecified'}`,
      `Exam board: ${examBoard || 'unspecified'}`,
      `Target concept being reviewed: ${concept}`,
      `closePrerequisites (background only — see the system prompt's own rule, never write a step testing these): ${JSON.stringify(closePrerequisiteLabels)}`,
      `eligibleSiblingConcepts: ${JSON.stringify(siblings)}`,
      `alreadyGenerated (do not repeat): ${JSON.stringify(alreadyGenerated.map((s) => ({ type: s.type, text: s.text })))}`,
      `stepsNeeded: ${stepsNeeded}`,
    ].join('\n'),
    MODELS.diagnosticTree,
    0.4,
    4096,
    // Every tier's prompt is fixed and identical across every request that
    // lands in that tier — same caching win as encoding's own generation
    // prompts, see retrievalLessonPrompts.ts's own comment on why tiering
    // (not the continuous m value) is what makes this possible at all.
    true
  );

  return (result.steps || []).map((s) => ({
    type: s.type,
    text: s.text,
    requiresCalculation: !!s.requiresCalculation,
    interleavedConcepts: s.interleavedConcepts || [],
  }));
}

async function fetchChainContext(
  conceptKey: string,
  subject: string,
  topic: string,
  concept: string,
  qualification: string,
  examBoard: string
): Promise<string[]> {
  // Best-effort — a chain-generation failure shouldn't block a review
  // session from happening at all; fall back to no prerequisite context
  // rather than throwing, since prerequisites are background material
  // here, not something this session actually depends on to function.
  try {
    const chainResult = await getOrGenerateChain(conceptKey, subject, topic, concept, qualification, examBoard);
    const chain = chainResult.chain as Chain | null;
    if (!chain || !chain.nodes.length) return [];
    const target = chain.nodes[chain.nodes.length - 1];
    const byId = new Map(chain.nodes.map((n) => [n.id, n]));
    return (target.depends_on || [])
      .map((d) => byId.get(d.node_id)?.label)
      .filter((label): label is string => !!label);
  } catch (err) {
    console.error('LastMind: chain fetch failed for retrieval-lesson context, continuing without it.', err);
    return [];
  }
}

export async function startRetrievalLesson(
  userId: string,
  conceptKey: string,
  subject: string,
  topic: string,
  concept: string,
  qualification = '',
  examBoard = ''
): Promise<RetrievalStartResult> {
  const { row, spacedSuccessCount } = await getMasteryStatus(userId, conceptKey);
  const stability = row?.stability ?? 0;
  const m = computeMechanisticReadiness(stability, spacedSuccessCount);
  const tier = tierForM(m);
  const totalSteps = STEPS_PER_TIER[tier];

  const closePrerequisiteLabels = await fetchChainContext(conceptKey, subject, topic, concept, qualification, examBoard);
  const siblings = tier >= 2 ? await listEligibleSiblingConcepts(userId, subject, topic, conceptKey) : [];

  const [firstStep] = await generateRetrievalSteps(
    tier, subject, topic, concept, qualification, examBoard, closePrerequisiteLabels, siblings, [], 1
  );
  if (!firstStep) {
    throw new Error('Could not generate retrieval practice for this concept.');
  }

  const state: RetrievalLessonState = {
    conceptKey, subject, topic, concept, qualification, examBoard,
    tier, totalSteps, siblings, closePrerequisiteLabels,
    steps: [firstStep], currentIndex: 0, anyWeakSoFar: false,
  };

  return { done: false, step: firstStep, state, contentReady: totalSteps <= 1 };
}

/**
 * Phase 2 — fired by the frontend the moment the first step is on screen,
 * exactly like encoding's own continueEncodingLesson. Generates the rest
 * of the session (totalSteps - 1 steps) in one batched call. No-op if the
 * session only ever had one step (tier 3), or if a duplicate call somehow
 * arrives after the session is already fully generated.
 */
export async function continueRetrievalLesson(state: RetrievalLessonState): Promise<RetrievalLessonState> {
  const remaining = state.totalSteps - state.steps.length;
  if (remaining <= 0) return state;

  const newSteps = await generateRetrievalSteps(
    state.tier, state.subject, state.topic, state.concept, state.qualification, state.examBoard,
    state.closePrerequisiteLabels, state.siblings, state.steps, remaining
  );

  return { ...state, steps: [...state.steps, ...newSteps] };
}

export async function submitRetrievalAnswer(
  userId: string,
  state: RetrievalLessonState,
  answer: string,
  dontKnow = false
): Promise<RetrievalSubmitResult> {
  const currentStep = state.steps[state.currentIndex];
  if (!currentStep) {
    return { done: true, state };
  }

  let correct: boolean;
  let feedback: string | null;

  if (dontKnow) {
    correct = false;
    feedback = null;
  } else if (currentStep.type === 'mechanistic_check') {
    // Same pedantic bar as encoding's own mechanistic_check grading, and
    // for the same reason — this step exists specifically to catch
    // memorized/pattern-matched recall, so its grading has to actually
    // look for that. diagnosticTree, not simpleQuestion, matching
    // encoding's own tier-to-model mapping for this call type.
    const check = await callJSON<{ correct: boolean; feedback: string | null }>(
      RETRIEVAL_MECHANISTIC_CHECK_PROMPT,
      `Qualification: ${state.qualification || 'unspecified'}\nExam board: ${state.examBoard || 'unspecified'}\nConcept: ${state.concept}\nPrompt: ${currentStep.text}\nStudent's answer: ${answer}`,
      MODELS.diagnosticTree,
      0.2,
      undefined,
      true
    );
    correct = check.correct;
    feedback = check.feedback;
  } else {
    const check = await callJSON<{ correct: boolean; feedback: string | null }>(
      RETRIEVAL_ANSWER_CHECK_PROMPT,
      `Concept: ${state.concept}\nPrompt: ${currentStep.text}\nStudent's answer: ${answer}`,
      MODELS.simpleQuestion,
      0.2,
      undefined,
      true
    );
    correct = check.correct;
    feedback = check.feedback;
  }

  const nextIndex = state.currentIndex + 1;
  const anyWeakSoFar = state.anyWeakSoFar || !correct;
  const nextState: RetrievalLessonState = { ...state, currentIndex: nextIndex, anyWeakSoFar };

  if (nextIndex >= state.steps.length) {
    // Tier-driven, not step-type-driven — unlike encoding's core-vs-
    // prerequisite split, every retrieval step is already about the
    // target, so the tier itself (how heavily scaffolded the question
    // was) is the honest signal here. A wrong answer at tier 0 — a
    // heavily-scaffolded question that already hands over most of the
    // reasoning — is strong evidence the memory is genuinely gone: FSRS's
    // dedicated lapse formula, "again". A wrong answer at a harder tier
    // could just as easily be the question's own deliberate difficulty
    // (tier 3's unfamiliar-angle phrasing exists specifically to be hard
    // even for someone who remembers) rather than true forgetting — "hard"
    // instead. A clean pass at tier 0 is the one case where "genuinely
    // comfortable" is a real, earned signal rather than a guess — "easy".
    // A clean pass at any harder tier is still a success, just not
    // specifically flagged as effortless — "good".
    const rating: FsrsRatingKey = anyWeakSoFar
      ? (state.tier === 0 ? 'again' : 'hard')
      : (state.tier === 0 ? 'easy' : 'good');
    const { previousRow, newState: fsrsRow } = await gradeAndRecordReview(userId, state.conceptKey, rating);
    const fsrsUpdate: FsrsUpdateSummary = {
      rating,
      previous: previousRow
        ? { stability: previousRow.stability, difficulty: previousRow.difficulty, due: previousRow.due, reps: previousRow.reps, lapses: previousRow.lapses, state: previousRow.state }
        : null,
      updated: {
        stability: fsrsRow.stability,
        difficulty: fsrsRow.difficulty,
        due: fsrsRow.due,
        reps: fsrsRow.reps,
        lapses: fsrsRow.lapses,
        state: fsrsRow.state,
        scheduledDays: fsrsRow.scheduled_days,
        elapsedDays: fsrsRow.elapsed_days,
      },
    };
    return { done: true, correct, feedback, state: nextState, fsrsUpdate };
  }

  return { done: false, correct, feedback, step: state.steps[nextIndex], state: nextState };
}

/**
 * Same "ask a question" side panel as the first-time encoding lesson (see
 * answerLessonQuestion in encodingLessonService.ts) — reuses the same
 * ASK_PANEL_PROMPT, since the anti-fishing check and stateless/advisory
 * framing are identical here: only the CURRENTLY pending retrieval step
 * (state.steps[state.currentIndex]) is checked, and nothing about this
 * call touches FSRS or the lesson's own state.
 */
export async function answerRetrievalQuestion(state: RetrievalLessonState, question: string): Promise<{ redirected: boolean; answer: string }> {
  const currentStep = state.steps[state.currentIndex];

  return callJSON<{ redirected: boolean; answer: string }>(
    ASK_PANEL_PROMPT,
    [
      `Subject: ${state.subject}`,
      `Qualification: ${state.qualification || 'unspecified'}`,
      `Exam board: ${state.examBoard || 'unspecified'}`,
      `Current step's own concept/label: ${state.concept}`,
      `Current step's type: ${currentStep ? currentStep.type : 'n/a'}`,
      `Current step's own question (not yet answered by the student): ${currentStep ? currentStep.text : '(lesson already complete — nothing currently pending)'}`,
      `Student's question, asked from the side panel: ${question}`,
    ].join('\n'),
    MODELS.diagnosticTree,
    0.4,
    undefined,
    true
  );
}
