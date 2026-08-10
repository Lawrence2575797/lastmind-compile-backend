import { callClaudeJSON, MODELS } from './claudeClient';
import { gradeAndRecordReview } from './reviewService';
import { runSharedEncodingCheck } from './sharedDiagnosticSteps';
import {
  CHECK_ANSWER_AND_SLIP_PROMPT,
  WM_RELAXATION_PROMPT,
  HINT_CUE_PROMPT,
  CONTRASTIVE_CUE_PROMPT,
  CORRECTION_PROMPT,
} from '../constants/diagnosticPrompts';

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
      return { ...(await runEncodingCheckOrSkip(userId, notedState)), answerCorrect: false };
    }

    case 'slip_recheck': {
      const check = await checkAnswer(state.conceptLabel, state.originalQuestion, answer);
      const notedState = appendNote(state, check.misconceptionNote);
      if (check.correct) {
        return finish(userId, state.conceptLabel, 'hard', 'slip', notedState, true);
      }
      return { ...(await runEncodingCheckOrSkip(userId, notedState)), answerCorrect: false };
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
        state: { ...state, stage: 'wm_relax', wmRelaxTrustworthy: simplified.staysGenuineRetrieval },
        answerCorrect: true,
      };
    }

    case 'wm_relax': {
      const check = await checkAnswer(state.conceptLabel, '(simplified)', answer);
      const notedState = appendNote(state, check.misconceptionNote);
      if (check.correct && state.wmRelaxTrustworthy !== false) {
        return finish(userId, state.conceptLabel, 'hard', 'wm_overload', notedState, true);
      }
      const hintResult = await callJSON<{ hint: string }>(
        HINT_CUE_PROMPT,
        `Concept: ${state.conceptLabel}`,
        MODELS.diagnosticTree,
        0.3
      );
      return {
        done: false,
        nextQuestion: `${state.originalQuestion}\n\nHint: ${hintResult.hint}`,
        state: { ...notedState, stage: 'hint_cue' },
        answerCorrect: false,
      };
    }

    case 'hint_cue': {
      const check = await checkAnswer(state.conceptLabel, state.originalQuestion, answer);
      const notedState = appendNote(state, check.misconceptionNote);
      if (check.correct) {
        return finish(userId, state.conceptLabel, 'hard', 'decay', notedState, true);
      }
      const contrastive = await callJSON<{ confusedWith: string; question: string }>(
        CONTRASTIVE_CUE_PROMPT,
        `Concept: ${state.conceptLabel}`,
        MODELS.diagnosticTree,
        0.3
      );
      return {
        done: false,
        nextQuestion: contrastive.question,
        state: { ...notedState, stage: 'contrastive_cue', confusedWith: contrastive.confusedWith },
        answerCorrect: false,
      };
    }

    case 'contrastive_cue': {
      const check = await checkAnswer(state.conceptLabel, '(contrastive)', answer);
      const notedState = appendNote(state, check.misconceptionNote);
      if (check.correct) {
        return finish(userId, state.conceptLabel, 'hard', 'interference', notedState, true);
      }
      return finish(userId, state.conceptLabel, 'again', 'unresolved', notedState, false);
    }

    default:
      throw new Error(`Unknown diagnostic stage: ${state.stage}`);
  }
}
