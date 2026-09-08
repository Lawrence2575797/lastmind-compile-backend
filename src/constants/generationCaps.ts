// Usage caps on FRESH knowledge-map-v2 generation (a genuine cache miss -
// generateAndCacheNodeLesson/generateAndCacheEdgeLesson, real Sonnet cost)
// - Premium only, per explicit product decision. Deliberately NOT the
// existing Locks currency (lock_balances/MONTHLY_LOCK_ALLOTMENT in
// locks.ts) - that system is untouched and keeps governing its own,
// older lesson pipeline (encodingLessonService.ts/spacedLessonEngine.ts).
// This is a separate, simpler count-based limiter: every fresh
// generation counts as exactly one unit against every window below,
// deliberately NOT distinguishing cache-hit vs cache-miss cost (there is
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
