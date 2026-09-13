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
// GCSE (9-1) Maths (Edexcel, 1MA1) variant of generate_knowledge_map.js -
// Foundation and Higher tier as two separate knowledge maps, real spec
// content pre-extracted into gcse_maths_foundation_subtopics.json /
// gcse_maths_higher_subtopics.json (see build_gcse_subtopics.js).
//
// Usage: GCSE_MATHS_TIER=foundation node scripts/generate_knowledge_map_gcse_maths.js
//    or: GCSE_MATHS_TIER=higher node scripts/generate_knowledge_map_gcse_maths.js
// Requires CLAUDE_API_KEY in the environment (see .env.example).

// override:true - a stale CLAUDE_API_KEY/Claude_API_KEY inherited from the
// parent shell's own process environment (Windows env vars are case-
// insensitive) otherwise wins over whatever this project's own .env says,
// since dotenv's default behavior never overrides an already-set variable.
require('dotenv').config({ override: true });
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

// knowledgeMapPrompts.ts is TypeScript (consumed normally by the compiled
// backend); this script runs as plain Node like every other file in
// scripts/, so it can't require() a .ts file directly without a build
// step. Extract the exported template-literal constants as text instead,
// rather than adding a TS toolchain dependency to a one-off script.
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
const KNOWLEDGE_MAP_GENERATION_PROMPT_BASE = extractPromptConstant(promptsSource, 'KNOWLEDGE_MAP_GENERATION_PROMPT');
const KNOWLEDGE_MAP_GENERATION_PROMPT_PRACTICAL_RULE = extractPromptConstant(promptsSource, 'KNOWLEDGE_MAP_GENERATION_PROMPT_PRACTICAL_RULE');
const KNOWLEDGE_MAP_COVERAGE_PROMPT = extractPromptConstant(promptsSource, 'KNOWLEDGE_MAP_COVERAGE_PROMPT');
const KNOWLEDGE_MAP_VERIFICATION_PROMPT_BASE = extractPromptConstant(promptsSource, 'KNOWLEDGE_MAP_VERIFICATION_PROMPT');
const KNOWLEDGE_MAP_VERIFICATION_PROMPT_PRACTICAL_CHECK = extractPromptConstant(promptsSource, 'KNOWLEDGE_MAP_VERIFICATION_PROMPT_PRACTICAL_CHECK');

// Rule 17 (and its matching verification check) only ever fires for a
// subject with real lab/fieldwork content - sending it on every subtopic
// call for a subject like Economics is pure dead input cost (and a
// standing invitation for the model to go looking for practical content
// that was never asked for). Set this per subject, not per call.
const HAS_PRACTICAL_CONTENT = false; // true for Chemistry/Biology/Physics-style specs
const KNOWLEDGE_MAP_GENERATION_PROMPT = KNOWLEDGE_MAP_GENERATION_PROMPT_BASE.replace(
  '{{PRACTICAL_RULE}}',
  HAS_PRACTICAL_CONTENT ? KNOWLEDGE_MAP_GENERATION_PROMPT_PRACTICAL_RULE : ''
);
const KNOWLEDGE_MAP_VERIFICATION_PROMPT = KNOWLEDGE_MAP_VERIFICATION_PROMPT_BASE.replace(
  '{{PRACTICAL_CHECK}}',
  HAS_PRACTICAL_CONTENT ? KNOWLEDGE_MAP_VERIFICATION_PROMPT_PRACTICAL_CHECK : ''
);

// Same env var claudeClient.ts already reads - not ANTHROPIC_API_KEY.
const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

// Matches the draft/gate split already established by
// chainGenerationSimple + factCheck in claudeClient.ts, not
// chainGeneration + factCheck (both-Opus) - generation here is a
// structured decomposition task against explicit rules, which Sonnet
// handles reliably; verification is the precision-critical judgment call
// (is this edge actually wrong, is this really a duplicate) applied
// across the whole batch at once, where Opus's extra reasoning capacity
// earns its cost. The cost delta between the two options is trivial
// either way at this volume (roughly $1-1.50 per subject) - this is a
// quality choice, not a cost one.
const GENERATION_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5';
const VERIFICATION_MODEL = 'claude-opus-5';
// Coverage-checking against the raw spec text is a completeness GATE,
// not a draft - same reasoning as VERIFICATION_MODEL, and the class of
// error it exists to catch (a whole named theory silently dropped) is
// exactly the kind of thing worth an unconditional Opus check regardless
// of which model drafted the subtopic.
const COVERAGE_MODEL = 'claude-opus-5';
const MAX_COVERAGE_ROUNDS = 2;

