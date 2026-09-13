// Post-processing cleanup for a generate_knowledge_map*.js output file:
// merges duplicate node ids (a real, pre-existing gap in that pipeline -
// its own verification pass correctly IDENTIFIES duplicate_concept issues,
// but applyFixes only ever acts on new_nodes/new_edges/remove_edges, never
// on a duplicate finding itself, so a duplicate id survives into the final
// written file even after a "verified: true" run - found live on the GCSE
// Maths run, where independent per-subtopic generation calls each
// invented their own node for common cross-cutting ideas like
// "place_value"/"pythagoras" under the identical id).
//
// Purely structural, no AI call needed: nodes sharing an id are the SAME
// concept by construction (ids are meant to be unique identifiers, not
// coincidentally-matching strings), so this keeps the FIRST occurrence as
// the canonical node and rewrites every edge that referenced any later
// duplicate's id to point at the canonical one instead, dropping the
// now-redundant duplicate node entries and any edge that becomes a
// self-loop or an exact duplicate of another edge as a result of the
// remap.
//
// Usage: node scripts/merge_duplicate_km_nodes.js <path-to-knowledge_map-json>
const fs = require('fs');

const filePath = process.argv[2];
if (!filePath) { console.error('Usage: node merge_duplicate_km_nodes.js <path>'); process.exit(1); }
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
const { nodes, edges } = data;

const canonicalIdByOriginal = new Map(); // every original id -> the id that survives
const survivorByRawId = new Map(); // raw id -> the FIRST node object seen with that id
const mergedNodes = [];
let duplicateCount = 0;

nodes.forEach((n) => {
  if (survivorByRawId.has(n.id)) {
    duplicateCount++;
    canonicalIdByOriginal.set(n.id, survivorByRawId.get(n.id).id);
    console.log(`Merging duplicate node "${n.id}" (label: "${n.label}") into the first occurrence (label: "${survivorByRawId.get(n.id).label}")`);
  } else {
    survivorByRawId.set(n.id, n);
    canonicalIdByOriginal.set(n.id, n.id);
    mergedNodes.push(n);
  }
});

const remappedEdges = edges
  .map((e) => ({ ...e, from: canonicalIdByOriginal.get(e.from) || e.from, to: canonicalIdByOriginal.get(e.to) || e.to }))
  .filter((e) => e.from !== e.to); // drop any self-loop the remap created

const seenEdgeKeys = new Set();
const dedupedEdges = [];
remappedEdges.forEach((e) => {
  const key = `${e.from}->${e.to}`;
  if (seenEdgeKeys.has(key)) return;
  seenEdgeKeys.add(key);
  dedupedEdges.push(e);
});

console.log(`\n${duplicateCount} duplicate node(s) merged.`);
console.log(`Nodes: ${nodes.length} -> ${mergedNodes.length}`);
console.log(`Edges: ${edges.length} -> ${dedupedEdges.length} (after remap + de-dup, before self-loop/dup removal: ${remappedEdges.length})`);

// Same DAG/orphan check generate_knowledge_map*.js itself runs, so this
// script's own output is verified before writing, not just assumed clean.
const nodeIds = new Set(mergedNodes.map((n) => n.id));
const orphaned = dedupedEdges.filter(({ from, to }) => !nodeIds.has(from) || !nodeIds.has(to));
orphaned.forEach(({ from, to }) => console.warn('ORPHANED EDGE:', from, '->', to));

const adj = {};
mergedNodes.forEach((n) => { adj[n.id] = []; });
dedupedEdges.forEach(({ from, to }) => { if (adj[from]) adj[from].push(to); });
const WHITE = 0, GRAY = 1, BLACK = 2;
const color = {};
mergedNodes.forEach((n) => { color[n.id] = WHITE; });
let cyclePath = null;
function dfs(u, path) {
  color[u] = GRAY;
  for (const v of adj[u]) {
    if (color[v] === GRAY) { cyclePath = path.concat([u, v]); return true; }
    if (color[v] === WHITE && dfs(v, path.concat([u]))) return true;
  }
  color[u] = BLACK;
  return false;
}
for (const n of mergedNodes) if (color[n.id] === WHITE && dfs(n.id, [])) break;
if (cyclePath) console.warn('CYCLE:', cyclePath.map((id) => `${id} (${survivorByRawId.get(id)?.label || id})`).join(' -> '));

const valid = orphaned.length === 0 && !cyclePath;
console.log(`\nValid DAG after merge: ${valid}`);

data.nodes = mergedNodes;
data.edges = dedupedEdges;
fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
console.log(`Written back to ${filePath}`);
