// Two-call pipeline: GENERATION (per subtopic) -> VERIFICATION (whole batch)
// -> apply fixes -> validate as a DAG. Mirrors exactly what happened by
// hand in the Claude Code session that designed these prompts: generate,
// then have a separate, dedicated pass hunt for the blind-comprehension
// gaps, missing cross-links, and ordering bugs a single pass reliably
// misses.
//
// Uses YOUR OWN Anthropic API key (never Claude Code) - this is real
// production content generation for LastMind, so it must run through the
// Commercial/API terms, not a personal session.
//
// Usage: node scripts/generate_knowledge_map.js
// Requires ANTHROPIC_API_KEY in the environment (see .env.example).
// Edit SUBJECT/QUALIFICATION/EXAM_BOARD and SUBTOPICS below before running.

require('dotenv/config');
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

// knowledgeMapPrompts.ts is TypeScript (consumed normally by the compiled
// backend); this script runs as plain Node like every other file in
// scripts/, so it can't require() a .ts file directly without a build
// step. Extract the two exported template-literal constants as text
// instead, rather than adding a TS toolchain dependency to a one-off script.
function extractPromptConstant(source, name) {
  const marker = `export const ${name} = \``;
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`Could not find ${name} in knowledgeMapPrompts.ts`);
  const contentStart = start + marker.length;
  const end = source.indexOf('`;', contentStart);
  if (end === -1) throw new Error(`Could not find the end of ${name}`);
  return source.slice(contentStart, end);
}
const promptsSource = fs.readFileSync(path.join(__dirname, '../src/constants/knowledgeMapPrompts.ts'), 'utf8');
const KNOWLEDGE_MAP_GENERATION_PROMPT = extractPromptConstant(promptsSource, 'KNOWLEDGE_MAP_GENERATION_PROMPT');
const KNOWLEDGE_MAP_VERIFICATION_PROMPT = extractPromptConstant(promptsSource, 'KNOWLEDGE_MAP_VERIFICATION_PROMPT');

// Same env var claudeClient.ts already reads - not ANTHROPIC_API_KEY.
const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

// Matches MODELS.chainGeneration/factCheck in claudeClient.ts: that's the
// closest existing analogue (a dependency-structure generation task, fact-
// checked on Opus unconditionally because a wrong chain silently corrupts
// everything built on it) - the same reasoning applies here, more so,
// since this runs once per SUBJECT rather than once per concept.
const GENERATION_MODEL = 'claude-opus-4-8';
const VERIFICATION_MODEL = 'claude-opus-4-8';

const SUBJECT = 'Economics';
const QUALIFICATION = 'A-Level';
const EXAM_BOARD = 'Edexcel';

// Fill in with the REAL specification content for each subtopic - the
// actual named theories/concepts from the syllabus. Generation quality is
// bounded by what's given here; do not leave this to the model's own
// possibly-stale recall of the spec.
const SUBTOPICS = [
  {
    subtopic: '1.1 Nature of economics',
    specContent: `PASTE THE REAL SPEC TEXT FOR THIS SUBTOPIC HERE.`,
  },
  // ... one entry per subtopic
];

function stripCodeFences(text) {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}

async function generateSubtopic(subtopic, specContent) {
  const resp = await client.messages.create({
    model: GENERATION_MODEL,
    max_tokens: 8000,
    system: KNOWLEDGE_MAP_GENERATION_PROMPT,
    messages: [{
      role: 'user',
      content: `Subject: ${SUBJECT}\nQualification: ${QUALIFICATION}\nExam board: ${EXAM_BOARD}\nSubtopic: ${subtopic}\n\nReal specification content:\n${specContent}`,
    }],
  });
  const text = resp.content.find(b => b.type === 'text').text;
  return JSON.parse(stripCodeFences(text));
}

async function verifyBatch(allNodes, allEdges) {
  const resp = await client.messages.create({
    model: VERIFICATION_MODEL,
    max_tokens: 8000,
    system: KNOWLEDGE_MAP_VERIFICATION_PROMPT,
    messages: [{
      role: 'user',
      content: `Subject: ${SUBJECT} (${QUALIFICATION}, ${EXAM_BOARD})\n\nNodes:\n${JSON.stringify(allNodes)}\n\nEdges:\n${JSON.stringify(allEdges)}`,
    }],
  });
  const textBlock = resp.content.find(b => b.type === 'text');
  return JSON.parse(stripCodeFences(textBlock.text));
}

