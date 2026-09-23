// Checkpointed, source-grounded knowledge map for Warwick BSc Economics (L100) Year 1 core: EC104, EC108, EC109,
// EC124, EC140 - all five required-core modules (see warwick_econ_l100_sources.json, drawn from the live Warwick
// module catalogue + the 2025-26 course regulations PDF). No rule-17 practical layering applies here (university
// lecture modules, not GCSE required practicals), so practicalIds stays empty on every node.
require('dotenv').config({ override: true });
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const source = require('./warwick_econ_l100_sources.json');
const { validate, patchGraph } = require('./build_aqa_biology_map');
const DIR = path.join(__dirname, 'warwick_econ_build');
fs.mkdirSync(DIR, { recursive: true });
const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
const promptSource = fs.readFileSync(path.join(__dirname, '../src/constants/knowledgeMapPrompts.ts'), 'utf8');
function prompt(name) { const marker = `export const ${name} = \``; const start = promptSource.indexOf(marker) + marker.length; return promptSource.slice(start, promptSource.indexOf('`;', start)); }
const generation = prompt('KNOWLEDGE_MAP_GENERATION_PROMPT').replace('{{PRACTICAL_RULE}}', 'This content has no required practicals/labs - do not create procedure-kind nodes or practicalIds; every node is kind concept, application or evaluation, and practicalIds stays [].');
const verification = prompt('KNOWLEDGE_MAP_VERIFICATION_PROMPT').replace('{{PRACTICAL_CHECK}}', '');
const contract = `University of Warwick BSc Economics (L100), Year 1 core. This is undergraduate lecture-course content across FIVE separate modules taught in parallel - not a single linear spec - so subtopics must be prefixed with their real module code so identically-named ideas in different modules never collide (e.g. subtopic "EC108 - Consumption theories", never a bare "Consumption theories"). Each node has {id,label,subtopic,theme,difficulty,objective,essentialPoints,specRefs,kind,practicalIds}; kind is concept|application|evaluation (no procedure - no lab practicals in this content); essentialPoints has 1-4 atomic points; specRefs cites the real module code + syllabus line (e.g. "EC109 syllabus: Consumer Theory"); practicalIds is always []. One node teaches ONE independently testable idea - split every named model, every distinct diagram/graph, every theorem, every distinct proof/derivation step, every named distribution or test, into its own node, exactly as you would split named examples in a school-level spec. IDs are globally unique using ec104_, ec108_, ec109_, ec124_, ec140_ prefixes matching the module. theme is "EC<code>: <module title>" exactly. Genuine cross-module prerequisites are expected and important - e.g. EC140's constrained optimisation genuinely underpins EC109's consumer/producer optimisation, EC124's probability/distributions genuinely underpin empirical claims used in EC108/EC109, and quantitative EC124/EC140 content should be treated as a prerequisite layer for the theory modules wherever a real mathematical dependency exists, not bolted on arbitrarily. Do not repeat a concept as a separate node in a different module - reuse the same id and add a cross-module edge instead. Return strict JSON, no markdown.`;
const patchContract = `Return {issues,removeNodeIds,upsertNodes,removeEdges,addEdges,remainingProblems}. Patches must use complete node objects. Fix every substantive issue, preserve a DAG, and never invent endpoints.`;
function normaliseEdge(edge) {
  if (Array.isArray(edge)) return { from: edge[0], to: edge[1], difficulty: 0.3 };
  return { ...edge, from: edge.from || edge.source, to: edge.to || edge.target };
}
function normalisePatch(patch) {
  return {
    ...patch,
    removeNodeIds: patch.removeNodeIds || [],
    upsertNodes: patch.upsertNodes || [],
    removeEdges: (patch.removeEdges || []).map(normaliseEdge),
    addEdges: (patch.addEdges || []).map(normaliseEdge),
  };
}
const file = name => path.join(DIR, `${name}.json`);
const read = name => fs.existsSync(file(name)) ? JSON.parse(fs.readFileSync(file(name), 'utf8')) : null;
const save = (name, value) => fs.writeFileSync(file(name), JSON.stringify(value, null, 2));
let usage = read('usage') || { calls: 0, estimatedUsd: 0 };
const BUDGET_USD = 3;
async function call(name, system, input, model, maxTokens) {
  const prior = read(name); if (prior) return prior;
  if (usage.estimatedUsd >= BUDGET_USD) throw new Error(`Budget cap of $${BUDGET_USD} reached (spent ~$${usage.estimatedUsd.toFixed(2)}) before ${name}; stopping.`);
  console.log(`Starting ${name}`);
  const response = await client.messages.stream({ model, max_tokens: maxTokens, thinking: { type: 'disabled' },
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: JSON.stringify(input) }] }).finalMessage();
  const u = response.usage, opus = model.includes('opus');
  usage.calls += 1;
  usage.estimatedUsd += ((u.input_tokens + (u.cache_creation_input_tokens || 0) * 1.25 + (u.cache_read_input_tokens || 0) * 0.1) * (opus ? 5 : 3) + u.output_tokens * (opus ? 25 : 15)) / 1e6;
  save('usage', usage);
  const raw = response.content.filter(x => x.type === 'text').map(x => x.text).join('\n');
  fs.writeFileSync(path.join(DIR, `${name}.txt`), raw);
  if (response.stop_reason !== 'end_turn') throw new Error(`${name}: incomplete ${response.stop_reason}`);
  const cleaned = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim();
  const firstBrace = cleaned.indexOf('{'), lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace <= firstBrace) throw new Error(`${name}: no JSON object returned`);
  const parsed = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
  save(name, parsed); console.log(`Completed ${name}; cumulative ~$${usage.estimatedUsd.toFixed(2)}`); return parsed;
}
async function main() {
  const pieces = [];
  for (const mod of source.modules) {
    const draft = await call(mod.code.toLowerCase(), generation + '\n' + contract + '\nBefore returning, audit your own output for complete source coverage, atomicity, and cycles.', {
      module: mod, instructions: `Generate the full module ${mod.code} (${mod.title}) only. Cover every syllabus line given. Do not generate other modules' content here - only reference other modules via externalPrerequisites: {to, prerequisiteConcept} for genuine cross-module dependencies.`,
    }, process.env.CLAUDE_MODEL || 'claude-sonnet-5', 50000);
    for (const node of draft.nodes || []) {
      if (!Array.isArray(node.specRefs) || !node.specRefs.length) node.specRefs = [`${mod.code} syllabus`];
      node.practicalIds = [];
    }
    save(mod.code.toLowerCase(), draft);
    try { validate(draft, true); }
    catch (error) { console.warn(`${mod.code} retained for global repair: ${error.message}`); }
    pieces.push(draft);
  }

  let graph = { nodes: pieces.flatMap(p => p.nodes), edges: pieces.flatMap(p => p.edges) };
  graph.nodes = [...new Map(graph.nodes.map(node => [node.id, node])).values()];
  graph.edges = [...new Map(graph.edges.map(edge => [`${edge.from}>${edge.to}`, edge])).values()];

  const semanticKey = node => `${node.subtopic}|${node.label}`.toLowerCase().replace(/[^a-z0-9|]+/g, '_');
  const canonicalByMeaning = new Map();
  const duplicateToCanonical = new Map();
  for (const node of graph.nodes) {
    const key = semanticKey(node);
    if (canonicalByMeaning.has(key)) duplicateToCanonical.set(node.id, canonicalByMeaning.get(key));
    else canonicalByMeaning.set(key, node.id);
  }
  if (duplicateToCanonical.size) {
    graph.nodes = graph.nodes.filter(node => !duplicateToCanonical.has(node.id));
    graph.edges = graph.edges.map(edge => ({
      ...edge,
      from: duplicateToCanonical.get(edge.from) || edge.from,
      to: duplicateToCanonical.get(edge.to) || edge.to,
    })).filter(edge => edge.from !== edge.to);
    graph.edges = [...new Map(graph.edges.map(edge => [`${edge.from}>${edge.to}`, edge])).values()];
  }

  for (let round = 0; round < 3; round++) {
    let structuralProblems = '';
    try { validate(graph); console.log('Graph is structurally valid.'); break; }
    catch (e) { structuralProblems = e.message; }
    const audit = await call(`global-repair-${round}`, verification + '\n' + contract + '\n' + patchContract, {
      graph, structuralProblems,
      task: 'Fix the structural problem described, plus any other genuine cycle, dangling edge, duplicate id, or atomicity issue you find while you are in here. Preserve a DAG. Return a compact patch only.',
    }, process.env.CLAUDE_MODEL || 'claude-sonnet-5', 20000);
    if (audit.remainingProblems?.length) console.warn(`Round ${round} defers: ${JSON.stringify(audit.remainingProblems)}`);
    graph = patchGraph(graph, normalisePatch(audit));
    graph.edges = [...new Map(graph.edges.map(edge => [`${edge.from}>${edge.to}`, edge])).values()];
    save('assembled', graph);
  }

  const report = validate(graph);
  const rank = new Map(report.order.map((id, i) => [id, i])); graph.nodes.sort((a, b) => rank.get(a.id) - rank.get(b.id));
  const out = {
    subject: 'Economics', qualification: 'Undergraduate Year 1', examBoard: 'Warwick',
    specification: 'BSc Economics L100 Year 1 core (EC104, EC108, EC109, EC124, EC140)',
    rule17: false, verified: true, sourceUrls: source.modules.map(m => m.url), ...graph,
  };
  fs.mkdirSync(path.join(__dirname, '../src/data'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '../src/data/warwickEconL100.json'), JSON.stringify(out, null, 2));
  save('validation', { nodes: graph.nodes.length, edges: graph.edges.length, roots: report.roots, usage });
  console.log(`Validated ${graph.nodes.length} nodes and ${graph.edges.length} edges.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