// Each of the three system prompts below is byte-identical across every
// subtopic call in a run (and across coverage-check/regenerate retries
// for the same subtopic) - wrapping it as a cached content block means
// only the FIRST call in a run pays full input price for it; every
// subsequent call within the ~5 minute cache window reads it back at a
// steep discount instead of repaying for the same ~1-2k token ruleset
// 15-20+ times per subject.
function cachedSystem(promptText) {
  return [{ type: 'text', text: promptText, cache_control: { type: 'ephemeral' } }];
}

// Hard spend ceiling for THIS run, checked before every API call and
// after every response - not just an estimate printed at the end. Set
// deliberately close to (not far above) the quoted estimate for this
// specific subject, since the whole point of asking for a cap is that it
// actually holds, not that it's generous. Standard (non-intro) per-token
// rates are used for the running total on purpose: if intro pricing
// applies, real spend comes in under what this tracker reports, which is
// the safe direction to be wrong in for a cap - never the other way.
// User's explicit cap for this run: $5.
const SPEND_CAP_USD = 50.0; // generous safety-net cap, not a target - no fixed budget requested for this run
const PRICING_PER_MTOK = {
  'claude-sonnet-5': { in: 3, out: 15 },
  'claude-opus-5': { in: 5, out: 25 },
};
let totalSpendUsd = 0;
function recordUsage(model, usage) {
  const p = PRICING_PER_MTOK[model];
  if (!p || !usage) return;
  const inTok = usage.input_tokens || 0;
  const cacheWriteTok = usage.cache_creation_input_tokens || 0;
  const cacheReadTok = usage.cache_read_input_tokens || 0;
  const outTok = usage.output_tokens || 0;
  const cost = (inTok * p.in + cacheWriteTok * p.in * 1.25 + cacheReadTok * p.in * 0.1 + outTok * p.out) / 1e6;
  totalSpendUsd += cost;
  console.error(`  [spend] +$${cost.toFixed(4)} (${model}) -> running total $${totalSpendUsd.toFixed(4)} / $${SPEND_CAP_USD} cap`);
  if (totalSpendUsd >= SPEND_CAP_USD) {
    throw new Error(`SPEND CAP REACHED: running total $${totalSpendUsd.toFixed(4)} has hit the $${SPEND_CAP_USD} cap for this run. Stopping before starting further calls - re-run with a higher SPEND_CAP_USD if this was expected and you want to continue from the checkpoint.`);
  }
}
// Checked at the START of every call site too (not just after), so a
// chunk that's already at/over cap from a sibling call refuses to even
// start its own next API call rather than only noticing after paying for it.
function assertUnderCap() {
  if (totalSpendUsd >= SPEND_CAP_USD) {
    throw new Error(`SPEND CAP REACHED: running total $${totalSpendUsd.toFixed(4)} already at/over the $${SPEND_CAP_USD} cap - refusing to start another call.`);
  }
}

// Subject-specific config for GCSE (9-1) Maths (Edexcel, 1MA1), Foundation
// and Higher tier as two SEPARATE knowledge maps (per explicit instruction).
// SUBTOPICS content is the REAL spec text extracted from the actual
// Pearson specification PDF, split at the document's own two explicit
// tier sections ("Foundation tier knowledge, skills and understanding" /
// pages 3-9, "Higher tier..." / pages 10-18 - see the spec's own
// "Foundation tier"/"Higher tier" paragraph) - not inferred from
// bold/underline typography, and not from this pipeline's own general
// knowledge of GCSE Maths content (see build_gcse_subtopics.js, kept
// alongside the two generated *_subtopics.json files for how this was
// produced and verified against known tier ground truth).
const GCSE_MATHS_TIER = process.env.GCSE_MATHS_TIER; // 'foundation' | 'higher'
if (GCSE_MATHS_TIER !== 'foundation' && GCSE_MATHS_TIER !== 'higher') {
  throw new Error(`GCSE_MATHS_TIER env var must be 'foundation' or 'higher', got: ${GCSE_MATHS_TIER}`);
}
const SUBJECT = 'Mathematics';
const QUALIFICATION = GCSE_MATHS_TIER === 'foundation' ? 'GCSE Foundation' : 'GCSE Higher';
const EXAM_BOARD = 'Edexcel';
const SUBTOPICS = require(path.join(__dirname, `gcse_maths_${GCSE_MATHS_TIER}_subtopics.json`));


