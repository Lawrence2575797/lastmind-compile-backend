require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = 'sb_publishable_Bb-f61P1zqy_xW63D26nUw_VTOVXaub';
const BACKEND_URL = 'https://lastmind-compile-backend.onrender.com';

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const anonClient = createClient(SUPABASE_URL, ANON_KEY);

const testEmail = `lastmind-test-${Date.now()}@example.com`;
const testPassword = 'Test-Password-12345!';

(async () => {
  let userId = null;
  try {
    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email: testEmail, password: testPassword, email_confirm: true,
    });
    if (createErr) throw createErr;
    userId = created.user.id;

    const { data: signIn, error: signInErr } = await anonClient.auth.signInWithPassword({
      email: testEmail, password: testPassword,
    });
    if (signInErr) throw signInErr;
    const token = signIn.session.access_token;

    const { error: subErr } = await adminClient.from('subscriptions').insert({ user_id: userId, status: 'active' });
    if (subErr) throw subErr;

    // Grab a real question id from Topic 1.1 to submit a free-text answer against
    // (needs the AI marking path, not the MC shortcut, to exercise the new columns/prompt).
    const { data: q, error: qErr } = await adminClient
      .from('practice_questions')
      .select('id, question_text, mark_tariff, mark_scheme_type')
      .neq('mark_scheme_type', 'multiple_choice')
      .limit(1)
      .maybeSingle();
    if (qErr) throw qErr;
    if (!q) { console.log('no non-MC question found to test against'); return; }
    console.log('testing against:', q.question_text.slice(0, 60), '...', q.mark_tariff, 'marks');

    const resp = await fetch(`${BACKEND_URL}/practice-questions/${q.id}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ answerText: 'Opportunity cost is the value of the next best alternative foregone when a choice is made, for example choosing to study instead of working means giving up potential wages.' }),
    });
    console.log('HTTP status:', resp.status);
    const body = await resp.json();
    console.log(JSON.stringify(body, null, 2));
  } finally {
    if (userId) {
      await adminClient.auth.admin.deleteUser(userId);
      console.log('cleaned up test user');
    }
  }
})();
