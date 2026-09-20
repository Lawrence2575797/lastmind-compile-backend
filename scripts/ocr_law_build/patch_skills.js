// Free (no API) structural fix: merge the "skills" nodes that duplicate 3.3/3.4 rules into those rules,
// point the two genuine application skills the right way round (rule -> application), and move the
// Legal skills subtopic to the end of the course (8.1) so students meet law before they apply it.
const fs = require('fs');
const path = require('path');
const { validate } = require('../build_aqa_biology_map');
const file = path.join(__dirname, '../../src/data/ocrLawALevel.json');
const map = JSON.parse(fs.readFileSync(file, 'utf8'));
const isSkill = (n) => n.subtopic.startsWith('0.1');
const byId = new Map(map.nodes.map((n) => [n.id, n]));
const skillIds = new Set(map.nodes.filter(isSkill).map((n) => n.id));

const targetsOf = new Map();
map.edges.filter((e) => skillIds.has(e.from) && !skillIds.has(e.to)).forEach((e) => {
  if (!targetsOf.has(e.from)) targetsOf.set(e.from, []);
  targetsOf.get(e.from).push(e.to);
});
const merge = new Map();   // duplicate skill id -> canonical content id
const applications = [];   // genuine application skills
for (const [id, targets] of targetsOf) {
  if (/^Applying/i.test(byId.get(id).label)) applications.push(id); else merge.set(id, targets[0]);
}
let edges = map.edges.map((e) => ({ ...e }));
// application skills: reverse each skill->content edge into content->skill
edges = edges.map((e) => (applications.includes(e.from) && !skillIds.has(e.to) ? { ...e, from: e.to, to: e.from } : e));
// merge duplicates
edges = edges.map((e) => ({ ...e, from: merge.get(e.from) || e.from, to: merge.get(e.to) || e.to })).filter((e) => e.from !== e.to);
const nodes = map.nodes.filter((n) => !merge.has(n.id));
// dedupe and break any cycle (later edges dropped)
const seen = new Set(); const adj = new Map(nodes.map((n) => [n.id, []])); const kept = [];
const reaches = (a, b) => { const s = new Set(), st = [a]; while (st.length) { const x = st.pop(); if (x === b) return true; if (s.has(x)) continue; s.add(x); (adj.get(x) || []).forEach((y) => st.push(y)); } return false; };
for (const e of edges) {
  const k = `${e.from}>${e.to}`;
  if (seen.has(k) || !adj.has(e.from) || !adj.has(e.to) || reaches(e.to, e.from)) continue;
  seen.add(k); adj.get(e.from).push(e.to); kept.push(e);
}
// the application skills also need the other interpretation / precedent rules they combine
const extra = (skillId, subtopicPrefix) => nodes.filter((n) => n.subtopic.startsWith(subtopicPrefix) && n.kind === 'concept').forEach((n) => {
  const k = `${n.id}>${skillId}`;
  if (!seen.has(k) && !reaches(skillId, n.id)) { seen.add(k); adj.get(n.id).push(skillId); kept.push({ from: n.id, to: skillId, difficulty: 0.45 }); }
});
applications.forEach((id) => extra(id, /interpretation/i.test(byId.get(id).label) ? '3.3' : '3.4'));

nodes.forEach((n) => {
  if (isSkill(n)) {
    n.subtopic = n.subtopic.replace(/^0\.1/, '8.1');
    n.theme = n.theme.replace(/^Theme 0/, 'Theme 8');
  }
});
map.nodes = nodes; map.edges = kept;
const report = validate(map);
const rank = new Map(report.order.map((id, i) => [id, i]));
map.nodes.sort((a, b) => rank.get(a.id) - rank.get(b.id));
fs.writeFileSync(file, JSON.stringify(map, null, 2));
console.log(`merged ${merge.size}, reversed ${applications.length} application skills; ${map.nodes.length} nodes, ${map.edges.length} edges, ${report.roots.length} roots`);
