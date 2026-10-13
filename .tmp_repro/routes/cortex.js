"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../services/authMiddleware");
const rateLimiters_1 = require("../services/rateLimiters");
const cortexService_1 = require("../services/cortexService");
const router = (0, express_1.Router)();
router.use('/cortex', authMiddleware_1.requireAuth, rateLimiters_1.costlyEndpointLimiter);
// POST /cortex/message  { message, history, folders, dueReviews }
// { reply, action }
//
// The single stateful-feeling entry point for Cortex, but actually
// stateless server-side — the frontend holds and resends the chat
// history each call, same pattern as the diagnostic engine's `state`.
// If the decided action is "generate_notes", the note content itself is
// already generated and attached by the time this responds.
router.post('/cortex/message', async (req, res) => {
    const { message, history, folders, dueReviews } = req.body ?? {};
    if (typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({ error: 'message is required' });
    }
    try {
        const result = await (0, cortexService_1.decideCortexAction)(message, Array.isArray(history) ? history : [], Array.isArray(folders) ? folders : [], Array.isArray(dueReviews) ? dueReviews : []);
        res.json(result);
    }
    catch (err) {
        console.error('Cortex message handling failed:', err);
        res.status(500).json({ error: 'could not process this message' });
    }
});
exports.default = router;
