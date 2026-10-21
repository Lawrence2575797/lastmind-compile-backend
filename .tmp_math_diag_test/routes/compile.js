"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const piiFilterStructured_1 = require("../safety/piiFilterStructured");
const piiFilterContextual_1 = require("../safety/piiFilterContextual");
const harmfulContentFilter_1 = require("../safety/harmfulContentFilter");
const claudeClient_1 = require("../services/claudeClient");
const authMiddleware_1 = require("../services/authMiddleware");
const rateLimiters_1 = require("../services/rateLimiters");
const router = (0, express_1.Router)();
router.post('/compile', authMiddleware_1.requireAuth, rateLimiters_1.costlyEndpointLimiter, async (req, res) => {
    const { notes } = req.body;
    if (typeof notes !== 'string' || notes.trim().length === 0) {
        return res.status(400).json({
            error: 'Invalid input: notes must be a non-empty string.',
        });
    }
    try {
        // 1) Structured PII removal (regex-based shapes: emails, phones, etc.)
        const cleaned1 = (0, piiFilterStructured_1.applyStructuredPIIFilter)(notes);
        // 2) Contextual PII removal (phrase-based: "my name is X", etc.)
        const cleaned2 = (0, piiFilterContextual_1.applyContextualPIIFilter)(cleaned1);
        // 3) Harmful content cleaning (keyword/heuristic-based)
        const safeText = (0, harmfulContentFilter_1.applyHarmfulContentFilter)(cleaned2);
        // 4) Only the filtered text ever reaches Claude.
        const result = await (0, claudeClient_1.processNotes)(safeText);
        return res.status(200).json({
            result,
            safeText,
        });
    }
    catch (err) {
        console.error('Unexpected error in /compile:', err);
        return res.status(500).json({
            error: 'Processing failed. Please try again later.',
        });
    }
});
exports.default = router;
