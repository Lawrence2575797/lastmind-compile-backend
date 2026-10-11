"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processDiagnosticAnswer = processDiagnosticAnswer;
const claudeClient_1 = require("./claudeClient");
const reviewService_1 = require("./reviewService");
const sharedDiagnosticSteps_1 = require("./sharedDiagnosticSteps");
const diagnosticPrompts_1 = require("../constants/diagnosticPrompts");
const WORDING_CHECK_PROMPT_TEXT = 'Did you understand what this question was asking?';
function stripCodeFences(text) {
    return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}
async function callJSON(systemPrompt, userContent, model, temperature = 0) {
    const raw = await (0, claudeClient_1.callClaudeJSON)({ model, systemPrompt, userContent, temperature });
    return JSON.parse(stripCodeFences(raw));
}
async function checkAnswer(conceptLabel, questionDescription, answer) {
    return callJSON(diagnosticPrompts_1.CHECK_ANSWER_AND_SLIP_PROMPT, `Concept: ${conceptLabel}\nQuestion: ${questionDescription}\nStudent's answer: ${answer}`, claudeClient_1.MODELS.simpleQuestion);
}
function appendNote(state, note) {
    if (!note)
        return state;
    return { ...state, misconceptionNotes: [...state.misconceptionNotes, note] };
}
async function finish(userId, conceptLabel, ratingKey, diagnosis, state, answerCorrect) {
    await (0, reviewService_1.gradeAndRecordReview)(userId, state.conceptKey ?? conceptLabel, ratingKey);
    let correction;
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
        const result = await callJSON(diagnosticPrompts_1.CORRECTION_PROMPT, contextLines.join('\n'), claudeClient_1.MODELS.diagnosticTree, 0.3);
        correction = result.correction;
    }
    return { done: true, diagnosis, correction, state, answerCorrect };
}
// Runs the SHARED encoding check (section 2 of the tree — applies before
// any atomic/mechanistic branching) and routes accordingly for the
// single-concept (atomic) path specifically.
async function runEncodingCheckOrSkip(userId, state) {
    const outcome = await (0, sharedDiagnosticSteps_1.runSharedEncodingCheck)(userId, state.conceptLabel, state.conceptLabel);
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
async function resumeWrongAnswerContinuation(userId, state) {
    switch (state.stage) {
        case 'initial':
        case 'slip_recheck':
            return { ...(await runEncodingCheckOrSkip(userId, state)), answerCorrect: false };
        case 'wm_relax': {
            const hintResult = await callJSON(diagnosticPrompts_1.HINT_CUE_PROMPT, `Concept: ${state.conceptLabel}`, claudeClient_1.MODELS.diagnosticTree, 0.3);
            const nextQuestion = `${state.originalQuestion}\n\nHint: ${hintResult.hint}`;
            return {
                done: false,
                nextQuestion,
                state: { ...state, stage: 'hint_cue', lastShownQuestion: nextQuestion },
                answerCorrect: false,
            };
        }
        case 'hint_cue': {
            const contrastive = await callJSON(diagnosticPrompts_1.CONTRASTIVE_CUE_PROMPT, `Concept: ${state.conceptLabel}`, claudeClient_1.MODELS.diagnosticTree, 0.3);
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
async function handleWordingGateResponse(userId, state, answer) {
    const gate = state.wordingGate;
    const understood = /^\s*yes/i.test(answer);
    const clearedState = { ...state, wordingGate: undefined };
    if (!understood) {
        const reframed = await callJSON(diagnosticPrompts_1.REFRAME_QUESTION_PROMPT, `Concept: ${state.conceptLabel}\nOriginal question: ${gate.failedQuestion}`, claudeClient_1.MODELS.simpleQuestion, 0.3);
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
function gateOnWrongAnswer(state, failedQuestion) {
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
async function processDiagnosticAnswer(userId, state, answer, dontKnow) {
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
            const simplified = await callJSON(diagnosticPrompts_1.WM_RELAXATION_PROMPT, `Concept: ${state.conceptLabel}\nOriginal question: ${state.originalQuestion}`, claudeClient_1.MODELS.diagnosticTree, 0.3);
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
