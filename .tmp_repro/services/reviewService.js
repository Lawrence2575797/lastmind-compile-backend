"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RATING_MAP = void 0;
exports.gradeAndRecordReview = gradeAndRecordReview;
exports.getMasteryStatus = getMasteryStatus;
const supabaseAdmin_1 = require("./supabaseAdmin");
const fsrsService_1 = require("./fsrsService");
exports.RATING_MAP = {
    again: fsrsService_1.Rating.Again,
    hard: fsrsService_1.Rating.Hard,
    good: fsrsService_1.Rating.Good,
    easy: fsrsService_1.Rating.Easy,
};
/**
 * Grades one concept through the real FSRS algorithm and persists the
 * updated state for a given user. Also returns the PREVIOUS row (before
 * this grade), since the diagnostic engine needs it for two things: the
 * MASTERED_THRESHOLD skip-check (is this node already solid enough to
 * skip re-testing) and the "was the schedule actually followed" check
 * (comparing when a review was due against when it actually happened).
 */
async function gradeAndRecordReview(userId, conceptId, ratingKey) {
    const fsrsRating = exports.RATING_MAP[ratingKey.toLowerCase()];
    if (!fsrsRating) {
        throw new Error(`Invalid rating: ${ratingKey}`);
    }
    const { data: existingRow, error: fetchError } = await supabaseAdmin_1.supabaseAdmin
        .from('concept_reviews')
        .select('*')
        .eq('user_id', userId)
        .eq('concept_id', conceptId)
        .maybeSingle();
    if (fetchError)
        throw fetchError;
    const currentCard = existingRow ? (0, fsrsService_1.rowToCard)(existingRow) : (0, fsrsService_1.newCard)();
    const { card: updatedCard } = (0, fsrsService_1.gradeReview)(currentCard, fsrsRating);
    const rowFields = (0, fsrsService_1.cardToRowFields)(updatedCard);
    const { error: upsertError } = await supabaseAdmin_1.supabaseAdmin
        .from('concept_reviews')
        .upsert({ user_id: userId, concept_id: conceptId, ...rowFields, updated_at: new Date().toISOString() }, { onConflict: 'user_id,concept_id' });
    if (upsertError)
        throw upsertError;
    return { previousRow: existingRow, newState: rowFields };
}
/**
 * Checks whether a concept already has enough real review history to skip
 * re-testing it (the MASTERED_THRESHOLD pre-filter from the diagnostic
 * spec). Deliberately requires BOTH a real stability figure AND at least
 * one prior rep — a single lucky first review can get an artificially
 * confident population-default stability estimate, so stability alone
 * isn't trusted on its own.
 */
async function getMasteryStatus(userId, conceptId) {
    const { data: row, error } = await supabaseAdmin_1.supabaseAdmin
        .from('concept_reviews')
        .select('*')
        .eq('user_id', userId)
        .eq('concept_id', conceptId)
        .maybeSingle();
    if (error)
        throw error;
    if (!row)
        return { row: null, isMastered: false, scheduleWasFollowed: null };
    const MASTERY_STABILITY_THRESHOLD = 30; // days — a real, deliberately conservative bar
    const MIN_REPS_FOR_TRUST = 2; // guards against a single lucky first review
    const isMastered = row.stability >= MASTERY_STABILITY_THRESHOLD && row.reps >= MIN_REPS_FOR_TRUST;
    // Was this review actually done on schedule, or overdue? Compares the
    // gap between when it was due and roughly now (the review happening
    // right now IS the "actual review date" in this context).
    let scheduleWasFollowed = null;
    if (row.last_review) {
        const dueDate = new Date(row.due).getTime();
        const now = Date.now();
        const overdueDays = (now - dueDate) / (1000 * 60 * 60 * 24);
        // A generous grace window — a day or two late is normal life, not
        // "the schedule wasn't followed."
        scheduleWasFollowed = overdueDays <= 2;
    }
    return { row, isMastered, scheduleWasFollowed };
}
