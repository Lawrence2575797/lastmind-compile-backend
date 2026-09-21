// Splits over-broad knowledge-map nodes into atomic ones, with NO model calls (the splits are hand-written in node_splits.json).
//   node scripts/split_nodes.js            dry run: prints what would change, writes nothing
//   node scripts/split_nodes.js --apply    performs it
// For each match: the original node keeps its id and concept_id (so student progress is untouched) and is narrowed to part 1.
// Parts 2..n become new nodes chained after it (part k -> part k+1) and inherit the original's outgoing edges, so anything that
// needed the original now needs every part. Nodes with a stored lesson are skipped (their lesson would no longer match the label).
// Spanish and Italian are never touched. Law's source JSON (src/data/ocrLawALevel.json) is kept in step.
require('dotenv').config({ override: true });
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const APPLY = process.argv.includes('--apply');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const splits = JSON.parse(fs.readFileSync(path.join(__dirname, 'node_splits.json'), 'utf8'));
const clean = (v) => String(v).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
const lawPath = path.join(__dirname, '../src/data/ocrLawALevel.json');
const law = JSON.parse(fs.readFileSync(lawPath, 'utf8'));
const lawById = new Map(law.nodes.map((n) => [n.id, n]));

async function fetchAll(table, cols, f) { const out = []; for (let from = 0; ; from += 1000) { let q = db.from(table).select(cols).range(from, from + 999); if (f) q = f(q); const { data, error } = await q; if (error) throw error; out.push(...data); if (data.length < 1000) break; } return out; }

(async () => {
  const nodes = (await fetchAll('knowledge_map_nodes', '*')).filter((n) => !['Spanish', 'Italian'].includes(n.subject));
  const withLesson = new Set();
  for (let i = 0; i < nodes.length; i += 200) { const { data } = await db.from('knowledge_map_node_lessons').select('node_id').in('node_id', nodes.slice(i, i + 200).map((n) => n.id)); (data || []).forEach((r) => withLesson.add(r.node_id)); }
  const keys = new Set(nodes.map((n) => `${n.subject}|${n.qualification}|${n.exam_board}|${n.node_key}`));
  let planned = 0, skipped = [], added = 0, unmatched = [];
  for (const [prefix, parts] of splits) {
    const hits = nodes.filter((n) => n.label.startsWith(prefix));
    if (!hits.length) { unmatched.push(prefix); continue; }
    for (const orig of hits) {
      if (withLesson.has(orig.id)) { skipped.push(orig.label); continue; }
      const segs = orig.concept_id.split(':'); const head = segs.slice(0, 2).join(':');
      const partNodes = [{ ...orig, label: parts[0] }];
      const newRows = parts.slice(1).map((label, i) => {
        const { id, created_at, ...rest } = orig;
        const key = `${orig.node_key}_p${i + 2}`;
        if (keys.has(`${orig.subject}|${orig.qualification}|${orig.exam_board}|${key}`)) throw new Error('node_key clash ' + key);
        return { ...rest, node_key: key, label, concept_id: `${head}:${clean(label)}` };
      });
      planned++; added += newRows.length;
      console.log(`${orig.subject} | ${orig.label.slice(0, 70)}\n    -> ${parts.join('\n    -> ')}`);
      if (!APPLY) continue;
      const { error: uErr } = await db.from('knowledge_map_nodes').update({ label: parts[0] }).eq('id', orig.id);
      if (uErr) throw uErr;
      const { data: ins, error: iErr } = await db.from('knowledge_map_nodes').insert(newRows).select('id, node_key');
      if (iErr) throw iErr;
      const idByKey = new Map(ins.map((r) => [r.node_key, r.id]));
      const chain = [orig.id, ...newRows.map((r) => idByKey.get(r.node_key))];
      const { data: outEdges } = await db.from('knowledge_map_edges').select('to_node_id, difficulty').eq('from_node_id', orig.id);
      const edges = [];
      for (let k = 0; k < chain.length - 1; k++) edges.push({ from_node_id: chain[k], to_node_id: chain[k + 1], difficulty: 0.25 });
      for (let k = 1; k < chain.length; k++) for (const e of outEdges || []) edges.push({ from_node_id: chain[k], to_node_id: e.to_node_id, difficulty: e.difficulty });
      if (edges.length) { const { error: eErr } = await db.from('knowledge_map_edges').upsert(edges, { onConflict: 'from_node_id,to_node_id' }); if (eErr) throw eErr; }
      const { data: so } = await db.from('knowledge_map_node_spec_order').select('id, node_order').eq('subject', orig.subject).eq('qualification', orig.qualification).eq('exam_board', orig.exam_board).eq('subtopic', orig.subtopic).maybeSingle();
      if (so && Array.isArray(so.node_order)) { const at = so.node_order.indexOf(orig.id); if (at >= 0) { const order = [...so.node_order]; order.splice(at + 1, 0, ...chain.slice(1)); await db.from('knowledge_map_node_spec_order').update({ node_order: order }).eq('id', so.id); } }
      // keep the Law source file in step with the live map
      const ln = lawById.get(orig.node_key);
      if (ln && orig.subject === 'Law') {
        ln.conceptId = orig.concept_id; ln.label = parts[0]; ln.objective = 'Understand and apply: ' + parts[0]; ln.essentialPoints = [parts[0]];
        const outLaw = law.edges.filter((e) => e.from === orig.node_key);
        parts.slice(1).forEach((label, i) => { const id = `${orig.node_key}_p${i + 2}`; law.nodes.push({ ...ln, id, label, conceptId: `${head}:${clean(label)}`, objective: 'Understand and apply: ' + label, essentialPoints: [label] }); });
        const ids = [orig.node_key, ...parts.slice(1).map((_, i) => `${orig.node_key}_p${i + 2}`)];
        for (let k = 0; k < ids.length - 1; k++) law.edges.push({ from: ids[k], to: ids[k + 1], difficulty: 0.25 });
        for (let k = 1; k < ids.length; k++) for (const e of outLaw) law.edges.push({ from: ids[k], to: e.to, difficulty: e.difficulty });
      }
    }
  }
  if (APPLY) fs.writeFileSync(lawPath, JSON.stringify(law, null, 2));
  console.log(`\n${APPLY ? 'APPLIED' : 'DRY RUN'}: ${planned} nodes split, ${added} new nodes.`);
  if (skipped.length) console.log('Skipped (already have a stored lesson):', skipped.length, skipped.map((s) => s.slice(0, 50)));
  if (unmatched.length) console.log('No match for:', unmatched);
})().catch((e) => { console.error(e.message || e); process.exit(1); });
