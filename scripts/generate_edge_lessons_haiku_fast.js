// Full edge-lesson generation on Haiku 4.5, synchronous + concurrent
// rather than the Batches API - the whole point of batching was the 50%
// discount trading against an up-to-an-hour queue, but Haiku's real cost
// here is already trivial ($3.51 projected for all 1741 edges, confirmed
// from a real 20-edge sample with 0 thinking_tokens), so the discount
// isn't worth the wait when speed is what's actually wanted. Same
// checkpoint-per-chunk safety pattern as generate_knowledge_map.js.
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

const SUBJECT = 'Economics', QUALIFICATION = 'A-Level', EXAM_BOARD = 'Edexcel';
const CONCURRENCY = 12;
const MAP_PATH = path.join(__dirname, 'knowledge_map_economics_alevel.json');
const NODE_LESSONS_PATH = path.join(__dirname, 'node_lessons_economics_alevel.json');
const OUT_PATH = path.join(__dirname, 'edge_lessons_economics_alevel.json');
const CHECKPOINT_PATH = path.join(__dirname, '_checkpoint_edge_lessons.json');

// Hard, real-time spend cap - user raised the ceiling to "below $10" to
// let the whole 1741-edge run finish in one go (real per-edge cost is
// running ~$0.0040, so full completion projects to ~$6.96 - comfortably
// under $10). Set at $9.50 (not $10.00) to leave headroom for the one
// chunk already in flight when the cap is checked (up to CONCURRENCY=12
// more calls at the real measured rate could land after the check
// passes, worst case ~$0.05 - the $0.50 margin comfortably covers that).
// Checked BEFORE every chunk, using the REAL average cost per edge
// measured so far this run, not the sample's number, once enough real
// data exists to trust it more.
const HARD_CAP_USD = 9.50;
const SAMPLE_AVG_COST_PER_EDGE = 0.004035; // from the real 20-edge sample, used only until this run has its own real average

// Haiku 4.5 standard synchronous rates.
const HAIKU_SYNC_IN = 1.00 / 1e6, HAIKU_SYNC_OUT = 5.00 / 1e6;
const CACHE_READ_MULT = 0.1, CACHE_WRITE_MULT = 1.25;
function costFromUsage(usage) {
  if (!usage) return 0;
  const cacheRead = usage.cache_read_input_tokens || 0;
  const cacheWrite = usage.cache_creation_input_tokens || 0;
  const fresh = usage.input_tokens || 0;
  return fresh * HAIKU_SYNC_IN + cacheRead * HAIKU_SYNC_IN * CACHE_READ_MULT + cacheWrite * HAIKU_SYNC_IN * CACHE_WRITE_MULT + (usage.output_tokens || 0) * HAIKU_SYNC_OUT;
}

function stripCodeFences(text) { return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim(); }
function cachedSystem(t) { return [{ type: 'text', text: t, cache_control: { type: 'ephemeral' } }]; }

async function withRetry(fn, label, maxRetries = 4) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try { return await fn(); }
    catch (err) {
      const isRateLimit = err?.status === 429;
      const transient = isRateLimit || err?.cause?.code === 'ECONNRESET' || err?.status >= 500;
      if (!transient || attempt === maxRetries) throw err;
      const waitMs = isRateLimit ? 15000 * attempt : 5000 * attempt;
      console.warn(`  ! ${label} failed (attempt ${attempt}: ${err.message}) - retrying in ${waitMs / 1000}s...`);
      await new Promise(r => setTimeout(r, waitMs));
    }
  }
}

async function generateOneEdge(fromNode, toNode) {
  const resp = await withRetry(() => client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 4000,
    system: cachedSystem(KNOWLEDGE_MAP_EDGE_LESSON_PROMPT),
    messages: [{
      role: 'user',
      content: `Subject: ${SUBJECT}\nQualification: ${QUALIFICATION}\nExam board: ${EXAM_BOARD}\nSubtopic: ${toNode?.subtopic || ''}\n\nConcept A: ${fromNode?.label}\nA's explanation: ${fromNode?.explanation}\n\nConcept B: ${toNode?.label}\nB's explanation: ${toNode?.explanation}`,
    }],
  }), `${fromNode?.id}-${toNode?.id}`);
  const text = resp.content.find(b => b.type === 'text').text;
  const parsed = JSON.parse(stripCodeFences(text));
  return { parsed, cost: costFromUsage(resp.usage) };
}

