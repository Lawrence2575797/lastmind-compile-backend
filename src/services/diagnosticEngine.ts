import { callClaudeJSON, MODELS } from './claudeClient';
import { gradeAndRecordReview } from './reviewService';
import { runSharedEncodingCheck } from './sharedDiagnosticSteps';
import { parseModelJson } from './jsonParsing';
import {
  CHECK_ANSWER_AND_SLIP_PROMPT,
  MATH_ANSWER_CHECK_AND_SLIP_PROMPT,
  LOCALIZATION_CHECK_PROMPT,
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
  | 'hint_cue'
  | 'contrastive_cue';

// 'wm_overload' removed — working-memory overload requires several
// simultaneously-held chunks to even be a coherent possibility; a single
// atomic concept is one chunk, so it was never a meaningful diagnosis
// here. The chain-level equivalent lives entirely in the mechanistic
// engine as 'global_chain_failure' instead.
export type Diagnosis =
  | 'pass'
  | 'slip'
  | 'encoding'
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
  // build on originalQuestion verbatim (the encoding_check->hint_cue
  // transition) must check this first and fall back to lastShownQuestion /
  // concept-only context instead — see those call sites. Left unset
  // (falsy) for every top-level session, where originalQuestion is always
  // the genuine question the student answered.
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
  // The literal text of whatever question is currently on screen — needed
  // for the optional "reframe this" action (see reframeCurrentQuestion),
  // since hint_cue/contrastive_cue grade by concept label (not stored
  // wording), so there's otherwise nothing in state holding the exact
  // shown text. originalQuestion already serves this role for
  // 'initial'/'slip_recheck', but this is kept in sync everywhere a new
  // question is generated so reframeCurrentQuestion never needs to know
  // which stage it's reframing.
  lastShownQuestion?: string;
  // The options that went with lastShownQuestion, when it was an MCQ (the
  // 'encoding_check' recognition test — the only stage that's ever
  // multiple-choice). Needed so retryCurrentQuestion can re-render the
  // same 4 buttons instead of silently downgrading to a free-text box on
  // retry — lastShownQuestion alone only carries the question text.
  lastShownOptions?: string[];
  // Calculation status of originalQuestion specifically — set at entry
  // (see startMathDiagnosis) when the question that triggered this whole
  // diagnosis was itself a calculation. Referenced by 'initial'/
  // 'slip_recheck' (which grade originalQuestion directly) AND 'hint_cue'
  // for a REAL (non-placeholder) session, which re-asks originalQuestion +
  // a hint — see lastGenerated* below for the placeholder case instead.
  originalQuestionRequiresCalculation?: boolean;
  originalQuestionExpectedSolution?: string;
  // Calculation status of the most recently GENERATED sub-question —
  // contrastive_cue's distinguishing question, OR (for a placeholder-
  // seeded sub-diagnosis only, which has no real originalQuestion to fall
  // back to) the fresh first question generated the moment encoding_check
  // passes, immediately re-asked with a hint as that session's own
  // 'hint_cue' stage. Consumed by whichever stage grades that specific
  // generated question.
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
// student is CURRENTLY looking at, given the stage they're in —
// 'contrastive_cue' is grading a question THIS engine itself just
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
  if (state.stage === 'contrastive_cue') {
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
  const outcome = await runSharedEncodingCheck(userId, state.conceptLabel, state.conceptLabel, state.subject);

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
        state: { ...state, stage: 'encoding_check', recognitionCorrectAnswer: outcome.correctAnswer, lastShownQuestion: outcome.question, lastShownOptions: outcome.options },
      };
    default:
      throw new Error(`Unexpected encoding-check outcome for atomic path: ${outcome.result}`);
  }
}

// Runs the moment encoding_check's recognition test passes — skips
// straight to a hinted free-recall attempt. No intermediate "cold retry"
// stage (the old 'wm_relax'): working-memory overload isn't a meaningful
// diagnosis for a single atomic concept — it takes several
// simultaneously-held chunks to even be possible, and one concept is one
// chunk (see the Diagnosis type's own comment; the chain-level version of
// this lives in the mechanistic engine as 'global_chain_failure', where
// there genuinely are several chunks in play). So there was never
// anything a cold, unhinted retry here would actually be testing for —
// straight to hint_cue instead.
async function proceedToHintCue(state: DiagnosticState): Promise<DiagnosticResult> {
  const usingPlaceholder = !!state.originalQuestionIsPlaceholder;
  let reAskBase: string;
  let hintTargetRequiresCalculation: boolean;
  let generatedRequiresCalculation = false;
  let generatedExpectedSolution: string | undefined;

  if (usingPlaceholder) {
    // No real question exists yet for a mechanistic localization hand-off
    // (see originalQuestionIsPlaceholder's own comment) — generate a
    // genuine first retrieval question for this bare concept, the same
    // tool mechanisticEngine.ts's own localization walk already uses for
    // exactly this job.
    const generated = await callJSON<{ question: string; requiresCalculation?: boolean; expectedSolution?: string }>(
      LOCALIZATION_CHECK_PROMPT,
      `Subject: ${state.subject}\nConcept: ${state.conceptLabel}`,
      MODELS.diagnosticTree,
      0.3
    );
    reAskBase = generated.question;
    hintTargetRequiresCalculation = !!generated.requiresCalculation;
    generatedRequiresCalculation = !!generated.requiresCalculation;
    generatedExpectedSolution = generated.requiresCalculation ? generated.expectedSolution : undefined;
  } else {
    reAskBase = state.originalQuestion;
    hintTargetRequiresCalculation = !!state.originalQuestionRequiresCalculation;
  }

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
    state: {
      ...state,
      stage: 'hint_cue',
      lastShownQuestion: nextQuestion,
      ...(usingPlaceholder
        ? { lastGeneratedRequiresCalculation: generatedRequiresCalculation, lastGeneratedExpectedSolution: generatedExpectedSolution }
        : {}),
    },
    answerCorrect: true, // the recognition check that led here just passed
    nextRequiresCalculation: hintTargetRequiresCalculation,
  };
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

// Re-serves the exact question the student just got wrong, unchanged, for
// a genuine second attempt — the "this was just a slip" side button used
// to trust that self-report at face value and end the diagnosis outright
// with no verification at all, which let a genuinely wrong answer through
// on a bare claim. Retrying instead means a real slip (fat-finger, misread)
// gets caught by the student actually getting it right this time, and a
// real gap still surfaces normally through the usual wrong-answer
// escalation if they get it wrong again — no LLM call needed, since
// nothing about the question or state actually changes.
export function retryCurrentQuestion(state: DiagnosticState): DiagnosticResult {
  const questionToRetry = state.lastShownQuestion || state.originalQuestion;
  return {
    done: false,
    nextQuestion: questionToRetry,
    nextOptions: state.stage === 'encoding_check' ? state.lastShownOptions : undefined,
    state,
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
      return proceedToHintCue(state);
    }

    case 'hint_cue': {
      // Grading against whichever question was actually re-asked with the
      // hint — the ORIGINAL question for a real top-level session (see
      // originalQuestion*'s own comment), or the fresh question
      // proceedToHintCue generated (lastGenerated*) for a placeholder-
      // seeded sub-diagnostic, matching that function's own state update.
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
