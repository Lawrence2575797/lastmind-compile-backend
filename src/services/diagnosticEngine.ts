import { callClaudeJSON, MODELS } from './claudeClient';
import { gradeAndRecordReview } from './reviewService';
import { runSharedEncodingCheck } from './sharedDiagnosticSteps';
import { parseModelJson } from './jsonParsing';
import {
  CHECK_ANSWER_AND_SLIP_PROMPT,
  MATH_ANSWER_CHECK_AND_SLIP_PROMPT,
  WM_RELAXATION_PROMPT,
  HINT_CUE_PROMPT,
  CONTRASTIVE_CUE_PROMPT,
  CORRECTION_PROMPT,
  REFRAME_QUESTION_PROMPT,
} from '../constants/diagnosticPrompts';

const WORDING_CHECK_PROMPT_TEXT = 'Did you understand what this question was asking?';

// maxTokens raised well above callClaudeJSON's own 2048 default — same
// fix already applied in chainService.ts and cortexService.ts for the
// exact same failure mode (silent truncation before any usable JSON, or
// before any text at all, surfacing as an opaque "could not process this
// answer"/"server failed to respond" with no indication this was the
// cause). Every prompt this engine calls can end up producing a genuinely
// substantial response — a correction quoting and explaining a specific
// misconception, a freshly-constructed contrastive/simplified question —
// so this raises the default for ALL of them rather than tuning each call
// site individually.
async function callJSON<T>(systemPrompt: string, userContent: string, model: string, temperature = 0, maxTokens = 4096): Promise<T> {
  const raw = await callClaudeJSON({ model, systemPrompt, userContent, temperature, maxTokens });
  return parseModelJson<T>(raw);
}

interface AnswerCheck { correct: boolean; looksLikeSlip?: boolean; misconceptionNote: string | null; }

// expectedSolution present means the question just answered was a
// calculation (see DiagnosticState's originalQuestion*/lastGenerated*
// fields) — grades against that verified ground truth via a stronger
// model instead of open judgment, same reasoning as
// submitEncodingAnswer's own math-aware grading in Phase 1.
async function checkAnswer(conceptLabel: string, questionDescription: string, answer: string, expectedSolution?: string): Promise<AnswerCheck> {
  if (expectedSolution) {
    return callJSON<AnswerCheck>(
      MATH_ANSWER_CHECK_AND_SLIP_PROMPT,
      `Question: ${questionDescription}\nVerified correct solution (reference only, never shown to the student): ${expectedSolution}\nStudent's working: ${answer}`,
      MODELS.diagnosticTree,
      0.1
    );
  }
  return callJSON<AnswerCheck>(
    CHECK_ANSWER_AND_SLIP_PROMPT,
    `Concept: ${conceptLabel}\nQuestion: ${questionDescription}\nStudent's answer: ${answer}`,
    MODELS.simpleQuestion
  );
}

export type DiagnosticStage =
  | 'initial'
  | 'slip_recheck'
  | 'encoding_check'
  | 'wm_relax'
  | 'hint_cue'
  | 'contrastive_cue';

export type Diagnosis =
  | 'pass'
  | 'slip'
  | 'encoding'
  | 'wm_overload'
  | 'decay'
  | 'interference'
  | 'schedule_miscalibrated'
  | 'unresolved';

