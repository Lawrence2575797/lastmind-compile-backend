"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../services/authMiddleware");
const rateLimiters_1 = require("../services/rateLimiters");
const chainService_1 = require("../services/chainService");
const spacedLessonEngine_1 = require("../services/spacedLessonEngine");
const router = (0, express_1.Router)();
router.use('/chain-lesson', authMiddleware_1.requireAuth, rateLimiters_1.costlyEndpointLimiter);
// POST /chain-lesson/start  { subject, topic, concept }
// Begins a scaffold-then-chunk lesson session for a chain — the multi-day
// counterpart to the reactive diagnostic engine. Chunking granularity is
// read from chain_lesson_progress automatically, based on how many times
// this chain's lesson has been completed before.
router.post('/chain-lesson/start', async (req, res) => {
    const { subject, topic, concept } = req.body ?? {};
    if (typeof subject !== 'string' || typeof topic !== 'string' || typeof concept !== 'string') {
        return res.status(400).json({ error: 'subject, topic, and concept are all required' });
    }
    try {
        const conceptKey = (0, chainService_1.normalizeConceptKey)(subject, topic, concept);
        const result = await (0, spacedLessonEngine_1.startChainLesson)(req.userId, conceptKey, subject, topic, concept);
        res.json(result);
    }
    catch (err) {
        console.error('Chain lesson start failed:', err);
        res.status(500).json({ error: 'could not start the chain lesson' });
    }
});
// POST /chain-lesson/submit  { state, answer }
router.post('/chain-lesson/submit', async (req, res) => {
    const { state, answer } = req.body ?? {};
    if (!state) {
        return res.status(400).json({ error: 'state is required (from the previous /chain-lesson/start or /chain-lesson/submit response)' });
    }
    try {
        const result = await (0, spacedLessonEngine_1.processChainLessonAnswer)(req.userId, state, typeof answer === 'string' ? answer : '');
        res.json(result);
    }
    catch (err) {
        console.error('Chain lesson answer processing failed:', err);
        res.status(500).json({ error: 'could not process this answer' });
    }
});
exports.default = router;
