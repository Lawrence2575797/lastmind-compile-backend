import { callClaudeJSON, MODELS } from './claudeClient';
import { gradeAndRecordReview } from './reviewService';
import { runSharedEncodingCheck } from './sharedDiagnosticSteps';
import {
  CHECK_ANSWER_AND_SLIP_PROMPT,
  WM_RELAXATION_PROMPT,
  HINT_CUE_PROMPT,
  CONTRASTIVE_CUE_PROMPT,
  CORRECTION_PROMPT,
  REFRAME_QUESTION_PROMPT,
} from '../constants/diagnosticPrompts';

const WORDING_CHECK_PROMPT_TEXT = 'Did you understand what this question was asking?';

function stripCodeFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}

async function callJSON<T>(systemPrompt: string, userContent: string, model: string, temperature = 0): Promise<T> {
  const raw = await callClaudeJSON({ model, systemPrompt, userContent, temperature });
  return JSON.parse(stripCodeFences(raw)) as T;
}

interface AnswerCheck { correct: boolean; looksLikeSlip?: boolean; misconceptionNote: string | null; }

async function checkAnswer(conceptLabel: string, questionDescription: string, answer: string): Promise<AnswerCheck> {
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
}

function appendNote(state: DiagnosticState, note: string | null | undefined): DiagnosticState {
  if (!note) return state;
  return { ...state, misconceptionNotes: [...state.misconceptionNotes, note] };
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
      return {
        done: false,
        nextQuestion,
        state: { ...state, stage: 'hint_cue', lastShownQuestion: nextQuestion },
        answerCorrect: false,
      };
    }

    case 'hint_cue': {
      const contrastive = await callJSON<{ confusedWith: string; question: string }>(
        CONTRASTIVE_CUE_PROMPT,
        `Concept: ${state.conceptLabel}`,
        MODELS.diagnosticTree,
        0.3
      );
      return {
        done: false,
        nextQuestion: contrastive.question,
        state: { ...state, stage: 'contrastive_cue', confusedWith: contrastive.confusedWith, lastShownQuestion: contrastive.question },
        answerCorrect: false,
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
    return {
      done: false,
      nextQuestion: reframed.question,
      state: {
        ...clearedState,
        lastShownQuestion: reframed.question,
        ...(isOriginalQuestionStage ? { originalQuestion: reframed.question } : {}),
      },
    };
  }

  return resumeWrongAnswerContinuation(userId, clearedState);
}

// Wraps a "this free-text answer was wrong" result with the wording gate
// instead of escalating immediately — every free-text stage's wrong branch
// routes through this. Skipped for encoding_check (a 4-option MCQ, where
// wording ambiguity is a much smaller risk).
function gateOnWrongAnswer(state: DiagnosticState, failedQuestion: string): DiagnosticResult {
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

      const check = await checkAnswer(state.conceptLabel, state.originalQuestion, answer);
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
        };
      }
      return gateOnWrongAnswer(notedState, state.originalQuestion);
    }

    case 'slip_recheck': {
      const check = await checkAnswer(state.conceptLabel, state.originalQuestion, answer);
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
      const simplified = await callJSON<{ simplifiedQuestion: string; staysGenuineRetrieval: boolean }>(
        WM_RELAXATION_PROMPT,
        `Concept: ${state.conceptLabel}\nOriginal question: ${state.originalQuestion}`,
        MODELS.diagnosticTree,
        0.3
      );
      return {
        done: false,
        nextQuestion: simplified.simplifiedQuestion,
        state: { ...state, stage: 'wm_relax', wmRelaxTrustworthy: simplified.staysGenuineRetrieval, lastShownQuestion: simplified.simplifiedQuestion },
        answerCorrect: true,
      };
    }

    case 'wm_relax': {
      const check = await checkAnswer(state.conceptLabel, '(simplified)', answer);
      const notedState = appendNote(state, check.misconceptionNote);
      if (check.correct && state.wmRelaxTrustworthy !== false) {
        return finish(userId, state.conceptLabel, 'hard', 'wm_overload', notedState, true);
      }
      return gateOnWrongAnswer(notedState, state.lastShownQuestion || state.originalQuestion);
    }

    case 'hint_cue': {
      const check = await checkAnswer(state.conceptLabel, state.originalQuestion, answer);
      const notedState = appendNote(state, check.misconceptionNote);
      if (check.correct) {
        return finish(userId, state.conceptLabel, 'hard', 'decay', notedState, true);
      }
      return gateOnWrongAnswer(notedState, state.lastShownQuestion || state.originalQuestion);
    }

    case 'contrastive_cue': {
      const check = await checkAnswer(state.conceptLabel, '(contrastive)', answer);
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
