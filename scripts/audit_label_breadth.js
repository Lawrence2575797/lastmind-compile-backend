// READ-ONLY: which node labels name several ideas at once (they produce oversize lessons)? Skips Spanish/Italian.
require('dotenv').config({ override: true });
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
function score(label) {
  const reasons = []; let s = 0;
  const commas = (label.match(/,/g) || []).length, ands = (label.match(/\b(and|&|plus)\b/gi) || []).length, slashes = (label.match(/\//g) || []).length, semis = (label.match(/[;:]/g) || []).length;
  if (label.length > 110) { s += 2; reasons.push('very long label'); } else if (label.length > 85) { s += 1; reasons.push('long label'); }
  if (commas >= 2) { s += 2; reasons.push(commas + ' commas'); }
  if (ands >= 2) { s += 1; reasons.push(ands + ' "and"s'); }
  if (slashes >= 2) { s += 1; reasons.push(slashes + ' slashes'); }
  if (semis >= 1 && label.length > 70) { s += 1; reasons.push('colon/semicolon'); }
  return { s, reasons };
}
(async () => {
  const nodes = []; for (let f = 0; ; f += 1000) { const { data, error } = await db.from('knowledge_map_nodes').select('id, subject, qualification, exam_board, label, subtopic').range(f, f + 999); if (error) throw error; nodes.push(...data); if (data.length < 1000) break; }
  const keep = nodes.filter((n) => !['Spanish', 'Italian'].includes(n.subject));
  const has = new Set(); for (let i = 0; i < keep.length; i += 200) { const { data } = await db.from('knowledge_map_node_lessons').select('node_id').in('node_id', keep.slice(i, i + 200).map((n) => n.id)); (data || []).forEach((r) => has.add(r.node_id)); }
  const out = keep.map((n) => ({ ...n, ...score(n.label), hasLesson: has.has(n.id) })).filter((n) => n.s >= 3).sort((a, b) => b.s - a.s);
  const per = {}; keep.forEach((n) => { const k = n.subject + ' ' + n.qualification; per[k] = per[k] || { total: 0, broad: 0 }; per[k].total++; }); out.forEach((n) => per[n.subject + ' ' + n.qualification].broad++);
  console.log(JSON.stringify(per, null, 1));
  fs.writeFileSync('scripts/label_breadth_audit.json', JSON.stringify(out, null, 1));
  out.slice(0, 12).forEach((n) => console.log(n.s, n.hasLesson ? 'L' : '-', n.subject, '|', n.label.slice(0, 120)));
})().catch((e) => { console.error(e.message); process.exit(1); });
