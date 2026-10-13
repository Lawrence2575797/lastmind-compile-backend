require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function normalizeForPlanMatch(value) {
  return (value || '').trim().toLowerCase().replace(/[\s-]+/g, '');
}

(async () => {
  const subject = 'Economics', qualification = 'A-Level', examBoard = 'Edexcel';
  const { data, error } = await supabase
    .from('spec_lesson_plans')
    .select('subject, qualification, exam_board, subtopic, concept, lesson_order')
    .ilike('subject', subject)
    .order('subtopic', { ascending: true })
    .order('lesson_order', { ascending: true });
  if (error) { console.error(error); process.exit(1); }
  console.log('total rows fetched (ilike subject):', data.length);
  const wantQ = normalizeForPlanMatch(qualification);
  const wantE = normalizeForPlanMatch(examBoard);
  const matched = data.filter(r => normalizeForPlanMatch(r.qualification) === wantQ && normalizeForPlanMatch(r.exam_board || '') === wantE);
  console.log('matched rows with normalized A-Level/Edexcel:', matched.length);
  console.log('sample stored qualification value:', data[0] && data[0].qualification);
  const subtopics = new Set(matched.map(r => r.subtopic));
  console.log('distinct subtopics:', subtopics.size);
})();
