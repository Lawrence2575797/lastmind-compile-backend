"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
const supabaseAdmin_1 = require("./supabaseAdmin");
/**
 * Requires a valid Bearer token, verified cryptographically against
 * Supabase itself — never trusts a claimed user ID, same principle used
 * throughout the rest of the backend. Rejects with 401 if missing or
 * invalid. On success, attaches the real verified user ID to req.userId
 * for the route handler to use.
 */
async function requireAuth(req, res, next) {
    const header = req.headers.authorization || '';
    const accessToken = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!accessToken) {
        return res.status(401).json({ error: 'missing bearer token' });
    }
    const userId = await (0, supabaseAdmin_1.verifyUser)(accessToken);
    if (!userId) {
        return res.status(401).json({ error: 'invalid or expired session' });
    }
    req.userId = userId;
    next();
}
