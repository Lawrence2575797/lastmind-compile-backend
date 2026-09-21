// Writes the SQL that replaces every stored Edexcel Economics lesson with the derivation-built content, split into pasteable parts.
//   SUPABASE_URL=x SUPABASE_SERVICE_ROLE_KEY=x npx ts-node scripts/derivation/export_sql.ts <out-dir>
// (the two variables are only needed so the service module loads; nothing connects to a database)
import fs from 'fs';
import path from 'path';
import { derivationContentForNode, NodeIdentity } from '../../src/services/derivationService';
import map from '../knowledge_map_economics_alevel.json';

const clean = (s: string) => (s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
const outDir = process.argv[2];
fs.mkdirSync(outDir, { recursive: true });
const PART = 200;
const rows: { key: string; json: string }[] = [];
for (const n of (map as any).nodes) {
  const id: NodeIdentity = { id: 'x', node_key: n.id, concept_id: `economics:${clean(n.subtopic || '')}:${clean(n.label)}`, subject: 'Economics', qualification: 'A-Level', exam_board: 'Edexcel' };
  const c = derivationContentForNode(id);
  if (!c) throw new Error('no content for ' + n.id);
  const json = JSON.stringify(c);
  if (json.includes('$j$')) throw new Error('unexpected delimiter in ' + n.id);
  rows.push({ key: n.id, json });
}
const WHERE = `n.subject = 'Economics' AND n.qualification = 'A-Level' AND n.exam_board = 'Edexcel'`;
const parts = Math.ceil(rows.length / PART);
for (let p = 0; p < parts; p++) {
  const chunk = rows.slice(p * PART, (p + 1) * PART);
  const values = chunk.map((r) => `  ('${r.key.replace(/'/g, "''")}', $j$${r.json}$j$::jsonb)`).join(',\n');
  const sql = `-- Economics lessons: part ${p + 1} of ${parts}. Replaces the stored old lesson for ${chunk.length} concepts with the derivation-built content. Safe to run twice.
INSERT INTO knowledge_map_node_lessons (node_id, encoding_content)
SELECT n.id, v.content
FROM (VALUES
${values}
) AS v(node_key, content)
JOIN knowledge_map_nodes n ON n.node_key = v.node_key AND ${WHERE}
ON CONFLICT (node_id) DO UPDATE SET encoding_content = EXCLUDED.encoding_content;
`;
  fs.writeFileSync(path.join(outDir, `econ_lessons_${p + 1}_of_${parts}.sql`), sql);
}
fs.writeFileSync(path.join(outDir, `econ_lessons_${parts + 1}_clear_notes.sql`), `-- Run after every part above. Clears the compiled notes cached from the old lessons; they rebuild from the new content on demand, with no AI call.
DELETE FROM knowledge_map_node_notes WHERE node_id IN (SELECT n.id FROM knowledge_map_nodes n WHERE ${WHERE});
`);
fs.writeFileSync(path.join(outDir, `econ_lessons_0_check.sql`), `-- Optional, run any time: how many Economics lessons now hold derivation content (expect 1243 once every part has run).
SELECT count(*) AS derivation_lessons FROM knowledge_map_node_lessons l JOIN knowledge_map_nodes n ON n.id = l.node_id
WHERE ${WHERE} AND l.encoding_content ->> 'derivation' = 'true';
`);
console.log(`${rows.length} lessons in ${parts} parts`);
