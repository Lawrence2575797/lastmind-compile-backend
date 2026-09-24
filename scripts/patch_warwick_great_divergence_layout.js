// Fixes a real layout bug in stage 32's hand-authored graph: the declared total height (h: 340) was smaller than
// the actual pixel extent of the Glorious Revolution box (y 340-420), which the SVG viewBox clips to exactly `h` -
// so that box (and the visual room for Cultural theory next to it) was cut off, leaving only 4 of 5 boxes visible
// and a stray unplaceable chip in the bank. Computed positions/edges programmatically this time instead of typing
// pixel coordinates by hand again, so every box's extent is guaranteed to fit inside the declared height.
require('dotenv/config');
const { createClient } = require('@supabase/supabase-js');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SUBJECT = 'Economics', QUALIFICATION = 'Undergraduate Year 1', EXAM_BOARD = 'Warwick';
const GD = 'economics:ec104_early_modern_period:the_great_divergence_question_why_europe_';
const INST = 'economics:ec104_early_modern_period:institutional_explanations_for_economic_development_property_rights_constraints_on_rulers_';
const GEO = 'economics:ec104_early_modern_period:geographic_explanations_for_divergence_resources_disease_climate_';
const CULT = 'economics:ec104_early_modern_period:cultural_ideational_explanations_for_divergence_values_religion_science_';
const GLOR = 'economics:ec104_early_modern_period:case_study_england_s_glorious_revolution_1688_and_credible_commitment';

const ROW_H = 64, GAP = 40, MARGIN = 20;
// Level 1 (3 nodes) sets the vertical rhythm; level 0 (root) centres on them; level 2 (GLOR) sits beside INST.
const level1Y = [0, 1, 2].map((i) => MARGIN + i * (ROW_H + GAP));
const nodes = {
  [INST]: [330, level1Y[0], 260, ROW_H],
  [GEO]: [330, level1Y[1], 260, ROW_H],
  [CULT]: [330, level1Y[2], 260, ROW_H],
  [GD]: [40, Math.round((level1Y[0] + level1Y[2]) / 2), 230, ROW_H],
  [GLOR]: [650, level1Y[0] - 8, 300, ROW_H + 16], // beside INST (the node it actually depends on), slightly taller
};
const totalH = Math.max(...Object.values(nodes).map(([, y, , h]) => y + h)) + MARGIN;

const midRight = (id) => { const [x, y, w, h] = nodes[id]; return [x + w, y + h / 2]; };
const midLeft = (id) => { const [x, y, w, h] = nodes[id]; return [x, y + h / 2]; };
function elbow(fromId, toId) {
  const [fx, fy] = midRight(fromId), [tx, ty] = midLeft(toId);
  if (Math.abs(fy - ty) < 4) return [[fx, fy], [tx, ty]];
  const midX = fx + (tx - fx) / 2;
  return [[fx, fy], [midX, fy], [midX, ty], [tx, ty]];
}

const pairs = [[GD, INST], [GD, GEO], [GD, CULT], [INST, GLOR]];
const edges = pairs.map(([a, b]) => elbow(a, b));

async function main() {
  const { data: row, error } = await db.from('derivation_generated_stages').select('compiled')
    .eq('subject', SUBJECT).eq('qualification', QUALIFICATION).eq('exam_board', EXAM_BOARD).eq('stage_index', 32).maybeSingle();
  if (error) throw error;
  if (!row) throw new Error('Stage 32 not found.');
  row.compiled.stage.graph = { h: totalH, edges, given: [], nodes, pairs };
  const { error: upErr } = await db.from('derivation_generated_stages').update({ compiled: row.compiled })
    .match({ subject: SUBJECT, qualification: QUALIFICATION, exam_board: EXAM_BOARD, stage_index: 32 });
  if (upErr) throw upErr;
  console.log('Stage 32 graph layout recomputed. Total height:', totalH);
  console.log('Nodes:', JSON.stringify(nodes, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
