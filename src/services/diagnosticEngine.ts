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
}

export interface DiagnosticResult {
  done: boolean;
  diagnosis?: Diagnosis;
  correction?: string;
  nextQuestion?: string;
  nextOptions?: string[];
  state: DiagnosticState;
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
  state: DiagnosticState
): Promise<DiagnosticResult> {
  await gradeAndRecordReview(userId, conceptLabel, ratingKey);

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

  return { done: true, diagnosis, correction, state };
}

// Runs the SHARED encoding check (section 2 of the tree — applies before
// any atomic/mechanistic branching) and routes accordingly for the
// single-concept (atomic) path specifically.
async function runEncodingCheckOrSkip(userId: string, state: DiagnosticState): Promise<DiagnosticResult> {
  const outcome = await runSharedEncodingCheck(userId, state.conceptLabel, state.conceptLabel);

  switch (outcome.result) {
    case 'schedule_miscalibrated':
      return finish(userId, state.conceptLabel, 'again', 'schedule_miscalibrated', state);
    case 'decay_schedule_skipped':
      return finish(userId, state.conceptLabel, 'hard', 'decay', state);
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
        return runEncodingCheckOrSkip(userId, state);
      }

      const check = await checkAnswer(state.conceptLabel, state.originalQuestion, answer);
      const notedState = appendNote(state, check.misconceptionNote);

      if (check.correct) {
        return finish(userId, state.conceptLabel, 'good', 'pass', notedState);
      }
      if (check.looksLikeSlip) {
        return {
          done: false,
          nextQuestion: state.originalQuestion,
          state: { ...notedState, stage: 'slip_recheck' },
        };
      }
      return runEncodingCheckOrSkip(userId, notedState);
    }

    case 'slip_recheck': {
      const check = await checkAnswer(state.conceptLabel, state.originalQuestion, answer);
      const notedState = appendNote(state, check.misconceptionNote);
      if (check.correct) {
        return finish(userId, state.conceptLabel, 'hard', 'slip', notedState);
      }
      return runEncodingCheckOrSkip(userId, notedState);
    }

    case 'encoding_check': {
      const isCorrect = answer.trim() === (state.recognitionCorrectAnswer || '').trim();
      if (!isCorrect) {
        return finish(userId, state.conceptLabel, 'again', 'encoding', state);
      }
      const simplified = await callJSON<{ simplifiedQuestion: string }>(
        WM_RELAXATION_PROMPT,
        `Concept: ${state.conceptLabel}\nOriginal question: ${state.originalQuestion}`,
        MODELS.diagnosticTree,
        0.3
      );
      return {
        done: false,
        nextQuestion: simplified.simplifiedQuestion,
        state: { ...state, stage: 'wm_relax' },
      };
    }

    case 'wm_relax': {
      const check = await checkAnswer(state.conceptLabel, '(simplified)', answer);
      const notedState = appendNote(state, check.misconceptionNote);
      if (check.correct) {
        return finish(userId, state.conceptLabel, 'hard', 'wm_overload', notedState);
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
      };
    }

    case 'hint_cue': {
      const check = await checkAnswer(state.conceptLabel, state.originalQuestion, answer);
      const notedState = appendNote(state, check.misconceptionNote);
      if (check.correct) {
        return finish(userId, state.conceptLabel, 'hard', 'decay', notedState);
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
      };
    }

    case 'contrastive_cue': {
      const check = await checkAnswer(state.conceptLabel, '(contrastive)', answer);
      const notedState = appendNote(state, check.misconceptionNote);
      if (check.correct) {
        return finish(userId, state.conceptLabel, 'hard', 'interference', notedState);
      }
      return finish(userId, state.conceptLabel, 'again', 'unresolved', notedState);
    }

    default:
      throw new Error(`Unknown diagnostic stage: ${state.stage}`);
  }
}
