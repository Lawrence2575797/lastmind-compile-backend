// Replaces every stored Edexcel Economics lesson with the content built from the derivation lessons, and clears the compiled notes cached
// from the old lessons (they are recomputed for free from the new content the next time a note is opened).
//
//   npx ts-node scripts/overwrite_econ_lessons.ts            dry run: shows what would change, writes nothing
//   npx ts-node scripts/overwrite_econ_lessons.ts --apply    does it
//
// Uses SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env, like the other scripts here. Makes no AI calls. Safe to run more than once.
import 'dotenv/config';
import { supabaseAdmin } from '../src/services/supabaseAdmin';
import { derivationContentForNode, derivationStageForNode, NodeIdentity } from '../src/services/derivationService';

const APPLY = process.argv.includes('--apply');

async function all<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) return out;
  }
}

(async () => {
  const nodes = await all<NodeIdentity>((a, b) => supabaseAdmin.from('knowledge_map_nodes')
    .select('id, node_key, concept_id, subject, qualification, exam_board, label')
    .eq('subject', 'Economics').eq('qualification', 'A-Level').eq('exam_board', 'Edexcel').range(a, b) as any);
  const covered = nodes.filter((n) => derivationStageForNode(n) !== null);
  console.log(`${nodes.length} Edexcel Economics nodes in the database, ${covered.length} covered by derivation lessons.`);

  const ids = covered.map((n) => n.id);
  const existing: { node_id: string; encoding_content: any }[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabaseAdmin.from('knowledge_map_node_lessons').select('node_id, encoding_content').in('node_id', ids.slice(i, i + 100));
    if (error) throw error;
    existing.push(...((data || []) as any[]));
  }
  const stored = new Map(existing.map((r) => [r.node_id, r.encoding_content]));
  const rows: { node_id: string; encoding_content: any }[] = [];
  let already = 0, replaced = 0, created = 0, noContent = 0;
  for (const n of covered) {
    const content = derivationContentForNode(n);
    if (!content) { noContent++; continue; }
    const old = stored.get(n.id);
    if (old && old.derivation && old.stage === content.stage && old.explanation === content.explanation) { already++; continue; }
    if (old) replaced++; else created++;
    rows.push({ node_id: n.id, encoding_content: content });
  }
  console.log(`old lessons to replace: ${replaced}, new lesson rows to create: ${created}, already up to date: ${already}, nodes with no derivation content: ${noContent}`);
  const sample = rows[0];
  if (sample) console.log('example of new stored explanation:\n' + sample.encoding_content.explanation);

  if (!APPLY) { console.log('\nDry run only. Re-run with --apply to write.'); return; }

  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await supabaseAdmin.from('knowledge_map_node_lessons').upsert(rows.slice(i, i + 100), { onConflict: 'node_id' });
    if (error) throw error;
    process.stdout.write(`\rwrote ${Math.min(i + 100, rows.length)} / ${rows.length}`);
  }
  console.log('');
  for (let i = 0; i < ids.length; i += 100) {
    const { error } = await supabaseAdmin.from('knowledge_map_node_notes').delete().in('node_id', ids.slice(i, i + 100));
    if (error) throw error;
  }
  console.log(`cleared cached notes for ${ids.length} nodes. Done.`);
})().catch((e) => { console.error(e); process.exit(1); });
