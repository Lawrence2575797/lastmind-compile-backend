"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../services/authMiddleware");
const rateLimiters_1 = require("../services/rateLimiters");
const chainService_1 = require("../services/chainService");
const router = (0, express_1.Router)();
router.post('/chains/generate', authMiddleware_1.requireAuth, rateLimiters_1.costlyEndpointLimiter, async (req, res) => {
    const { subject, topic, concept } = req.body ?? {};
    if (typeof subject !== 'string' || typeof topic !== 'string' || typeof concept !== 'string') {
        return res.status(400).json({ error: 'subject, topic, and concept are all required' });
    }
    const conceptKey = (0, chainService_1.normalizeConceptKey)(subject, topic, concept);
    try {
        const result = await (0, chainService_1.getOrGenerateChain)(conceptKey, subject, topic, concept);
        if (result.error === 'unresolved_must_fix') {
            return res.status(500).json({ error: 'Generated chain failed verification and could not be auto-corrected. Not cached.' });
        }
        res.json({ conceptKey, chain: result.chain, source: result.source });
    }
    catch (err) {
        console.error(`Chain generation failed for "${conceptKey}":`, err);
        res.status(500).json({ error: 'could not generate a dependency chain for this concept' });
    }
});
exports.default = router;
