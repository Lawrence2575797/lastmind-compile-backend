"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabaseAdmin_1 = require("../services/supabaseAdmin");
const authMiddleware_1 = require("../services/authMiddleware");
const rateLimiters_1 = require("../services/rateLimiters");
const reviewService_1 = require("../services/reviewService");
const router = (0, express_1.Router)();
// POST /review  { conceptId: string, rating: 'again'|'hard'|'good'|'easy' }
// Grades one concept through the real FSRS algorithm and persists the
// updated state. This is meant to be called with a rating already decided
// by the diagnostic tree's own verdict — not a raw student self-rating.
// Rate-limited specifically because nothing else stops a logged-in user
// from spamming this to artificially inflate their own FSRS stability.
router.post('/review', authMiddleware_1.requireAuth, rateLimiters_1.costlyEndpointLimiter, async (req, res) => {
    const { conceptId, rating } = req.body ?? {};
    if (typeof conceptId !== 'string' || !conceptId.trim() || typeof rating !== 'string') {
        return res.status(400).json({ error: "conceptId and rating ('again'|'hard'|'good'|'easy') are both required" });
    }
    try {
        const { newState } = await (0, reviewService_1.gradeAndRecordReview)(req.userId, conceptId, rating);
        res.json({ conceptId, ...newState });
    }
    catch (err) {
        console.error('Review grading failed:', err);
        res.status(500).json({ error: 'could not record this review' });
    }
});
// GET /due  — concept IDs currently due for review for the verified user.
router.get('/due', authMiddleware_1.requireAuth, rateLimiters_1.costlyEndpointLimiter, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin_1.supabaseAdmin
            .from('concept_reviews')
            .select('concept_id, due, stability, difficulty')
            .eq('user_id', req.userId)
            .lte('due', new Date().toISOString())
            .order('due', { ascending: true });
        if (error)
            throw error;
        res.json({ due: data || [] });
    }
    catch (err) {
        console.error('Fetching due concepts failed:', err);
        res.status(500).json({ error: 'could not fetch due concepts' });
    }
});
// GET /schedule — every tracked concept for this user with its next due
// date, sorted soonest-first, regardless of whether it's overdue yet.
// This is the sidebar calendar's data source — /due alone only returns
// what's ALREADY due, not the full upcoming picture.
router.get('/schedule', authMiddleware_1.requireAuth, rateLimiters_1.costlyEndpointLimiter, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin_1.supabaseAdmin
            .from('concept_reviews')
            .select('concept_id, due')
            .eq('user_id', req.userId)
            .order('due', { ascending: true });
        if (error)
            throw error;
        res.json({ schedule: data || [] });
    }
    catch (err) {
        console.error('Fetching schedule failed:', err);
        res.status(500).json({ error: 'could not fetch schedule' });
    }
});
exports.default = router;
