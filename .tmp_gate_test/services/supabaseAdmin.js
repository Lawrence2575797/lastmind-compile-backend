"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabaseAdmin = void 0;
exports.verifyUser = verifyUser;
const supabase_js_1 = require("@supabase/supabase-js");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('Warning: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set. ' +
        'FSRS review endpoints will not work until these are configured.');
}
// The SERVICE ROLE key bypasses Row Level Security entirely — this client
// must only ever exist here, server-side. Never sent to the browser, never
// logged, treated exactly like an API secret key.
exports.supabaseAdmin = (0, supabase_js_1.createClient)(SUPABASE_URL || '', SUPABASE_SERVICE_ROLE_KEY || '');
// Verifies a Supabase access token cryptographically against Supabase
// itself, returning the real user ID if valid — never trust a
// client-supplied user ID directly, same principle used throughout the
// rest of the backend.
async function verifyUser(accessToken) {
    const { data, error } = await exports.supabaseAdmin.auth.getUser(accessToken);
    if (error || !data?.user)
        return null;
    return data.user.id;
}
