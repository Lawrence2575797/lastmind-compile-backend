// Attaches to an ALREADY-SUBMITTED node-lesson batch by id (never
// resubmits) - polls until done, computes the REAL cost from the batch's
// own per-request usage data (not a projection), writes results to disk,
// and stops there. Does not touch edge lessons at all - that's a
// separate, deliberately gated script (see generate_edge_lessons.js) run
// only after reviewing this batch's real cost, following the exact
// mistake this split exists to prevent: committing to the next spend
// before the last one's real number was known.
//
// Usage: node scripts/check_node_lessons_batch.js <batch_id>
require('dotenv').config({ override: true });
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

const BATCH_ID = process.argv[2];
if (!BATCH_ID) { console.error('Usage: node scripts/check_node_lessons_batch.js <batch_id>'); process.exit(1); }

const SUBJECT = 'Economics', QUALIFICATION = 'A-Level', EXAM_BOARD = 'Edexcel';
const OUT_PATH = path.join(__dirname, `node_lessons_${SUBJECT.toLowerCase()}_${QUALIFICATION.toLowerCase().replace(/[^a-z0-9]/g, '')}.json`);

function stripCodeFences(text) {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}

// Real confirmed Sonnet 5 BATCH rates (from Anthropic's own pricing page,
// not the standard synchronous rate).
const SONNET_BATCH_IN = 1.00 / 1e6, SONNET_BATCH_OUT = 5.00 / 1e6;
const CACHE_READ_MULT = 0.1, CACHE_WRITE_MULT = 1.25;

async function main() {
  console.log(`Checking batch ${BATCH_ID}...`);
  let batch = await client.beta.messages.batches.retrieve(BATCH_ID);
  while (batch.processing_status !== 'ended') {
    console.log(`  ${JSON.stringify(batch.request_counts)} - waiting 60s...`);
    await new Promise(r => setTimeout(r, 60_000));
    batch = await client.beta.messages.batches.retrieve(BATCH_ID);
  }
  console.log('Batch ended. Fetching results...');

  const nodeLessons = [];
  let totalCost = 0, parseFailures = 0, succeeded = 0, failed = 0;
  for await (const result of await client.beta.messages.batches.results(BATCH_ID)) {
    if (result.result.type !== 'succeeded') {
      failed++;
      continue;
    }
    succeeded++;
    const usage = result.result.message.usage;
    if (usage) {
      const cacheRead = usage.cache_read_input_tokens || 0;
      const cacheWrite = usage.cache_creation_input_tokens || 0;
      const freshInput = (usage.input_tokens || 0);
      totalCost += freshInput * SONNET_BATCH_IN
        + cacheRead * SONNET_BATCH_IN * CACHE_READ_MULT
        + cacheWrite * SONNET_BATCH_IN * CACHE_WRITE_MULT
        + (usage.output_tokens || 0) * SONNET_BATCH_OUT;
    }
    const textBlock = result.result.message.content.find(b => b.type === 'text');
    if (!textBlock) { parseFailures++; continue; }
    try {
      const parsed = JSON.parse(stripCodeFences(textBlock.text));
      nodeLessons.push({ nodeId: result.custom_id, ...parsed });
    } catch (err) {
      parseFailures++;
      fs.writeFileSync(path.join(__dirname, `debug_lesson_parse_failure_${result.custom_id}.txt`), textBlock.text);
    }
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify({ subject: SUBJECT, qualification: QUALIFICATION, examBoard: EXAM_BOARD, nodeLessons }, null, 2));
  console.log(`\nSucceeded: ${succeeded}, failed: ${failed}, parse failures: ${parseFailures}`);
  console.log(`REAL cost of this batch: $${totalCost.toFixed(2)}`);
  console.log(`Written ${nodeLessons.length} node lessons to ${OUT_PATH}`);
}

main().catch(err => { console.error(err); process.exit(1); });
