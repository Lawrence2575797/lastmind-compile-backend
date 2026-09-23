// Derives spec_lesson_plans rows MECHANICALLY from the already-built/ingested knowledge map - no new content, no
// API call. This guarantees concept_id matches ingest_warwick_econ_l100_map.js's scheme exactly (both compute it
// the same way from the same node data), which is what lets specLessonPracticeService.ts find a lesson plan for
// every concept the knowledge map actually has.
require('dotenv/config');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const map = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/data/warwickEconL100.json'), 'utf8'));
const clean = (value) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
const conceptId = (node) => `${clean(map.subject)}:${clean(node.subtopic)}:${clean(node.label)}`;
const moduleCodeOf = (nodeId) => (nodeId.match(/^([a-z]+\d+)_/) || [, null])[1]?.toUpperCase() || 'UNKNOWN';

async function main() {
  const bySubtopic = new Map();
  for (const node of map.nodes) {
    if (!bySubtopic.has(node.subtopic)) bySubtopic.set(node.subtopic, []);
    bySubtopic.get(node.subtopic).push(node);
  }
  const rows = [];
  for (const [subtopic, nodes] of bySubtopic) {
    nodes.forEach((node, i) => {
      rows.push({
        subject: map.subject,
        qualification: map.qualification,
        exam_board: map.examBoard,
        theme: node.theme,
        subtopic,
        lesson_order: i + 1,
        concept: node.label,
        branch: moduleCodeOf(node.id),
        concept_id: conceptId(node),
      });
    });
  }

  await supabase.from('spec_lesson_plans').delete().match({ subject: map.subject, qualification: map.qualification, exam_board: map.examBoard });
  console.log(`Inserting ${rows.length} lesson plan rows...`);
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from('spec_lesson_plans').insert(rows.slice(i, i + 500));
    if (error) { console.error('Insert failed:', JSON.stringify(error)); process.exit(1); }
  }
  console.log('Done.');
}
main();
