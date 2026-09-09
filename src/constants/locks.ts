// Locks — a monthly usage cap on every Claude-cost-incurring action in
// the app (encoding + spaced retrieval lessons here, plus every other
// metered action charged via chargeLocksForUsage elsewhere), deliberately
// separate from Keys (earned by learning, spent on real-world rewards —
// the opposite direction). Locks are granted at the start of each
// calendar month, like a subscription allotment, and only ever spent.
//
// Exchange rate: 1 Lock = $0.0001 (1/100th of a cent) of real Claude API
// cost — see modelPricing.ts's USD_PER_LOCK, the one rate every Lock
// charge in this app is priced against.
//
// ENCODING_LESSON_LOCK_COST/RETRIEVAL_LESSON_LOCK_COST below are real
// measured costs at that rate, not an obscured round number: a
// first-time encoding lesson's generate+grade call costs ~$0.0128
// (~128 Locks); a retrieval/spaced-review grading call costs ~$0.0013
// (~13 Locks).
//
// MONTHLY_LOCK_ALLOTMENT was originally sized off generationCaps.ts's
// FRESH_GENERATION_CAP_MONTH (150 at the time) x this file's own
// ENCODING_LESSON_LOCK_COST - assuming every one of a month's worth of
// lessons cost as much as the most expensive lesson type. That constant
// has since been raised (see generationCaps.ts's own comment - a separate,
// deliberate free/premium generation-cap redesign), so the multiplication
// is now spelled out as a literal (150, the ORIGINAL fresh-generation
// month figure) rather than importing the now-changed constant - Locks
// itself is explicitly out of scope for that redesign and must not move
// as a side effect of it. It's a ceiling on total spend across EVERY
// metered action in the app, not fresh generation alone - fresh
// generation itself is separately, and more tightly, rate-limited by
// generationCapService.ts's own windows regardless of Lock balance.
export const ENCODING_LESSON_LOCK_COST = 128;
export const RETRIEVAL_LESSON_LOCK_COST = 13;
export const MONTHLY_LOCK_ALLOTMENT = 150 * ENCODING_LESSON_LOCK_COST;

// Held when booking a weekly calendar lesson slot (src/routes/locks.ts),
// refunded if a qualifying lesson is started inside the booked window,
// forfeited if not. Kept at the same ~8.3% share of the monthly
// allotment this had before the allotment itself was recalibrated — a
// real stake, not a token deduction.
export const LESSON_DEPOSIT_LOCK_AMOUNT = Math.round((MONTHLY_LOCK_ALLOTMENT * 10) / 120);
