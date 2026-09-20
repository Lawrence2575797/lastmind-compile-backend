// Checkpointed, source-grounded knowledge-map build for OCR A Level Law (H415).
// HARD API COST CAP: US$3.00 in total. Before every call the projected worst-case
// cost (input + max_tokens of output) is added to the running total (persisted in
// ocr_law_build/usage.json across runs) and the call is refused if it would pass the cap.
// Resumable: every completed call is saved and never repeated.
require('dotenv').config({ override: true });
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { THEMES, SUBJECT, QUALIFICATION, EXAM_BOARD, SPEC } = require('./ocr_law_build/ocr_law_spec');
const { validate, patchGraph } = require('./build_aqa_biology_map');

const CAP_USD = 3.0;
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5';
const PRICE = { in: 3, out: 15 }; // USD per million tokens (Sonnet-class)
const DIR = path.join(__dirname, 'ocr_law_build');
const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

const promptSource = fs.readFileSync(path.join(__dirname, '../src/constants/knowledgeMapPrompts.ts'), 'utf8');
function prompt(name) {
  const marker = `export const ${name} = \``;
  const start = promptSource.indexOf(marker) + marker.length;
  return promptSource.slice(start, promptSource.indexOf('`;', start));
}
const generation = prompt('KNOWLEDGE_MAP_GENERATION_PROMPT').replace('{{PRACTICAL_RULE}}', '');

const contract = `SUBJECT: OCR A Level Law (H415), England and Wales. You are given the real specification content lines for one or more subtopics, and must build atomic lesson-sized nodes for EVERY assessable statement, using your verified knowledge of the law (leading cases, statute sections) so that the nodes reflect what OCR mark schemes credit.
LAW-SPECIFIC GUIDANCE:
- Each node is ONE testable idea a student can learn in a few minutes: one rule, one element, one test, one named case's principle, one statutory provision, one advantage or one disadvantage, one reform proposal.
- Leading cases belong inside the node whose principle they establish (in essentialPoints, e.g. "R v Woollin (1998): oblique intention - virtual certainty test"); give a case its own node only when it introduces a separate test used elsewhere.
- Elements of an offence or tort are separate nodes (each element, then the offence that needs them all). Defences: one node per defence and one per distinct requirement where a defence has several.
- Evaluation content (advantages/disadvantages, criticisms, reform proposals) follows rules 7 and 13: one node per individual point, kind "evaluation", depending on the rule it evaluates.
- kind: "concept" (a rule/definition), "procedure" (a process or step-by-step test, e.g. legislative stages), "application" (applying a rule to facts), "evaluation" (strengths, weaknesses, reform).
- COMPACT OUTPUT (cost matters): each node is {"id","label","st","difficulty","kind"} and NOTHING else. "st" is the subtopic code only (for example "2.3"). Make the label self-contained and precise enough to teach from on its own: name the specific rule, element, test, case principle or statute section (for example "Murder mens rea: oblique intention and the virtual certainty test (Woollin)"). "difficulty" has at most two decimals.
- Each edge is a 3-element array [fromId, toId, difficulty], not an object. "from" must be understood before "to". A DAG. Only edges within the nodes you produce here (cross-subtopic links are added in a later pass). Every node except genuine roots must have at least one incoming edge.
- Node ids: short, unique, and start with the prefix given in the task.
- Keep JSON compact (no indentation, no commentary). Return strict JSON {"nodes":[...],"edges":[[from,to,difficulty],...]}.`;

const linkContract = `Return strict JSON {"edges":[{"from":"ID","to":"ID","difficulty":0.0}]}. You are given every node (id | label | subtopic) of a knowledge map for OCR A Level Law, already linked WITHIN each subtopic group. Add ONLY genuine CROSS-subtopic prerequisite edges: "from" must be understood before "to" makes sense (for example an offence's evaluation needs the offence; a Convention article needs the Human Rights Act; a theory topic needs the rules it theorises about; statutory interpretation aids the later application skills). Prefer the single most direct prerequisite, avoid transitive shortcuts, never create a cycle, never link a node to another in its own subtopic group, and add at most 120 edges. Every subtopic group's first nodes should be reachable from an earlier foundation where one genuinely exists (for example criminal offences from the general elements of liability, tort defences from negligence). Use only ids you are given.`;

