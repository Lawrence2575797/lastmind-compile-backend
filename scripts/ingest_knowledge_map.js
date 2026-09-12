// Loads knowledge_map_<subject>_<qualification>.json (from
// generate_knowledge_map.js) and lesson_content_<subject>_<qualification>.json
// (from generate_lesson_content.js, if present) into the real DB tables.
//
// Requires the four migrations already be applied in Supabase first:
// create_knowledge_map_nodes.sql, create_knowledge_map_edges.sql,
// create_knowledge_map_node_lessons.sql, create_knowledge_map_edge_lessons.sql
// - this script only inserts rows, it never runs DDL.
//
// Usage: node scripts/ingest_knowledge_map.js
require('dotenv/config');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SUBJECT = 'Economics';
const QUALIFICATION = 'A-Level';
const EXAM_BOARD = 'Edexcel';

// Same clean()/concept-key convention as scripts/seed_aqa_econ_lesson_plan.js
// and chainService.ts's normalizeConceptKey - so concept_reviews (FSRS) and
// practice_questions resolve to the same key this table uses, with no
// separate mapping table needed.
function clean(s) { return (s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_'); }
function conceptId(subtopic, label) { return `${clean(SUBJECT)}:${clean(subtopic)}:${clean(label)}`; }

const MAP_PATH = path.join(__dirname, `knowledge_map_${SUBJECT.toLowerCase()}_${QUALIFICATION.toLowerCase().replace(/[^a-z0-9]/g, '')}.json`);
const LESSON_PATH = path.join(__dirname, `lesson_content_${SUBJECT.toLowerCase()}_${QUALIFICATION.toLowerCase().replace(/[^a-z0-9]/g, '')}.json`);

// Supabase/PostgREST caps a plain .select() at 1000 rows by default -
// found the hard way when a 1209-node subject silently got only 1000
// nodes back on re-fetch, causing every edge that touched one of the
// missing 209 to be dropped as "node id not found" with no error thrown
// anywhere. Paginate with .range() until a page comes back short of the
// page size, which is the only reliable "that was the last page" signal
// (the row count is a rough estimate on some Postgres plans, not
// something to loop against directly).
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

// Supabase's default insert batch has no hard row cap here, but chunking
// keeps any single request well under request-size limits for ~1800 rows.
async function insertInChunks(table, rows, chunkSize = 200) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from(table).insert(chunk);
    if (error) throw new Error(`Insert into ${table} failed at row ${i}: ${error.message}`);
    console.log(`  -> ${table}: inserted ${Math.min(i + chunkSize, rows.length)}/${rows.length}`);
  }
}

async function main() {
  if (!fs.existsSync(MAP_PATH)) throw new Error(`Missing ${MAP_PATH} - run generate_knowledge_map.js first`);
  const map = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
  const { nodes, edges } = map;

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

  // Need the DB-assigned uuids back to wire edges/lessons by id, not node_key.
  const insertedNodes = await selectAll('knowledge_map_nodes', 'id, node_key', { subject: SUBJECT, qualification: QUALIFICATION, exam_board: EXAM_BOARD });
  const idByNodeKey = new Map(insertedNodes.map(r => [r.node_key, r.id]));

  // Edges moved from plain [from, to] tuples to {from, to, difficulty}
  // objects once difficulty scoring was added - accept either shape so
  // older already-generated map files (pre-difficulty) still ingest fine.
  const edgeRows = edges
    .map(e => Array.isArray(e) ? { from: e[0], to: e[1], difficulty: null } : e)
    .map(e => ({ from_node_id: idByNodeKey.get(e.from), to_node_id: idByNodeKey.get(e.to), difficulty: typeof e.difficulty === 'number' ? e.difficulty : null, fromKey: e.from, toKey: e.to }))
    .filter(e => {
      if (!e.from_node_id || !e.to_node_id) { console.warn(`  -> skipping edge ${e.fromKey}->${e.toKey}: node id not found`); return false; }
      return true;
    })
    .map(({ from_node_id, to_node_id, difficulty }) => ({ from_node_id, to_node_id, difficulty }));
  await insertInChunks('knowledge_map_edges', edgeRows);

  // ---- Lesson content, if the batch generation has already completed ----
  if (fs.existsSync(LESSON_PATH)) {
    const lessons = JSON.parse(fs.readFileSync(LESSON_PATH, 'utf8'));

    const nodeLessonRows = lessons.nodeLessons
      .map(l => ({
        node_id: idByNodeKey.get(l.nodeId),
        encoding_content: {
          explanation: l.explanation,
          practiceQuestion: l.practiceQuestion,
          predictionQuestion: l.predictionQuestion || null,
          personalLinkPrompt: l.personalLinkPrompt || null,
        },
      }))
      .filter(r => r.node_id);
    await insertInChunks('knowledge_map_node_lessons', nodeLessonRows);

    const insertedEdges = await selectAll('knowledge_map_edges', 'id, from_node_id, to_node_id');
    const edgeIdByPair = new Map(insertedEdges.map(r => [`${r.from_node_id}|${r.to_node_id}`, r.id]));

    const edgeLessonRows = lessons.edgeLessons
      .map(l => {
        const fromId = idByNodeKey.get(l.fromNodeId);
        const toId = idByNodeKey.get(l.toNodeId);
        const edgeId = fromId && toId ? edgeIdByPair.get(`${fromId}|${toId}`) : null;
        return {
          edge_id: edgeId,
          link_teaching_content: l.linkTeaching,
          transfer_question: l.transferQuestion,
          integration_question: l.integrationQuestion,
        };
      })
      .filter(r => r.edge_id);
    await insertInChunks('knowledge_map_edge_lessons', edgeLessonRows);
  } else {
    console.log(`No lesson content file found at ${LESSON_PATH} yet - nodes/edges ingested, lessons skipped (run generate_lesson_content.js then re-run this script).`);
  }

  console.log('\nDone.');
}

main().catch(err => { console.error(err); process.exit(1); });
