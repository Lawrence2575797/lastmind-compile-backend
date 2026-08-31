// Two-phase Batches API pipeline for one-time lesson-content generation,
// run AFTER generate_knowledge_map.js has produced
// knowledge_map_<subject>_<qualification>.json. Batches (not synchronous
// calls) because this is pure backend content generation with nobody
// waiting on a response live - the Batches API is 50% off standard
// pricing for exactly this kind of work. See lessonGenerationPrompts.ts
// for the two prompts and the reasoning behind their word-count targets.
//
// IMPORTANT - what this does NOT give you: individual lesson results as
// they complete. The Message Batches API only exposes results once the
// ENTIRE batch's processing_status is "ended" (or the 24-hour hard
// cutoff hits, whichever first) - there is no per-item early read, only
// a live request_counts breakdown (succeeded/processing/errored) while
// it runs. Most batches finish in under an hour per Anthropic's own
// docs, but that's typical, not guaranteed.
//
// Phase 1 (node encoding) must fully complete before Phase 2 (edge
// lessons) can be built, because each edge lesson's prompt needs both
// endpoint nodes' ALREADY-GENERATED explanations as input context - an
// edge can't be taught before both concepts it connects have been
// taught themselves.
//
// Usage: node scripts/generate_lesson_content.js
// Requires CLAUDE_API_KEY in the environment and
// knowledge_map_<subject>_<qualification>.json already present (run
// generate_knowledge_map.js first).

require('dotenv').config({ override: true });
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

function extractPromptConstant(source, name) {
  const marker = `export const ${name} = \``;
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`Could not find ${name} in lessonGenerationPrompts.ts`);
  const contentStart = start + marker.length;
  const end = source.indexOf('`;', contentStart);
  if (end === -1) throw new Error(`Could not find the end of ${name}`);
  return source.slice(contentStart, end);
}
const promptsSource = fs.readFileSync(path.join(__dirname, '../src/constants/lessonGenerationPrompts.ts'), 'utf8');
const KNOWLEDGE_MAP_ENCODING_LESSON_PROMPT = extractPromptConstant(promptsSource, 'KNOWLEDGE_MAP_ENCODING_LESSON_PROMPT');
const KNOWLEDGE_MAP_EDGE_LESSON_PROMPT = extractPromptConstant(promptsSource, 'KNOWLEDGE_MAP_EDGE_LESSON_PROMPT');

const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

// Same draft model as map generation - this is a structured writing task
// against an explicit, detailed spec, not a judgment-call gate.
const LESSON_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5';
// Raised from an initial 1200 after the real map-generation run showed
// Sonnet 5 using adaptive thinking by default even with no explicit
// `thinking` param - on that prompt it burned 12-17k tokens on invisible
// reasoning before writing any real output, and max_tokens caps
// thinking+output TOGETHER. This prompt is simpler/more constrained than
// the map generator's, so it may not need anywhere near this - but a
// batch job can't be corrected mid-flight the way a synchronous retry
// can, and a higher cap costs nothing extra unless the model actually
// uses it (the model stops at end_turn well before the cap regardless),
// so there's no reason not to leave real headroom here.
const MAX_TOKENS = 16000;

const SUBJECT = 'Economics';
const QUALIFICATION = 'A-Level';
const EXAM_BOARD = 'Edexcel';

const MAP_PATH = path.join(__dirname, `knowledge_map_${SUBJECT.toLowerCase()}_${QUALIFICATION.toLowerCase().replace(/[^a-z0-9]/g, '')}.json`);

function stripCodeFences(text) {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}

// Batch custom_id charset is restricted to [a-zA-Z0-9_-] - node ids in
// this pipeline are already short/clean, but sanitize defensively so an
// edge key (from-to) can never produce an invalid id.
function safeId(raw) {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
}

function cachedSystem(promptText) {
  return [{ type: 'text', text: promptText, cache_control: { type: 'ephemeral' } }];
}