export interface DiagnosticState {
  conceptLabel: string;
  subject: string;
  stage: DiagnosticStage;
  originalQuestion: string;
  recognitionCorrectAnswer?: string;
  // Accumulated across every wrong attempt in this session — this is what
  // makes the eventual correction address the STUDENT'S actual specific
  // error, not just a generic template for the diagnosis category.
  misconceptionNotes: string[];
  confusedWith?: string; // captured specifically during the contrastive-cue stage
  // Optional real FSRS id, separate from conceptLabel (which doubles as
  // display text in prompts/corrections) — existing callers that don't set
  // this keep grading under conceptLabel exactly as before; new callers
  // that have both a real id and a friendly label (e.g. a prerequisite
  // chain node) can supply both correctly instead of conflating them.
  conceptKey?: string;
  // Set when entering wm_relax, from the SAME call that wrote the
  // simplified question — false means that call itself flagged the
  // simplification as too trivial/telegraphing to trust as evidence of a
  // working-memory-specific issue, regardless of whether the student then
  // answers it correctly.
  wmRelaxTrustworthy?: boolean;
  // Set whenever a free-text answer just came back wrong, BEFORE escalating
  // to the next diagnostic technique — pauses on a direct "did you
  // understand the wording?" check first, since confusing wording and a
  // genuine gap produce the same "got it wrong" signal but need very
  // different responses. `state.stage` itself is left unchanged while this
  // is set (it's checked before the main switch), so resuming after "yes"
  // or re-entering after a "no" reframe both land back in the same stage's
  // own case block with no separate resume-target bookkeeping needed.
  // See processDiagnosticAnswer's top-of-function routing and
  // handleWordingGateResponse.
  wordingGate?: { failedQuestion: string };
  // The literal text of whatever question is currently on screen — needed
  // to reframe it if the wording gate fires, since wm_relax/hint_cue/
  // contrastive_cue grade by concept label (not stored wording), so
  // there's otherwise nothing in state holding the exact shown text.
  // originalQuestion already serves this role for 'initial'/'slip_recheck'.
  lastShownQuestion?: string;
  // Calculation status of originalQuestion specifically — set at entry
  // (see startMathDiagnosis) when the question that triggered this whole
  // diagnosis was itself a calculation. Referenced by 'initial'/
  // 'slip_recheck' (which grade originalQuestion directly) AND 'hint_cue'
  // (which re-asks originalQuestion + a hint, jumping past whatever
  // wm_relax generated — see lastGenerated* below for why these two pairs
  // have to stay separate rather than one "current question" pair).
  originalQuestionRequiresCalculation?: boolean;
  originalQuestionExpectedSolution?: string;
  // Calculation status of the most recently GENERATED sub-question
  // (wm_relax's simplification, or contrastive_cue's distinguishing
  // question) — distinct from originalQuestion* because hint_cue does NOT
  // continue from wm_relax's simplified question, it jumps back to
  // re-asking the original with a hint. Consumed by whichever stage grades
  // that specific generated question ('wm_relax', 'contrastive_cue').
  lastGeneratedRequiresCalculation?: boolean;
  lastGeneratedExpectedSolution?: string;
}

export interface DiagnosticResult {
  done: boolean;
  diagnosis?: Diagnosis;
  correction?: string;
  nextQuestion?: string;
  nextOptions?: string[];
  state: DiagnosticState;
  // Whether the answer just submitted (in THIS call) was judged correct —
  // undefined only when this call didn't grade a fresh answer at all (a
  // dontKnow entry, or a mastery-status shortcut that isn't based on the
  // just-given answer). Lets the frontend give real per-turn feedback
  // instead of going silent until the whole diagnosis concludes.
  answerCorrect?: boolean;
  // True when nextQuestion is a calculation the student should answer with
  // the maths keyboard rather than free text — never set alongside
  // nextOptions (an MCQ never needs it). Undefined/false means plain text.
  nextRequiresCalculation?: boolean;
}

function appendNote(state: DiagnosticState, note: string | null | undefined): DiagnosticState {
  if (!note) return state;
  return { ...state, misconceptionNotes: [...state.misconceptionNotes, note] };
}

// Which calculation info applies to whatever free-text question the
// student is CURRENTLY looking at, given the stage they're in — 'wm_relax'
// and 'contrastive_cue' are grading a question THIS engine itself just
// generated (lastGenerated*); every other free-text stage ('initial',
// 'slip_recheck', 'hint_cue') is grading originalQuestion itself, either
// directly or re-asked with a hint. Shared by checkAnswer call sites and
// the wording-gate reframe response, so the two can never disagree about
// which question is actually on screen.
function currentQuestionCalcInfo(state: DiagnosticState): { requiresCalculation: boolean; expectedSolution?: string } {
  if (state.stage === 'wm_relax' || state.stage === 'contrastive_cue') {
    return { requiresCalculation: !!state.lastGeneratedRequiresCalculation, expectedSolution: state.lastGeneratedExpectedSolution };
  }
  return { requiresCalculation: !!state.originalQuestionRequiresCalculation, expectedSolution: state.originalQuestionExpectedSolution };
}