function stripCodeFences(text) {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}

// Found live on this exact subject's real run: two coverage-check
// responses came back missing precisely their final closing '}' - every
// string properly terminated, every array properly closed, just the one
// outermost brace dropped (confirmed by counting: 3 '{' vs 2 '}' in both
// cases, nothing else off). Too small and too specific a defect to be
// max_tokens truncation (these responses were a few hundred tokens
// against a 16000 cap) - looks like an occasional real model formatting
// slip on this call shape. A plain JSON.parse has no way to recover from
// that; this repairs the one specific, common case (a handful of missing
// closers at the very end, string content itself intact) by walking the
// text tracking bracket/brace/string-quote state and appending whatever
// closers are still open, in the correct nesting order, before a final
// parse attempt. Does not attempt to fix anything IN the middle of the
// text (a truncated string value, a missing comma) - those are genuine
// truncations that should keep failing loudly, not be silently patched.
// Found live on THIS Italian run: the model second-guessed itself
// mid-response - wrote a first, flawed JSON object, a line of plain-text
// commentary ("Wait, I need to remove the invalid placeholder edge."),
// then a corrected second JSON object. stripCodeFences only strips the
// very first/last code fence, so the middle closing/opening fences and
// the commentary between the two objects survive into `text` - a bracket
// stack over the whole thing balances perfectly (both objects are
// individually well-formed), so parseJsonWithRepair's own "missing
// trailing closer" repair correctly declines to touch it, and a plain
// JSON.parse stops at the end of the FIRST object and reports "Unexpected
// non-whitespace character after JSON" for everything past it. Since a
// self-correcting model's LAST complete top-level object/array is its
// actual final answer, this scans for every top-level {...}/[...] span in
// the text and returns the last one, discarding the superseded draft and
// the commentary in between.
function extractLastJsonValue(text) {
  let depth = 0, start = -1, inString = false, escaped = false, lastSpan = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{' || ch === '[') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0 && start !== -1) {
        lastSpan = [start, i + 1];
        start = -1;
      }
    }
  }
  return lastSpan ? text.slice(lastSpan[0], lastSpan[1]) : text;
}

function parseJsonWithRepair(text, context) {
  try {
    return JSON.parse(text);
  } catch (firstErr) {
    const stack = [];
    let inString = false;
    let escaped = false;
    for (const ch of text) {
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{') stack.push('}');
      else if (ch === '[') stack.push(']');
      else if (ch === '}' || ch === ']') {
        if (stack[stack.length - 1] === ch) stack.pop();
      }
    }
    if (!inString && stack.length) {
      const repaired = text + stack.reverse().join('');
      try {
        const parsed = JSON.parse(repaired);
        console.error(`  [repair] ${context}: response was missing ${stack.length} trailing closer(s) - repaired and parsed successfully`);
        return parsed;
      } catch (secondErr) {
        // fall through to the last-JSON-value repair below
      }
    }
    try {
      const parsed = JSON.parse(extractLastJsonValue(text));
      console.error(`  [repair] ${context}: response contained multiple JSON values (likely a self-corrected draft) - used the last one and parsed successfully`);
      return parsed;
    } catch (thirdErr) {
      throw firstErr; // neither repair worked - surface the ORIGINAL error, not a repaired one
    }
  }
}

