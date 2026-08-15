import { callClaudeJSON, MODELS } from './claudeClient';
import { gradeAndRecordReview } from './reviewService';
import { parseModelJson } from './jsonParsing';
import { CHECK_ANSWER_AND_SLIP_PROMPT, MATH_ERROR_LOCALIZATION_PROMPT, REFRAME_QUESTION_PROMPT } from '../constants/diagnosticPrompts';
import {
  loadChainIfMechanistic,
  startMechanisticDiagnosis,
  processMechanisticAnswer,
  reframeCurrentQuestion as reframeCurrentMechanisticQuestion,
  retryCurrentQuestion as retryCurrentMechanisticQuestion,
  MechanisticState,
} from './mechanisticEngine';
import {
  processDiagnosticAnswer,
  advanceAfterWrongAnswer,
  reframeCurrentQuestion as reframeCurrentAtomicQuestion,
  retryCurrentQuestion as retryCurrentAtomicQuestion,
  DiagnosticState,
} from './diagnosticEngine';
import { fetchExpectedSolution } from './encodingLessonService';

// Tags which underlying engine a mid-flow session belongs to, once the
// atomic/mechanistic decision has actually been made — everything before
// that decision (slip-checking) is identical regardless, so it's handled
// once, here, rather than duplicated in either engine.
export type OrchestratorState =
  | {
      engine: 'pending';
      conceptKey: string;
      conceptLabel: string;
      subject: string;
      topic: string;
      originalQuestion: string;
      slipStage: 'initial' | 'slip_recheck';
      // Same qualification-tiering purpose as everywhere else this pair
      // shows up (see chainService.ts's getOrGenerateChain) — carried
      // through the pending stage so the eventual mechanistic dispatch, if
      // any, generates/looks up its chain at the right tier rather than
      // silently falling back to the untiered "" bucket. Optional so
      // existing/older client-constructed pending states (which predate
      // this field) still satisfy the type.
      qualification?: string;
      examBoard?: string;
    }
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
  // Same meaning as DiagnosticResult/MechanisticResult's field of the same
  // name — tells the frontend whether nextQuestion needs the maths
  // keyboard. Never set alongside nextOptions.
  nextRequiresCalculation?: boolean;
}

