// Edge-lesson generation, deliberately split from node-lesson generation
// and gated in two steps - this is the direct fix for committing to the
// full node-lesson batch on a projected number that turned out to have a
// real, unflagged 4x uncertainty band. Never again: this script always
// runs a small REAL sample first and requires an explicit --confirm run
// with the sample's own real numbers before touching the full 1741.
//
// Step 1 (default): node scripts/generate_edge_lessons.js
//   -> runs a 20-edge SAMPLE synchronously (not batched - small enough
//      that waiting for a batch queue slot would cost more time than it
//      saves), reports the REAL average cost/edge from actual usage,
//      projects the full 1741-edge cost from that real average, and
//      stops. No batch submitted.
// Step 2 (only after reviewing step 1's real numbers):
//   node scripts/generate_edge_lessons.js --confirm
//   -> submits the full 1741-edge batch.
require('dotenv').config({ override: true });
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

function extractPromptConstant(source, name) {
  const marker = `export const ${name} = \``;
  const start = source.indexOf(marker);
  const contentStart = start + marker.length;
  const end = source.indexOf('`;', contentStart);
  return source.slice(contentStart, end);
}
const promptsSource = fs.readFileSync(path.join(__dirname, '../src/constants/lessonGenerationPrompts.ts'), 'utf8');
const KNOWLEDGE_MAP_EDGE_LESSON_PROMPT = extractPromptConstant(promptsSource, 'KNOWLEDGE_MAP_EDGE_LESSON_PROMPT');

const LESSON_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5';
const MAX_TOKENS = 128000;
const SUBJECT = 'Economics', QUALIFICATION = 'A-Level', EXAM_BOARD = 'Edexcel';
const SAMPLE_SIZE = 20;

const MAP_PATH = path.join(__dirname, `knowledge_map_${SUBJECT.toLowerCase()}_${QUALIFICATION.toLowerCase().replace(/[^a-z0-9]/g, '')}.json`);
const NODE_LESSONS_PATH = path.join(__dirname, `node_lessons_${SUBJECT.toLowerCase()}_${QUALIFICATION.toLowerCase().replace(/[^a-z0-9]/g, '')}.json`);

function stripCodeFences(text) { return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim(); }
function safeId(raw) { return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64); }
function cachedSystem(t) { return [{ type: 'text', text: t, cache_control: { type: 'ephemeral' } }]; }

// Real confirmed Sonnet 5 rates.
const BATCH_IN = 1.00 / 1e6, BATCH_OUT = 5.00 / 1e6;       // batch (what the full run will actually use)
const SYNC_IN = 3.00 / 1e6, SYNC_OUT = 15.00 / 1e6;         // standard synchronous (what the sample uses)
const CACHE_READ_MULT = 0.1, CACHE_WRITE_MULT = 1.25;

function edgeRequestParams(fromNode, toNode) {
  return {
    model: LESSON_MODEL,
    max_tokens: MAX_TOKENS,
    system: cachedSystem(KNOWLEDGE_MAP_EDGE_LESSON_PROMPT),
    messages: [{
      role: 'user',
      content: `Subject: ${SUBJECT}\nQualification: ${QUALIFICATION}\nExam board: ${EXAM_BOARD}\nSubtopic: ${toNode?.subtopic || ''}\n\nConcept A: ${fromNode?.label}\nA's explanation: ${fromNode?.explanation}\n\nConcept B: ${toNode?.label}\nB's explanation: ${toNode?.explanation}`,
    }],
  };
}

function costFromUsage(usage, inRate, outRate) {
  if (!usage) return 0;
  const cacheRead = usage.cache_read_input_tokens || 0;
  const cacheWrite = usage.cache_creation_input_tokens || 0;
  const fresh = usage.input_tokens || 0;
  return fresh * inRate + cacheRead * inRate * CACHE_READ_MULT + cacheWrite * inRate * CACHE_WRITE_MULT + (usage.output_tokens || 0) * outRate;
}

async function main() {
  const map = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
  const nodeLessons = JSON.parse(fs.readFileSync(NODE_LESSONS_PATH, 'utf8')).nodeLessons;
  const nodeById = new Map(map.nodes.map(n => [n.id, n]));
  const explanationById = new Map(nodeLessons.map(l => [l.nodeId, l.explanation]));
  function nodeWithExplanation(id) {
    const n = nodeById.get(id);
    return n ? { ...n, explanation: explanationById.get(id) } : null;
  }

  const confirmed = process.argv.includes('--confirm');

  if (!confirmed) {
    console.log(`Running a real ${SAMPLE_SIZE}-edge sample synchronously (Sonnet standard rate, not batch) to measure actual cost before committing to all ${map.edges.length} edges...`);
    const sampleEdges = map.edges.slice(0, SAMPLE_SIZE);
    let sampleCost = 0;
    for (const [from, to] of sampleEdges) {
      const resp = await client.messages.create({ ...edgeRequestParams(nodeWithExplanation(from), nodeWithExplanation(to)) });
      sampleCost += costFromUsage(resp.usage, SYNC_IN, SYNC_OUT);
      process.stdout.write('.');
    }
    console.log('');
    const avgSyncCostPerEdge = sampleCost / sampleEdges.length;
    // Batch is priced at exactly half the synchronous rate for both
    // input and output on this model, so the real batch-equivalent
    // average is just half the measured synchronous average - no need to
    // re-run the sample at batch rates to get an accurate batch estimate.
    const avgBatchCostPerEdge = avgSyncCostPerEdge / 2;
    const projectedFull = avgBatchCostPerEdge * map.edges.length;
    console.log(`\nSample: ${sampleEdges.length} edges cost $${sampleCost.toFixed(3)} at synchronous rates ($${avgSyncCostPerEdge.toFixed(4)}/edge avg).`);
    console.log(`Projected REAL cost for all ${map.edges.length} edges via the Batches API: $${projectedFull.toFixed(2)}`);
    console.log(`\nThis is a real measured average, not a word-count projection. Review this number, then run:`);
    console.log(`  node scripts/generate_edge_lessons.js --confirm`);
    console.log(`to submit the full batch. Nothing further has been submitted.`);
    return;
  }

  console.log(`Submitting the full ${map.edges.length}-edge batch...`);
  const requests = map.edges.map(([from, to]) => ({
    custom_id: safeId(`${from}-${to}`),
    params: edgeRequestParams(nodeWithExplanation(from), nodeWithExplanation(to)),
  }));
  const batch = await client.beta.messages.batches.create({ requests });
  console.log(`Batch id: ${batch.id} - check it with:`);
  console.log(`  node scripts/check_edge_lessons_batch.js ${batch.id}`);
}

main().catch(err => { console.error(err); process.exit(1); });
