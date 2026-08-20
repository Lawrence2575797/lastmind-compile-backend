import { Request, Response, NextFunction } from 'express';
import { verifyUser } from './supabaseAdmin';

// Extends Express's Request type so authenticated routes can read
// req.userId/req.userEmail without casting.
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userEmail?: string | null;
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
