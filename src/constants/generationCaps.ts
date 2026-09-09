// Usage caps on FRESH knowledge-map-v2 generation (a genuine cache miss -
// generateAndCacheNodeLesson/generateAndCacheEdgeLesson, real Sonnet cost).
// Both tiers are capped (see generationCapService.ts) - previously only
// Premium was, which left free accounts completely uncapped on real
// generation spend; that's the actual bug this two-tier split fixes, per
// explicit product decision. Sized off a real, measured cost: a first-time
// node-lesson generation + its grading call costs ~$0.0128 today (Sonnet 5
// generation + Haiku grading, current API pricing).
//
// PREMIUM: 2h/day unchanged from the original single-tier figures; week
// and month raised (40->100, 150->300) so a genuinely heavy premium month
// is 300 lessons - exactly 3x the free monthly figure below (a real,
// deliberate 200%-higher-than-free ceiling, expressed in lessons, not
// Locks - the two systems are unrelated, see lockService.ts). Resets:
// 2h/day/week are ROLLING windows (exact lookback from now - a calendar-
// boundary reset would let a student burn the cap right before midnight
// and again right after); MONTH resets on the calendar boundary, same
// convention as lockService.ts's own currentMonthStart.
export const FRESH_GENERATION_CAP_2H = 13;
export const FRESH_GENERATION_CAP_DAY = 25;
export const FRESH_GENERATION_CAP_WEEK = 100;
export const FRESH_GENERATION_CAP_MONTH = 300;

// FREE: hour/day/week are rolling windows, same philosophy as Premium's
// 2h/day/week above. MONTH is the one deliberate difference in shape, not
// just number - it resets on the student's own signup-anniversary day
// each month (see generationCapService.ts's currentAnchorMonthStartIso),
// not the calendar month boundary, so a free account's usage always
// resets on the same day-of-month they joined on. 100/month is exactly
// 1/3 of Premium's 300 - the "200% higher" ratio the product decision is
// stated in.
export const FREE_GENERATION_CAP_HOUR = 4;
export const FREE_GENERATION_CAP_DAY = 8;
export const FREE_GENERATION_CAP_WEEK = 25;
export const FREE_GENERATION_CAP_MONTH = 100;
