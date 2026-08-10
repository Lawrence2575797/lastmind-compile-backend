import { callClaudeJSON, MODELS } from './claudeClient';
import { gradeAndRecordReview } from './reviewService';
import { CHECK_ANSWER_AND_SLIP_PROMPT } from '../constants/diagnosticPrompts';
import { loadChainIfMechanistic, startMechanisticDiagnosis, processMechanisticAnswer, MechanisticState } from './mechanisticEngine';
import { processDiagnosticAnswer, DiagnosticState } from './diagnosticEngine';

function stripCodeFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}

// Tags which underlying engine a mid-flow session belongs to, once the
// atomic/mechanistic decision has actually been made — everything before
// that decision (slip-checking) is identical regardless, so it's handled
// once, here, rather than duplicated in either engine.
export type OrchestratorState =
  | { engine: 'pending'; conceptKey: string; conceptLabel: string; subject: string; topic: string; originalQuestion: string; slipStage: 'initial' | 'slip_recheck' }
  | { engine: 'atomic'; inner: DiagnosticState }
  | { engine: 'mechanistic'; inner: MechanisticState };

export interface OrchestratorResult {
  done: boolean;
  diagnosis?: string;
  correction?: string;
  nextQuestion?: string;
  nextOptions?: string[];
  state: OrchestratorState;
  // Whether the answer just submitted was judged correct — undefined only
  // when this call didn't grade a fresh answer (see DiagnosticResult in
  // diagnosticEngine.ts for the full explanation). Lets the frontend show
  // real per-turn feedback through the whole diagnostic drill-down instead
  // of going silent until it concludes.
  answerCorrect?: boolean;
}

async function dispatchToBranch(
  userId: string,
  conceptKey: string,
  conceptLabel: string,
  subject: string,
  topic: string,
  originalQuestion: string
): Promise<OrchestratorResult> {
  const chain = await loadChainIfMechanistic(conceptKey, subject, topic, conceptLabel);

  if (chain) {
    const result = await startMechanisticDiagnosis(userId, conceptKey, conceptLabel, subject, originalQuestion, chain);
    return {
      done: result.done,
      diagnosis: result.diagnosis,
      correction: result.correction,
      nextQuestion: result.nextQuestion,
      nextOptions: result.nextOptions,
      state: { engine: 'mechanistic', inner: result.state },
      answerCorrect: result.answerCorrect,
    };
  }

  // No mechanistic chain — fall through to the atomic engine, entering it
  // at its own 'initial' stage so it runs its own (identical) shared
  // encoding check itself.
  const atomicState: DiagnosticState = { conceptLabel: conceptKey, subject, stage: 'initial', originalQuestion, misconceptionNotes: [] };
  const result = await processDiagnosticAnswer(userId, atomicState, '', true); // dontKnow-equivalent path straight to the encoding check, since slip-checking already happened here in the orchestrator
  return {
    done: result.done,
    diagnosis: result.diagnosis,
    correction: result.correction,
    nextQuestion: result.nextQuestion,
    nextOptions: result.nextOptions,
    state: { engine: 'atomic', inner: result.state },
    answerCorrect: result.answerCorrect,
  };
}

/**
 * Entry point for a caller that ALREADY knows an answer is wrong (it ran
 * its own grading) and wants the diagnostic tree without the shared
 * slip-check re-grading the same answer a second time — e.g. the encoding
 * lesson, whose own grading is already deliberately generous, so a "wrong"
 * from it is a stronger signal than the slip-check's first pass, and
 * re-asking the identical question on a "looks like a slip" verdict would
 * feel broken given that flow offers no retry UI of its own.
 *
 * forceAtomic MUST be true for anything that isn't a real top-level lesson
 * concept with its own cached dependency chain (e.g. a prerequisite chain
 * node) — dispatchToBranch's mechanistic check unconditionally calls
 * getOrGenerateChain, which on a cache miss runs two full Opus calls
 * before it even checks whether the result has any dependencies. Skipping
 * straight to the atomic engine avoids that entirely.
 */
export async function startDiagnosisFromKnownAnswer(
  userId: string,
  conceptKey: string,
  conceptLabel: string,
  subject: string,
  topic: string,
  originalQuestion: string,
  forceAtomic: boolean
): Promise<OrchestratorResult> {
  if (forceAtomic) {
    const atomicState: DiagnosticState = {
      conceptLabel,
      conceptKey,
      subject,
      stage: 'initial',
      originalQuestion,
      misconceptionNotes: [],
    };
    const result = await processDiagnosticAnswer(userId, atomicState, '', true);
    return {
      done: result.done,
      diagnosis: result.diagnosis,
      correction: result.correction,
      nextQuestion: result.nextQuestion,
      nextOptions: result.nextOptions,
      state: { engine: 'atomic', inner: result.state },
      answerCorrect: result.answerCorrect,
    };
  }
  return dispatchToBranch(userId, conceptKey, conceptLabel, subject, topic, originalQuestion);
}

/**
 * The single entry point the route calls for every diagnostic step,
 * regardless of stage or which engine ends up handling it.
 */
export async function runDiagnosticStep(
  userId: string,
  state: OrchestratorState,
  answer: string,
  dontKnow: boolean
): Promise<OrchestratorResult> {
  if (state.engine === 'atomic') {
    const result = await processDiagnosticAnswer(userId, state.inner, answer, dontKnow);
    return {
      done: result.done,
      diagnosis: result.diagnosis,
      correction: result.correction,
      nextQuestion: result.nextQuestion,
      nextOptions: result.nextOptions,
      state: { engine: 'atomic', inner: result.state },
      answerCorrect: result.answerCorrect,
    };
  }

  if (state.engine === 'mechanistic') {
    const result = await processMechanisticAnswer(userId, state.inner, answer, dontKnow);
    return {
      done: result.done,
      diagnosis: result.diagnosis,
      correction: result.correction,
      nextQuestion: result.nextQuestion,
      nextOptions: result.nextOptions,
      state: { engine: 'mechanistic', inner: result.state },
      answerCorrect: result.answerCorrect,
    };
  }

  // engine === 'pending' — this is the shared slip-check phase, identical
  // regardless of what comes after it.
  if (dontKnow) {
    return { ...(await dispatchToBranch(userId, state.conceptKey, state.conceptLabel, state.subject, state.topic, state.originalQuestion)), answerCorrect: false };
  }

  const raw = await callClaudeJSON({
    model: MODELS.simpleQuestion,
    systemPrompt: CHECK_ANSWER_AND_SLIP_PROMPT,
    userContent: `Concept: ${state.conceptLabel}\nQuestion: ${state.originalQuestion}\nStudent's answer: ${answer}`,
  });
  const check = JSON.parse(stripCodeFences(raw)) as { correct: boolean; looksLikeSlip: boolean };

  if (check.correct) {
    // A clean pass doesn't need either engine at all.
    await gradeAndRecordReview(userId, state.conceptKey, 'good');
    return { done: true, diagnosis: 'pass', state, answerCorrect: true };
  }

  if (check.looksLikeSlip && state.slipStage === 'initial') {
    return {
      done: false,
      nextQuestion: state.originalQuestion,
      state: { ...state, slipStage: 'slip_recheck' },
      answerCorrect: false,
    };
  }

  if (state.slipStage === 'slip_recheck') {
    // Wrong again on the re-ask — genuinely not a slip.
    await gradeAndRecordReview(userId, state.conceptKey, 'again');
  }

  return { ...(await dispatchToBranch(userId, state.conceptKey, state.conceptLabel, state.subject, state.topic, state.originalQuestion)), answerCorrect: false };
}
