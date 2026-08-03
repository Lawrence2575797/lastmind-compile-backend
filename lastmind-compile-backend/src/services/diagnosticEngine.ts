import { callClaudeJSON, MODELS } from './claudeClient';
import { gradeAndRecordReview, getMasteryStatus } from './reviewService';
import {
  CHECK_ANSWER_AND_SLIP_PROMPT,
  RECOGNITION_QUESTION_PROMPT,
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
}

export interface DiagnosticResult {
  done: boolean;
  diagnosis?: Diagnosis;
  correction?: string;
  nextQuestion?: string;
  nextOptions?: string[];
  state: DiagnosticState;
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
    const correctionDiagnosisKey = diagnosis === 'unresolved' ? 'encoding' : diagnosis; // fall back to a real explanation rather than nothing, in the rare unresolved case
    const result = await callJSON<{ correction: string }>(
      CORRECTION_PROMPT,
      `Concept: ${conceptLabel}\nDiagnosis: ${correctionDiagnosisKey}`,
      MODELS.diagnosticTree,
      0.3
    );
    correction = result.correction;
  }

  return { done: true, diagnosis, correction, state };
}

// Runs the encoding check (or skips it via FSRS mastery/schedule signals),
// and routes onward accordingly. Shared entry point reached from: an
// initial wrong answer that wasn't slip-like, a slip-recheck that also
// failed, or a direct "I don't know".
async function runEncodingCheckOrSkip(
  userId: string,
  state: DiagnosticState
): Promise<DiagnosticResult> {
  const mastery = await getMasteryStatus(userId, state.conceptLabel);

  if (mastery.isMastered) {
    // Trust the FSRS history rather than re-testing what's already solid —
    // this is the MASTERED_THRESHOLD skip-check from the spec.
    if (mastery.scheduleWasFollowed === true) {
      // Reviewed right on schedule and still failed cold — that's real
      // evidence the SYSTEM's own timing was wrong for this student on
      // this concept, not a fault of theirs.
      return finish(userId, state.conceptLabel, 'again', 'schedule_miscalibrated', state);
    }
    // Mastered, but the review was overdue — ordinary decay from a missed
    // schedule, not a system miscalibration.
    return finish(userId, state.conceptLabel, 'hard', 'decay', state);
  }

  // No trusted history — run the real encoding-vs-retrieval test.
  const recognition = await callJSON<{ question: string; options: string[]; correctOptionIndex: number }>(
    RECOGNITION_QUESTION_PROMPT,
    `Concept: ${state.conceptLabel}`,
    MODELS.diagnosticTree,
    0.3
  );

  return {
    done: false,
    nextQuestion: recognition.question,
    nextOptions: recognition.options,
    state: {
      ...state,
      stage: 'encoding_check',
      recognitionCorrectAnswer: recognition.options[recognition.correctOptionIndex],
    },
  };
}

/**
 * The single entry point for every stage of the single-concept diagnostic
 * flow. The frontend always calls this same function with whatever state
 * it was last given back — all the branching logic lives here, not
 * scattered across the frontend.
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

      const check = await callJSON<{ correct: boolean; looksLikeSlip: boolean }>(
        CHECK_ANSWER_AND_SLIP_PROMPT,
        `Concept: ${state.conceptLabel}\nQuestion: ${state.originalQuestion}\nStudent's answer: ${answer}`,
        MODELS.simpleQuestion
      );

      if (check.correct) {
        return finish(userId, state.conceptLabel, 'good', 'pass', state);
      }
      if (check.looksLikeSlip) {
        return {
          done: false,
          nextQuestion: state.originalQuestion,
          state: { ...state, stage: 'slip_recheck' },
        };
      }
      return runEncodingCheckOrSkip(userId, state);
    }

    case 'slip_recheck': {
      const check = await callJSON<{ correct: boolean }>(
        CHECK_ANSWER_AND_SLIP_PROMPT,
        `Concept: ${state.conceptLabel}\nQuestion: ${state.originalQuestion}\nStudent's answer: ${answer}`,
        MODELS.simpleQuestion
      );
      if (check.correct) {
        return finish(userId, state.conceptLabel, 'hard', 'slip', state);
      }
      return runEncodingCheckOrSkip(userId, state);
    }

    case 'encoding_check': {
      const isCorrect = answer.trim() === (state.recognitionCorrectAnswer || '').trim();
      if (!isCorrect) {
        return finish(userId, state.conceptLabel, 'again', 'encoding', state);
      }
      // Recognition passed — retrieval failure confirmed. Proceed to the
      // working-memory relaxation test.
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
      const check = await callJSON<{ correct: boolean }>(
        CHECK_ANSWER_AND_SLIP_PROMPT,
        `Concept: ${state.conceptLabel}\nQuestion: (simplified)\nStudent's answer: ${answer}`,
        MODELS.simpleQuestion
      );
      if (check.correct) {
        return finish(userId, state.conceptLabel, 'hard', 'wm_overload', state);
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
        state: { ...state, stage: 'hint_cue' },
      };
    }

    case 'hint_cue': {
      const check = await callJSON<{ correct: boolean }>(
        CHECK_ANSWER_AND_SLIP_PROMPT,
        `Concept: ${state.conceptLabel}\nQuestion: ${state.originalQuestion}\nStudent's answer: ${answer}`,
        MODELS.simpleQuestion
      );
      if (check.correct) {
        return finish(userId, state.conceptLabel, 'hard', 'decay', state);
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
        state: { ...state, stage: 'contrastive_cue' },
      };
    }

    case 'contrastive_cue': {
      const check = await callJSON<{ correct: boolean }>(
        CHECK_ANSWER_AND_SLIP_PROMPT,
        `Concept: ${state.conceptLabel}\nQuestion: (contrastive)\nStudent's answer: ${answer}`,
        MODELS.simpleQuestion
      );
      if (check.correct) {
        return finish(userId, state.conceptLabel, 'hard', 'interference', state);
      }
      // Even explicit contrastive cueing didn't resolve it — the tree's own
      // catch-all principle: don't force a confident diagnosis the process
      // couldn't actually support. Safer default: treat as needing real
      // re-teaching rather than leaving it unaddressed.
      return finish(userId, state.conceptLabel, 'again', 'unresolved', state);
    }

    default:
      throw new Error(`Unknown diagnostic stage: ${state.stage}`);
  }
}
