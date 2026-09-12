// One-off manual fix, not a general mechanism: the 3 Economics concepts
// the user had already encoded before day1_checks existed (Positive
// economic statements, Normative economic statements, Distinguishing
// positive from normative statements) have no day1_checks row at all,
// since scheduleDay1Check only ever fires on a concept's first-ever
// grade - which already happened for these before the migration ran.
// Explicitly NOT a blanket backfill across every subject/concept this
// account has ever encoded - just these 3, by name, per direct
// instruction. due_date = today so it's immediately testable rather
// than waiting until tomorrow.
require('dotenv').config({ override: true });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const TARGET_EMAIL = 'austinjwood095@gmail.com';
const CONCEPT_IDS = [
  'economics:1_1_nature_of_economics:positive_economic_statements',
  'economics:1_1_nature_of_economics:normative_economic_statements',
  'economics:1_1_nature_of_economics:distinguishing_positive_from_normative_statements',
];

async function main() {
  const { data: users } = await supabase.auth.admin.listUsers();
  const user = users.users.find((u) => (u.email || '').toLowerCase() === TARGET_EMAIL);
  if (!user) throw new Error('user not found');

  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('day1_checks')
    .upsert(
      CONCEPT_IDS.map((concept_id) => ({ user_id: user.id, concept_id, due_date: today })),
      { onConflict: 'user_id,concept_id', ignoreDuplicates: true }
    )
    .select();
  if (error) throw error;
  console.log(`Inserted ${data.length} day1_checks rows (due ${today}):`);
  data.forEach((r) => console.log('  -', r.concept_id));
}

main().catch((err) => { console.error(err); process.exit(1); });
