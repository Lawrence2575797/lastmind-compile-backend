// One-off: 91 nodes added by the verification pass's applyFixes (real,
// legitimate content - thin advantage/disadvantage sets it filled in)
// never got a subtopic field set at all, so ingest_knowledge_map.js's
// `n.subtopic || ''` coerced them to an empty string. That grouped 91
// unrelated nodes into one fake "" subtopic, which needed its own
// expensive one-time AI ordering call - the actual cause of the reported
// multi-minute hang. The knowledge_map_economics_alevel.json source file
// has already been patched (adjacency-based: each orphaned node took its
// nearest connected neighbour's real subtopic). This applies the same
// fix to the already-ingested live database rows, and removes the now-
// stale "" subtopic-order cache entry so nothing keeps referencing it.
require('dotenv').config({ override: true });
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SUBJECT = 'Economics', QUALIFICATION = 'A-Level', EXAM_BOARD = 'Edexcel';

async function main() {
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, 'knowledge_map_economics_alevel.json'), 'utf8'));

  // Paginated - a plain .select() silently caps at 1000 rows via
  // PostgREST's default, the same landmine already found and fixed
  // elsewhere in this app's own pipeline (this subject alone has 1255
  // nodes, so a naive select here would have missed real rows needing
  // this exact fix).
  const rows = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('knowledge_map_nodes')
      .select('id, node_key, subtopic')
      .eq('subject', SUBJECT).eq('qualification', QUALIFICATION).eq('exam_board', EXAM_BOARD)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  console.log(`Fetched ${rows.length} total node rows.`);

  const byId = new Map(d.nodes.map((n) => [n.id, n]));
  let updated = 0, alreadyFine = 0, missing = 0;
  for (const row of rows) {
    if (row.subtopic) { alreadyFine++; continue; }
    const jsonNode = byId.get(row.node_key);
    if (!jsonNode || !jsonNode.subtopic) { missing++; console.warn('  -> no fix found for node_key', row.node_key); continue; }
    const { error: updateError } = await supabase.from('knowledge_map_nodes').update({ subtopic: jsonNode.subtopic }).eq('id', row.id);
    if (updateError) throw updateError;
    updated++;
  }
  console.log(`Updated ${updated} rows, ${alreadyFine} already had a subtopic, ${missing} unresolved.`);

  const { error: deleteError } = await supabase
    .from('knowledge_map_node_spec_order')
    .delete()
    .eq('subject', SUBJECT).eq('qualification', QUALIFICATION).eq('exam_board', EXAM_BOARD).eq('subtopic', '');
  if (deleteError) throw deleteError;
  console.log('Removed the stale "" subtopic-order cache entry.');
}

main().catch((err) => { console.error(err); process.exit(1); });