async function generateSubtopic(subtopic, specContent, missingConcepts) {
  // missingConcepts is only ever set on a coverage-driven retry (see
  // main()) - appending it rather than silently starting over means the
  // model still has every reason for the atomicity/breadth decisions it
  // already got right, plus an explicit, unmissable instruction covering
  // exactly what the coverage check found absent.
  const retryNote = missingConcepts && missingConcepts.length
    ? `\n\nA completeness check against this same specification text found that your previous attempt did not cover the following - make sure this regeneration includes proper decomposed coverage of each one (not just a one-line mention):\n${missingConcepts.map(m => `- ${m.term}: ${m.whyItMatters}`).join('\n')}`
    : '';
  // 16k (up from 8k): a dense subtopic (e.g. 4.3's market/interventionist/
  // other strategy lists) can genuinely produce more than 8k tokens of
  // nodes+edges once rules 7/8's "brainstorm 4-6 points per side" is
  // followed properly - 8k risked silently truncating valid JSON on
  // exactly the subtopics that need the most decomposition. Streamed
  // (not just a higher max_tokens) because a long non-streamed generation
  // risks the client's own request timeout, independent of the token cap.
  // thinking explicitly disabled, matching claudeClient.ts's
  // THINKS_BY_DEFAULT_MODELS handling for every other Sonnet 5/Opus 5 call
  // in this codebase: this is a rule-driven structured-JSON extraction
  // task, not one that benefits from extended reasoning, and adaptive
  // thinking is what caused the original truncation bug this comment used
  // to describe (it was burning most of a 16k budget on invisible
  // reasoning before writing a single character of the actual JSON).
  // max_tokens now only has to cover the actual output.
  assertUnderCap();
  const stream1 = client.messages.stream({
    model: GENERATION_MODEL,
    max_tokens: 32000,
    thinking: { type: 'disabled' },
    system: cachedSystem(KNOWLEDGE_MAP_GENERATION_PROMPT),
    messages: [{
      role: 'user',
      content: `Subject: ${SUBJECT}\nQualification: ${QUALIFICATION}\nExam board: ${EXAM_BOARD}\nSubtopic: ${subtopic}\n\nReal specification content:\n${specContent}${retryNote}`,
    }],
  });
  stream1.on('error', (e) => console.error('STREAM ERROR EVENT:', e));
  stream1.on('streamEvent', (e) => { if (e.type === 'message_delta' || e.type === 'message_stop') console.error('STREAM EVENT:', JSON.stringify(e)); });
  const resp = await stream1.finalMessage();
  console.error('stop_reason:', resp.stop_reason, ' usage:', JSON.stringify(resp.usage));
  recordUsage(GENERATION_MODEL, resp.usage);
  const debugPath = path.join(__dirname, `debug_generation_${safeId(subtopic)}.txt`);
  const textBlock1 = resp.content.find(b => b.type === 'text');
  if (!textBlock1) {
    fs.writeFileSync(debugPath, JSON.stringify(resp, null, 2));
    throw new Error(`No text block in response for subtopic "${subtopic}" - stop_reason: ${resp.stop_reason}, full response dumped to ${debugPath}`);
  }
  const text = textBlock1.text;
  const cleaned = stripCodeFences(text);
  try {
    return parseJsonWithRepair(cleaned, `generate ${subtopic}`);
  } catch (err) {
    fs.writeFileSync(debugPath, cleaned);
    console.error(`JSON parse failed for subtopic "${subtopic}" - raw response written to ${debugPath}`);
    throw err;
  }
}

function safeId(raw) {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
}

async function checkCoverage(subtopic, specContent, nodes) {
  // 6k (up from 4k): a thin margin above what a genuinely thorough
  // missing-concepts list for a dense subtopic could need - this call's
  // output is bounded by how much the FIRST pass actually missed, so it
  // rarely approaches this, but 4k was cutting it close on worst-case
  // subtopics with several dropped named theories at once.
  assertUnderCap();
  const stream2 = client.messages.stream({
    model: COVERAGE_MODEL,
    max_tokens: 16000,
    thinking: { type: 'disabled' },
    system: cachedSystem(KNOWLEDGE_MAP_COVERAGE_PROMPT),
    messages: [{
      role: 'user',
      content: `Specification text:\n${specContent}\n\nNode labels already generated from it:\n${JSON.stringify(nodes.map(n => n.label))}`,
    }],
  });
  const resp = await stream2.finalMessage();
  recordUsage(COVERAGE_MODEL, resp.usage);
  const textBlock2 = resp.content.find(b => b.type === 'text');
  if (!textBlock2) throw new Error(`Coverage check: no text block, stop_reason: ${resp.stop_reason}`);
  try {
    return parseJsonWithRepair(stripCodeFences(textBlock2.text), `coverage ${subtopic}`).missingConcepts || [];
  } catch (err) {
    const debugPath = path.join(__dirname, `debug_coverage_${safeId(subtopic)}.txt`);
    fs.writeFileSync(debugPath, textBlock2.text);
    console.error(`Coverage JSON parse failed for "${subtopic}" - raw response written to ${debugPath}`);
    throw err;
  }
}