const CHUNKS = [
  { id: 'SK', codes: ['8.1'] },
  { id: 'LS', codes: ['1.1', '1.2', '1.3', '1.4'] },
  { id: 'CA', codes: ['2.1', '2.2', '2.3', '2.4', '2.5'] },
  { id: 'CB', codes: ['2.6', '2.7', '2.8', '2.9'] },
  { id: 'LA', codes: ['3.1', '3.2', '3.3'] },
  { id: 'LB', codes: ['3.4', '3.5', '3.6'] },
  { id: 'TA', codes: ['4.1', '4.2', '4.3', '4.4'] },
  { id: 'TB', codes: ['4.5', '4.6', '4.7', '4.8'] },
  { id: 'NL', codes: ['5.1', '5.2', '5.3', '5.4', '5.5'] },
  { id: 'HR', codes: ['6.1', '6.2', '6.3', '6.4', '6.5', '6.6'] },
  { id: 'CT', codes: ['7.1', '7.2', '7.3', '7.4', '7.5', '7.6', '7.7'] },
];

const file = (name) => path.join(DIR, `${name}.json`);
const read = (name) => (fs.existsSync(file(name)) ? JSON.parse(fs.readFileSync(file(name), 'utf8')) : null);
const save = (name, value) => fs.writeFileSync(file(name), JSON.stringify(value, null, 2));
let usage = read('usage') || { calls: 0, estimatedUsd: 0 };

// First balanced {...} object in the text (the model sometimes appends a note after the JSON).
function firstJsonObject(text) {
  const start = text.indexOf('{');
  if (start < 0) throw new Error('no JSON object returned');
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) { if (esc) esc = false; else if (ch === String.fromCharCode(92)) esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return JSON.parse(text.slice(start, i + 1));
  }
  throw new Error('unterminated JSON object');
}

async function call(name, system, input, maxTokens) {
  const prior = read(name);
  if (prior) return prior;
  // A response that was already paid for and saved but failed to parse: re-parse it, never re-buy it.
  if (fs.existsSync(path.join(DIR, `${name}.txt`))) {
    const saved = firstJsonObject(fs.readFileSync(path.join(DIR, `${name}.txt`), 'utf8'));
    save(name, saved);
    return saved;
  }
  const userContent = JSON.stringify(input);
  // Worst case for this call: all input uncached, all of max_tokens produced.
  const inputTokens = Math.ceil((system.length + userContent.length) / 3.2);
  const worst = (inputTokens * PRICE.in * 1.25 + maxTokens * PRICE.out) / 1e6;
  if (usage.estimatedUsd + worst > CAP_USD) {
    throw new Error(`COST CAP: ${name} could bring spend to $${(usage.estimatedUsd + worst).toFixed(2)} (> $${CAP_USD}); already spent $${usage.estimatedUsd.toFixed(3)}. Stopping.`);
  }
  console.log(`Starting ${name} (spent so far $${usage.estimatedUsd.toFixed(3)})`);
  // The key is intermittently rejected (401) or rate limited; a failed request costs nothing, so retry.
  let response;
  for (let attempt = 1; ; attempt++) {
    try {
      response = await client.messages.stream({
        model: MODEL, max_tokens: maxTokens, thinking: { type: 'disabled' },
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: userContent }],
      }).finalMessage();
      break;
    } catch (err) {
      const retryable = [408, 429, 500, 502, 503, 529].includes(err.status);
      if (!retryable || attempt >= 6) throw err;
      console.warn(`${name}: attempt ${attempt} failed (${err.status}); retrying`);
      await new Promise((r) => setTimeout(r, 4000 * attempt));
    }
  }
  const u = response.usage;
  usage.calls += 1;
  usage.estimatedUsd += ((u.input_tokens + (u.cache_creation_input_tokens || 0) * 1.25 + (u.cache_read_input_tokens || 0) * 0.1) * PRICE.in + u.output_tokens * PRICE.out) / 1e6;
  save('usage', usage);
  const raw = response.content.filter((x) => x.type === 'text').map((x) => x.text).join('\n');
  fs.writeFileSync(path.join(DIR, `${name}.txt`), raw);
  if (response.stop_reason !== 'end_turn') throw new Error(`${name}: incomplete (${response.stop_reason}); spent $${usage.estimatedUsd.toFixed(3)}`);
  const parsed = firstJsonObject(raw);
  save(name, parsed);
  console.log(`Completed ${name}; cumulative ~$${usage.estimatedUsd.toFixed(3)}`);
  return parsed;
}

