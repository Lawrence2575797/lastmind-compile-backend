require('dotenv/config');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function clean(s) { return (s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_'); }
function specOutlineKey(subject, qualification, examBoard) {
  return `${clean(subject)}::${clean(qualification)}::${clean(examBoard)}`;
}

async function main() {
  const key = specOutlineKey('Economics', 'A Level', 'Edexcel');
  console.log('Looking up outline_key:', key);
  const { data, error } = await supabase
    .from('exam_spec_outlines')
    .select('outline_key, subject, qualification, exam_board, outline, microtopics, source_note, created_at')
    .eq('outline_key', key)
    .maybeSingle();

  if (error) {
    console.error('QUERY ERROR:', error);
    process.exit(1);
  }
  if (!data) {
    console.log('NO ROW FOUND for this key.');
    return;
  }
  console.log('ROW FOUND.');
  console.log('source_note:', data.source_note);
  console.log('created_at:', data.created_at);
  console.log('outline length (chars):', (data.outline || '').length);
  console.log('microtopics present:', !!data.microtopics);
  if (data.microtopics) {
    const mt = data.microtopics;
    console.log('microtopics themes count:', (mt.themes || []).length);
    (mt.themes || []).forEach(t => {
      const subCount = (t.subtopics || []).length;
      const totalPoints = (t.subtopics || []).reduce((sum, s) => sum + (s.microtopics || []).length, 0);
      console.log(`  Theme: ${t.theme} -> ${subCount} subtopics, ${totalPoints} microtopic points`);
    });
  }
}

main().catch(e => { console.error(e); process.exit(1); });
