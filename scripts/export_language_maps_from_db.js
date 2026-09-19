// Exports the LIVE Spanish/Italian knowledge maps (nodes + edges) from
// Supabase to scripts/_db_export_<language>.json, so split_language_maps.py
// works from what is actually deployed (the DB has been edited since the
// original JSON was ingested).
require('dotenv/config');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function all(table, cols, filters) {
  let out = [];
  for (let f = 0; ; f += 1000) {
    let q = s.from(table).select(cols).range(f, f + 999);
    Object.entries(filters || {}).forEach(([k, v]) => { q = q.eq(k, v); });
    const { data, error } = await q;
    if (error) throw error;
    out = out.concat(data);
    if (data.length < 1000) break;
  }
  return out;
}
(async () => {
  const edgesAll = await all('knowledge_map_edges', 'from_node_id, to_node_id, difficulty');
  for (const subject of ['Spanish', 'Italian']) {
    const nodes = await all('knowledge_map_nodes', 'id, node_key, label, subtopic, difficulty', { subject, qualification: 'Other', exam_board: '' });
    const keyById = new Map(nodes.map((n) => [n.id, n.node_key]));
    const edges = edgesAll.filter((e) => keyById.has(e.from_node_id) && keyById.has(e.to_node_id))
      .map((e) => ({ from: keyById.get(e.from_node_id), to: keyById.get(e.to_node_id), difficulty: e.difficulty }));
    const out = { subject, qualification: 'Other', examBoard: '', nodes: nodes.map((n) => ({ id: n.node_key, label: n.label, subtopic: n.subtopic, ...(n.difficulty != null ? { difficulty: Number(n.difficulty) } : {}) })), edges };
    fs.writeFileSync(path.join(__dirname, `_db_export_${subject.toLowerCase()}.json`), JSON.stringify(out, null, 1));
    console.log(subject, nodes.length, 'nodes', edges.length, 'edges');
  }
})().catch((e) => { console.error(e); process.exit(1); });
