// Checkpointed, source-grounded AQA 8462 map generation with rule 17 enabled.
require('dotenv').config({ override: true });
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const source = require('./aqa_chemistry_8462_sources.json');
const { validate, patchGraph } = require('./build_aqa_biology_map');
const DIR = path.join(__dirname, 'aqa_chemistry_build');
fs.mkdirSync(DIR, { recursive: true });
const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
const promptSource = fs.readFileSync(path.join(__dirname, '../src/constants/knowledgeMapPrompts.ts'), 'utf8');
function prompt(name) { const marker = `export const ${name} = \``; const start = promptSource.indexOf(marker) + marker.length; return promptSource.slice(start, promptSource.indexOf('`;', start)); }
const generation = prompt('KNOWLEDGE_MAP_GENERATION_PROMPT').replace('{{PRACTICAL_RULE}}', prompt('KNOWLEDGE_MAP_GENERATION_PROMPT_PRACTICAL_RULE'));
const verification = prompt('KNOWLEDGE_MAP_VERIFICATION_PROMPT').replace('{{PRACTICAL_CHECK}}', prompt('KNOWLEDGE_MAP_VERIFICATION_PROMPT_PRACTICAL_CHECK'));
const contract = `AQA GCSE Higher separate Chemistry 8462, not Combined Science. Include common, HT-only and chemistry-only content and obey exclusions. Rule 17 is mandatory. Each node has {id,label,subtopic,theme,difficulty,objective,essentialPoints,specRefs,kind,practicalIds}; kind is concept|procedure|application|evaluation; essentialPoints contains 1-4 atomic points; practicalIds contains integers 1-8. Use subtopics without leading 4 (for example 1.1) and themes Topic 1 through Topic 10. Include reusable WS/MS foundations in topic 0. Edges have {from,to,difficulty}. Return strict JSON.`;
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
async function call(name, system, input, model, maxTokens) {
  const prior = read(name); if (prior) return prior;
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
  const practical = source.sources.find(s => s.url.endsWith('/practical-assessment'));
  const working = source.sources.find(s => s.url.endsWith('/working-scientifically'));
  const maths = source.sources.find(s => s.url.endsWith('/mathematical-requirements'));
  const topics = [{ topic: 0, sources: [working, maths] }, ...source.sources.filter(s => /subject-content\//.test(s.url)).map((s, i) => ({ topic: i + 1, sources: [s] }))];
  const pieces = [];
  for (const item of topics) {
    const draft = await call(`topic${item.topic}`, generation + '\n' + contract + '\nBefore returning, audit your own output for complete source coverage, atomicity, hidden prerequisites, rule 17 layering, and cycles.', {
      topic: item.topic, specification: item.sources, practicalContext: item.topic ? practical.text : '',
      instructions: `Generate topic ${item.topic} only. Topic 0 contains reusable scientific, mathematical and apparatus skills. Other topics may list externalPrerequisites as {to,prerequisiteConcept}; do not duplicate another topic's node. Cover every assessable statement efficiently.`
    }, process.env.CLAUDE_MODEL || 'claude-sonnet-5', 50000);
    // Preserve an otherwise-valid paid response when it omitted only
    // provenance metadata on a duplicated cross-topic foundation skill.
    // The global audit below still has to merge/fix the actual duplicate.
    for (const node of draft.nodes || []) {
      if (!Array.isArray(node.specRefs) || !node.specRefs.length) node.specRefs = [`AQA 8462 topic ${item.topic}`];
      if (!Array.isArray(node.practicalIds)) node.practicalIds = [];
    }
    save(`topic${item.topic}`, draft);
    try { validate(draft, true); }
    catch (error) { console.warn(`Topic ${item.topic} retained for global repair: ${error.message}`); }
    pieces.push(draft);
  }
  let graph = { nodes: pieces.flatMap(p => p.nodes), edges: pieces.flatMap(p => p.edges) };
  // Identical IDs are the same reusable foundation concept emitted by
  // more than one topic. Keep the richer first definition; every edge
  // already targets the shared ID, so no paid repair call is needed.
  graph.nodes = [...new Map(graph.nodes.map(node => [node.id, node])).values()];
  graph.edges = [...new Map(graph.edges.map(edge => [`${edge.from}>${edge.to}`, edge])).values()];

  // Merge equivalent skills that different source batches named with distinct
  // IDs. Supabase intentionally enforces one concept identity per course.
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

  for (const topic of [6, 10]) {
    const theme = `Topic ${topic}`;
    const nodeIds = new Set(graph.nodes.filter(node => node.theme === theme).map(node => node.id));
    const local = { nodes: graph.nodes.filter(node => nodeIds.has(node.id)), edges: graph.edges.filter(edge => nodeIds.has(edge.from) && nodeIds.has(edge.to)) };
    const repair = await call(`topic${topic}-repair`, verification + '\n' + contract + '\n' + patchContract, {
      graph: local,
      task: topic === 6
        ? 'Fix the known rule-19 bundled factors list and any other atomicity/rule-17 issue in this topic. Return a compact patch only.'
        : 'Remove every cycle while preserving genuine prerequisite direction, then fix any atomicity/rule-17 issue in this topic. Return a compact patch only.'
    }, process.env.CLAUDE_MODEL || 'claude-sonnet-5', 18000);
    if (repair.remainingProblems?.length) console.warn(`Topic ${topic} defers cross-topic points to global audit: ${JSON.stringify(repair.remainingProblems)}`);
    graph = patchGraph(graph, normalisePatch(repair));
  }

  // Add the two cross-topic dependencies identified by the focused audits.
  // Keeping this deterministic avoids paying again for an oversized whole-map
  // response that cannot fit in the model's output window.
  graph.edges.push(
    { from: 'REACTION_PROFILE_DRAW', to: 'CATALYST_REACTION_PROFILE', difficulty: 0.45 },
    { from: 'NEUTRALISATION_DEF', to: 'N10_11_5', difficulty: 0.5 },
    { from: 'TITRATION_PROCEDURE', to: 'N10_11_5', difficulty: 0.5 },
  );
  graph.edges = [...new Map(graph.edges.map(edge => [`${edge.from}>${edge.to}`, edge])).values()];
  const report = validate(graph);
  for (let practical = 1; practical <= 8; practical++) {
    const nodes = graph.nodes.filter(node => node.practicalIds.includes(practical));
    if (!nodes.some(node => node.kind === 'procedure') || !nodes.some(node => node.kind === 'application')) throw new Error(`Missing rule-17 layers for practical ${practical}`);
  }
  const rank = new Map(report.order.map((id, i) => [id, i])); graph.nodes.sort((a, b) => rank.get(a.id) - rank.get(b.id));
  const out = { subject: 'Chemistry', qualification: 'GCSE Higher', examBoard: 'AQA', specification: '8462', rule17: true, verified: true, sourceUrls: source.sources.map(s => s.url), ...graph };
  fs.mkdirSync(path.join(__dirname, '../src/data'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '../src/data/aqaChemistryHigher.json'), JSON.stringify(out, null, 2));
  save('validation', { nodes: graph.nodes.length, edges: graph.edges.length, roots: report.roots, usage });
  console.log(`Validated ${graph.nodes.length} nodes and ${graph.edges.length} edges.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
