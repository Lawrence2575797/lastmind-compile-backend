require('dotenv/config');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = 'sb_publishable_Bb-f61P1zqy_xW63D26nUw_VTOVXaub';
const BACKEND_URL = 'https://lastmind-compile-backend.onrender.com';

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const anonClient = createClient(SUPABASE_URL, ANON_KEY);

const testEmail = `lastmind-marktest2-${Date.now()}@example.com`;
const testPassword = 'Test-Password-12345!';

async function submitAndShow(token, question, answerText, label) {
  console.log(`\n=== ${label} ===`);
  console.log('Question:', question.question_text);
  console.log('Tariff:', question.mark_tariff, '| Type:', question.mark_scheme_type);
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

    // The actual positive/normative disagreement question, on-topic strong answer, no evaluation attempted
    const { data: aqaQ } = await adminClient
      .from('practice_questions')
      .select('*')
      .eq('subject', 'Economics').eq('exam_board', 'AQA')
      .ilike('question_text', '%economists often disagree%')
      .limit(1).maybeSingle();
    if (aqaQ) {
      await submitAndShow(token, aqaQ, 'Economists can agree on the positive facts of a situation but still disagree on policy because economics is not value-free once policy is involved. For example, two economists might agree that raising the minimum wage will cause some job losses in low-wage sectors, but disagree on whether the policy should go ahead, because one prioritises reducing poverty and inequality (a value judgement about fairness) while the other prioritises minimising unemployment and preserving business flexibility. This is a normative disagreement about which objective should take priority, not a disagreement about the facts themselves. Similarly, economists may agree that a carbon tax would reduce emissions but disagree on whether the resulting cost to low-income households outweighs the environmental benefit, again a value judgement rather than a factual dispute. Different economists also give different weights to competing macroeconomic objectives, such as growth versus environmental sustainability, which is why the same facts can lead to different policy recommendations.', 'AQA Econ - strong, genuinely on-topic answer (no evaluation, matching the real 9-mark rule)');
    } else {
      console.log('question not found');
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
