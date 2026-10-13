"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startDiagnosisFromKnownAnswer = startDiagnosisFromKnownAnswer;
exports.runDiagnosticStep = runDiagnosticStep;
const claudeClient_1 = require("./claudeClient");
const reviewService_1 = require("./reviewService");
const diagnosticPrompts_1 = require("../constants/diagnosticPrompts");
const mechanisticEngine_1 = require("./mechanisticEngine");
const diagnosticEngine_1 = require("./diagnosticEngine");
function stripCodeFences(text) {
    return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}
async function dispatchToBranch(userId, conceptKey, conceptLabel, subject, topic, originalQuestion) {
    const chain = await (0, mechanisticEngine_1.loadChainIfMechanistic)(conceptKey, subject, topic, conceptLabel);
    if (chain) {
        const result = await (0, mechanisticEngine_1.startMechanisticDiagnosis)(userId, conceptKey, conceptLabel, subject, originalQuestion, chain);
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
    const atomicState = { conceptLabel: conceptKey, subject, stage: 'initial', originalQuestion, misconceptionNotes: [] };
    const result = await (0, diagnosticEngine_1.processDiagnosticAnswer)(userId, atomicState, '', true); // dontKnow-equivalent path straight to the encoding check, since slip-checking already happened here in the orchestrator
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
async function startDiagnosisFromKnownAnswer(userId, conceptKey, conceptLabel, subject, topic, originalQuestion, forceAtomic) {
    if (forceAtomic) {
        const atomicState = {
            conceptLabel,
            conceptKey,
            subject,
            stage: 'initial',
            originalQuestion,
            misconceptionNotes: [],
        };
        const result = await (0, diagnosticEngine_1.processDiagnosticAnswer)(userId, atomicState, '', true);
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
async function runDiagnosticStep(userId, state, answer, dontKnow) {
    if (state.engine === 'atomic') {
        const result = await (0, diagnosticEngine_1.processDiagnosticAnswer)(userId, state.inner, answer, dontKnow);
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
        const result = await (0, mechanisticEngine_1.processMechanisticAnswer)(userId, state.inner, answer, dontKnow);
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
    const raw = await (0, claudeClient_1.callClaudeJSON)({
        model: claudeClient_1.MODELS.simpleQuestion,
        systemPrompt: diagnosticPrompts_1.CHECK_ANSWER_AND_SLIP_PROMPT,
        userContent: `Concept: ${state.conceptLabel}\nQuestion: ${state.originalQuestion}\nStudent's answer: ${answer}`,
    });
    const check = JSON.parse(stripCodeFences(raw));
    if (check.correct) {
        // A clean pass doesn't need either engine at all.
        await (0, reviewService_1.gradeAndRecordReview)(userId, state.conceptKey, 'good');
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
        await (0, reviewService_1.gradeAndRecordReview)(userId, state.conceptKey, 'again');
    }
    return { ...(await dispatchToBranch(userId, state.conceptKey, state.conceptLabel, state.subject, state.topic, state.originalQuestion)), answerCorrect: false };
}