async function finish(
  userId: string,
  conceptLabel: string,
  ratingKey: 'again' | 'hard' | 'good' | 'easy',
  diagnosis: Diagnosis,
  state: DiagnosticState,
  answerCorrect?: boolean
): Promise<DiagnosticResult> {
  await gradeAndRecordReview(userId, state.conceptKey ?? conceptLabel, ratingKey);

  let correction: string | undefined;
  if (diagnosis !== 'pass' && diagnosis !== 'slip') {
    const correctionDiagnosisKey = diagnosis === 'unresolved' ? 'encoding' : diagnosis;
    const contextLines = [
      `Concept: ${conceptLabel}`,
      `Diagnosis: ${correctionDiagnosisKey}`,
    ];
    if (state.misconceptionNotes.length) {
      contextLines.push(`Specific misconception observed: ${state.misconceptionNotes[state.misconceptionNotes.length - 1]}`);
    }
    if (state.confusedWith) {
      contextLines.push(`Specifically confused with: ${state.confusedWith}`);
    }

    const result = await callJSON<{ correction: string }>(
      CORRECTION_PROMPT,
      contextLines.join('\n'),
      MODELS.diagnosticTree,
      0.3
    );
    correction = result.correction;
  }

  return { done: true, diagnosis, correction, state, answerCorrect };
}

// Runs the SHARED encoding check (section 2 of the tree — applies before
// any atomic/mechanistic branching) and routes accordingly for the
// single-concept (atomic) path specifically.
async function runEncodingCheckOrSkip(userId: string, state: DiagnosticState): Promise<DiagnosticResult> {
  const outcome = await runSharedEncodingCheck(userId, state.conceptLabel, state.conceptLabel);

  // Every path into this function follows a wrong (or "don't know") answer
  // to whatever question was just asked — even though none of these three
  // branches grade a NEW answer themselves, the caller's own answer was
  // the reason we're here, so answerCorrect: false is accurate for all of
  // them (finish() calls set it directly; the fresh-question branch is
  // tagged by the caller, which knows this).
  switch (outcome.result) {
    case 'schedule_miscalibrated':
      return finish(userId, state.conceptLabel, 'again', 'schedule_miscalibrated', state, false);
    case 'decay_schedule_skipped':
      return finish(userId, state.conceptLabel, 'hard', 'decay', state, false);
    case 'needs_recognition_test':
      return {
        done: false,
        nextQuestion: outcome.question,
        nextOptions: outcome.options,
        state: { ...state, stage: 'encoding_check', recognitionCorrectAnswer: outcome.correctAnswer },
      };
    default:
      throw new Error(`Unexpected encoding-check outcome for atomic path: ${outcome.result}`);
  }
}

// Runs once a free-text answer has already been confirmed wrong, resuming
// exactly the escalation each stage would have run immediately — factored
// out so the wording gate can defer it by one round-trip without
// re-grading anything.
async function resumeWrongAnswerContinuation(
  userId: string,
  state: DiagnosticState
): Promise<DiagnosticResult> {
  switch (state.stage) {
    case 'initial':
    case 'slip_recheck':
      return { ...(await runEncodingCheckOrSkip(userId, state)), answerCorrect: false };

    case 'wm_relax': {
      const hintResult = await callJSON<{ hint: string }>(
        HINT_CUE_PROMPT,
        `Concept: ${state.conceptLabel}`,
        MODELS.diagnosticTree,
        0.3
      );
      const nextQuestion = `${state.originalQuestion}\n\nHint: ${hintResult.hint}`;
      // Re-asking originalQuestion itself (with a hint appended), NOT
      // wm_relax's simplified question — its calc status is already
      // whatever originalQuestion* holds, untouched here.
      return {
        done: false,
        nextQuestion,
        state: { ...state, stage: 'hint_cue', lastShownQuestion: nextQuestion },
        answerCorrect: false,
        nextRequiresCalculation: !!state.originalQuestionRequiresCalculation,
      };
    }

    case 'hint_cue': {
      const contrastive = await callJSON<{
        confusedWith: string;
        question: string;
        requiresCalculation?: boolean;
        expectedSolution?: string;
      }>(
        CONTRASTIVE_CUE_PROMPT,
        `Subject: ${state.subject}\nConcept: ${state.conceptLabel}`,
        MODELS.diagnosticTree,
        0.3
      );
      return {
        done: false,
        nextQuestion: contrastive.question,
        state: {
          ...state,
          stage: 'contrastive_cue',
          confusedWith: contrastive.confusedWith,
          lastShownQuestion: contrastive.question,
          lastGeneratedRequiresCalculation: !!contrastive.requiresCalculation,
          lastGeneratedExpectedSolution: contrastive.requiresCalculation ? contrastive.expectedSolution : undefined,
        },
        answerCorrect: false,
        nextRequiresCalculation: !!contrastive.requiresCalculation,
      };
    }

    case 'contrastive_cue':
      return finish(userId, state.conceptLabel, 'again', 'unresolved', state, false);

    default:
      throw new Error(`Cannot resume a wrong-answer continuation from stage: ${state.stage}`);
  }
}