// Submits a batch, polls every 60s until processing_status is "ended",
// then streams results back as a Map<custom_id, resultObject>.
async function runBatch(requests, label) {
  console.log(`Submitting batch "${label}" (${requests.length} requests)...`);
  const batch = await client.messages.batches.create({ requests });
  console.log(`  -> batch id ${batch.id}, polling until ended...`);

  let current = batch;
  while (current.processing_status !== 'ended') {
    await new Promise(resolve => setTimeout(resolve, 60_000));
    current = await client.messages.batches.retrieve(batch.id);
    console.log(`  -> ${label}: ${JSON.stringify(current.request_counts)}`);
  }

  const results = new Map();
  let parseFailures = 0;
  for await (const result of await client.messages.batches.results(batch.id)) {
    if (result.result.type !== 'succeeded') {
      console.warn(`  -> ${label}: ${result.custom_id} did not succeed (${result.result.type})`);
      continue;
    }
    const textBlock = result.result.message.content.find(b => b.type === 'text');
    if (!textBlock) {
      console.warn(`  -> ${label}: ${result.custom_id} succeeded but had no text block (stop_reason: ${result.result.message.stop_reason})`);
      continue;
    }
    try {
      results.set(result.custom_id, JSON.parse(stripCodeFences(textBlock.text)));
    } catch (err) {
      parseFailures++;
      fs.writeFileSync(path.join(__dirname, `debug_lesson_parse_failure_${result.custom_id}.txt`), textBlock.text);
      console.warn(`  -> ${label}: ${result.custom_id} JSON parse failed (dumped to scripts/debug_lesson_parse_failure_${result.custom_id}.txt): ${err.message}`);
    }
  }
  if (parseFailures) console.warn(`  -> ${label}: ${parseFailures} item(s) failed to parse - see dumped debug files.`);
  return results;
}

async function main() {
  const map = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
  const { nodes, edges } = map;
  const nodeById = new Map(nodes.map(n => [n.id, n]));

  // ---- Phase 1: encoding lessons, one request per node ----
  const leadsToByNode = new Map(nodes.map(n => [n.id, []]));
  edges.forEach(([from, to]) => {
    const toLabel = nodeById.get(to)?.label;
    if (leadsToByNode.has(from) && toLabel) leadsToByNode.get(from).push(toLabel);
  });

  const nodeRequests = nodes.map(node => ({
    custom_id: safeId(node.id),
    params: {
      model: LESSON_MODEL,
      max_tokens: MAX_TOKENS,
      system: cachedSystem(KNOWLEDGE_MAP_ENCODING_LESSON_PROMPT),
      messages: [{
        role: 'user',
        content: `Subject: ${SUBJECT}\nQualification: ${QUALIFICATION}\nExam board: ${EXAM_BOARD}\nSubtopic: ${node.subtopic || ''}\nConcept to teach: ${node.label}\nConcepts this leads to (do not explain or foreshadow these - see rule 2): ${JSON.stringify((leadsToByNode.get(node.id) || []).filter(Boolean))}`,
      }],
    },
  }));
  const nodeResults = await runBatch(nodeRequests, 'node encoding lessons');

  const nodeLessons = nodes.map(node => ({
    nodeId: node.id,
    ...nodeResults.get(safeId(node.id)),
  }));
  const explanationById = new Map(nodeLessons.map(l => [l.nodeId, l.explanation]));

  // ---- Phase 2: edge lessons, one request per edge - needs Phase 1's
  // explanations, so this cannot start until nodeResults is fully in ----
  const edgeRequests = edges.map(([from, to]) => {
    const fromNode = nodeById.get(from);
    const toNode = nodeById.get(to);
    return {
      custom_id: safeId(`${from}-${to}`),
      params: {
        model: LESSON_MODEL,
        max_tokens: MAX_TOKENS,
        system: cachedSystem(KNOWLEDGE_MAP_EDGE_LESSON_PROMPT),
        messages: [{
          role: 'user',
          content: `Subject: ${SUBJECT}\nQualification: ${QUALIFICATION}\nExam board: ${EXAM_BOARD}\nSubtopic: ${toNode?.subtopic || ''}\n\nConcept A: ${fromNode?.label}\nA's explanation: ${explanationById.get(from)}\n\nConcept B: ${toNode?.label}\nB's explanation: ${explanationById.get(to)}`,
        }],
      },
    };
  });
  const edgeResults = await runBatch(edgeRequests, 'edge lessons');

  const edgeLessons = edges.map(([from, to]) => ({
    fromNodeId: from,
    toNodeId: to,
    ...edgeResults.get(safeId(`${from}-${to}`)),
  }));

  const outPath = path.join(__dirname, `lesson_content_${SUBJECT.toLowerCase()}_${QUALIFICATION.toLowerCase().replace(/[^a-z0-9]/g, '')}.json`);
  fs.writeFileSync(outPath, JSON.stringify({ subject: SUBJECT, qualification: QUALIFICATION, examBoard: EXAM_BOARD, nodeLessons, edgeLessons }, null, 2));
  console.log(`\nWritten ${nodeLessons.length} node lessons and ${edgeLessons.length} edge lessons to ${outPath}`);
}

main().catch(err => { console.error(err); process.exit(1); });