function applyFixes(nodes, edges, issues) {
  const nodeIds = new Set(nodes.map(n => n.id));
  const edgeKey = ([a, b]) => a + '->' + b;
  const edgeSet = new Set(edges.map(edgeKey));

  issues.forEach(issue => {
    (issue.fix?.new_nodes || []).forEach(n => {
      if (!nodeIds.has(n.id)) { nodes.push(n); nodeIds.add(n.id); }
    });
    (issue.fix?.new_edges || []).forEach(e => {
      if (!edgeSet.has(edgeKey(e))) { edges.push(e); edgeSet.add(edgeKey(e)); }
    });
    (issue.fix?.remove_edges || []).forEach(e => {
      const k = edgeKey(e);
      const idx = edges.findIndex(x => edgeKey(x) === k);
      if (idx !== -1) edges.splice(idx, 1);
    });
  });
  return { nodes, edges };
}

// Same validity check used throughout the artifact this pipeline is
// replacing - a DAG with no orphaned edges, run automatically rather than
// by hand every time.
function validate(nodes, edges) {
  const nodeIds = new Set(nodes.map(n => n.id));
  const dupes = {};
  nodes.forEach(n => dupes[n.id] = (dupes[n.id] || 0) + 1);
  Object.entries(dupes).forEach(([id, c]) => { if (c > 1) console.warn('DUPLICATE ID:', id); });

  const bad = edges.filter(([a, b]) => !nodeIds.has(a) || !nodeIds.has(b));
  bad.forEach(([a, b]) => console.warn('ORPHANED EDGE:', a, '->', b));

  const adj = {};
  nodes.forEach(n => adj[n.id] = []);
  edges.forEach(([a, b]) => { if (adj[a]) adj[a].push(b); });
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = {};
  nodes.forEach(n => color[n.id] = WHITE);
  let cyclePath = null;
  function dfs(u, path) {
    color[u] = GRAY;
    for (const v of adj[u]) {
      if (color[v] === GRAY) { cyclePath = path.concat([u, v]); return true; }
      if (color[v] === WHITE && dfs(v, path.concat([u]))) return true;
    }
    color[u] = BLACK;
    return false;
  }
  for (const n of nodes) if (color[n.id] === WHITE && dfs(n.id, [])) break;
  if (cyclePath) console.warn('CYCLE:', cyclePath.join(' -> '));

  return { valid: bad.length === 0 && !cyclePath && Object.values(dupes).every(c => c === 1) };
}

async function main() {
  let allNodes = [];
  let allEdges = [];

  for (const { subtopic, specContent } of SUBTOPICS) {
    console.log(`Generating: ${subtopic}...`);
    const { nodes, edges } = await generateSubtopic(subtopic, specContent);
    nodes.forEach(n => n.subtopic = subtopic);
    allNodes = allNodes.concat(nodes);
    allEdges = allEdges.concat(edges);
    console.log(`  -> ${nodes.length} nodes, ${edges.length} edges`);
  }

  console.log(`\nVerifying batch of ${allNodes.length} nodes...`);
  const { issues } = await verifyBatch(allNodes, allEdges);
  console.log(`  -> ${issues.length} issue(s) found`);
  issues.forEach(i => console.log(`  [${i.type}] ${i.affected_node}: ${i.explanation}`));

  const fixed = applyFixes(allNodes, allEdges, issues);
  const result = validate(fixed.nodes, fixed.edges);
  console.log(`\nFinal: ${fixed.nodes.length} nodes, ${fixed.edges.length} edges, valid DAG: ${result.valid}`);

  const outPath = `knowledge_map_${SUBJECT.toLowerCase()}_${QUALIFICATION.toLowerCase().replace(/[^a-z0-9]/g, '')}.json`;
  fs.writeFileSync(outPath, JSON.stringify({ subject: SUBJECT, qualification: QUALIFICATION, examBoard: EXAM_BOARD, nodes: fixed.nodes, edges: fixed.edges }, null, 2));
  console.log(`Written to ${outPath}`);
}

main().catch(err => { console.error(err); process.exit(1); });
