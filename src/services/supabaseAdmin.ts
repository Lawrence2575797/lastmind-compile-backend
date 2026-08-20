import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    'Warning: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set. ' +
    'FSRS review endpoints will not work until these are configured.'
  );
}

// The SERVICE ROLE key bypasses Row Level Security entirely — this client
// must only ever exist here, server-side. Never sent to the browser, never
// logged, treated exactly like an API secret key.
export const supabaseAdmin = createClient(SUPABASE_URL || '', SUPABASE_SERVICE_ROLE_KEY || '');

export interface VerifiedUser {
  id: string;
  email: string | null;
}

// Verifies a Supabase access token cryptographically against Supabase
// itself, returning the real user identity if valid — never trust a
// client-supplied user ID directly, same principle used throughout the
// rest of the backend. Email is included alongside id purely so
// authMiddleware.ts can gate the admin overdue-queue behind an
// ADMIN_EMAILS allowlist — there's no role/permissions table anywhere in
// this codebase, and email is the one piece of real identity Supabase Auth
// already verifies for us.
export async function verifyUser(accessToken: string): Promise<VerifiedUser | null> {
  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !data?.user) return null;
  return { id: data.user.id, email: data.user.email || null };
}