function loadCheckpoint() {
  if (!fs.existsSync(CHECKPOINT_PATH)) return { done: {}, spentUsd: 0 };
  const loaded = JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf8'));
  if (typeof loaded.spentUsd !== 'number') loaded.spentUsd = 0; // tolerate a checkpoint from before cost tracking existed
  return loaded;
}
function saveCheckpoint(state) { fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify(state)); }

async function main() {
  const map = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
  const nodeLessons = JSON.parse(fs.readFileSync(NODE_LESSONS_PATH, 'utf8')).nodeLessons;
  const nodeById = new Map(map.nodes.map(n => [n.id, n]));
  const explanationById = new Map(nodeLessons.map(l => [l.nodeId, l.explanation]));
  function nodeWithExplanation(id) {
    const n = nodeById.get(id);
    return n ? { ...n, explanation: explanationById.get(id) } : null;
  }

  const state = loadCheckpoint();
  const doneCount = Object.keys(state.done).length;
  if (doneCount) console.log(`Resuming: ${doneCount}/${map.edges.length} already done, $${state.spentUsd.toFixed(3)} spent so far.`);

  const remaining = map.edges.filter(([from, to]) => !state.done[`${from}-${to}`]);
  let completed = doneCount, failed = 0;

  for (let i = 0; i < remaining.length; i += CONCURRENCY) {
    const chunk = remaining.slice(i, i + CONCURRENCY);

    // Hard spend cap, checked with the REAL average once we have at
    // least one real chunk's worth of data, falling back to the sample's
    // known average before that - never assume the projection instead of
    // measuring, but also never let a whole chunk fire blind against an
    // unknown remaining budget.
    const avgSoFar = completed > doneCount ? state.spentUsd / (completed - doneCount || 1) : SAMPLE_AVG_COST_PER_EDGE;
    const projectedAfterChunk = state.spentUsd + avgSoFar * chunk.length;
    if (projectedAfterChunk > HARD_CAP_USD) {
      console.error(`\nSTOPPING: next chunk would push spend to an estimated $${projectedAfterChunk.toFixed(2)}, over the $${HARD_CAP_USD} hard cap. Spent so far: $${state.spentUsd.toFixed(3)}. ${completed}/${map.edges.length} edges done.`);
      break;
    }

    const results = await Promise.allSettled(chunk.map(([from, to]) =>
      generateOneEdge(nodeWithExplanation(from), nodeWithExplanation(to)).then(r => ({ from, to, ...r.parsed, __cost: r.cost }))
    ));
    results.forEach((r, idx) => {
      const [from, to] = chunk[idx];
      if (r.status === 'fulfilled') state.spentUsd += (r.value.__cost || 0);
      if (r.status === 'fulfilled' && r.value.linkTeaching && r.value.transferQuestion && r.value.integrationQuestion) {
        const { __cost, ...content } = r.value;
        state.done[`${from}-${to}`] = content;
        completed++;
      } else {
        failed++;
        console.warn(`  FAILED: ${from}->${to}: ${r.status === 'rejected' ? r.reason?.message : 'incomplete JSON shape'}`);
      }
    });
    saveCheckpoint(state);
    console.log(`Progress: ${completed}/${map.edges.length} done, ${failed} failed, $${state.spentUsd.toFixed(3)} spent so far.`);

    if (state.spentUsd >= HARD_CAP_USD) {
      console.error(`\nSTOPPING: hard cap of $${HARD_CAP_USD} reached ($${state.spentUsd.toFixed(3)} actually spent). ${completed}/${map.edges.length} edges done.`);
      break;
    }
  }

  const edgeLessons = Object.values(state.done).map(content => ({
    fromNodeId: content.from, toNodeId: content.to,
    linkTeaching: content.linkTeaching, transferQuestion: content.transferQuestion, integrationQuestion: content.integrationQuestion,
  }));
  fs.writeFileSync(OUT_PATH, JSON.stringify({ subject: SUBJECT, qualification: QUALIFICATION, examBoard: EXAM_BOARD, edgeLessons }, null, 2));
  console.log(`\nFinal: ${edgeLessons.length}/${map.edges.length} edge lessons written to ${OUT_PATH}. Failed: ${failed}.`);
}

main().catch(err => { console.error(err); process.exit(1); });
