// Locks — a monthly usage cap on the Claude-cost-incurring lesson types
// (encoding + spaced retrieval, both already premium-only), deliberately
// separate from Keys (earned by learning, spent on real-world rewards —
// the opposite direction). Locks are granted at the start of each
// calendar month, like a subscription allotment, and only ever spent.
//
// The numbers below are calibrated against a rough internal budget of
// ~£10/month of Claude spend per user, at roughly 10 cents/encoding
// lesson (the founder's own figure) — NEVER surface this £/lesson
// reasoning, or any exact cents-per-Lock figure, anywhere user-facing.
// The exchange rate (120 Locks ≈ £10 → ~8.3p/Lock) is intentionally not a
// round number, and the 2:1 encoding:retrieval ratio only roughly tracks
// real relative cost (Opus-heavy chain generation + fact-checking for
// encoding vs Sonnet/Haiku-only grading for retrieval) rather than
// reproducing it exactly — the whole point is that a user staring at
// these numbers can't cleanly back-calculate what a lesson actually
// costs to generate.
export const MONTHLY_LOCK_ALLOTMENT = 120;
export const ENCODING_LESSON_LOCK_COST = 2;
export const RETRIEVAL_LESSON_LOCK_COST = 1;

// Held when booking a weekly calendar lesson slot (src/routes/locks.ts),
// refunded if a qualifying lesson is started inside the booked window,
// forfeited if not. Deliberately a real stake relative to the monthly
// allotment (120) — losing a booking should actually sting, not be a
// token deduction.
export const LESSON_DEPOSIT_LOCK_AMOUNT = 10;
