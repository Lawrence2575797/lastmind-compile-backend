import { rateLimit } from 'express-rate-limit';

// First line of defense — applied globally, keyed by IP, before any auth
// check even runs. Loose on purpose: this exists to stop a script from
// hammering the server wholesale, not to police legitimate use.
export const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

// A tighter limit specifically for the cost-incurring, Claude-calling
// endpoints (/compile, /chains/generate) — keyed by the VERIFIED user ID
// (from requireAuth, which must run before this), not IP. Keying by user
// rather than IP matters here: many students can share one school IP, and
// IP-based limiting alone would either be too strict for them or too loose
// to actually stop one abusive account.
export const costlyEndpointLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.userId || req.ip || 'unknown',
  message: { error: 'Too many requests to this endpoint. Please slow down.' },
});

// Folder/page sync isn't Claude-cost-incurring (just a Supabase read/write),
// so costlyEndpointLimiter's 10/min would break completely normal use — a
// student editing notes fires a debounced save on every pause in typing,
// and switching between a few pages/folders alone can exceed that. This is
// still per-user bounded against a runaway client bug or genuine abuse,
// just at a limit generous enough that ordinary editing never gets near it.
export const syncEndpointLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.userId || req.ip || 'unknown',
  message: { error: 'Too many sync requests. Please slow down.' },
});
