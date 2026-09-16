require('dotenv').config({ override: true });
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const budget = require('./aqa_biology_budget');
async function main() {
  const map = require('../src/data/aqaBiologyHigher.json');
  const sources = require('./aqa_biology_8461_sources.json');
  const prerequisites = new Map(map.nodes.map(n => [n.id, []]));
  for (const edge of map.edges) prerequisites.get(edge.to).push(edge.from);
  const input = JSON.stringify({ specification: sources.sources.map(s => s.text),
    nodes: map.nodes.map(n => [n.id, n.label, prerequisites.get(n.id), n.specRefs, n.practicalIds]) });
  const system = `Audit this AQA GCSE Higher separate Biology 8461 map against the FULL retrieved official specification. Thinking is disabled. Every node must teach ONE independently testable idea, maximum FOUR supporting details. Split independently forgettable facts rather than bundle lists. Edges are genuine prerequisites, including cross-topic dependencies. Do not demand arbitrary sequence edges to minimise roots. Practical rule 17: reusable procedural skills, biology concept and interpretation are separate nodes; interpreting experiment data depends on both relevant procedure and concept, evaluating an error depends on the specific step. Check ALL source sections for substantive omitted concepts, HT and biology-only details, all ten practicals and mathematical/WS skills. Respect explicit exclusions. Report scientific inaccuracies, misleading simplifications, out-of-scope demands, unjustified roots or edges, missing edges, duplicate concepts and bundled objectives. Reference concrete IDs. Do not ask for multi-concept synthesis nodes just to mirror a broad source bullet. The map's labels are also the generation scope; lessons will be based on matching source excerpts. Return strict JSON {issues:[{id,type,problem,fix}],missingConcepts:[{ref,concept}],missingEdges:[{from,to,why}],wrongEdges:[{from,to,why}],summary:string}. Concise, actionable findings only; do not rewrite the map. Prioritise substantive factual/coverage issues over style.`;
  const name = process.argv[2] || 'source-coverage-audit';
  const out = path.join(__dirname, 'aqa_biology_build', name + '.json');
  if (fs.existsSync(out)) throw new Error('Audit already exists; no duplicate API charge.');
  const maxTokens = 10000;
  budget.reserve(name, system, input, maxTokens, false);
  console.log(`Auditing ${map.nodes.length} nodes; ${Buffer.byteLength(input)} input bytes, max ${maxTokens} output tokens; thinking disabled.`);
  const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
  const result = await client.messages.stream({ model: process.env.CLAUDE_MODEL || 'claude-sonnet-5', max_tokens: maxTokens,
    thinking: { type: 'disabled' }, system, messages: [{ role: 'user', content: input }] }).finalMessage();
  budget.settle(name, result.usage, false);
  const raw = result.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
  fs.writeFileSync(out + '.txt', raw);
  if (result.stop_reason !== 'end_turn') throw new Error('Truncated audit; inspect saved output.');
  const audit = JSON.parse(raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, ''));
  fs.writeFileSync(out, JSON.stringify(audit, null, 2));
  console.log(JSON.stringify({ issues: audit.issues.length, missingConcepts: audit.missingConcepts.length, missingEdges: audit.missingEdges.length, wrongEdges: audit.wrongEdges.length, budget: budget.load() }));
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
