"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runSharedEncodingCheck = runSharedEncodingCheck;
const claudeClient_1 = require("./claudeClient");
const reviewService_1 = require("./reviewService");
const diagnosticPrompts_1 = require("../constants/diagnosticPrompts");
function stripCodeFences(text) {
    return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}
/**
 * The shared encoding-vs-retrieval check — runs BEFORE any atomic/
 * mechanistic branching, exactly matching the agreed tree order (section 2
 * applies regardless of which branch comes next). Extracted here rather
 * than left inside either engine specifically so both the atomic and
 * mechanistic engines can call it without importing each other.
 */
async function runSharedEncodingCheck(userId, conceptId, conceptLabel) {
    const mastery = await (0, reviewService_1.getMasteryStatus)(userId, conceptId);
    if (mastery.isMastered) {
        if (mastery.scheduleWasFollowed === true) {
            return { result: 'schedule_miscalibrated' };
        }
        return { result: 'decay_schedule_skipped' };
    }
    const recognition = await (0, claudeClient_1.callClaudeJSON)({
        model: claudeClient_1.MODELS.diagnosticTree,
        systemPrompt: diagnosticPrompts_1.RECOGNITION_QUESTION_PROMPT,
        userContent: `Concept: ${conceptLabel}`,
        temperature: 0.3,
    }).then((raw) => JSON.parse(stripCodeFences(raw)));
    return {
        result: 'needs_recognition_test',
        question: recognition.question,
        options: recognition.options,
        correctAnswer: recognition.options[recognition.correctOptionIndex],
    };
}