async function verifyBatch(allNodes, allEdges) {
  // 32k (up from 8k): this is the one call that sees the ENTIRE subject
  // at once (700+ nodes for Economics) and can legitimately surface
  // dozens of issues, each carrying its own explanation plus proposed
  // new_nodes/new_edges - the single most likely call in this whole
  // pipeline to have been silently truncating its JSON output at 8k on a
  // real full-subject run. Streamed for the same request-timeout reason
  // as generateSubtopic, more so here given the larger cap.
  assertUnderCap();
  const stream3 = client.messages.stream({
    model: VERIFICATION_MODEL,
    max_tokens: 60000,
    thinking: { type: 'disabled' },
    system: cachedSystem(KNOWLEDGE_MAP_VERIFICATION_PROMPT),
    messages: [{
      role: 'user',
      content: `Subject: ${SUBJECT} (${QUALIFICATION}, ${EXAM_BOARD})\n\nNodes:\n${JSON.stringify(allNodes)}\n\nEdges:\n${JSON.stringify(allEdges)}`,
    }],
  });
  const resp = await stream3.finalMessage();
  console.error('verification stop_reason:', resp.stop_reason, ' usage:', JSON.stringify(resp.usage));
  recordUsage(VERIFICATION_MODEL, resp.usage);
  const textBlock = resp.content.find(b => b.type === 'text');
  if (!textBlock) throw new Error(`Verification: no text block, stop_reason: ${resp.stop_reason}`);
  try {
    return parseJsonWithRepair(stripCodeFences(textBlock.text), 'verification');
  } catch (err) {
    fs.writeFileSync(path.join(__dirname, 'debug_last_verification_response.txt'), textBlock.text);
    console.error('Verification JSON parse failed - raw response written to scripts/debug_last_verification_response.txt');
    throw err;
  }
}

// Edges moved from plain [from, to] tuples to {from, to, difficulty}
// objects once difficulty scoring was added to the generation prompt -
// this normalizer accepts either shape so a verification fix's
// new_edges/remove_edges (still authored as plain [a, b] pairs in the
// verification prompt's output format, since verification only ever adds
// missing STRUCTURE, not a fresh difficulty judgment) work the same as a
// generation pass's own {from, to, difficulty} edges. A fix-added edge
// gets difficulty: null - a real value can only come from a judgment call
// against the full subtopic content, which a structural-fix pass never
// re-does; null is a valid, honest "not yet estimated" state, not a bug.
function normalizeEdge(e) {
  return Array.isArray(e) ? { from: e[0], to: e[1], difficulty: null } : e;
}

function applyFixes(nodes, edges, issues) {
  edges = edges.map(normalizeEdge);
  const nodeIds = new Set(nodes.map(n => n.id));
  const edgeKey = (e) => e.from + '->' + e.to;
  const edgeSet = new Set(edges.map(edgeKey));
  const nodeById = new Map(nodes.map(n => [n.id, n]));

  // Real bug found live: verification's own new_nodes never carry a
  // subtopic field (the prompt only asks for id/label - see
  // KNOWLEDGE_MAP_VERIFICATION_PROMPT's fix schema), so a node added here
  // used to be ingested with an empty subtopic - grouping every such node
  // across the whole batch into one fake shared "subtopic", which then
  // needed its own expensive one-time AI teaching-order call, and showed
  // wrong/blank in the sidebar tree's subtopic grouping. Inheriting the
  // affected_node's own subtopic is the direct, reliable fix: a fix is
  // always raised ABOUT a specific existing node, so that node's own
  // subtopic is a real, correct home for whatever's being added alongside it.
  issues.forEach(issue => {
    const inheritedSubtopic = nodeById.get(issue.affected_node)?.subtopic;
    (issue.fix?.new_nodes || []).forEach(n => {
      if (!nodeIds.has(n.id)) {
        if (!n.subtopic && inheritedSubtopic) n.subtopic = inheritedSubtopic;
        nodes.push(n);
        nodeIds.add(n.id);
        nodeById.set(n.id, n);
      }
    });
    (issue.fix?.new_edges || []).forEach(raw => {
      const e = normalizeEdge(raw);
      if (!edgeSet.has(edgeKey(e))) { edges.push(e); edgeSet.add(edgeKey(e)); }
    });
    (issue.fix?.remove_edges || []).forEach(raw => {
      const k = edgeKey(normalizeEdge(raw));
      const idx = edges.findIndex(x => edgeKey(x) === k);
      if (idx !== -1) edges.splice(idx, 1);
    });
  });
  return { nodes, edges };
}

