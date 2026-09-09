import { FRESH_GENERATION_CAP_MONTH } from './generationCaps';

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
// MONTHLY_LOCK_ALLOTMENT is sized directly off the fresh-generation usage
// cap already agreed (generationCaps.ts's FRESH_GENERATION_CAP_MONTH) —
// assuming every one of a month's worth of lessons cost as much as the
// most expensive lesson type, first-time encoding generation. It's a
// ceiling on total spend across EVERY metered action in the app, not
// fresh generation alone — fresh generation itself is separately, and
// more tightly, rate-limited by generationCapService.ts's own rolling
// 2h/day/week windows regardless of Lock balance.
export const ENCODING_LESSON_LOCK_COST = 128;
export const RETRIEVAL_LESSON_LOCK_COST = 13;
export const MONTHLY_LOCK_ALLOTMENT = FRESH_GENERATION_CAP_MONTH * ENCODING_LESSON_LOCK_COST;

// Held when booking a weekly calendar lesson slot (src/routes/locks.ts),
// refunded if a qualifying lesson is started inside the booked window,
// forfeited if not. Kept at the same ~8.3% share of the monthly
// allotment this had before the allotment itself was recalibrated — a
// real stake, not a token deduction.
export const LESSON_DEPOSIT_LOCK_AMOUNT = Math.round((MONTHLY_LOCK_ALLOTMENT * 10) / 120);
