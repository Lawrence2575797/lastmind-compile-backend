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
  // True when originalQuestion is NOT a real question ever shown to the
  // student — mechanisticEngine.ts's localization hand-off seeds a fresh
  // DiagnosticState with a bookkeeping placeholder like "(localization
  // check on partial_derivatives)" rather than a real prompt (see its own
  // construction comment). Anything that would otherwise re-display or
  // build on originalQuestion verbatim (the encoding_check->wm_relax
  // transition, hint_cue's re-ask) must check this first and fall back to
  // lastShownQuestion / concept-only context instead — see those call
  // sites. Left unset (falsy) for every top-level session, where
  // originalQuestion is always the genuine question the student answered.
  originalQuestionIsPlaceholder?: boolean;
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
  // The literal text of whatever question is currently on screen — needed
  // for the optional "reframe this" action (see reframeCurrentQuestion),
  // since wm_relax/hint_cue/contrastive_cue grade by concept label (not
  // stored wording), so there's otherwise nothing in state holding the
  // exact shown text. originalQuestion already serves this role for
  // 'initial'/'slip_recheck', but this is kept in sync everywhere a new
  // question is generated so reframeCurrentQuestion never needs to know
  // which stage it's reframing.
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
// reframeCurrentQuestion, so they can never disagree about which question
// is actually on screen.
function currentQuestionCalcInfo(state: DiagnosticState): { requiresCalculation: boolean; expectedSolution?: string } {
  if (state.originalQuestionIsPlaceholder) {
    // A placeholder-seeded (sub-diagnostic) session has no real
    // originalQuestion* to ever fall back to — every stage, including
    // hint_cue, grades/re-asks based on lastGenerated* instead. See
    // originalQuestionIsPlaceholder's own comment.
    return { requiresCalculation: !!state.lastGeneratedRequiresCalculation, expectedSolution: state.lastGeneratedExpectedSolution };
  }
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
        state: { ...state, stage: 'encoding_check', recognitionCorrectAnswer: outcome.correctAnswer, lastShownQuestion: outcome.question },
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
      // Re-asking originalQuestion itself (with a hint appended) is only
      // valid when originalQuestion is a REAL question the student was
      // actually shown. For a mechanistic localization hand-off it's a
      // bookkeeping placeholder — re-asking THAT verbatim is exactly the
      // "(localization check on X)\n\nHint: ..." bug this fixes. Fall back
      // to lastShownQuestion (the wm_relax question that was just
      // generated and answered wrong) in that case instead, and hint
      // about ITS calc status, not originalQuestion*'s.
      const usingPlaceholder = !!state.originalQuestionIsPlaceholder;
      const reAskBase = usingPlaceholder ? (state.lastShownQuestion || state.conceptLabel) : state.originalQuestion;
      const hintTargetRequiresCalculation = usingPlaceholder
        ? !!state.lastGeneratedRequiresCalculation
        : !!state.originalQuestionRequiresCalculation;

      const hintResult = await callJSON<{ hint: string }>(
        HINT_CUE_PROMPT,
        `Concept: ${state.conceptLabel}\nQuestion type: ${hintTargetRequiresCalculation ? 'calculation' : 'verbal'}`,
        MODELS.diagnosticTree,
        0.3
      );
      const nextQuestion = `${reAskBase}\n\nHint: ${hintResult.hint}`;
      return {
        done: false,
        nextQuestion,
        state: { ...state, stage: 'hint_cue', lastShownQuestion: nextQuestion },
        answerCorrect: false,
        nextRequiresCalculation: hintTargetRequiresCalculation,
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

// On-demand reword of whatever question is currently on screen — the
// replacement for the old mandatory "did you understand the wording?"
// gate. Callable at ANY point in the tree via a frontend side-button
// (rather than a forced question shown after every wrong answer); leaves
// the diagnostic stage and every grading-relevant field untouched, it only
// swaps the display text. Exported so the orchestrator can expose it
// independent of processDiagnosticAnswer's normal answer-submission flow.
export async function reframeCurrentQuestion(state: DiagnosticState): Promise<DiagnosticResult> {
  const questionToReframe = state.lastShownQuestion || state.originalQuestion;
  const reframed = await callJSON<{ question: string }>(
    REFRAME_QUESTION_PROMPT,
    `Concept: ${state.conceptLabel}\nOriginal question: ${questionToReframe}`,
    MODELS.simpleQuestion,
    0.3
  );
  // 'initial'/'slip_recheck' grade by passing originalQuestion's own TEXT
  // to the answer checker (see checkAnswer call sites below) — those two
  // stages must have originalQuestion itself updated to match what's now
  // shown, or grading would describe a question the student was never
  // actually asked. Every other stage grades via a fixed label instead
  // (e.g. '(simplified)', '(cued combination)'), so only lastShownQuestion
  // needs updating for them.
  const isOriginalQuestionStage = !state.originalQuestionIsPlaceholder && (state.stage === 'initial' || state.stage === 'slip_recheck');
  return {
    done: false,
    nextQuestion: reframed.question,
    state: {
      ...state,
      lastShownQuestion: reframed.question,
      ...(isOriginalQuestionStage ? { originalQuestion: reframed.question } : {}),
    },
    nextRequiresCalculation: currentQuestionCalcInfo(state).requiresCalculation,
  };
}

// Advances straight into the next diagnostic escalation after a wrong
// answer — every free-text stage's wrong branch routes through this, as
// does mechanisticEngine.ts's localization hand-off and
// diagnosticOrchestrator.ts's atomic-path entry points. Used to gate on a
// "did you understand the wording?" check before escalating; that's now
// the optional reframeCurrentQuestion action above instead of a forced
// step here, so this is a thin, uniformly-named entry point into
// resumeWrongAnswerContinuation.
export function advanceAfterWrongAnswer(userId: string, state: DiagnosticState): Promise<DiagnosticResult> {
  return resumeWrongAnswerContinuation(userId, state);
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
      return advanceAfterWrongAnswer(userId, notedState);
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
      return advanceAfterWrongAnswer(userId, notedState);
    }

    case 'encoding_check': {
      const isCorrect = answer.trim() === (state.recognitionCorrectAnswer || '').trim();
      if (!isCorrect) {
        return finish(userId, state.conceptLabel, 'again', 'encoding', state, false);
      }
      // originalQuestion is a bookkeeping placeholder (never a real shown
      // question) for a mechanistic localization hand-off — passing it as
      // "Original question: (localization check on X)" would feed the
      // model a misleading label instead of real context. Omit the line
      // entirely in that case; Subject + Concept alone is enough for
      // WM_RELAXATION_PROMPT to write a genuine first retrieval question.
      const simplified = await callJSON<{
        simplifiedQuestion: string;
        staysGenuineRetrieval: boolean;
        requiresCalculation?: boolean;
        expectedSolution?: string;
      }>(
        WM_RELAXATION_PROMPT,
        state.originalQuestionIsPlaceholder
          ? `Subject: ${state.subject}\nConcept: ${state.conceptLabel}`
          : `Subject: ${state.subject}\nConcept: ${state.conceptLabel}\nOriginal question: ${state.originalQuestion}`,
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
      return advanceAfterWrongAnswer(userId, notedState);
    }

    case 'hint_cue': {
      // Grading against whichever question was actually re-asked with the
      // hint — the ORIGINAL question for a real top-level session (see
      // originalQuestion*'s own comment), or wm_relax's lastGenerated*
      // question for a placeholder-seeded sub-diagnostic, matching
      // resumeWrongAnswerContinuation's 'wm_relax' case above exactly.
      const check = await checkAnswer(
        state.conceptLabel,
        state.originalQuestionIsPlaceholder ? '(hinted)' : state.originalQuestion,
        answer,
        state.originalQuestionIsPlaceholder
          ? (state.lastGeneratedRequiresCalculation ? state.lastGeneratedExpectedSolution : undefined)
          : (state.originalQuestionRequiresCalculation ? state.originalQuestionExpectedSolution : undefined)
      );
      const notedState = appendNote(state, check.misconceptionNote);
      if (check.correct) {
        return finish(userId, state.conceptLabel, 'hard', 'decay', notedState, true);
      }
      return advanceAfterWrongAnswer(userId, notedState);
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
      return advanceAfterWrongAnswer(userId, notedState);
    }

    default:
      throw new Error(`Unknown diagnostic stage: ${state.stage}`);
  }
}
