// Diagnostic only - calls the REAL derivationGenericLookup/derivationGenericGenerate against the live DB for a
// specific node, with the try/catch that normally swallows the error (routes/knowledgeMap.ts's own
// generateNodeLessonPreferringDerivation) removed, to see WHY generation keeps silently falling back to the old
// per-node lesson generator for various Warwick Economics concepts.
require('dotenv').config({ override: true });
const { supabaseAdmin } = require('../dist/services/supabaseAdmin');
const { derivationGenericLookup, derivationGenericGenerate } = require('../dist/services/derivationGenericService');

async function main() {
  const nodeKey = process.argv[2];
  if (!nodeKey) { console.error('Usage: node diagnose_generation_failure.js <node_key>'); process.exit(1); }
  const { data: node, error } = await supabaseAdmin
    .from('knowledge_map_nodes').select('id,node_key,label,concept_id,subject,qualification,exam_board')
    .eq('subject', 'Economics').eq('qualification', 'Undergraduate Year 1').eq('exam_board', 'Warwick')
    .eq('node_key', nodeKey).maybeSingle();
  if (error) throw error;
  if (!node) { console.error('Node not found:', nodeKey); process.exit(1); }
  console.log('Node:', node.node_key, '|', node.label, '| id:', node.id);

  const generic = await derivationGenericLookup(node.id);
  if (!generic) { console.log('derivationGenericLookup returned null - this node is not resolvable via the generic path at all.'); return; }
  console.log('Resolved stage index:', generic.stageIndex, '| already cached:', !!generic.cached);
  if (generic.cached) { console.log('Already cached - no generation needed.'); return; }

  console.log('Calling derivationGenericGenerate (this WILL make a real Claude API call if not cached)...');
  try {
    const stage = await derivationGenericGenerate(generic, 'diagnostic-script-no-real-user');
    console.log('SUCCESS. Stage keys:', Object.keys(stage));
  } catch (err) {
    console.error('REAL ERROR (this is what generateNodeLessonPreferringDerivation silently swallows):');
    console.error(err);
  }
}
main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