async function dispatchToBranch(
  userId: string,
  conceptKey: string,
  conceptLabel: string,
  subject: string,
  topic: string,
  originalQuestion: string,
  // Set only when this originalQuestion is itself a calculation (see
  // startMathDiagnosis's "conceptual" hand-off) — carried into whichever
  // engine ends up handling it, so combination_check/hint_cue (which both
  // re-ask this exact question) stay math-aware too.
  originalQuestionRequiresCalculation = false,
  originalQuestionExpectedSolution?: string,
  qualification = '',
  examBoard = ''
): Promise<OrchestratorResult> {
  const chain = await loadChainIfMechanistic(conceptKey, subject, topic, conceptLabel, qualification, examBoard);

  if (chain) {
    const result = await startMechanisticDiagnosis(
      userId, conceptKey, conceptLabel, subject, originalQuestion, chain,
      originalQuestionRequiresCalculation, originalQuestionExpectedSolution
    );
    return {
      done: result.done,
      diagnosis: result.diagnosis,
      correction: result.correction,
      nextQuestion: result.nextQuestion,
      nextOptions: result.nextOptions,
      state: { engine: 'mechanistic', inner: result.state },
      answerCorrect: result.answerCorrect,
      nextRequiresCalculation: result.nextRequiresCalculation,
    };
  }

  // No mechanistic chain — fall through to the atomic engine, entering it
  // at its own 'initial' stage and escalating straight into the encoding
  // check (skips processDiagnosticAnswer's dontKnow shortcut, which also
  // skips the slip-check — this originalQuestion is a REAL question the
  // student was just shown, so the slip-check already ran upstream of
  // dispatchToBranch, not here).
  const atomicState: DiagnosticState = {
    conceptLabel: conceptKey,
    subject,
    stage: 'initial',
    originalQuestion,
    misconceptionNotes: [],
    originalQuestionRequiresCalculation,
    originalQuestionExpectedSolution: originalQuestionRequiresCalculation ? originalQuestionExpectedSolution : undefined,
  };
  const result = await advanceAfterWrongAnswer(userId, atomicState);
  return {
    done: result.done,
    diagnosis: result.diagnosis,
    correction: result.correction,
    nextQuestion: result.nextQuestion,
    nextOptions: result.nextOptions,
    state: { engine: 'atomic', inner: result.state },
    answerCorrect: result.answerCorrect,
    nextRequiresCalculation: result.nextRequiresCalculation,
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
  forceAtomic: boolean,
  // Set when originalQuestion is itself a calculation (see startMathDiagnosis's
  // "conceptual" hand-off) — same purpose as dispatchToBranch's params of the
  // same name.
  originalQuestionRequiresCalculation = false,
  originalQuestionExpectedSolution?: string,
  qualification = '',
  examBoard = ''
): Promise<OrchestratorResult> {
  if (forceAtomic) {
    const atomicState: DiagnosticState = {
      conceptLabel,
      conceptKey,
      subject,
      stage: 'initial',
      originalQuestion,
      misconceptionNotes: [],
      originalQuestionRequiresCalculation,
      originalQuestionExpectedSolution: originalQuestionRequiresCalculation ? originalQuestionExpectedSolution : undefined,
    };
    const result = await advanceAfterWrongAnswer(userId, atomicState);
    return {
      done: result.done,
      diagnosis: result.diagnosis,
      correction: result.correction,
      nextQuestion: result.nextQuestion,
      nextOptions: result.nextOptions,
      state: { engine: 'atomic', inner: result.state },
      answerCorrect: result.answerCorrect,
      nextRequiresCalculation: result.nextRequiresCalculation,
    };
  }
  return dispatchToBranch(userId, conceptKey, conceptLabel, subject, topic, originalQuestion, originalQuestionRequiresCalculation, originalQuestionExpectedSolution, qualification, examBoard);
}

/**
 * Entry point for a WRONG answer to a calculation step specifically (see
 * ENCODING_LESSON_BATCH_PROMPT's requiresCalculation) — genuinely
 * different from startDiagnosisFromKnownAnswer's theory path: there's
 * actual shown working to inspect, so this looks for exactly where it
 * went wrong before doing anything else, the way a human tutor would scan
 * your working rather than re-teach the topic from scratch.
 *
 * `contentKey`/`stepIndex` — never trust a client-supplied answer/solution
 * pair; the verified expectedSolution is re-fetched server-side from the
 * same encoding_lesson_content cache row grading itself reads from (see
 * fetchExpectedSolution), exactly like submitEncodingAnswer already does.
 *
 * Routes on MATH_ERROR_LOCALIZATION_PROMPT's verdict:
 * - "slip" (method was right, an isolated mechanical error) resolves
 *   immediately with a targeted correction — same 'hard' FSRS severity as
 *   the atomic engine's own theory-question "slip" outcome, since the
 *   underlying understanding is intact either way.
 * - "conceptual" hands off into the EXISTING diagnostic tree (atomic or
 *   mechanistic, same as a theory question would use) — reusing all of
 *   its scaffolding rather than building a separate one — seeded with the
 *   specific error this localization pass already found, so the eventual
 *   correction addresses what actually went wrong instead of guessing
 *   from scratch.
 * - "no_attempt" (blank/abandoned working), or a cache miss on the
 *   verified solution, falls through to that same standard entry
 *   ungated by any localization verdict — there's nothing to localize an
 *   error within, so this is exactly the theory-question flow.
 */
export async function startMathDiagnosis(
  userId: string,
  conceptKey: string,
  conceptLabel: string,
  subject: string,
  topic: string,
  question: string,
  contentKey: string,
  stepIndex: number,
  studentWorking: string,
  forceAtomic: boolean,
  qualification = '',
  examBoard = ''
): Promise<OrchestratorResult> {
  const hasWorking = !!(studentWorking && studentWorking.trim());
  const expectedSolution = hasWorking ? await fetchExpectedSolution(contentKey, stepIndex) : null;

  if (expectedSolution) {
    const raw = await callClaudeJSON({
      model: MODELS.diagnosticTree,
      systemPrompt: MATH_ERROR_LOCALIZATION_PROMPT,
      userContent: `Question: ${question}\nVerified correct solution (reference only, never shown to the student): ${expectedSolution}\nStudent's working: ${studentWorking}`,
      temperature: 0.1,
      // Raised well above the 2048 default — same fix as
      // diagnosticEngine.ts/mechanisticEngine.ts's own callJSON, see there.
      maxTokens: 4096,
    });
    const localization = parseModelJson<{ errorType: 'slip' | 'conceptual' | 'no_attempt'; explanation: string | null; correction: string | null }>(raw);

    if (localization.errorType === 'slip') {
      await gradeAndRecordReview(userId, conceptKey, 'hard');
      const terminalState: DiagnosticState = { conceptLabel, subject, stage: 'initial', originalQuestion: question, misconceptionNotes: [] };
      return {
        done: true,
        diagnosis: 'slip',
        correction: localization.correction || undefined,
        state: { engine: 'atomic', inner: terminalState },
        answerCorrect: false,
      };
    }

    if (localization.errorType === 'conceptual') {
      const result = await startDiagnosisFromKnownAnswer(userId, conceptKey, conceptLabel, subject, topic, question, forceAtomic, true, expectedSolution, qualification, examBoard);
      if (localization.explanation) {
        if (result.state.engine === 'atomic') result.state.inner.misconceptionNotes.push(localization.explanation);
        else if (result.state.engine === 'mechanistic') result.state.inner.misconceptionNotes.push(localization.explanation);
      }
      return result;
    }
    // errorType === 'no_attempt' falls through below, same as no working at all.
  }

  return startDiagnosisFromKnownAnswer(userId, conceptKey, conceptLabel, subject, topic, question, forceAtomic, undefined, undefined, qualification, examBoard);
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
      nextRequiresCalculation: result.nextRequiresCalculation,
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
      nextRequiresCalculation: result.nextRequiresCalculation,
    };
  }

  // engine === 'pending' — this is the shared slip-check phase, identical
  // regardless of what comes after it.
  if (dontKnow) {
    return {
      ...(await dispatchToBranch(userId, state.conceptKey, state.conceptLabel, state.subject, state.topic, state.originalQuestion, undefined, undefined, state.qualification, state.examBoard)),
      answerCorrect: false,
    };
  }

  const raw = await callClaudeJSON({
    model: MODELS.simpleQuestion,
    systemPrompt: CHECK_ANSWER_AND_SLIP_PROMPT,
    userContent: `Concept: ${state.conceptLabel}\nQuestion: ${state.originalQuestion}\nStudent's answer: ${answer}`,
    maxTokens: 4096,
  });
  const check = parseModelJson<{ correct: boolean; looksLikeSlip: boolean }>(raw);

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

  return {
    ...(await dispatchToBranch(userId, state.conceptKey, state.conceptLabel, state.subject, state.topic, state.originalQuestion, undefined, undefined, state.qualification, state.examBoard)),
    answerCorrect: false,
  };
}

