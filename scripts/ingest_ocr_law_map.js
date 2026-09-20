// Idempotent staged publication. Does not touch student progress.
require('dotenv').config({ override: true });
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { validate } = require('./build_aqa_biology_map');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const mapPath = path.join(__dirname, '../src/data/ocrLawALevel.json');
const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
const STAGING = 'A-Level [H415 staging]';
const clean = value => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
const conceptId = node => `law:${clean(node.subtopic)}:${clean(node.label)}`;
const course = query => query.eq('subject', map.subject).eq('exam_board', map.examBoard);
async function all(table, columns, build) {
  const rows = [];
  for (let from = 0; ; from += 500) {
    let query = db.from(table).select(columns).range(from, from + 499).order('id');
    if (build) query = build(query);
    const { data, error } = await query; if (error) throw error;
    rows.push(...data); if (data.length < 500) return rows;
  }
}
async function upsert(table, rows, onConflict) {
  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await db.from(table).upsert(rows.slice(i, i + 100), { onConflict });
    if (error) throw error;
  }
}
async function verify(qualification) {
  const actual = await all('knowledge_map_nodes', 'id,node_key,label,concept_id,subtopic,theme', q => course(q).eq('qualification', qualification));
  if (actual.length !== map.nodes.length) throw new Error(`Node count mismatch ${actual.length}/${map.nodes.length}`);
  const byKey = new Map(actual.map(node => [node.node_key, node]));
  for (const node of map.nodes) {
    const row = byKey.get(node.id);
    if (!row || row.label !== node.label || row.subtopic !== node.subtopic || row.theme !== node.theme || row.concept_id !== conceptId(node)) throw new Error(`Node mismatch ${node.id}`);
  }
  const idToKey = new Map(actual.map(node => [node.id, node.node_key]));
  const storedEdges = [];
  for (let i = 0; i < actual.length; i += 40) storedEdges.push(...await all('knowledge_map_edges', 'id,from_node_id,to_node_id', q => q.in('from_node_id', actual.slice(i, i + 40).map(node => node.id))));
  const expected = new Set(map.edges.map(edge => `${edge.from}>${edge.to}`));
  if (storedEdges.length !== expected.size) throw new Error(`Edge count mismatch ${storedEdges.length}/${expected.size}`);
  for (const edge of storedEdges) if (!expected.has(`${idToKey.get(edge.from_node_id)}>${idToKey.get(edge.to_node_id)}`)) throw new Error('Unexpected edge');
  return actual;
}
async function main() {
  validate(map);
  if (map.specification !== 'H415') throw new Error('Unexpected map');
  const live = await all('knowledge_map_nodes', 'id,node_key', q => course(q).eq('qualification', map.qualification));
  if (live.length) { await verify(map.qualification); console.log('Published map already matches.'); return; }
  const staged = await all('knowledge_map_nodes', 'id,node_key', q => course(q).eq('qualification', STAGING));
  if (staged.some(node => !map.nodes.some(expected => expected.id === node.node_key))) throw new Error('Unexpected staging rows; refusing to overwrite.');
  await upsert('knowledge_map_nodes', map.nodes.map(node => ({ subject: map.subject, qualification: STAGING, exam_board: map.examBoard, node_key: node.id, label: node.label, subtopic: node.subtopic, theme: node.theme, concept_id: conceptId(node), difficulty: node.difficulty })), 'subject,qualification,exam_board,node_key');
  const rows = await all('knowledge_map_nodes', 'id,node_key', q => course(q).eq('qualification', STAGING));
  const byKey = new Map(rows.map(node => [node.node_key, node.id]));
  await upsert('knowledge_map_edges', map.edges.map(edge => ({ from_node_id: byKey.get(edge.from), to_node_id: byKey.get(edge.to), difficulty: edge.difficulty })), 'from_node_id,to_node_id');
  await verify(STAGING);
  const { error } = await course(db.from('knowledge_map_nodes').update({ qualification: map.qualification })).eq('qualification', STAGING);
  if (error) throw error;
  const published = await verify(map.qualification);
  const receipt = { publishedAt: new Date().toISOString(), sha256: crypto.createHash('sha256').update(fs.readFileSync(mapPath)).digest('hex'), nodes: published.length, edges: map.edges.length};
  fs.writeFileSync(path.join(__dirname, 'ocr_law_build/ingestion-receipt.json'), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt));
}
main().catch(error => { console.error(error.message || error); process.exitCode = 1; });
