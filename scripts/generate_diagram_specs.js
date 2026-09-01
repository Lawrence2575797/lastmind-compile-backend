// Generates MECHANISTIC diagram_spec content for every real diagram-
// relevant knowledge-map node and writes it into
// knowledge_map_node_lessons.encoding_content.practiceQuestion.diagramSpec
// (additive - explanation/practiceQuestion.questionText/markScheme are
// left untouched, this only adds the diagramSpec field alongside them).
// Real sample already proved cost (~$0.0026/node on Sonnet) and quality
// (4/4 valid first try) before this was run at full scale - see the
// session's own discipline on that.
require('dotenv').config({ override: true });
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');
const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function extractPromptConstant(source, name) {
  const marker = `export const ${name} = \``;
  const start = source.indexOf(marker);
  const contentStart = start + marker.length;
  const end = source.indexOf('`;', contentStart);
  return source.slice(contentStart, end);
}
const promptsSource = fs.readFileSync(path.join(__dirname, '../src/constants/diagramSpecPrompts.ts'), 'utf8');
const MECHANISTIC_DIAGRAM_SPEC_PROMPT = extractPromptConstant(promptsSource, 'MECHANISTIC_DIAGRAM_SPEC_PROMPT');
const curveListMatch = promptsSource.match(/export const CURVE_TYPE_LIST = \[([\s\S]*?)\];/);
const CURVE_TYPE_LIST = curveListMatch[1].match(/'([a-z_]+)'/g).map((s) => s.slice(1, -1));

const MODEL = 'claude-sonnet-5';
const SONNET_SYNC_IN = 3.00 / 1e6, SONNET_SYNC_OUT = 15.00 / 1e6;
function costFromUsage(usage) {
  if (!usage) return 0;
  return (usage.input_tokens || 0) * SONNET_SYNC_IN + (usage.output_tokens || 0) * SONNET_SYNC_OUT;
}
function stripCodeFences(text) { return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim(); }

function validateSpec(spec) {
  if (spec.notDiagrammatic) return { ok: true, notDiagrammatic: true };
  const errors = [];
  const curveIds = new Set();
  for (const c of spec.curves || []) {
    if (!c.id || !c.type) { errors.push(`curve missing id/type: ${JSON.stringify(c)}`); continue; }
    const baseType = c.type.replace(/_shift_(left|right)$/, '');
    if (!CURVE_TYPE_LIST.includes(baseType)) errors.push(`unknown curve type: ${c.type}`);
    if (c.baseCurveId && !curveIds.has(c.baseCurveId)) errors.push(`curve ${c.id} references baseCurveId "${c.baseCurveId}" before it's defined`);
    curveIds.add(c.id);
  }
  for (const s of spec.shades || []) {
    if (!Array.isArray(s.boundedBy) || s.boundedBy.length !== 3) { errors.push(`shade ${s.id} boundedBy must have exactly 3 entries`); continue; }
    const axisCount = s.boundedBy.filter((b) => b === 'price-axis' || b === 'quantity-axis').length;
    const curveCount = s.boundedBy.filter((b) => curveIds.has(b)).length;
    if (axisCount !== 1 || curveCount !== 2) errors.push(`shade ${s.id} boundedBy must be exactly 2 known curve ids + 1 axis, got ${JSON.stringify(s.boundedBy)}`);
  }
  for (const l of spec.labels || []) {
    if (l.anchor.startsWith('curve:') && !curveIds.has(l.anchor.slice(6))) errors.push(`label "${l.text}" anchors to unknown curve id`);
    if (l.anchor.startsWith('intersection:')) {
      const [a, b] = l.anchor.slice(13).split(',');
      if (!curveIds.has(a) || !curveIds.has(b)) errors.push(`label "${l.text}" intersection anchor references unknown curve id(s)`);
    }
  }
  return { ok: errors.length === 0, errors };
}

async function generateOne(label) {
  const messages = [{ role: 'user', content: `Concept: ${label}` }];
  let spec, validation, attempt = 0, cost = 0;
  while (attempt < 2) {
    attempt++;
    const resp = await client.messages.create({ model: MODEL, max_tokens: 2000, thinking: { type: 'disabled' }, system: MECHANISTIC_DIAGRAM_SPEC_PROMPT, messages });
    cost += costFromUsage(resp.usage);
    const text = resp.content.find((b) => b.type === 'text').text;
    try { spec = JSON.parse(stripCodeFences(text)); } catch (e) { spec = { parseError: true }; validation = { ok: false, errors: ['JSON parse failed'] }; break; }
    validation = validateSpec(spec);
    if (validation.ok) break;
    messages.push({ role: 'assistant', content: text });
    messages.push({ role: 'user', content: `That spec had real errors - fix ONLY these and resend the complete corrected JSON:\n${validation.errors.join('\n')}` });
  }
  return { spec, validation, cost, attempts: attempt };
}

async function main() {
  const kw = /diagram|curve|PPF|lorenz|laffer|phillips|draw|AD\/AS|supply and demand/i;
  const idKw = /^(DRAW_|PPF_|LORENZ|LAFFER|PHILLIPS|AD_|AS_|LRAS)/;
  const all = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from('knowledge_map_nodes').select('id, label').range(from, from + 999);
    if (!data || !data.length) break;
    all.push(...data);
    if (data.length < 1000) break;
  }
  const candidates = all.filter((n) => kw.test(n.label) || idKw.test(n.id));
  console.log(`Generating diagram specs for ${candidates.length} candidate nodes...`);

  let totalCost = 0, diagrammatic = 0, notDiagrammatic = 0, failed = 0;
  const failures = [];
  for (const node of candidates) {
    const { spec, validation, cost } = await generateOne(node.label);
    totalCost += cost;
    if (!validation.ok) { failed++; failures.push({ id: node.id, label: node.label }); process.stdout.write('x'); continue; }
    if (spec.notDiagrammatic) { notDiagrammatic++; process.stdout.write('.'); continue; }

    const { data: lessonRow } = await supabase.from('knowledge_map_node_lessons').select('encoding_content').eq('node_id', node.id).maybeSingle();
    if (!lessonRow) { failed++; failures.push({ id: node.id, label: node.label, reason: 'no lesson row' }); process.stdout.write('!'); continue; }
    const content = lessonRow.encoding_content || {};
    content.practiceQuestion = { ...(content.practiceQuestion || {}), diagramSpec: spec };
    const { error } = await supabase.from('knowledge_map_node_lessons').update({ encoding_content: content }).eq('node_id', node.id);
    if (error) { failed++; failures.push({ id: node.id, label: node.label, reason: error.message }); process.stdout.write('!'); continue; }
    diagrammatic++;
    process.stdout.write('o');
  }
  console.log('');
  console.log(`\nDone. ${diagrammatic} written with a real diagram, ${notDiagrammatic} correctly identified as not diagrammatic, ${failed} failed.`);
  console.log(`Real cost: $${totalCost.toFixed(3)}`);
  if (failures.length) console.log('Failures:', JSON.stringify(failures, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