// Handles the student's response to the "did you understand the wording?"
// gate — "no" reframes whatever question is currently shown and re-asks it
// at the SAME stage (a genuine re-attempt, not an escalation); "yes" moves
// on to exactly what would have happened had the gate not existed.
async function handleWordingGateResponse(
  userId: string,
  state: DiagnosticState,
  answer: string
): Promise<DiagnosticResult> {
  const gate = state.wordingGate!;
  const understood = /^\s*yes/i.test(answer);
  const clearedState: DiagnosticState = { ...state, wordingGate: undefined };

  if (!understood) {
    const reframed = await callJSON<{ question: string }>(
      REFRAME_QUESTION_PROMPT,
      `Concept: ${state.conceptLabel}\nOriginal question: ${gate.failedQuestion}`,
      MODELS.simpleQuestion,
      0.3
    );
    const isOriginalQuestionStage = clearedState.stage === 'initial' || clearedState.stage === 'slip_recheck';
    // A reframe only reworks the WORDING — whatever's being tested (and
    // its calculation status) is unchanged, so currentQuestionCalcInfo
    // still correctly describes the reworded question too.
    return {
      done: false,
      nextQuestion: reframed.question,
      state: {
        ...clearedState,
        lastShownQuestion: reframed.question,
        ...(isOriginalQuestionStage ? { originalQuestion: reframed.question } : {}),
      },
      nextRequiresCalculation: currentQuestionCalcInfo(clearedState).requiresCalculation,
    };
  }

  return resumeWrongAnswerContinuation(userId, clearedState);
}

// Wraps a "this free-text answer was wrong" result with the wording gate
// instead of escalating immediately — every free-text stage's wrong branch
// routes through this. Skipped for encoding_check (a 4-option MCQ, where
// wording ambiguity is a much smaller risk). Exported so the orchestrator
// can gate on a REAL, already-known-wrong originalQuestion (e.g. from the
// encoding lesson) before ever dispatching into this engine at all — see
// diagnosticOrchestrator.ts. NOT used for the 'initial'-stage dontKnow
// shortcut below, which also serves mechanisticEngine.ts's internal
// localization hand-off, where "originalQuestion" is just a placeholder
// label for a node the student was never actually shown a real question
// for yet — gating on that would ask about wording of text they never saw.
export function gateOnWrongAnswer(state: DiagnosticState, failedQuestion: string): DiagnosticResult {
  return {
    done: false,
    nextQuestion: WORDING_CHECK_PROMPT_TEXT,
    nextOptions: ['Yes', 'No'],
    state: { ...state, wordingGate: { failedQuestion } },
    answerCorrect: false,
  };
}

/**
 * The single entry point for every stage of the single-concept diagnostic
 * flow. Also used recursively by the mechanistic engine to fully diagnose
 * whichever prerequisite node its localization walk isolates.
 */
