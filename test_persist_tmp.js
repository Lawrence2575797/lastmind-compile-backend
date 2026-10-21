require('dotenv/config');
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

    const { error: subErr } = await adminClient.from('subscriptions').insert({ user_id: userId, status: 'active' });
    if (subErr) throw subErr;

    const { data: signIn, error: signInErr } = await anonClient.auth.signInWithPassword({ email: testEmail, password: testPassword });
    if (signInErr) throw signInErr;
    const token = signIn.session.access_token;
    const authHeaders = { Authorization: `Bearer ${token}` };

    const { data: q, error: qErr } = await adminClient
      .from('practice_questions')
      .select('id, question_text, mark_tariff, mark_scheme_type, mark_scheme_json, subject, topic, concept')
      .eq('mark_scheme_type', 'multiple_choice')
      .limit(1).maybeSingle();
    if (qErr) throw qErr;
    console.log('testing against MC question:', q.question_text.slice(0, 50));

    const params = new URLSearchParams({ subject: q.subject, topic: q.topic, concept: q.concept });
    const listBefore = await fetch(`${BACKEND_URL}/practice-questions?${params}`, { headers: authHeaders }).then(r => r.json());
    const thisQBefore = listBefore.find(x => x.id === q.id);
    console.log('BEFORE any answer - priorAttempt:', thisQBefore ? thisQBefore.priorAttempt : 'question not in this list?!');

    const correctIndex = q.mark_scheme_json.correctIndex;
    const submit1 = await fetch(`${BACKEND_URL}/practice-questions/${q.id}/submit`, {
      method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ answerText: String(correctIndex) }),
    });
    console.log('FIRST submit status:', submit1.status, await submit1.clone().json());

    const submit2 = await fetch(`${BACKEND_URL}/practice-questions/${q.id}/submit`, {
      method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ answerText: String((correctIndex + 1) % q.mark_scheme_json.options.length) }),
    });
    console.log('SECOND submit (different answer) status:', submit2.status, await submit2.clone().json());

    const listAfter = await fetch(`${BACKEND_URL}/practice-questions?${params}`, { headers: authHeaders }).then(r => r.json());
    const thisQAfter = listAfter.find(x => x.id === q.id);
    console.log('AFTER - priorAttempt on reload:', thisQAfter.priorAttempt);

    const { count } = await adminClient.from('practice_question_attempts').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('question_id', q.id);
    console.log('Number of attempt rows actually stored for this user+question:', count);
  } finally {
    if (userId) { await adminClient.auth.admin.deleteUser(userId); console.log('cleaned up test user'); }
  }
})();
