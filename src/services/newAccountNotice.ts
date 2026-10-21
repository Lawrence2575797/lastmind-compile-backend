import { supabaseAdmin } from './supabaseAdmin';

// Tells the owner when a brand-new account first uses LastMind: the address, how they signed up, and when. The address is the owner's to see as the
// operator of the service (it is already held in Supabase Auth, and the privacy policy says so). It is only sent where NEW_ACCOUNT_NOTIFY_URL points
// (an ntfy topic, a Discord or Slack webhook); with none set, nothing leaves the server and the owner can read /admin/new-accounts instead.
const FRESH_MS = 48 * 3600 * 1000;
export async function notifyNewAccount(userId: string): Promise<void> {
  try {
    const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
    const u = data?.user;
    if (!u) return;
    const made = u.created_at ? Date.parse(u.created_at) : NaN;
    if (!Number.isFinite(made) || Date.now() - made > FRESH_MS) return;   // an older account this server is only now meeting is not news
    console.log('New LastMind account created:', userId);
    const url = process.env.NEW_ACCOUNT_NOTIFY_URL;
    if (!url || !/^https:\/\//i.test(url)) return;
    const provider = (u.app_metadata as any)?.provider || 'email';
    const text = `New LastMind account: ${u.email || 'no email'} (${provider}, ${u.email_confirmed_at ? 'email confirmed' : 'email not confirmed yet'}) at ${new Date(made).toISOString()}`;
    const json = /discord(app)?\.com\/api\/webhooks\//i.test(url) ? { content: text } : /hooks\.slack\.com\//i.test(url) ? { text } : null;
    await fetch(url, {
      method: 'POST',
      headers: json ? { 'Content-Type': 'application/json' } : { Title: 'New LastMind account' },
      body: json ? JSON.stringify(json) : text,
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    console.error('New-account notice failed:', err);
  }
}
