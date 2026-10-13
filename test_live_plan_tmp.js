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
      email: testEmail,
      password: testPassword,
      email_confirm: true,
    });
    if (createErr) throw createErr;
    userId = created.user.id;

    const { data: signIn, error: signInErr } = await anonClient.auth.signInWithPassword({
      email: testEmail,
      password: testPassword,
    });
    if (signInErr) throw signInErr;
    const token = signIn.session.access_token;

    const params = new URLSearchParams({ subject: 'Economics', qualification: 'A-Level', examBoard: 'Edexcel' });
    const resp = await fetch(`${BACKEND_URL}/spec-lesson-plan?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log('HTTP status:', resp.status);
    const body = await resp.json();
    console.log('subtopics returned:', Array.isArray(body.subtopics) ? body.subtopics.length : body.subtopics);
    if (Array.isArray(body.subtopics) && body.subtopics.length) {
      console.log('first subtopic:', body.subtopics[0].subtopic, '-', body.subtopics[0].concepts.length, 'concepts');
    }
  } finally {
    if (userId) {
      await adminClient.auth.admin.deleteUser(userId);
      console.log('cleaned up test user');
    }
  }
})();
