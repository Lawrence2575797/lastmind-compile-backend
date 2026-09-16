// Reproducible, checkpointed 8461 Higher map. No database writes here.
require('dotenv').config({ override: true });
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const source = require('./aqa_biology_8461_sources.json');
const budget = require('./aqa_biology_budget');
const DIR = path.join(__dirname, 'aqa_biology_build');
fs.mkdirSync(DIR, { recursive: true });
const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
const promptSource = fs.readFileSync(path.join(__dirname, '../src/constants/knowledgeMapPrompts.ts'), 'utf8');
function prompt(name) {
  const start = promptSource.indexOf(`export const ${name} = \``) + `export const ${name} = \``.length;
  return promptSource.slice(start, promptSource.indexOf('`;', start));
}
const generation = prompt('KNOWLEDGE_MAP_GENERATION_PROMPT').replace('{{PRACTICAL_RULE}}', prompt('KNOWLEDGE_MAP_GENERATION_PROMPT_PRACTICAL_RULE'));
const verification = prompt('KNOWLEDGE_MAP_VERIFICATION_PROMPT').replace('{{PRACTICAL_CHECK}}', prompt('KNOWLEDGE_MAP_VERIFICATION_PROMPT_PRACTICAL_CHECK'));
const contract = `This is AQA GCSE Higher separate Biology 8461, NOT combined science. Include common, HT-only and biology-only assessable content. Obey stated exclusions (e.g. do not require named mitosis phases). One node teaches ONE independently testable idea, NOT up to four different ideas; at most four essential details of that one idea. Split named examples, adaptations, hormones, food tests, diseases and individual experimental steps. No artificial edges to reduce roots: each edge must be a genuine learning prerequisite. Cross-topic prerequisites are encouraged. Rules 7/8's economics examples do NOT justify inventing four-to-six evaluations of every biology fact. Include only real specification knowledge and necessary grounding. Do not repeat a concept as a separate node in different topics.
Each node must have {id,label,subtopic,theme,difficulty,objective,essentialPoints,specRefs,kind,practicalIds}. kind is concept|procedure|application|evaluation. objective is one precise testable idea. essentialPoints is 1-4 short strings, each essential to that ONE idea. specRefs names real source sections, e.g. 4.1.1.2, WS 2.4, MS 1c, AT 7, 8.2.1. practicalIds is an array of integers 1-10 (empty for non-practical nodes). subtopic uses the existing app format without the leading 4, e.g. '1.1 Cell structure', '6.1 Reproduction'; theme is 'Topic 1 - Cell biology' etc. Use '0.1 Working scientifically' and '0.2 Mathematical skills' for reusable foundation skills. IDs are globally unique using b0_, b1_, ... b7_ prefixes for their topic. Edges are {from,to,difficulty}. Node labels must unambiguously state the single taught idea because the app displays them directly. Return strict JSON, no markdown.`;
const checkpoint = (name) => path.join(DIR, name + '.json');
const save = (name, data) => fs.writeFileSync(checkpoint(name), JSON.stringify(data, null, 2));
const read = (name) => fs.existsSync(checkpoint(name)) ? JSON.parse(fs.readFileSync(checkpoint(name), 'utf8')) : null;
let spend = read('usage') || { estimatedUsd: 0, calls: 0 };
async function call(name, system, input, review = false) {
  const prior = read(name);
  if (prior) return prior;
  const model = review ? 'claude-opus-5' : (process.env.CLAUDE_MODEL || 'claude-sonnet-5');
  const inputText = typeof input === 'string' ? input : JSON.stringify(input);
  budget.reserve(name, system, inputText, 60000, review);
  console.log(`Starting ${name}`);
  const response = await client.messages.stream({ model, max_tokens: 60000, thinking: { type: 'disabled' },
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: inputText }] }).finalMessage();
  const u = response.usage;
  budget.settle(name, u, review);
  spend.calls++;
  spend.estimatedUsd += ((u.input_tokens + (u.cache_creation_input_tokens || 0) * 1.25 + (u.cache_read_input_tokens || 0) * 0.1) * (review ? 5 : 3) + u.output_tokens * (review ? 25 : 15)) / 1e6;
  save('usage', spend);
  const raw = response.content.filter(x => x.type === 'text').map(x => x.text).join('\n');
  fs.writeFileSync(path.join(DIR, name + '.txt'), raw);
  if (response.stop_reason !== 'end_turn') throw new Error(`${name}: incomplete response (${response.stop_reason})`);
  const result = JSON.parse(raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, ''));
  save(name, result);
  console.log(`Completed ${name}; estimated cumulative $${spend.estimatedUsd.toFixed(2)}`);
  return result;
}
function patchGraph(graph, patch) {
  const removed = new Set(patch.removeNodeIds || []);
  const nodes = new Map(graph.nodes.filter(n => !removed.has(n.id)).map(n => [n.id, n]));
  for (const n of patch.upsertNodes || []) nodes.set(n.id, n);
  const edgeKey = e => e.from + '>' + e.to;
  const removedEdges = new Set((patch.removeEdges || []).map(edgeKey));
  const edges = new Map(graph.edges.filter(e => !removed.has(e.from) && !removed.has(e.to) && !removedEdges.has(edgeKey(e))).map(e => [edgeKey(e), e]));
  for (const e of patch.addEdges || []) edges.set(edgeKey(e), e);
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}
const patchContract = `Return {issues:[string],removeNodeIds:[id],upsertNodes:[COMPLETE node objects using the contract],removeEdges:[{from,to}],addEdges:[{from,to,difficulty}],remainingProblems:[string]}. All listed issues MUST be fixed by this patch. On splitting remove the original bundled node and rewire its incoming/outgoing edges to the proper replacements. On merging remove the duplicate and rewire ALL its edges to the survivor. Do not leave both umbrella and split nodes. remainingProblems is nonempty if you cannot fix an issue with this patch. Do not make a change for stylistic preferences. An empty patch is correct when no substantive issue exists.`;
function validate(graph, allowExternal = false) {
  const ids = new Set();
  for (const n of graph.nodes) {
    if (ids.has(n.id)) throw new Error(`Duplicate id ${n.id}`);
    ids.add(n.id);
    if (!n.label || !n.objective || !n.subtopic || !n.theme || !n.specRefs?.length || !n.essentialPoints?.length || n.essentialPoints.length > 4 || !(n.difficulty >= 0 && n.difficulty <= 1)) throw new Error(`Invalid atomic node ${n.id}`);
    if (!['concept','procedure','application','evaluation'].includes(n.kind)) throw new Error(`Invalid kind ${n.id}`);
    if (!Array.isArray(n.practicalIds) || n.practicalIds.some(p => !Number.isInteger(p) || p < 1 || p > 10)) throw new Error(`Invalid practical ids ${n.id}`);
  }
  const incoming = new Map(graph.nodes.map(n => [n.id, 0]));
  const adjacency = new Map(graph.nodes.map(n => [n.id, []]));
  const edgeKeys = new Set();
  for (const e of graph.edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) {
      if (allowExternal) continue;
      throw new Error(`Dangling edge ${e.from} -> ${e.to}`);
    }
    const k = e.from + '>' + e.to;
    if (e.from === e.to || edgeKeys.has(k) || !(e.difficulty >= 0 && e.difficulty <= 1)) throw new Error(`Invalid edge ${k}`);
    edgeKeys.add(k);
    incoming.set(e.to, incoming.get(e.to) + 1);
    adjacency.get(e.from).push(e.to);
  }
  const roots = graph.nodes.filter(n => !incoming.get(n.id));
  const queue = roots.map(n => n.id), order = [];
  while (queue.length) {
    const id = queue.shift(); order.push(id);
    for (const to of adjacency.get(id)) { incoming.set(to, incoming.get(to) - 1); if (!incoming.get(to)) queue.push(to); }
  }
  if (order.length !== ids.size) throw new Error(`Cycle involving ${[...incoming].filter(x => x[1]).map(x => x[0]).join(', ')}`);
  return { roots: roots.map(n => ({ id: n.id, label: n.label })), order };
}
async function main() {
  const practical = source.sources.find(s => s.url.endsWith('/practical-assessment'));
  const chunks = [
    { topic: 0, sources: [source.sources[0], source.sources[8]], extra: practical.text.slice(0, practical.text.indexOf('8.2 Required')) },
    ...source.sources.slice(1, 8).map((s, i) => ({ topic: i + 1, sources: [s], extra: practical.text })),
  ];
  const graphs = [];
  for (let start = 0; start < chunks.length; start += 2) {
    const results = await Promise.allSettled(chunks.slice(start, start + 2).map(async chunk => {
      const input = { topic: chunk.topic, specification: chunk.sources, practicalContext: chunk.extra,
        instructions: `Generate topic ${chunk.topic} ONLY. Practical context is provided for precision: include ONLY investigations belonging to this topic. Topic 0 generates reusable WS/MS/apparatus skills, no specific biology investigations. Other topics may reference other topics via an externalPrerequisites array of {to, prerequisiteConcept}; do NOT create duplicate foundation or other-topic nodes. Output {nodes,edges,externalPrerequisites}. Include every assessable statement, required named example, calculation and skill, while respecting exclusions.` };
      const draft = await call(`topic${chunk.topic}-draft`, generation + '\n' + contract, input);
      const audit = await call(`topic${chunk.topic}-audit`, verification + '\n' + contract + '\n' + patchContract,
        { ...input, graph: draft, task: 'Check coverage against EVERY source statement, scientific accuracy, ONE-idea atomicity and rule 17. Also fix omissions. Keep external prerequisites as requests for global linking, not invented endpoint IDs.' }, true);
      if (audit.remainingProblems?.length) throw new Error(JSON.stringify(audit.remainingProblems));
      const graph = patchGraph(draft, audit);
      validate(graph, true);
      return { ...graph, externalPrerequisites: draft.externalPrerequisites || [] };
    }));
    for (const r of results) { if (r.status === 'rejected') throw r.reason; graphs.push(r.value); }
  }
  let graph = { nodes: graphs.flatMap(g => g.nodes), edges: graphs.flatMap(g => g.edges) };
  for (let round = 0; round < 4; round++) {
    let structuralProblems = '';
    try { validate(graph); } catch (e) { structuralProblems = e.message; }
    const audit = await call(`global-audit-${round}`, verification + '\n' + contract + '\n' + patchContract, {
      graph, externalPrerequisites: graphs.flatMap(g => g.externalPrerequisites), structuralProblems,
      task: 'Audit the whole course. Resolve EVERY external prerequisite against existing nodes. Minimise unjustified roots through genuine dependencies across topics, not arbitrary ordering. Check every root for hidden technical vocabulary, include definitions that are genuinely needed. Reuse general procedural skills. Ensure all 10 practicals have procedure/concept/application layers; applications depend on BOTH procedure and concept, and evaluation on the specific step. Merge same concepts across topics and correct bundled nodes. Keep DAG acyclic and all endpoints existing. Give each root a short rootReason explaining why it has no taught prerequisites (upsert only roots missing this). Fix all substantive errors.'
    }, true);
    if (audit.remainingProblems?.length) throw new Error(JSON.stringify(audit.remainingProblems));
    graph = patchGraph(graph, audit);
    save('assembled', graph);
    const changed = ['removeNodeIds', 'upsertNodes', 'removeEdges', 'addEdges'].some(k => audit[k]?.length);
    if (!changed && !structuralProblems) break;
    if (round === 3) throw new Error('Global review still proposes changes; inspect retained assembled graph before release.');
  }
  const report = validate(graph);
  if (report.roots.some(r => !graph.nodes.find(n => n.id === r.id).rootReason)) throw new Error('Unjustified roots');
  for (let p = 1; p <= 10; p++) {
    const nodes = graph.nodes.filter(n => n.practicalIds.includes(p));
    if (!nodes.some(n => n.kind === 'procedure') || !nodes.some(n => n.kind === 'application')) throw new Error(`Missing practical layers RP${p}`);
  }
  const rank = new Map(report.order.map((id, i) => [id, i]));
  graph.nodes.sort((a, b) => rank.get(a.id) - rank.get(b.id));
  const out = { subject: 'Biology', qualification: 'GCSE Higher', examBoard: 'AQA', specification: '8461', rule17: true, verified: true,
    sourceUrls: source.sources.map(s => s.url), ...graph };
  const dest = path.join(__dirname, '../src/data/aqaBiologyHigher.json');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(out, null, 2));
  save('validation', { nodes: graph.nodes.length, edges: graph.edges.length, crossTopicEdges: graph.edges.filter(e => graph.nodes.find(n => n.id === e.from).theme !== graph.nodes.find(n => n.id === e.to).theme).length, ...report, spend });
  console.log(`Validated ${graph.nodes.length} nodes, ${graph.edges.length} edges, ${report.roots.length} justified roots.`);
}
if (require.main === module) main().catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { validate, patchGraph };
