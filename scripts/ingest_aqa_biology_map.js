// Idempotent, non-destructive staging and publication. Does not touch student progress.
require('dotenv').config({ override: true });
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { validate } = require('./build_aqa_biology_map');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const mapPath = path.join(__dirname, '../src/data/aqaBiologyHigher.json');
const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
const STAGING = 'GCSE Higher [8461 staging]';
const clean = s => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
const conceptId = n => `biology:${clean(n.subtopic)}:${clean(n.label)}`;
async function all(table, columns, build) {
  const rows = [];
  for (let from = 0; ; from += 500) {
    let q = db.from(table).select(columns).range(from, from + 499).order('id');
    if (build) q = build(q);
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}
const course = q => q.eq('subject', map.subject).eq('exam_board', map.examBoard);
async function upsert(table, rows, onConflict) {
  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await db.from(table).upsert(rows.slice(i,i+100), { onConflict });
    if (error) throw error;
  }
}
async function verify(qualification) {
  const actual = await all('knowledge_map_nodes', 'id,node_key,label,concept_id,subtopic,theme', q => course(q).eq('qualification', qualification));
  if (actual.length !== map.nodes.length) throw new Error(`Node count mismatch: ${actual.length}/${map.nodes.length}`);
  const byKey = new Map(actual.map(n => [n.node_key,n]));
  for (const n of map.nodes) {
    const row = byKey.get(n.id);
    if (!row || row.label !== n.label || row.subtopic !== n.subtopic || row.theme !== n.theme || row.concept_id !== conceptId(n)) throw new Error(`Node mismatch ${n.id}`);
  }
  const idToKey = new Map(actual.map(n => [n.id,n.node_key]));
  const storedEdges = [];
  for (let i=0;i<actual.length;i+=40) {
    storedEdges.push(...await all('knowledge_map_edges','id,from_node_id,to_node_id',q=>q.in('from_node_id',actual.slice(i,i+40).map(n=>n.id))));
  }
  const expected = new Set(map.edges.map(e=>e.from+'>'+e.to));
  if (storedEdges.length !== expected.size) throw new Error(`Edge count mismatch ${storedEdges.length}/${expected.size}`);
  for (const e of storedEdges) if (!expected.has(idToKey.get(e.from_node_id)+'>'+idToKey.get(e.to_node_id))) throw new Error('Unexpected or cross-course edge');
  return actual;
}
async function main() {
  validate(map);
  if (!map.verified || map.rule17 !== true || map.qualification !== 'GCSE Higher' || map.specification !== '8461') throw new Error('Map has not passed release review');
  if (new Set(map.nodes.map(conceptId)).size !== map.nodes.length) throw new Error('Colliding concept identifiers');
  const live = await all('knowledge_map_nodes','id,node_key',q=>course(q).eq('qualification',map.qualification));
  if (live.length) {
    const published = await verify(map.qualification);
    writeReceipt(published);
    console.log('Published map already matches exactly; no changes made.');
    return;
  }
  const staged = await all('knowledge_map_nodes','id,node_key',q=>course(q).eq('qualification',STAGING));
  if (staged.some(n=>!map.nodes.some(m=>m.id===n.node_key))) throw new Error('Staging contains unexpected nodes; refusing to delete or overwrite them.');
  console.log(`Staging ${map.nodes.length} nodes and ${map.edges.length} edges under an unpublished qualification.`);
  await upsert('knowledge_map_nodes',map.nodes.map(n=>({subject:map.subject,qualification:STAGING,exam_board:map.examBoard,node_key:n.id,label:n.label,subtopic:n.subtopic,theme:n.theme,concept_id:conceptId(n),difficulty:n.difficulty})), 'subject,qualification,exam_board,node_key');
  const rows = await all('knowledge_map_nodes','id,node_key',q=>course(q).eq('qualification',STAGING));
  const byKey = new Map(rows.map(n=>[n.node_key,n.id]));
  await upsert('knowledge_map_edges',map.edges.map(e=>({from_node_id:byKey.get(e.from),to_node_id:byKey.get(e.to),difficulty:e.difficulty})), 'from_node_id,to_node_id');
  await verify(STAGING);
  // One SQL UPDATE exposes all nodes together, only after every edge is verified.
  const { error } = await course(db.from('knowledge_map_nodes').update({qualification:map.qualification})).eq('qualification',STAGING);
  if (error) throw error;
  const published = await verify(map.qualification);
  writeReceipt(published);
}
function writeReceipt(published) {
  const receipt = { publishedAt:new Date().toISOString(), sha256:crypto.createHash('sha256').update(fs.readFileSync(mapPath)).digest('hex'), subject:map.subject,qualification:map.qualification,examBoard:map.examBoard,nodes:published.length,edges:map.edges.length,rule17:true };
  fs.writeFileSync(path.join(__dirname,'aqa_biology_build/ingestion-receipt.json'),JSON.stringify(receipt,null,2));
  console.log(JSON.stringify(receipt));
}
main().catch(e=>{console.error(e.message || e);process.exitCode=1;});
