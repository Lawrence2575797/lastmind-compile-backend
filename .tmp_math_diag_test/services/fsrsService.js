"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.State = exports.Rating = void 0;
exports.newCard = newCard;
exports.gradeReview = gradeReview;
exports.rowToCard = rowToCard;
exports.cardToRowFields = cardToRowFields;
const ts_fsrs_1 = require("ts-fsrs");
Object.defineProperty(exports, "Rating", { enumerable: true, get: function () { return ts_fsrs_1.Rating; } });
Object.defineProperty(exports, "State", { enumerable: true, get: function () { return ts_fsrs_1.State; } });
// 92% is the retention target settled on for LastMind — deliberately on
// the higher end of FSRS's typical 85-95% range. The asymmetry: a student
// reviewing slightly more than strictly optimal costs a little time; a
// student whose system let something genuinely decay past recall right
// before a real exam is a much worse failure for a product whose whole
// pitch is "we catch what you don't know."
const params = (0, ts_fsrs_1.generatorParameters)({
    request_retention: 0.92,
    maximum_interval: 36500, // ~100 years — effectively "no cap", let the algorithm decide
});
const scheduler = (0, ts_fsrs_1.fsrs)(params);
/** A fresh card for a concept node that's never been reviewed before. */
function newCard(now = new Date()) {
    return (0, ts_fsrs_1.createEmptyCard)(now);
}
/**
 * Runs one graded review through the real FSRS algorithm, returning the
 * updated card state. `rating` must come from the diagnostic tree's own
 * verdict — never a student self-rating (see the diagnosis-to-grade
 * mapping this is meant to be called from):
 *   Encoding failure              -> Rating.Again
 *   Retrieval failure             -> Rating.Hard
 *   Clean pass                    -> Rating.Good or Rating.Easy
 *   Careless slip (once resolved) -> does not affect the concept's own
 *                                    grade at all — a slip is a statement
 *                                    about execution, not about whether
 *                                    the concept itself is known.
 */
function gradeReview(card, rating, now = new Date()) {
    return scheduler.next(card, now, rating); // { card: <new state>, log: <review log> }
}
function rowToCard(row) {
    return {
        due: new Date(row.due),
        stability: row.stability,
        difficulty: row.difficulty,
        elapsed_days: row.elapsed_days,
        scheduled_days: row.scheduled_days,
        reps: row.reps,
        lapses: row.lapses,
        state: row.state,
        last_review: row.last_review ? new Date(row.last_review) : undefined,
    };
}
function cardToRowFields(card) {
    return {
        due: card.due.toISOString(),
        stability: card.stability,
        difficulty: card.difficulty,
        elapsed_days: card.elapsed_days,
        scheduled_days: card.scheduled_days,
        reps: card.reps,
        lapses: card.lapses,
        state: card.state,
        last_review: card.last_review ? new Date(card.last_review).toISOString() : null,
    };
}