// Real, pre-existing gap found live: verifyBatch correctly IDENTIFIES
// duplicate_concept issues (two subtopic-generation calls each inventing
// their own node for the same cross-cutting idea, e.g. "place_value" or
// "pythagoras" independently created under the identical id by two
// different subtopics that both needed it), but applyFixes above only
// ever acts on new_nodes/new_edges/remove_edges - never on a duplicate
// finding - so a duplicate id used to survive into the final written file
// even after a "verified: true" run, corrupting ingestion (concept_id
// collisions) and sometimes registering as a false DAG cycle (two
// genuinely different intended edges landing on one merged id can loop).
// Purely structural, no AI call needed: nodes sharing an id ARE the same
// concept by construction, so this keeps the FIRST occurrence as
// canonical and remaps every edge referencing a later duplicate's id.
function mergeDuplicateNodes(nodes, edges) {
  const canonicalIdByOriginal = new Map();
  const survivorByRawId = new Map();
  const mergedNodes = [];
  nodes.forEach((n) => {
    if (survivorByRawId.has(n.id)) {
      canonicalIdByOriginal.set(n.id, survivorByRawId.get(n.id).id);
      console.log(`  [merge] duplicate node "${n.id}" (label: "${n.label}") merged into first occurrence (label: "${survivorByRawId.get(n.id).label}")`);
    } else {
      survivorByRawId.set(n.id, n);
      canonicalIdByOriginal.set(n.id, n.id);
      mergedNodes.push(n);
    }
  });
  const remapped = edges
    .map((e) => ({ ...e, from: canonicalIdByOriginal.get(e.from) || e.from, to: canonicalIdByOriginal.get(e.to) || e.to }))
    .filter((e) => e.from !== e.to);
  const seen = new Set();
  const mergedEdges = remapped.filter((e) => {
    const key = `${e.from}->${e.to}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { nodes: mergedNodes, edges: mergedEdges };
}

// Same validity check used throughout the artifact this pipeline is
// replacing - a DAG with no orphaned edges, run automatically rather than
// by hand every time.
function validate(nodes, edges) {
  edges = edges.map(normalizeEdge);
  const nodeIds = new Set(nodes.map(n => n.id));
  const dupes = {};
  nodes.forEach(n => dupes[n.id] = (dupes[n.id] || 0) + 1);
  Object.entries(dupes).forEach(([id, c]) => { if (c > 1) console.warn('DUPLICATE ID:', id); });

  const bad = edges.filter(({ from, to }) => !nodeIds.has(from) || !nodeIds.has(to));
  bad.forEach(({ from, to }) => console.warn('ORPHANED EDGE:', from, '->', to));

  const adj = {};
  nodes.forEach(n => adj[n.id] = []);
  edges.forEach(({ from, to }) => { if (adj[from]) adj[from].push(to); });
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

// Retries a transient failure (dropped connection, momentary API
// overload) with exponential backoff - discovered necessary on the real
// first full run, which died to a mid-stream ECONNRESET on subtopic 2.5
// after already paying for five subtopics' worth of generation calls.
// Does NOT retry a JSON-parse failure (that's a real content bug worth
// seeing immediately, not a flaky-network symptom) or anything already
// wrapped in its own try/catch inside generateSubtopic/checkCoverage/
// verifyBatch that writes a debug dump - only the raw network/SDK-level
// exception these three functions can also throw.
async function withRetry(fn, label, maxRetries = 4) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      // 429 added after raising SUBTOPIC_CONCURRENCY made hitting a rate
      // limit a real possibility, not just a network blip - a 429 needs a
      // longer, escalating wait than a dropped connection does, since
      // retrying immediately into an active rate limit just fails again.
      const isRateLimit = err?.status === 429;
      const transient = isRateLimit || err?.cause?.code === 'ECONNRESET' || err?.status >= 500 || err?.name === 'APIConnectionError';
      if (!transient || attempt === maxRetries) throw err;
      const waitMs = isRateLimit ? 20000 * attempt : 5000 * attempt;
      console.warn(`  ! ${label} failed (attempt ${attempt}/${maxRetries}: ${err.message}) - retrying in ${waitMs / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }
}

const CHECKPOINT_PATH = path.join(__dirname, `_checkpoint_${SUBJECT.toLowerCase()}_${QUALIFICATION.toLowerCase().replace(/[^a-z0-9]/g, '')}.json`);

function loadCheckpoint() {
  if (!fs.existsSync(CHECKPOINT_PATH)) return { completedSubtopics: [], allNodes: [], allEdges: [], totalSpendUsd: 0 };
  const data = JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf8'));
  console.log(`Resuming from checkpoint: ${data.completedSubtopics.length}/${SUBTOPICS.length} subtopics already done, $${(data.totalSpendUsd || 0).toFixed(4)} already spent.`);
  return data;
}

function saveCheckpoint(state) {
  fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify(state));
}

// One subtopic's full generate -> coverage-check -> regenerate pipeline,
// as a standalone unit safe to run concurrently with others (each only
// ever touches its own local `nodes`/`edges`, never shared state) - the
// only genuine cross-subtopic dependency in the whole pipeline is the
// FINAL verifyBatch call, which needs everything already finished, so
// nothing here needs to run sequentially.
async function processSubtopic(subtopic, specContent) {
  console.log(`Generating: ${subtopic}...`);
  let { nodes, edges } = await withRetry(() => generateSubtopic(subtopic, specContent), `generate ${subtopic}`);
  console.log(`  -> ${subtopic}: ${nodes.length} nodes, ${edges.length} edges`);

  // Coverage check against the RAW spec text - the only check in this
  // pipeline that can catch a whole named theory/model dropped entirely,
  // since it's the only one that ever sees the source text rather than
  // just the nodes already produced from it (see the comment above
  // KNOWLEDGE_MAP_COVERAGE_PROMPT for why this is a distinct failure
  // mode from anything verifyBatch below can catch).
  for (let round = 0; round < MAX_COVERAGE_ROUNDS; round++) {
    console.log(`  [${subtopic}] Checking coverage (round ${round + 1})...`);
    const missing = await withRetry(() => checkCoverage(subtopic, specContent, nodes), `coverage check ${subtopic}`);
    if (!missing.length) {
      console.log(`  -> ${subtopic}: full coverage confirmed`);
      break;
    }
    console.log(`  -> ${subtopic}: ${missing.length} concept(s) missing, regenerating: ${missing.map(m => m.term).join('; ')}`);
    ({ nodes, edges } = await withRetry(() => generateSubtopic(subtopic, specContent, missing), `regenerate ${subtopic}`));
    console.log(`  -> ${subtopic}: ${nodes.length} nodes, ${edges.length} edges after regeneration`);
  }

  nodes.forEach(n => n.subtopic = subtopic);
  return { subtopic, nodes, edges: edges.map(normalizeEdge) };
}

// Concurrency limited (not all 19 at once) to stay well clear of the
// account's own rate limits rather than guess at exactly where they are
// and find out the hard way mid-run. Lowered from 4 to 2 specifically for
// this run's hard SPEND_CAP_USD - the cap is only checked between calls,
// not mid-stream, so the worst-case overshoot once it trips is bounded by
// however many calls were already in flight in that chunk; halving
// concurrency halves that worst case, at the cost of roughly doubling
// wall-clock time.
const SUBTOPIC_CONCURRENCY = 2;

async function main() {
  const state = loadCheckpoint();
  let { allNodes, allEdges } = state;
  const done = new Set(state.completedSubtopics);
  // Seeded from the checkpoint, not left at 0 - found live on a previous
  // run: totalSpendUsd was in-memory only, so a checkpoint-resume after a
  // failure got a FRESH cap budget stacked on top of whatever the first
  // invocation had already spent, and the real total ended up well over
  // the intended cap. Persisting it here is what actually makes the cap
  // hold across a resume, not just within one invocation.
  totalSpendUsd = state.totalSpendUsd || 0;

  const remaining = SUBTOPICS.filter(s => !done.has(s.subtopic));
  for (const s of SUBTOPICS) { if (done.has(s.subtopic)) console.log(`Skipping (already done): ${s.subtopic}`); }

  let anyFailed = false;
  for (let i = 0; i < remaining.length; i += SUBTOPIC_CONCURRENCY) {
    const chunk = remaining.slice(i, i + SUBTOPIC_CONCURRENCY);
    // allSettled, not all - a genuine failure in one subtopic (e.g. a
    // real max_tokens truncation, not just a transient network blip)
    // must not throw away the OTHER subtopics in the same chunk that
    // finished fine. Promise.all would reject the whole chunk the moment
    // any one item threw, silently discarding already-done work that
    // was never given a chance to reach saveCheckpoint - exactly what
    // happened on the real run this was found on.
    const settled = await Promise.allSettled(chunk.map(s => processSubtopic(s.subtopic, s.specContent)));
    settled.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        const { subtopic, nodes, edges } = result.value;
        allNodes = allNodes.concat(nodes);
        allEdges = allEdges.concat(edges);
        done.add(subtopic);
      } else {
        anyFailed = true;
        console.error(`FAILED: ${chunk[idx].subtopic}: ${result.reason?.message || result.reason}`);
      }
    });
    saveCheckpoint({ completedSubtopics: Array.from(done), allNodes, allEdges, totalSpendUsd });
    console.log(`Checkpoint saved: ${done.size}/${SUBTOPICS.length} subtopics done.`);
  }
  if (anyFailed) {
    console.error('\nOne or more subtopics failed permanently (see FAILED lines above) - fix the underlying issue, then just re-run this script. The checkpoint means only the failed subtopic(s) get retried, nothing already-done gets re-paid for.');
    process.exit(1);
  }

  console.log(`\nVerifying batch of ${allNodes.length} nodes...`);
  let finalNodes = allNodes, finalEdges = allEdges, verified = false;
  try {
    const { issues } = await withRetry(() => verifyBatch(allNodes, allEdges), 'verification');
    console.log(`  -> ${issues.length} issue(s) found`);
    issues.forEach(i => console.log(`  [${i.type}] ${i.affected_node}: ${i.explanation}`));
    const fixed = applyFixes(allNodes, allEdges, issues);
    const merged = mergeDuplicateNodes(fixed.nodes, fixed.edges);
    finalNodes = merged.nodes;
    finalEdges = merged.edges;
    verified = true;
  } catch (err) {
    // The spend cap is a hard promise for this run - if it trips here
    // (verification is one whole-batch Opus call, scaling with total node
    // count, so it can be the single biggest line item), the already-paid-
    // for generation work still gets written out rather than lost: an
    // unverified map is a real, usable result (same shape ingest_knowledge_map.js
    // expects), just without the whole-batch consistency pass. Re-run
    // verifyBatch by hand later (raise SPEND_CAP_USD or start a fresh
    // invocation) if that pass still matters once you're ready to spend more.
    console.error(`\nVerification did not complete (${err.message}). Writing out the generated-but-unverified map instead of losing it.`);
  }
  const result = validate(finalNodes, finalEdges);
  console.log(`\nFinal: ${finalNodes.length} nodes, ${finalEdges.length} edges, verified: ${verified}, valid DAG: ${result.valid}`);

  const outPath = `knowledge_map_${SUBJECT.toLowerCase()}_${QUALIFICATION.toLowerCase().replace(/[^a-z0-9]/g, '')}.json`;
  fs.writeFileSync(outPath, JSON.stringify({ subject: SUBJECT, qualification: QUALIFICATION, examBoard: EXAM_BOARD, nodes: finalNodes, edges: finalEdges }, null, 2));
  console.log(`Written to ${outPath}`);
}

main().catch(err => { console.error(err); process.exit(1); });
