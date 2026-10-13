require('dotenv/config');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const testEmail = `lastmind-sectest-${Date.now()}@example.com`;

(async () => {
  let userId = null;
  try {
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email: testEmail, password: 'Test-Password-12345!', email_confirm: true,
    });
    if (createErr) throw createErr;
    userId = created.user.id;

    const { data: q } = await supabase.from('practice_questions').select('id').limit(1).maybeSingle();

    const row = { user_id: userId, question_id: q.id, answer_text: 'x', mark_awarded: 1, mark_tariff: 1, feedback: 'x' };
    const first = await supabase.from('practice_question_attempts').insert(row);
    console.log('First direct insert:', first.error ? `FAILED: ${first.error.message}` : 'succeeded');

    const second = await supabase.from('practice_question_attempts').insert(row);
    if (second.error) {
      console.log('Second direct insert (duplicate user+question) BLOCKED:', second.error.code, second.error.message);
      console.log(second.error.code === '23505' ? 'UNIQUE CONSTRAINT IS LIVE - hardening applied.' : 'blocked, but not by the expected unique constraint code');
    } else {
      console.log('Second direct insert SUCCEEDED - unique constraint NOT yet applied (app-level guard still protects real users, but DB-level race protection is missing).');
    }
  } finally {
    if (userId) {
      await supabase.from('practice_question_attempts').delete().eq('user_id', userId);
      await supabase.auth.admin.deleteUser(userId);
      console.log('cleaned up test user + rows');
    }
  }
})();
