import { supabaseAdmin } from './supabaseAdmin';
import { callClaudeJSON, MODELS } from './claudeClient';
import { CHAIN_GENERATION_PROMPT, FACT_CHECK_PROMPT } from '../constants/chainPrompts';

function stripCodeFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}

function clean(s: string): string {
  return (s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

export function normalizeConceptKey(subject: string, topic: string, concept: string): string {
  return `${clean(subject)}:${clean(topic)}:${clean(concept)}`;
}

/**
 * Fetches a chain from cache, or generates+fact-checks+caches a new one on
 * a miss. Extracted here (rather than left inline in the /chains/generate
 * route) specifically so the diagnostic engine can ensure a chain exists
 * BEFORE starting a session — previously nothing did this, so every
 * diagnostic session silently fell through to the atomic (no chain
 * awareness) path unless a chain happened to already be cached from a
 * separate, earlier manual call.
 *
 * `qualification`/`examBoard` tier the cache the same way
 * encoding_diagrams/encoding_lesson_content already do (see
 * encodingLessonService.ts) — same target concept can genuinely need a
 * different depth/rigor of decomposition depending on the level a student
 * is studying it at (e.g. GCSE vs A-Level), so sharing one chain across
 * every qualification silently gave everyone the depth whichever caller
 * happened to generate it first asked for. Both are optional and default
 * to '' — callers that don't have them yet (or genuinely don't care) just
 * land in the untiered "" bucket, same as before this was added.
 */
export async function getOrGenerateChain(
  conceptKey: string,
  subject: string,
  topic: string,
  concept: string,
  qualification = '',
  examBoard = ''
): Promise<{ chain: any; source: 'cache' | 'generated'; error?: string }> {
  const chainCacheKey = `${conceptKey}::${clean(qualification)}::${clean(examBoard)}`;

  const { data: cached, error: cacheError } = await supabaseAdmin
    .from('dependency_chains')
    .select('chain')
    .eq('concept_key', chainCacheKey)
    .maybeSingle();

  if (cacheError) throw cacheError;
  if (cached) {
    return { chain: cached.chain, source: 'cache' };
  }

  const generationInput = [
    `Subject: ${subject}`,
    `Topic: ${topic}`,
    `Concept: ${concept}`,
    `Qualification level: ${qualification || 'unspecified'}`,
    `Exam board: ${examBoard || 'unspecified'}`,
  ].join('\n');
  // NOTE: no `temperature` here — Anthropic deprecated this parameter
  // entirely for Claude Opus 4.7 and later (including 4.8, used here via
  // MODELS.chainGeneration): any explicit value, even 0, now returns a
  // 400 error. Omitting it is the only supported option for this model;
  // determinism has to come from the prompt itself rather than this
  // parameter for Opus calls specifically.
  // maxTokens raised well above the 2048 default — the default was
  // silently truncating mid-JSON for larger graphs (more nodes = more
  // edges + labels to emit), which then failed JSON.parse and surfaced as
  // an opaque "could not..." error with no indication this was the cause.
  // CHAIN_GENERATION_PROMPT is fixed, ~1.1K tokens, and byte-identical for
  // every concept/student that ever triggers a chain-cache miss — clears
  // Opus's 1024-token cache minimum, so mark it cacheable rather than
  // paying full price on every single one of those misses across the app.
  const rawChain = await callClaudeJSON({
    model: MODELS.chainGeneration,
    systemPrompt: CHAIN_GENERATION_PROMPT,
    userContent: generationInput,
    maxTokens: 4096,
    cacheSystemPrompt: true,
  });

  let chain: any;
  try {
    chain = JSON.parse(stripCodeFences(rawChain));
  } catch (err) {
    console.error('LastMind: chain generation returned invalid JSON (likely truncated).', { rawChain });
    throw err;
  }

  // Fact-check has to emit a full corrected_graph (the whole chain again)
  // on top of its issues list when it finds a problem — the same
  // truncation risk as above, same fix.
  const rawFactCheck = await callClaudeJSON({
    model: MODELS.factCheck,
    systemPrompt: FACT_CHECK_PROMPT,
    userContent: JSON.stringify(chain),
    maxTokens: 4096,
  });

  let factCheckResult: any;
  try {
    factCheckResult = JSON.parse(stripCodeFences(rawFactCheck));
  } catch (err) {
    console.error('LastMind: chain fact-check returned invalid JSON (likely truncated).', { rawFactCheck });
    throw err;
  }

  if (!factCheckResult.verified) {
    if (factCheckResult.corrected_graph) {
      chain = factCheckResult.corrected_graph;
    } else {
      const mustFix = (factCheckResult.issues || []).filter((i: any) => i.severity === 'must_fix');
      if (mustFix.length > 0) {
        // Same principle as before: never silently use/cache a chain with
        // an unresolved must-fix issue. In the diagnostic-engine context,
        // this means falling back to the atomic (no-chain) path rather
        // than erroring the whole session out.
        return { chain: null, source: 'generated', error: 'unresolved_must_fix' };
      }
    }
  }

  const { error: insertError } = await supabaseAdmin
    .from('dependency_chains')
    .insert({ concept_key: chainCacheKey, chain });

  if (insertError) throw insertError;

  return { chain, source: 'generated' };
}
