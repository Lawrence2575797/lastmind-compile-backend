// READ-ONLY audit: how long is each stored encoding lesson (encoding_content.explanation), per subject?
// Flags lessons that pack in too much for a quick scroll-through card, so they can be split into smaller nodes.
// Skips Spanish and Italian. Writes nothing to the database.
//   node scripts/audit_lesson_length.js            -> prints a summary and writes scripts/lesson_length_audit.json
require('dotenv').config({ override: true });
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SKIP = new Set(['Spanish', 'Italian']);

// Thresholds for "too much for one card": a student should get the point in well under a minute of reading.
const WORDS_WARN = 110, WORDS_BAD = 160;
const LIST_ITEMS_BAD = 4;   // a numbered or bulleted list this long is a list to memorise, not one idea

function measure(text) {
  const t = String(text || '');
  const words = (t.match(/\S+/g) || []).length;
  const listItems = (t.match(/^\s*(?:\d+[.)]|[-*•])\s+/gm) || []).length;
  const sentences = (t.match(/[.!?](?:\s|$)/g) || []).length;
  const cases = (t.match(/\b[A-Z][A-Za-z']+ v [A-Z][A-Za-z']+|\(\d{4}\)/g) || []).length;
  const paragraphs = t.split(/\n\s*\n/).filter((p) => p.trim()).length;
  const equalsDefs = (t.match(/ = /g) || []).length;
  return { words, listItems, sentences, cases, paragraphs, equalsDefs };
}
function grade(m) {
  const reasons = [];
  if (m.words > WORDS_BAD) reasons.push(`${m.words} words`);
  else if (m.words > WORDS_WARN) reasons.push(`${m.words} words (long)`);
  if (m.listItems >= LIST_ITEMS_BAD) reasons.push(`${m.listItems}-item list`);
  if (m.cases >= 4) reasons.push(`${m.cases} cases/dates`);
  if (m.equalsDefs >= 4) reasons.push(`${m.equalsDefs} definitions`);
  const bad = m.words > WORDS_BAD || m.listItems >= LIST_ITEMS_BAD || m.cases >= 4 || m.equalsDefs >= 4;
  return { level: bad ? 'split' : reasons.length ? 'long' : 'ok', reasons };
}

async function fetchAll(table, cols, filter) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from(table).select(cols).range(from, from + 999);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

(async () => {
  const nodes = await fetchAll('knowledge_map_nodes', 'id, subject, qualification, exam_board, label, subtopic');
  const kept = nodes.filter((n) => !SKIP.has(n.subject));
  const byId = new Map(kept.map((n) => [n.id, n]));
  const lessons = [];
  const ids = [...byId.keys()];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db.from('knowledge_map_node_lessons').select('node_id, encoding_content').in('node_id', ids.slice(i, i + 200));
    if (error) throw error;
    lessons.push(...data);
  }
  const groups = {};
  const rows = [];
  for (const l of lessons) {
    const n = byId.get(l.node_id);
    const text = l.encoding_content && l.encoding_content.explanation;
    if (!n || !text) continue;
    const m = measure(text), g = grade(m);
    const key = `${n.subject} — ${n.qualification}${n.exam_board ? ' (' + n.exam_board + ')' : ''}`;
    const s = (groups[key] = groups[key] || { nodes: 0, withLesson: 0, split: 0, long: 0, words: [] });
    s.withLesson++; s.words.push(m.words);
    if (g.level === 'split') s.split++; else if (g.level === 'long') s.long++;
    rows.push({ map: key, nodeId: n.id, label: n.label, subtopic: n.subtopic, ...m, level: g.level, reasons: g.reasons });
  }
  for (const n of kept) { const key = `${n.subject} — ${n.qualification}${n.exam_board ? ' (' + n.exam_board + ')' : ''}`; (groups[key] = groups[key] || { nodes: 0, withLesson: 0, split: 0, long: 0, words: [] }).nodes++; }

  const pct = (arr, p) => { const a = [...arr].sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : 0; };
  console.log('map | nodes | lessons stored | median words | p90 words | to split | long');
  for (const [k, s] of Object.entries(groups).sort()) console.log([k, s.nodes, s.withLesson, pct(s.words, 0.5), pct(s.words, 0.9), s.split, s.long].join(' | '));
  fs.writeFileSync(path.join(__dirname, 'lesson_length_audit.json'), JSON.stringify({ thresholds: { WORDS_WARN, WORDS_BAD, LIST_ITEMS_BAD }, groups, rows }, null, 1));
  console.log(`\n${rows.filter((r) => r.level === 'split').length} lessons flagged to split; details in scripts/lesson_length_audit.json`);
})().catch((e) => { console.error(e.message || e); process.exit(1); });
