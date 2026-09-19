// Syncs the (already ingested) Spanish and Italian knowledge maps in
// Supabase with the current knowledge_map_{spanish,italian}_other.json after
// split_language_maps.py enforced the max-2-items-per-lesson rule.
//
// Per language, matching nodes by node_key:
//   - node whose label changed  -> UPDATE label + concept_id in place (uuid and
//                                  its edges survive)
//   - node not in DB yet        -> INSERT
//   - edge in DB but not in JSON -> DELETE (its edge lesson/notes cascade)
//   - edge in JSON not in DB    -> INSERT
// Then clears every cached generated lesson/compiled note for the language's
// nodes (so each lesson is regenerated under the new 2-item prompt on first
// click) and the cached per-subtopic node ordering. Students' own personal
// notes and FSRS concept_reviews are never touched.
//
// Usage: node scripts/sync_language_maps.js          (dry run, changes nothing)
//        node scripts/sync_language_maps.js --apply
require('dotenv/config');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes('--apply');

const LANGUAGES = ['Spanish', 'Italian'];
const QUALIFICATION = 'Other';
const EXAM_BOARD = '';

function clean(s) { return (s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_'); }
function conceptId(subject, subtopic, label) { return `${clean(subject)}:${clean(subtopic)}:${clean(label)}`; }

async function selectAll(table, columns, filters) {
  const PAGE = 1000;
  let all = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select(columns).range(from, from + PAGE - 1);
    Object.entries(filters || {}).forEach(([k, v]) => { q = q.eq(k, v); });
    const { data, error } = await q;
    if (error) throw new Error(`select ${table} failed: ${error.message}`);
    all = all.concat(data);
    if (data.length < PAGE) break;
  }
  return all;
}

function chunks(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function run(label, fn) {
  const { error } = await fn();
  if (error) throw new Error(`${label} failed: ${error.message}`);
}

async function syncLanguage(subject) {
  const map = JSON.parse(fs.readFileSync(path.join(__dirname, `knowledge_map_${subject.toLowerCase()}_other.json`), 'utf8'));
  const dbNodes = await selectAll('knowledge_map_nodes', 'id, node_key, label, concept_id', { subject, qualification: QUALIFICATION, exam_board: EXAM_BOARD });
  if (!dbNodes.length) throw new Error(`${subject}: no nodes in DB - refusing to sync a language that was never ingested`);
  const dbByKey = new Map(dbNodes.map((n) => [n.node_key, n]));
  const jsonKeys = new Set(map.nodes.map((n) => n.id));

  const changed = map.nodes.filter((n) => dbByKey.has(n.id) && dbByKey.get(n.id).label !== n.label);
  const added = map.nodes.filter((n) => !dbByKey.has(n.id));
  const orphaned = dbNodes.filter((n) => !jsonKeys.has(n.node_key));
  console.log(`\n${subject}: ${dbNodes.length} DB nodes, ${map.nodes.length} in JSON -> ${changed.length} relabelled, ${added.length} new, ${orphaned.length} in DB but not in JSON (left alone)`);

  if (APPLY) {
    for (const n of changed) {
      await run(`update ${n.id}`, () => supabase.from('knowledge_map_nodes').update({ label: n.label, concept_id: conceptId(subject, n.subtopic, n.label) }).eq('id', dbByKey.get(n.id).id));
    }
    const rows = added.map((n) => ({
      concept_id: conceptId(subject, n.subtopic, n.label),
      subject, qualification: QUALIFICATION, exam_board: EXAM_BOARD,
      node_key: n.id, label: n.label, subtopic: n.subtopic || '',
      theme: (n.subtopic || '').split(' ')[0]?.split('.')[0] || null,
      difficulty: typeof n.difficulty === 'number' ? n.difficulty : null,
    }));
    for (const c of chunks(rows, 200)) await run('insert nodes', () => supabase.from('knowledge_map_nodes').insert(c));
  }

  const allNodes = APPLY ? await selectAll('knowledge_map_nodes', 'id, node_key', { subject, qualification: QUALIFICATION, exam_board: EXAM_BOARD }) : dbNodes;
  const idByKey = new Map(allNodes.map((n) => [n.node_key, n.id]));
  const nodeIds = allNodes.map((n) => n.id);
  const nodeIdSet = new Set(nodeIds);

  const wanted = new Set();
  for (const e of map.edges) {
    const f = Array.isArray(e) ? e[0] : e.from;
    const t = Array.isArray(e) ? e[1] : e.to;
    const fi = idByKey.get(f), ti = idByKey.get(t);
    if (fi && ti) wanted.add(`${fi}|${ti}`);
    else if (APPLY) throw new Error(`${subject}: edge ${f}->${t} has an unknown node`);
  }
  const dbEdges = (await selectAll('knowledge_map_edges', 'id, from_node_id, to_node_id')).filter((e) => nodeIdSet.has(e.from_node_id) && nodeIdSet.has(e.to_node_id));
  const haveKeys = new Set(dbEdges.map((e) => `${e.from_node_id}|${e.to_node_id}`));
  const staleEdges = dbEdges.filter((e) => !wanted.has(`${e.from_node_id}|${e.to_node_id}`));
  const newEdges = [...wanted].filter((k) => !haveKeys.has(k));
  console.log(`${subject}: ${dbEdges.length} DB edges -> delete ${staleEdges.length} stale, insert ${newEdges.length} new`);

  if (APPLY) {
    for (const c of chunks(staleEdges.map((e) => e.id), 100)) await run('delete edges', () => supabase.from('knowledge_map_edges').delete().in('id', c));
    const rows = newEdges.map((k) => { const [from_node_id, to_node_id] = k.split('|'); return { from_node_id, to_node_id }; });
    for (const c of chunks(rows, 200)) await run('insert edges', () => supabase.from('knowledge_map_edges').insert(c));
    // Uncache: every generated lesson and compiled note for this language.
    for (const c of chunks(nodeIds, 100)) {
      await run('clear node lessons', () => supabase.from('knowledge_map_node_lessons').delete().in('node_id', c));
      await run('clear node notes', () => supabase.from('knowledge_map_node_notes').delete().in('node_id', c));
    }
    await run('clear spec order', () => supabase.from('knowledge_map_node_spec_order').delete().eq('subject', subject).eq('qualification', QUALIFICATION).eq('exam_board', EXAM_BOARD));
    console.log(`${subject}: cleared cached lessons/notes for ${nodeIds.length} nodes.`);
  }
}

(async () => {
  console.log(APPLY ? 'APPLYING changes' : 'DRY RUN (pass --apply to write)');
  for (const subject of LANGUAGES) await syncLanguage(subject);
  console.log('\nDone.');
})().catch((err) => { console.error(err); process.exit(1); });
