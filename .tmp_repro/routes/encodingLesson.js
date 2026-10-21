"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../services/authMiddleware");
const rateLimiters_1 = require("../services/rateLimiters");
const chainService_1 = require("../services/chainService");
const encodingLessonService_1 = require("../services/encodingLessonService");
const router = (0, express_1.Router)();
router.use('/encoding-lesson', authMiddleware_1.requireAuth);
// POST /encoding-lesson/start  { subject, topic, concept, qualification?, examBoard? }
// The first-time lesson for a concept — a novelty hook fact, a
// knowledge-check of its close prerequisites, then deriving the concept
// itself and its implications. See encodingLessonService.ts for the full
// design. qualification/examBoard are optional and only used to bias
// terminology and (rarely) verify a retrieved diagram.
router.post('/encoding-lesson/start', rateLimiters_1.costlyEndpointLimiter, async (req, res) => {
    const { subject, topic, concept, qualification, examBoard } = req.body ?? {};
    if (typeof subject !== 'string' || typeof topic !== 'string' || typeof concept !== 'string') {
        return res.status(400).json({ error: 'subject, topic, and concept are all required' });
    }
    try {
        const conceptKey = (0, chainService_1.normalizeConceptKey)(subject, topic, concept);
        const result = await (0, encodingLessonService_1.startEncodingLesson)(conceptKey, subject, topic, concept, typeof qualification === 'string' ? qualification : '', typeof examBoard === 'string' ? examBoard : '');
        res.json(result);
    }
    catch (err) {
        console.error('Encoding lesson start failed:', err);
        res.status(500).json({ error: 'could not start the lesson' });
    }
});
// POST /encoding-lesson/submit  { state, answer, dontKnow? }
router.post('/encoding-lesson/submit', rateLimiters_1.costlyEndpointLimiter, async (req, res) => {
    const { state, answer, dontKnow } = req.body ?? {};
    if (!state) {
        return res.status(400).json({ error: 'state is required (from the previous /encoding-lesson/start or /encoding-lesson/submit response)' });
    }
    try {
        const result = await (0, encodingLessonService_1.submitEncodingAnswer)(req.userId, state, typeof answer === 'string' ? answer : '', !!dontKnow);
        res.json(result);
    }
    catch (err) {
        console.error('Encoding lesson answer processing failed:', err);
        res.status(500).json({ error: 'could not process this answer' });
    }
});
exports.default = router;
