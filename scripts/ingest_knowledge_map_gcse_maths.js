// GCSE (9-1) Maths (Edexcel, 1MA1) variant of ingest_knowledge_map.js -
// loads knowledge_map_mathematics_gcse<tier>.json (from
// generate_knowledge_map_gcse_maths.js) into the real DB tables. No
// lesson_content file for this subject - on-demand lesson generation
// (generateAndCacheNodeLesson) fills that in per node/edge as students
// reach it, same as the rest of the app already does.
//
// Usage: GCSE_MATHS_TIER=foundation node scripts/ingest_knowledge_map_gcse_maths.js
//    or: GCSE_MATHS_TIER=higher node scripts/ingest_knowledge_map_gcse_maths.js
require('dotenv/config');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const GCSE_MATHS_TIER = process.env.GCSE_MATHS_TIER;
if (GCSE_MATHS_TIER !== 'foundation' && GCSE_MATHS_TIER !== 'higher') {
  throw new Error(`GCSE_MATHS_TIER env var must be 'foundation' or 'higher', got: ${GCSE_MATHS_TIER}`);
}
const SUBJECT = 'Mathematics';
const QUALIFICATION = GCSE_MATHS_TIER === 'foundation' ? 'GCSE Foundation' : 'GCSE Higher';
const EXAM_BOARD = 'Edexcel';

// Same clean()/concept-key convention as scripts/seed_aqa_econ_lesson_plan.js
// and chainService.ts's normalizeConceptKey - so concept_reviews (FSRS) and
// practice_questions resolve to the same key this table uses, with no
// separate mapping table needed. Includes QUALIFICATION (the original
// ingest_knowledge_map.js's own conceptId doesn't) - a real bug found live:
// Foundation and Higher tier are two separate knowledge maps for the SAME
// subject, and Higher genuinely restates much Foundation content near-
// verbatim under the same subtopic+label (it's a superset by design - see
// the spec's own "Higher tier covers everything on Foundation plus..."),
// so the original two-part key collided across tiers on ingest
// (knowledge_map_nodes_concept_id_key violation) the moment Higher tried
// to insert after Foundation had already claimed the same concept_id.
function clean(s) { return (s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_'); }
function conceptId(subtopic, label) { return `${clean(SUBJECT)}:${clean(QUALIFICATION)}:${clean(subtopic)}:${clean(label)}`; }

const MAP_PATH = path.join(__dirname, `knowledge_map_mathematics_gcse${GCSE_MATHS_TIER}.json`);

async function selectAll(table, columns, filters) {
  const PAGE = 1000;
  let all = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select(columns).range(from, from + PAGE - 1);
    Object.entries(filters || {}).forEach(([k, v]) => { q = q.eq(k, v); });
    const { data, error } = await q;
    if (error) throw new Error(`Paginated select on ${table} failed at offset ${from}: ${error.message}`);
    all = all.concat(data);
    if (data.length < PAGE) break;
  }
  return all;
}

async function insertInChunks(table, rows, chunkSize = 200) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from(table).insert(chunk);
    if (error) throw new Error(`Insert into ${table} failed at row ${i}: ${error.message}`);
    console.log(`  -> ${table}: inserted ${Math.min(i + chunkSize, rows.length)}/${rows.length}`);
  }
}

async function main() {
  if (!fs.existsSync(MAP_PATH)) throw new Error(`Missing ${MAP_PATH} - run generate_knowledge_map_gcse_maths.js first`);
  const map = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
  const { nodes, edges } = map;

  // Real bug this guards against found live on the FIRST attempt at this
  // exact ingest: a duplicate concept_id (two node_keys mapping to the
  // same conceptId via subtopic+label) silently overwrites one row with
  // another on insert, then every edge touching the overwritten node_key
  // gets dropped downstream as "node id not found" with no loud error -
  // exactly the class of corruption merge_duplicate_km_nodes.js exists to
  // fix BEFORE ingest, not something this script can safely paper over
  // itself. Refuses to ingest rather than silently losing edges.
  const idCounts = {};
  nodes.forEach((n) => { idCounts[n.id] = (idCounts[n.id] || 0) + 1; });
  const dupeIds = Object.entries(idCounts).filter(([, c]) => c > 1);
  if (dupeIds.length) {
    throw new Error(`Refusing to ingest: ${dupeIds.length} duplicate node id(s) still present (${dupeIds.map(([id]) => id).join(', ')}) - run merge_duplicate_km_nodes.js on ${MAP_PATH} first.`);
  }

  console.log(`Ingesting ${nodes.length} nodes, ${edges.length} edges for ${SUBJECT} (${QUALIFICATION}, ${EXAM_BOARD})...`);

  const nodeRows = nodes.map(n => ({
    concept_id: conceptId(n.subtopic || '', n.label),
    subject: SUBJECT,
    qualification: QUALIFICATION,
    exam_board: EXAM_BOARD,
    node_key: n.id,
    label: n.label,
    subtopic: n.subtopic || '',
    theme: (n.subtopic || '').split(' ')[0]?.split('.')[0] || null,
    difficulty: typeof n.difficulty === 'number' ? n.difficulty : null,
  }));
  await insertInChunks('knowledge_map_nodes', nodeRows);

  const insertedNodes = await selectAll('knowledge_map_nodes', 'id, node_key', { subject: SUBJECT, qualification: QUALIFICATION, exam_board: EXAM_BOARD });
  const idByNodeKey = new Map(insertedNodes.map(r => [r.node_key, r.id]));

  const edgeRows = edges
    .map(e => Array.isArray(e) ? { from: e[0], to: e[1], difficulty: null } : e)
    .map(e => ({ from_node_id: idByNodeKey.get(e.from), to_node_id: idByNodeKey.get(e.to), difficulty: typeof e.difficulty === 'number' ? e.difficulty : null, fromKey: e.from, toKey: e.to }))
    .filter(e => {
      if (!e.from_node_id || !e.to_node_id) { console.warn(`  -> skipping edge ${e.fromKey}->${e.toKey}: node id not found`); return false; }
      return true;
    })
    .map(({ from_node_id, to_node_id, difficulty }) => ({ from_node_id, to_node_id, difficulty }));
  await insertInChunks('knowledge_map_edges', edgeRows);

  console.log(`\nNo lesson_content file for this subject (by design - on-demand generation fills lessons in per node/edge as students reach them).`);
  console.log('\nDone.');
}

main().catch(err => { console.error(err); process.exit(1); });
