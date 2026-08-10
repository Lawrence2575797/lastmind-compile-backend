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
