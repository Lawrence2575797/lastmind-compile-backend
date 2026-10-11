require('dotenv/config');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  for (let i = 0; i < 40; i++) {
    const email = 'poll-test-' + Date.now() + '@example.invalid';
    const { data: created } = await supabase.auth.admin.createUser({ email, password: 'Temp1234!', email_confirm: true });
    const userId = created.user.id;
    const { data: signIn } = await supabase.auth.signInWithPassword({ email, password: 'Temp1234!' });
    const token = signIn.session.access_token;

    try {
      const resp = await fetch('https://lastmind-compile-backend.onrender.com/verification/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ subject: 'PollTest', topic: 'PollTest', concept: 'PollTest-' + i, qualification: 'A Level', examBoard: 'AQA' })
      });
      await resp.json();

      const { data: rows } = await supabase.from('learning_profile_entries').select('id').eq('user_id', userId);
      await supabase.auth.admin.deleteUser(userId);

      if (rows && rows.length > 0) {
        console.log('DEPLOYED - row created successfully on attempt', i + 1);
        process.exit(0);
      }
      console.log('attempt', i + 1, '- not yet, waiting...');
    } catch (err) {
      console.log('attempt', i + 1, '- transient error (likely mid-restart):', err.message);
      await supabase.auth.admin.deleteUser(userId).catch(() => {});
    }
    await new Promise((r) => setTimeout(r, 8000));
  }
  console.log('TIMED OUT after 40 attempts');
})();
