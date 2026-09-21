'use strict';
// Splits a knowledge map into derivation stages, offline: node -> one term, a stage = up to MAX connected-in-order nodes of one subtopic.
//   node plan_stages.js ../knowledge_map_economics_alevel.json [plan.json]
const fs = require('fs');
const MAX = 5;

function plan(map) {
  const nodes = map.nodes, byId = {};
  nodes.forEach((n, i) => { byId[n.id] = { ...n, i }; });
  const edges = map.edges.filter((e) => byId[e.from] && byId[e.to] && e.from !== e.to);
  const indeg = {}, out = {};
  nodes.forEach((n) => { indeg[n.id] = 0; out[n.id] = []; });
  edges.forEach((e) => { indeg[e.to]++; out[e.from].push(e.to); });
  // Kahn, taking the earliest node in file order first so subtopics stay together
  const ready = nodes.filter((n) => indeg[n.id] === 0).map((n) => n.id), order = [];
  const seen = new Set();
  while (ready.length) {
    ready.sort((a, b) => byId[a].i - byId[b].i);
    // prefer staying in the same subtopic as the last node placed
    const last = order.length ? byId[order[order.length - 1]].subtopic : null;
    let pick = ready.findIndex((id) => byId[id].subtopic === last);
    if (pick < 0) pick = 0;
    const id = ready.splice(pick, 1)[0];
    order.push(id); seen.add(id);
    out[id].forEach((t) => { if (--indeg[t] === 0) ready.push(t); });
  }
  const cyclic = nodes.filter((n) => !seen.has(n.id)).map((n) => n.id);
  cyclic.forEach((id) => order.push(id));

  // Chunk the order into stages that are about one idea: a node joins the current stage only if it is linked to it (an edge, or a shared
  // child), the stage is under MAX, and the stage has not already closed on a single concept that all of it leads to.
  const kids = {}, parents = {};
  nodes.forEach((n) => { kids[n.id] = new Set(); parents[n.id] = new Set(); });
  edges.forEach((e) => { kids[e.from].add(e.to); parents[e.to].add(e.from); });
  const closed = (chunk) => {
    if (chunk.length < 3) return false;
    const inSet = new Set(chunk);
    const sinks = chunk.filter((c) => ![...kids[c]].some((k) => inSet.has(k)));
    return sinks.length === 1 && [...parents[sinks[0]]].filter((p) => inSet.has(p)).length >= 2;
  };
  const linked = (id, chunk) => chunk.some((c) => kids[c].has(id) || kids[id].has(c) || [...kids[id]].some((k) => kids[c].has(k)) || [...parents[id]].some((p) => parents[c].has(p)));
  const staged = new Set(), stages = [];
  const fileOrder = nodes.map((n) => n.id);
  while (staged.size < nodes.length) {
    const open = fileOrder.filter((id) => !staged.has(id));
    const seed = open.find((id) => [...parents[id]].every((p) => staged.has(p))) || open[0];
    const chunk = [seed], sub = byId[seed].subtopic;
    for (;;) {
      if (chunk.length >= MAX || closed(chunk)) break;
      const next = open.find((id) => !chunk.includes(id) && byId[id].subtopic === sub && [...parents[id]].every((p) => staged.has(p) || chunk.includes(p)) && linked(id, chunk));
      if (!next) break;
      chunk.push(next);
    }
    chunk.forEach((id) => staged.add(id));
    stages.push({ subtopic: sub, nodes: chunk });
  }
  const stageOf = {};
  stages.forEach((s, si) => s.nodes.forEach((id) => { stageOf[id] = si; }));
  stages.forEach((s, si) => {
    const inSet = new Set(s.nodes);
    s.edges = edges.filter((e) => inSet.has(e.from) && inSet.has(e.to)).map((e) => [e.from, e.to]);
    s.given = [...new Set(edges.filter((e) => inSet.has(e.to) && !inSet.has(e.from) && stageOf[e.from] < si).map((e) => e.from))];
    s.givenEdges = edges.filter((e) => inSet.has(e.to) && s.given.slice(0, 4).includes(e.from)).map((e) => [e.from, e.to]);
    s.later = edges.filter((e) => inSet.has(e.to) && !inSet.has(e.from) && !(stageOf[e.from] < si)).length;
  });
  return { stages, cyclic, byId };
}

if (require.main === module) {
  const map = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const { stages, cyclic } = plan(map);
  const terms = stages.reduce((s, x) => s + x.nodes.length, 0), given = stages.map((s) => s.given.length).sort((a, b) => a - b);
  console.log(`${map.nodes.length} nodes -> ${stages.length} stages (${terms} terms), avg ${(terms / stages.length).toFixed(1)} per stage; cyclic nodes: ${cyclic.length}`);
  console.log('given per stage: median', given[given.length >> 1], 'p90', given[Math.floor(given.length * 0.9)], 'max', given[given.length - 1]);
  if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify(stages, null, 1));
}
module.exports = { plan };
