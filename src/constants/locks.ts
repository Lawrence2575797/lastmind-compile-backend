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
import { FRESH_GENERATION_CAP_MONTH, FREE_GENERATION_CAP_MONTH } from './generationCaps';

export const ENCODING_LESSON_LOCK_COST = 128;
export const RETRIEVAL_LESSON_LOCK_COST = 13;

// Deliberately coupled to each tier's own fresh-generation MONTHLY cap -
// "however many lessons this tier can fresh-generate in a month, priced
// at the most expensive lesson type (encoding)". This was previously a
// single flat allotment shared by both tiers, explicitly decoupled from
// generationCaps.ts at the time so Locks wouldn't move as an ACCIDENTAL
// side effect of an unrelated generation-cap change - this re-coupling is
// a deliberate, explicit product decision (Premium and Free should have
// their own Lock ceilings matching their own generation caps), not a
// reversion of that earlier caution.
export const PREMIUM_MONTHLY_LOCK_ALLOTMENT = FRESH_GENERATION_CAP_MONTH * ENCODING_LESSON_LOCK_COST; // 300 * 128 = 38,400
export const FREE_MONTHLY_LOCK_ALLOTMENT = FREE_GENERATION_CAP_MONTH * ENCODING_LESSON_LOCK_COST; // 100 * 128 = 12,800

export function monthlyLockAllotmentForTier(isPaid: boolean): number {
  return isPaid ? PREMIUM_MONTHLY_LOCK_ALLOTMENT : FREE_MONTHLY_LOCK_ALLOTMENT;
}

// Held when booking a weekly calendar lesson slot (src/routes/locks.ts),
// refunded if a qualifying lesson is started inside the booked window,
// forfeited if not. Kept at its previous absolute value (was ~8.3% of the
// old flat 19,200 allotment) rather than re-derived from either new
// tier-specific figure - booking-deposit sizing isn't part of this
// per-tier recalibration.
export const LESSON_DEPOSIT_LOCK_AMOUNT = 1600;
