require('dotenv/config');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const { data: plans, error: e1 } = await supabase
    .from('spec_lesson_plans')
    .select('concept_id, subtopic, concept')
    .eq('subject', 'Economics').eq('qualification', 'A Level').eq('exam_board', 'Edexcel');
  if (e1) throw e1;

  const { data: questions, error: e2 } = await supabase
    .from('practice_questions')
    .select('concept_id, mark_tariff')
    .eq('subject', 'Economics').eq('qualification', 'A Level').eq('exam_board', 'Edexcel');
  if (e2) throw e2;

  console.log('Total lesson plan rows (concepts):', plans.length);
  console.log('Total practice question rows:', questions.length);

  const countByConceptId = new Map();
  for (const q of questions) countByConceptId.set(q.concept_id, (countByConceptId.get(q.concept_id) || 0) + 1);

  let missing = 0, shortfall = 0;
  for (const p of plans) {
    const count = countByConceptId.get(p.concept_id) || 0;
    if (count === 0) { console.log('MISSING entirely:', p.subtopic, '-', p.concept, '(concept_id:', p.concept_id + ')'); missing++; }
    else if (count < 4) { console.log('SHORTFALL:', p.subtopic, '-', p.concept, '- only', count); shortfall++; }
  }

  const planConceptIds = new Set(plans.map(p => p.concept_id));
  let orphaned = 0;
  for (const [cid] of countByConceptId) {
    if (!planConceptIds.has(cid)) { console.log('ORPHANED concept_id (no matching lesson plan row):', cid); orphaned++; }
  }

  const tariffCounts = {};
  for (const q of questions) tariffCounts[q.mark_tariff] = (tariffCounts[q.mark_tariff] || 0) + 1;
  console.log('Tariff distribution:', tariffCounts);

  console.log(`\nSummary: ${plans.length} lessons, ${missing} missing entirely, ${shortfall} with <4 questions, ${orphaned} orphaned concept_ids.`);
  if (missing === 0 && shortfall === 0 && orphaned === 0) console.log('ALL GOOD - every lesson has >=4 questions, every question matches a real lesson.');
})();
