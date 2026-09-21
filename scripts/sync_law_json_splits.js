// Mirrors scripts/split_nodes.sql onto the Law source file (src/data/ocrLawALevel.json) so a later ingest matches the live map.
const fs = require('fs'), path = require('path');
const { validate } = require('./build_aqa_biology_map');
const splits = JSON.parse(fs.readFileSync(path.join(__dirname, 'node_splits.json'), 'utf8'));
const p = path.join(__dirname, '../src/data/ocrLawALevel.json');
const map = JSON.parse(fs.readFileSync(p, 'utf8'));
const clean = (v) => String(v).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
const conceptId = (n) => `law:${clean(n.subtopic)}:${clean(n.label)}`;
let split = 0, added = 0;
for (const [prefix, parts] of splits) {
  for (const orig of map.nodes.filter((n) => n.label.startsWith(prefix))) {
    if (map.nodes.some((n) => n.id === orig.id + '_p2')) continue;
    const oldConcept = orig.conceptId || conceptId(orig);
    const outgoing = map.edges.filter((e) => e.from === orig.id);
    const ids = [orig.id];
    orig.conceptId = oldConcept; orig.label = parts[0]; orig.objective = 'Understand and apply: ' + parts[0]; orig.essentialPoints = [parts[0]];
    parts.slice(1).forEach((label, i) => {
      const id = `${orig.id}_p${i + 2}`; ids.push(id);
      map.nodes.push({ ...orig, id, label, conceptId: conceptId({ subtopic: orig.subtopic, label }), objective: 'Understand and apply: ' + label, essentialPoints: [label] });
      added++;
    });
    for (let k = 1; k < ids.length; k++) for (const e of outgoing) map.edges.push({ from: ids[k], to: e.to, difficulty: e.difficulty });
    for (let k = 0; k < ids.length - 1; k++) map.edges.push({ from: ids[k], to: ids[k + 1], difficulty: 0.25 });
    split++;
  }
}
const seen = new Set(); map.edges = map.edges.filter((e) => { const k = e.from + '>' + e.to; if (seen.has(k)) return false; seen.add(k); return true; });
validate(map);
fs.writeFileSync(p, JSON.stringify(map, null, 2));
console.log(`Law JSON: ${split} nodes split, ${added} added; now ${map.nodes.length} nodes, ${map.edges.length} edges`);