async function main() {
  const subtopicByCode = new Map();
  THEMES.forEach((t) => t.subtopics.forEach((s) => subtopicByCode.set(s.code, { ...s, theme: t.theme })));

  const pieces = [];
  for (const chunk of CHUNKS) {
    const subtopics = chunk.codes.map((code) => {
      const s = subtopicByCode.get(code);
      return { subtopic: `${code} ${s.title}`, theme: s.theme, specificationContent: s.bullets };
    });
    const draft = await call(`chunk-${chunk.id}`, generation + '\n' + contract, {
      subject: SUBJECT, qualification: QUALIFICATION, examBoard: EXAM_BOARD, specification: SPEC,
      idPrefix: `${chunk.id}_`, subtopics,
      instructions: 'Generate nodes and edges for these subtopics only. Cover every specification content line completely. Before returning, check atomicity, hidden prerequisites and that there are no cycles.',
    }, 14000);
    for (const n of draft.nodes || []) {
      if (!n.subtopic) {
        const sub = subtopicByCode.get(String(n.st));
        if (!sub) throw new Error(`Unknown subtopic code ${n.st} on ${n.id}`);
        n.subtopic = `${n.st} ${sub.title}`;
        n.theme = sub.theme;
      }
      if (!n.objective) n.objective = `Understand and apply: ${n.label}`;
      if (!Array.isArray(n.specRefs) || !n.specRefs.length) n.specRefs = [`OCR H415 ${String(n.subtopic).split(' ')[0]}`];
      if (!Array.isArray(n.essentialPoints) || !n.essentialPoints.length) n.essentialPoints = [n.label];
      n.essentialPoints = n.essentialPoints.slice(0, 4);
      delete n.st;
      n.practicalIds = [];
      if (!['concept', 'procedure', 'application', 'evaluation'].includes(n.kind)) n.kind = 'concept';
    }
    // Keep only edges whose ends exist in this chunk (later pass adds cross-chunk links).
    const ids = new Set(draft.nodes.map((n) => n.id));
    draft.edges = (draft.edges || [])
      .map((e) => (Array.isArray(e) ? { from: e[0], to: e[1], difficulty: typeof e[2] === 'number' ? e[2] : 0.3 } : e))
      .filter((e) => ids.has(e.from) && ids.has(e.to) && e.from !== e.to);
    pieces.push(draft);
  }

  let graph = { nodes: pieces.flatMap((p) => p.nodes), edges: pieces.flatMap((p) => p.edges) };
  graph.nodes = [...new Map(graph.nodes.map((n) => [n.id, n])).values()];
  graph.edges = [...new Map(graph.edges.map((e) => [`${e.from}>${e.to}`, e])).values()];

  // Merge same-meaning duplicates (Supabase enforces one concept identity per course).
  const key = (n) => `${n.subtopic}|${n.label}`.toLowerCase().replace(/[^a-z0-9|]+/g, '_');
  const canon = new Map(), dup = new Map();
  for (const n of graph.nodes) { const k = key(n); if (canon.has(k)) dup.set(n.id, canon.get(k)); else canon.set(k, n.id); }
  if (dup.size) {
    graph.nodes = graph.nodes.filter((n) => !dup.has(n.id));
    graph.edges = graph.edges.map((e) => ({ ...e, from: dup.get(e.from) || e.from, to: dup.get(e.to) || e.to })).filter((e) => e.from !== e.to);
    graph.edges = [...new Map(graph.edges.map((e) => [`${e.from}>${e.to}`, e])).values()];
  }

  // Cross-subtopic prerequisite links: one compact call over id | label | subtopic.
  const listing = graph.nodes.map((n) => `${n.id} | ${n.label} | ${n.subtopic.split(' ')[0]}`).join('\n');
  const link = await call('cross-links', linkContract, { nodes: listing }, 9000);
  const ids = new Set(graph.nodes.map((n) => n.id));
  const group = new Map(graph.nodes.map((n) => [n.id, n.subtopic]));
  const have = new Set(graph.edges.map((e) => `${e.from}>${e.to}`));
  for (const e of link.edges || []) {
    if (!ids.has(e.from) || !ids.has(e.to) || e.from === e.to || group.get(e.from) === group.get(e.to)) continue;
    if (have.has(`${e.from}>${e.to}`)) continue;
    graph.edges.push({ from: e.from, to: e.to, difficulty: typeof e.difficulty === 'number' ? e.difficulty : 0.4 });
    have.add(`${e.from}>${e.to}`);
  }

  // Second, cheap pass: nodes still without any prerequisite. A genuine root is a bare definition;
  // an evaluation, a defence, a remedy or an application should not be one.
  {
    const incoming = new Set(graph.edges.map((e) => e.to));
    const roots = graph.nodes.filter((n) => !incoming.has(n.id));
    const rootListing = roots.map((n) => `${n.id} | ${n.label.slice(0, 90)} | ${String(n.subtopic).split(' ')[0]} | ${n.kind}`).join(String.fromCharCode(10));
    const all = graph.nodes.map((n) => `${n.id} | ${n.label.slice(0, 60)} | ${String(n.subtopic).split(' ')[0]}`).join(String.fromCharCode(10));
    const rootLinks = await call('root-links', `Return ONLY strict JSON {"edges":[[fromId,toId,difficulty],...]} (3-element arrays, no other text). You are given (1) ROOTS: nodes of an OCR A Level Law knowledge map that currently have no prerequisite, and (2) ALL: every node. For each root that is NOT a genuine axiomatic definition (an evaluation/criticism/reform point, a defence, a remedy, an application, a test that builds on a rule, a case principle that builds on a doctrine) add ONE OR TWO edges [prerequisite, root, difficulty] from the node(s) that must be understood first, choosing the most direct prerequisite (it may be in another subtopic). Leave genuine definitional roots alone. Never create a cycle; use only ids given; each edge's "to" must be a listed root.`, { ROOTS: rootListing, ALL: all }, 4500);
    const rootIds = new Set(roots.map((n) => n.id));
    const idsAll = new Set(graph.nodes.map((n) => n.id));
    const haveKeys = new Set(graph.edges.map((e) => `${e.from}>${e.to}`));
    for (const e of rootLinks.edges || []) {
      const [from, to, d] = Array.isArray(e) ? e : [e.from, e.to, e.difficulty];
      if (!rootIds.has(to) || !idsAll.has(from) || from === to || haveKeys.has(`${from}>${to}`)) continue;
      graph.edges.push({ from, to, difficulty: typeof d === 'number' ? d : 0.35 });
      haveKeys.add(`${from}>${to}`);
    }
  }

  // Drop any edge that would create a cycle (later cross-links only), then validate.
  const adj = new Map(graph.nodes.map((n) => [n.id, []]));
  const kept = [];
  const reaches = (from, to) => { const seen = new Set(), st = [from]; while (st.length) { const x = st.pop(); if (x === to) return true; if (seen.has(x)) continue; seen.add(x); (adj.get(x) || []).forEach((y) => st.push(y)); } return false; };
  const withinFirst = [...graph.edges].sort((a, b) => (group.get(a.from) === group.get(a.to) ? 0 : 1) - (group.get(b.from) === group.get(b.to) ? 0 : 1));
  for (const e of withinFirst) {
    if (reaches(e.to, e.from)) { console.warn(`Dropped cyclic edge ${e.from} -> ${e.to}`); continue; }
    adj.get(e.from).push(e.to); kept.push(e);
  }
  graph.edges = kept;
  const report = validate(graph);
  const rank = new Map(report.order.map((id, i) => [id, i]));
  graph.nodes.sort((a, b) => rank.get(a.id) - rank.get(b.id));

  const out = { subject: SUBJECT, qualification: QUALIFICATION, examBoard: EXAM_BOARD, specification: SPEC, sourceUrl: 'https://www.ocr.org.uk/Images/315216-specification-accredited-a-level-gce-law-h415.pdf', ...graph };
  fs.mkdirSync(path.join(__dirname, '../src/data'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '../src/data/ocrLawALevel.json'), JSON.stringify(out, null, 2));
  save('validation', { nodes: graph.nodes.length, edges: graph.edges.length, roots: report.roots.length, usage });
  console.log(`Validated ${graph.nodes.length} nodes, ${graph.edges.length} edges, ${report.roots.length} roots. Total spend ~$${usage.estimatedUsd.toFixed(3)}.`);
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
