import { Request, Response, NextFunction } from 'express';
import { verifyUser, supabaseAdmin } from './supabaseAdmin';

// Extends Express's Request type so authenticated routes can read
// req.userId/req.userEmail without casting.
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userEmail?: string | null;
      userCreatedAt?: string | null;
    }
  }
}

/**
 * Requires a valid Bearer token, verified cryptographically against
 * Supabase itself — never trusts a claimed user ID, same principle used
 * throughout the rest of the backend. Rejects with 401 if missing or
 * invalid. On success, attaches the real verified user ID (and email, for
 * requireAdmin below) to the request for the route handler to use.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const accessToken = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!accessToken) {
    return res.status(401).json({ error: 'missing bearer token' });
  }

  const user = await verifyUser(accessToken);
  if (!user) {
    return res.status(401).json({ error: 'invalid or expired session' });
  }

  req.userId = user.id;
  req.userEmail = user.email;
  req.userCreatedAt = user.createdAt;
  next();
}

// The one and only admin gate in this codebase — no role/permissions table
// exists anywhere, so this is a deliberately simple hardcoded allowlist
// (Render env var, comma-separated) rather than new schema, scoped to
// exactly the one thing that needs it today: the overdue-help-request
// queue (see routes/admin.ts) that lets the owner personally fulfil the
// "if they don't respond, I will step in" guarantee. Must run AFTER
// requireAuth — depends on req.userEmail already being set.
const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const email = (req.userEmail || '').toLowerCase();
  if (!email || !ADMIN_EMAILS.has(email)) {
    return res.status(403).json({ error: 'not authorized' });
  }
  next();
}

// The same SAME `subscriptions` table lastmind-stripe-backend's
// /api/token-for-user reads (same Supabase project) — never trusts
// anything the frontend claims about the caller's tier. Exposed as a plain
// boolean check (not just the requirePaidTier gate below) for routes that
// stay reachable on both tiers but need to know WHICH tier applies — e.g.
// the knowledge-map Verify route's free/premium credit coefficient.
export async function isUserPaid(userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('subscriptions')
    .select('status')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return !!data && data.status === 'active';
}

// TEMPORARY: every premium-gated route left open to every account while
// testers are active, per explicit instruction — no manual per-tester
// premium grant, without touching the Locks economy at all. Deliberately
// NOT done by changing isUserPaid() itself (that would also inflate the
// monthly Locks allotment every route above ultimately meters against —
// see lockService.ts's monthlyLockAllotmentForTier) - only this gate is
// bypassed, so a free account still gets the free tier's own Locks
// amount, exactly as asked. Revert by restoring the body below (kept
// commented, not deleted, specifically so this is a one-line flip back
// rather than reconstructing it from memory).
export async function requirePaidTier(req: Request, res: Response, next: NextFunction) {
  next();
  // try {
  //   if (!(await isUserPaid(req.userId as string))) {
  //     return res.status(403).json({ error: 'this feature requires LastMind Premium' });
  //   }
  //   next();
  // } catch (err) {
  //   console.error('Paid-tier check failed:', err);
  //   res.status(500).json({ error: 'could not verify your subscription' });
  // }
}
