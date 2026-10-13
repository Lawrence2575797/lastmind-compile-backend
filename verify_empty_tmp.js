require('dotenv/config');
const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = 'sb_publishable_Bb-f61P1zqy_xW63D26nUw_VTOVXaub';
const BACKEND_URL = 'https://lastmind-compile-backend.onrender.com';
const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const anonClient = createClient(SUPABASE_URL, ANON_KEY);
const testEmail = `lastmind-emptytest-${Date.now()}@example.com`;
(async () => {
  let userId = null;
  try {
    const { data: created } = await adminClient.auth.admin.createUser({ email: testEmail, password: 'Test-Password-12345!', email_confirm: true });
    userId = created.user.id;
    const { data: signIn } = await anonClient.auth.signInWithPassword({ email: testEmail, password: 'Test-Password-12345!' });
    const token = signIn.session.access_token;
    await adminClient.from('subscriptions').insert({ user_id: userId, status: 'active' });
    const params = new URLSearchParams({ subject: 'Economics', topic: '1.1 Nature of economics', concept: 'Opportunity cost' });
    const resp = await fetch(`${BACKEND_URL}/practice-questions?${params}`, { headers: { Authorization: `Bearer ${token}` } });
    console.log('HTTP', resp.status);
    console.log(await resp.json());
  } finally {
    if (userId) {
      await adminClient.from('subscriptions').delete().eq('user_id', userId);
      await adminClient.auth.admin.deleteUser(userId);
    }
  }
})();