export async function processDiagnosticAnswer(
  userId: string,
  state: DiagnosticState,
  answer: string,
  dontKnow: boolean
): Promise<DiagnosticResult> {
  if (state.wordingGate) {
    return handleWordingGateResponse(userId, state, answer);
  }

  switch (state.stage) {
    case 'initial': {
      if (dontKnow) {
        return { ...(await runEncodingCheckOrSkip(userId, state)), answerCorrect: false };
      }

      const check = await checkAnswer(
        state.conceptLabel,
        state.originalQuestion,
        answer,
        state.originalQuestionRequiresCalculation ? state.originalQuestionExpectedSolution : undefined
      );
      const notedState = appendNote(state, check.misconceptionNote);

      if (check.correct) {
        return finish(userId, state.conceptLabel, 'good', 'pass', notedState, true);
      }
      if (check.looksLikeSlip) {
        return {
          done: false,
          nextQuestion: state.originalQuestion,
          state: { ...notedState, stage: 'slip_recheck' },
          answerCorrect: false,
          nextRequiresCalculation: !!state.originalQuestionRequiresCalculation,
        };
      }
      return gateOnWrongAnswer(notedState, state.originalQuestion);
    }

    case 'slip_recheck': {
      const check = await checkAnswer(
        state.conceptLabel,
        state.originalQuestion,
        answer,
        state.originalQuestionRequiresCalculation ? state.originalQuestionExpectedSolution : undefined
      );
      const notedState = appendNote(state, check.misconceptionNote);
      if (check.correct) {
        return finish(userId, state.conceptLabel, 'hard', 'slip', notedState, true);
      }
      return gateOnWrongAnswer(notedState, state.originalQuestion);
    }

    case 'encoding_check': {
      const isCorrect = answer.trim() === (state.recognitionCorrectAnswer || '').trim();
      if (!isCorrect) {
        return finish(userId, state.conceptLabel, 'again', 'encoding', state, false);
      }
      const simplified = await callJSON<{
        simplifiedQuestion: string;
        staysGenuineRetrieval: boolean;
        requiresCalculation?: boolean;
        expectedSolution?: string;
      }>(
        WM_RELAXATION_PROMPT,
        `Subject: ${state.subject}\nConcept: ${state.conceptLabel}\nOriginal question: ${state.originalQuestion}`,
        MODELS.diagnosticTree,
        0.3
      );
      return {
        done: false,
        nextQuestion: simplified.simplifiedQuestion,
        state: {
          ...state,
          stage: 'wm_relax',
          wmRelaxTrustworthy: simplified.staysGenuineRetrieval,
          lastShownQuestion: simplified.simplifiedQuestion,
          lastGeneratedRequiresCalculation: !!simplified.requiresCalculation,
          lastGeneratedExpectedSolution: simplified.requiresCalculation ? simplified.expectedSolution : undefined,
        },
        answerCorrect: true,
        nextRequiresCalculation: !!simplified.requiresCalculation,
      };
    }

    case 'wm_relax': {
      const check = await checkAnswer(
        state.conceptLabel,
        '(simplified)',
        answer,
        state.lastGeneratedRequiresCalculation ? state.lastGeneratedExpectedSolution : undefined
      );
      const notedState = appendNote(state, check.misconceptionNote);
      if (check.correct && state.wmRelaxTrustworthy !== false) {
        return finish(userId, state.conceptLabel, 'hard', 'wm_overload', notedState, true);
      }
      return gateOnWrongAnswer(notedState, state.lastShownQuestion || state.originalQuestion);
    }

    case 'hint_cue': {
      // Grading the ORIGINAL question (re-asked with a hint), not
      // whatever wm_relax generated — see originalQuestion*'s own comment.
      const check = await checkAnswer(
        state.conceptLabel,
        state.originalQuestion,
        answer,
        state.originalQuestionRequiresCalculation ? state.originalQuestionExpectedSolution : undefined
      );
      const notedState = appendNote(state, check.misconceptionNote);
      if (check.correct) {
        return finish(userId, state.conceptLabel, 'hard', 'decay', notedState, true);
      }
      return gateOnWrongAnswer(notedState, state.lastShownQuestion || state.originalQuestion);
    }

    case 'contrastive_cue': {
      const check = await checkAnswer(
        state.conceptLabel,
        '(contrastive)',
        answer,
        state.lastGeneratedRequiresCalculation ? state.lastGeneratedExpectedSolution : undefined
      );
      const notedState = appendNote(state, check.misconceptionNote);
      if (check.correct) {
        return finish(userId, state.conceptLabel, 'hard', 'interference', notedState, true);
      }
      return gateOnWrongAnswer(notedState, state.lastShownQuestion || state.originalQuestion);
    }

    default:
      throw new Error(`Unknown diagnostic stage: ${state.stage}`);
  }
}
