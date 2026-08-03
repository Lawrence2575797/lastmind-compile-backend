import { Request, Response, NextFunction } from 'express';
import { verifyUser } from './supabaseAdmin';

// Extends Express's Request type so authenticated routes can read
// req.userId without casting.
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/**
 * Requires a valid Bearer token, verified cryptographically against
 * Supabase itself — never trusts a claimed user ID, same principle used
 * throughout the rest of the backend. Rejects with 401 if missing or
 * invalid. On success, attaches the real verified user ID to req.userId
 * for the route handler to use.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const accessToken = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!accessToken) {
    return res.status(401).json({ error: 'missing bearer token' });
  }

  const userId = await verifyUser(accessToken);
  if (!userId) {
    return res.status(401).json({ error: 'invalid or expired session' });
  }

  req.userId = userId;
  next();
}
