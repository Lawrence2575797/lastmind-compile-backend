"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decideCortexAction = decideCortexAction;
const claudeClient_1 = require("./claudeClient");
const cortexPrompts_1 = require("../constants/cortexPrompts");
function stripCodeFences(text) {
    return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}
/**
 * Decides what (if anything) the student is asking Cortex to do, from a
 * single JSON-schema Claude call — same convention every other prompt in
 * this backend uses, deliberately not the SDK's native tool-use, so this
 * doesn't introduce a second pattern for the same job. Chat history is
 * passed in fresh each call rather than stored server-side, matching how
 * the diagnostic engine's `state` is round-tripped opaquely elsewhere.
 *
 * If the decided action is "generate_notes", immediately makes a second
 * call to actually write the notes, so the frontend gets ready-to-insert
 * content in one round trip instead of a second one.
 */
async function decideCortexAction(message, history, folders, dueReviews) {
    const userContent = [
        `Folder structure:\n${JSON.stringify(folders)}`,
        `Due reviews:\n${JSON.stringify(dueReviews)}`,
        history.length
            ? `Recent conversation:\n${history.map((h) => `${h.role}: ${h.content}`).join('\n')}`
            : 'No prior conversation this session.',
        `Student's latest message: ${message}`,
    ].join('\n\n');
    const raw = await (0, claudeClient_1.callClaudeJSON)({
        model: claudeClient_1.MODELS.diagnosticTree,
        systemPrompt: cortexPrompts_1.CORTEX_INTENT_PROMPT,
        userContent,
        temperature: 0.3,
    });
    const parsed = JSON.parse(stripCodeFences(raw));
    if (parsed.action && parsed.action.type === 'generate_notes') {
        const notesRaw = await (0, claudeClient_1.callClaudeJSON)({
            model: claudeClient_1.MODELS.diagnosticTree,
            systemPrompt: cortexPrompts_1.CORTEX_NOTE_GENERATION_PROMPT,
            userContent: `Subject: ${parsed.action.subject}\nTopic: ${parsed.action.topic}\nLesson: ${parsed.action.lesson}`,
            temperature: 0.4,
        });
        const notesParsed = JSON.parse(stripCodeFences(notesRaw));
        parsed.action.noteContent = notesParsed.notes;
    }
    return parsed;
}
