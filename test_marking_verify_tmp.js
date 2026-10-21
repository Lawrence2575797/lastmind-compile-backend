require('dotenv/config');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = 'sb_publishable_Bb-f61P1zqy_xW63D26nUw_VTOVXaub';
const BACKEND_URL = 'https://lastmind-compile-backend.onrender.com';

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const anonClient = createClient(SUPABASE_URL, ANON_KEY);

const testEmail = `lastmind-marktest-${Date.now()}@example.com`;
const testPassword = 'Test-Password-12345!';

async function submitAndShow(token, question, answerText, label) {
  console.log(`\n=== ${label} ===`);
  console.log('Question:', question.question_text.slice(0, 100));
  console.log('Tariff:', question.mark_tariff, '| Type:', question.mark_scheme_type);
  console.log('Answer given:', answerText.slice(0, 100));
  const resp = await fetch(`${BACKEND_URL}/practice-questions/${question.id}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ answerText }),
  });
  const body = await resp.json();
  console.log('HTTP', resp.status, '->', JSON.stringify(body, null, 2));
}

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

    // --- AQA Economics: a 9-mark "explain" question (should need NO evaluation) ---
    const { data: aqaQ } = await adminClient
      .from('practice_questions')
      .select('*')
      .eq('subject', 'Economics').eq('exam_board', 'AQA').eq('mark_tariff', 9)
      .limit(1).maybeSingle();
    if (aqaQ) {
      await submitAndShow(token, aqaQ, 'A monopolist restricts output below the competitive level and charges a price above marginal cost. This creates a deadweight welfare loss because some consumers who would have bought the good at a price between marginal cost and the monopoly price no longer do so, and the resources that would have produced it are not used. A diagram would show the monopoly output Qm below the competitive output Qc, with monopoly price Pm above marginal cost, and a deadweight loss triangle between the two output levels.', 'AQA Econ - strong analytical answer, no evaluation attempted (should still score well since 9-mark AQA needs no evaluation)');

      await submitAndShow(token, aqaQ, 'Monopoly is bad because it is unfair to people and the government should stop it because big companies are greedy.', 'AQA Econ - weak, unsubstantiated answer (should score low)');
    } else {
      console.log('No AQA 9-mark question found to test');
    }

    // --- Edexcel Psychology: a free-response question ---
    const { data: psyQ } = await adminClient
      .from('practice_questions')
      .select('*')
      .eq('subject', 'Psychology').eq('exam_board', 'Edexcel').neq('mark_scheme_type', 'multiple_choice')
      .limit(1).maybeSingle();
    if (psyQ) {
      await submitAndShow(token, psyQ, 'This is a random unrelated answer about baking cakes and has nothing to do with psychology at all.', 'Edexcel Psych - deliberately irrelevant answer (should score 0 and flag conceptual mistake)');
    } else {
      console.log('No Edexcel Psychology non-MC question found to test');
    }
  } finally {
    if (userId) {
      await adminClient.from('practice_question_attempts').delete().eq('user_id', userId);
      await adminClient.from('subscriptions').delete().eq('user_id', userId);
      await adminClient.auth.admin.deleteUser(userId);
      console.log('\ncleaned up test user + rows');
    }
  }
})();
