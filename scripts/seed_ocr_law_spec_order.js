// Precomputes each Law subtopic's teaching order from the prerequisite-sorted graph (free), so the
// first student to open a subtopic never triggers the per-subtopic Claude ordering call.
require('dotenv/config');
const { createClient } = require('@supabase/supabase-js');
const map = require('../src/data/ocrLawALevel.json');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const rows = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await db.from('knowledge_map_nodes').select('id,node_key').eq('subject', map.subject).eq('qualification', map.qualification).eq('exam_board', map.examBoard).range(from, from + 499).order('id');
    if (error) throw error; rows.push(...data); if (data.length < 500) break;
  }
  const uuid = new Map(rows.map((r) => [r.node_key, r.id]));
  const bySub = new Map();
  for (const n of map.nodes) { // map.nodes is already in topological order
    if (!bySub.has(n.subtopic)) bySub.set(n.subtopic, []);
    bySub.get(n.subtopic).push(uuid.get(n.id));
  }
  const out = [...bySub.entries()].map(([subtopic, node_order]) => ({ subject: map.subject, qualification: map.qualification, exam_board: map.examBoard, subtopic, node_order }));
  const { error } = await db.from('knowledge_map_node_spec_order').upsert(out, { onConflict: 'subject,qualification,exam_board,subtopic' });
  if (error) throw error;
  console.log(`spec order stored for ${out.length} subtopics; missing uuids: ${out.flatMap((o) => o.node_order).filter((x) => !x).length}`);
})().catch((e) => { console.error(e.message || e); process.exitCode = 1; });
