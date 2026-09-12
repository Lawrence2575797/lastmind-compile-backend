// One-off: deletes the OLD live Economics/A-Level/Edexcel knowledge-map
// rows (cascades to edges/node_lessons/edge_lessons via their existing FK
// constraints) so ingest_knowledge_map.js's next run inserts the newly
// regenerated, more-atomic map cleanly instead of colliding with the old
// node_key/concept_id values. Then wipes concept_reviews (FSRS progress)
// for austinjwood095@gmail.com scoped to Economics only - explicitly
// authorized by the user for this one account, this one subject, as part
// of replacing the live map out from under it.
//
// Usage: node scripts/replace_live_economics_map.js
require('dotenv').config({ override: true });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SUBJECT = 'Economics';
const QUALIFICATION = 'A-Level';
const EXAM_BOARD = 'Edexcel';
const TARGET_EMAIL = 'austinjwood095@gmail.com';

async function main() {
  console.log(`Deleting old ${SUBJECT}/${QUALIFICATION}/${EXAM_BOARD} knowledge_map_nodes rows (cascades edges/lessons)...`);
  const { data: deleted, error: deleteError } = await supabase
    .from('knowledge_map_nodes')
    .delete()
    .eq('subject', SUBJECT)
    .eq('qualification', QUALIFICATION)
    .eq('exam_board', EXAM_BOARD)
    .select('id');
  if (deleteError) throw deleteError;
  console.log(`  -> deleted ${deleted.length} old node rows.`);

  console.log(`Wiping FSRS progress (concept_reviews) for ${TARGET_EMAIL} scoped to ${SUBJECT}...`);
  const { data: users, error: userError } = await supabase.auth.admin.listUsers();
  if (userError) throw userError;
  const user = users.users.find((u) => (u.email || '').toLowerCase() === TARGET_EMAIL.toLowerCase());
  if (!user) {
    console.warn(`  -> no user found with email ${TARGET_EMAIL} - skipping FSRS wipe (nothing to do).`);
  } else {
    const conceptPrefix = SUBJECT.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_') + ':';
    const { data: reviewRows, error: reviewFetchError } = await supabase
      .from('concept_reviews')
      .select('concept_id')
      .eq('user_id', user.id)
      .like('concept_id', `${conceptPrefix}%`);
    if (reviewFetchError) throw reviewFetchError;
    console.log(`  -> found ${reviewRows.length} concept_reviews rows matching '${conceptPrefix}*' for this user.`);
    if (reviewRows.length) {
      const { error: reviewDeleteError } = await supabase
        .from('concept_reviews')
        .delete()
        .eq('user_id', user.id)
        .like('concept_id', `${conceptPrefix}%`);
      if (reviewDeleteError) throw reviewDeleteError;
      console.log(`  -> deleted ${reviewRows.length} concept_reviews rows.`);
    }
  }

  console.log('\nDone. Now run: node scripts/ingest_knowledge_map.js');
}

main().catch((err) => { console.error(err); process.exit(1); });
