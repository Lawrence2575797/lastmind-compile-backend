'use strict';
// Compiles every generated Economics stage into one bundle the backend serves: src/data/derivationEconomics.json
//   node export_bundle.js <specs-dir> <out.json>
const fs = require('fs');
const path = require('path');
const { build } = require('./build');
const map = require('../knowledge_map_economics_alevel.json');

const clean = (s) => (s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
const conceptId = (n) => `economics:${clean(n.subtopic || '')}:${clean(n.label)}`;
const byKey = new Map(map.nodes.map((n) => [n.id, n]));

const dir = process.argv[2], out = process.argv[3];
const files = fs.readdirSync(dir).filter((f) => /^\d+\.json$/.test(f)).sort();
const stages = [], byConcept = {}, problems = [];
files.forEach((f) => {
  const spec = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const st = spec.stages[0];
  spec.known = [...new Set([...(st.given || []), ...(st.needs || [])])]; spec.pageTitle = 'x'; spec.noLeakCheck = true; // labels were unified across batches after generation
  let r;
  try { r = build(spec); } catch (e) { problems.push(`${f}: ${e.message.split('\n')[1] || e.message}`); return; }
  const i = Number(f.slice(0, -5));
  const compiled = r.stages[0];
  const terms = {};
  Object.keys(r.TERMS).forEach((k) => { terms[k] = r.TERMS[k]; });
  const nodeKeys = st.nodes.filter((k) => byKey.has(k));
  stages[i] = { i, name: st.name, edges: st.edges, nodes: nodeKeys, concepts: nodeKeys.map((k) => conceptId(byKey.get(k))), terms, stage: compiled };
  nodeKeys.forEach((k) => { byConcept[conceptId(byKey.get(k))] = i; });
});
const missing = map.nodes.filter((n) => !(conceptId(n) in byConcept)).map((n) => n.id);
fs.writeFileSync(out, JSON.stringify({ subject: 'Economics', qualification: 'A-Level', examBoard: 'Edexcel', stages: stages.map((s) => s || null), byConcept }));
console.log(`stages ${stages.filter(Boolean).length}/${files.length}, concepts covered ${Object.keys(byConcept).length}/${map.nodes.length}, missing ${missing.length}, problems ${problems.length}`);
problems.slice(0, 5).forEach((p) => console.log(' ', p));
console.log('size', (fs.statSync(out).size / 1024 / 1024).toFixed(2) + ' MB');