/**
 * Rewords whatever question is currently shown, at any point in the tree —
 * the replacement for the old mandatory "did you understand the wording?"
 * gate (see diagnosticEngine.ts's reframeCurrentQuestion for the full
 * rationale). Dispatches by engine; the 'pending' case has no inner engine
 * state yet, so it reframes state.originalQuestion directly — the shared
 * slip-check (runDiagnosticStep) always grades against that field, so this
 * keeps the two in sync exactly like the atomic engine's 'initial'/
 * 'slip_recheck' stages do for their own originalQuestion.
 */
export async function reframeDiagnosticQuestion(state: OrchestratorState): Promise<OrchestratorResult> {
  if (state.engine === 'pending') {
    const raw = await callClaudeJSON({
      model: MODELS.simpleQuestion,
      systemPrompt: REFRAME_QUESTION_PROMPT,
      userContent: `Concept: ${state.conceptLabel}\nOriginal question: ${state.originalQuestion}`,
      temperature: 0.3,
      // Same 2048-token default truncation bug as this file's other direct
      // callClaudeJSON calls — see runDiagnosticStep's own comment.
      maxTokens: 4096,
    });
    const reframed = parseModelJson<{ question: string }>(raw);
    return {
      done: false,
      nextQuestion: reframed.question,
      state: { ...state, originalQuestion: reframed.question },
    };
  }

  if (state.engine === 'atomic') {
    const result = await reframeCurrentAtomicQuestion(state.inner);
    return {
      done: result.done,
      diagnosis: result.diagnosis,
      correction: result.correction,
      nextQuestion: result.nextQuestion,
      nextOptions: result.nextOptions,
      state: { engine: 'atomic', inner: result.state },
      nextRequiresCalculation: result.nextRequiresCalculation,
    };
  }

  const result = await reframeCurrentMechanisticQuestion(state.inner);
  return {
    done: result.done,
    diagnosis: result.diagnosis,
    correction: result.correction,
    nextQuestion: result.nextQuestion,
    nextOptions: result.nextOptions,
    state: { engine: 'mechanistic', inner: result.state },
    nextRequiresCalculation: result.nextRequiresCalculation,
  };
}

// Re-serves the current question unchanged, for the "this was just a slip"
// side button — see diagnosticEngine.ts's retryCurrentQuestion for why this
// replaced blindly trusting that self-report and ending the diagnosis
// outright. No LLM call at any engine stage, since nothing about the
// question or state changes; only the frontend's next render differs (the
// same card, re-armed for another attempt).
export function retryDiagnosticQuestion(state: OrchestratorState): OrchestratorResult {
  if (state.engine === 'pending') {
    return { done: false, nextQuestion: state.originalQuestion, state };
  }

  if (state.engine === 'atomic') {
    const result = retryCurrentAtomicQuestion(state.inner);
    return {
      done: result.done,
      diagnosis: result.diagnosis,
      correction: result.correction,
      nextQuestion: result.nextQuestion,
      nextOptions: result.nextOptions,
      state: { engine: 'atomic', inner: result.state },
      nextRequiresCalculation: result.nextRequiresCalculation,
    };
  }

  const result = retryCurrentMechanisticQuestion(state.inner);
  return {
    done: result.done,
    diagnosis: result.diagnosis,
    correction: result.correction,
    nextQuestion: result.nextQuestion,
    nextOptions: result.nextOptions,
    state: { engine: 'mechanistic', inner: result.state },
    nextRequiresCalculation: result.nextRequiresCalculation,
  };
}
