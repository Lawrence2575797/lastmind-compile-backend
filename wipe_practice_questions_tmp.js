require('dotenv/config');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const { error: delErr, count } = await supabase
    .from('practice_questions')
    .delete({ count: 'exact' })
    .not('id', 'is', null); // delete every row
  if (delErr) throw delErr;
  console.log('Deleted practice_questions rows:', count);

  const { data: remainingQ, error: qErr } = await supabase.from('practice_questions').select('id', { count: 'exact', head: true });
  if (qErr) throw qErr;
  console.log('Remaining practice_questions rows:', remainingQ === null ? 0 : remainingQ.length);

  const { data: remainingA, error: aErr } = await supabase.from('practice_question_attempts').select('id', { count: 'exact', head: true });
  if (aErr) throw aErr;
  console.log('Remaining practice_question_attempts rows (should be 0 via cascade):', remainingA === null ? 0 : remainingA.length);
})();
