// Usage caps on FRESH knowledge-map-v2 generation (a genuine cache miss -
// generateAndCacheNodeLesson/generateAndCacheEdgeLesson, real Sonnet cost)
// - Premium only, per explicit product decision. Enforced as its own
// simple count-based limiter (fresh_generation_events), separate from the
// Locks currency (lock_balances) - a heavy user can hit this window cap
// before ever running short on Locks, and vice versa. The two ARE sized
// off each other though: locks.ts's own MONTHLY_LOCK_ALLOTMENT is
// FRESH_GENERATION_CAP_MONTH x the Locks cost of a first-time encoding
// lesson, so the two ceilings agree on what "a month's worth of usage"
// means even though nothing here reads or writes lock_balances directly.
// Every fresh generation counts as exactly one unit against every window
// below, deliberately NOT distinguishing cache-hit vs cache-miss cost (there is
// no cache-hit case here by definition - a cache hit never reaches
// generateAndCache*, see routes/knowledgeMap.ts's own lesson routes).
//
// Sized off a real, measured cost: a first-time node-lesson generation +
// its grading call costs ~$0.0128 today (Sonnet 5 generation + Haiku
// grading, current API pricing). The tiered numbers below (13/25/40) are
// small multiples of each other, not the same number repeated, so each
// window is a genuinely tighter ceiling than "just stack the shorter
// one" - two full 2-hour bursts would be 26, but the day cap stops that
// at 25; two full days would be 50, but the week cap stops that at 40.
// WEEK is the real gate for a sustained heavy user - by design, it's
// reachable only after ~1.5-2 genuinely heavy days, not casual use, and
// hitting it is the intended trigger to offer buying more usage (not yet
// built - see chainLesson.ts's own comment on this being the missing
// piece). MONTH resets on the calendar month boundary (matching the
// existing lock_balances pattern's own currentMonthStart), a real but
// looser backstop above the weekly figure.
export const FRESH_GENERATION_CAP_2H = 13;
export const FRESH_GENERATION_CAP_DAY = 25;
export const FRESH_GENERATION_CAP_WEEK = 40;
export const FRESH_GENERATION_CAP_MONTH = 150;
