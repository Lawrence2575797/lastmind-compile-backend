import { supabaseAdmin } from './supabaseAdmin';
import { callClaudeJSON, MODELS } from './claudeClient';
import { CHAIN_GENERATION_PROMPT, FACT_CHECK_PROMPT } from '../constants/chainPrompts';

function stripCodeFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}

// Chains with fewer nodes than this skip the fact-check pass entirely —
// see getOrGenerateChain's comment at the skip site for the reasoning.
const FACT_CHECK_NODE_THRESHOLD = 4;

function clean(s: string): string {
  return (s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

export function normalizeConceptKey(subject: string, topic: string, concept: string): string {
  return `${clean(subject)}:${clean(topic)}:${clean(concept)}`;
}

// Mirrors learn/index.html's UNIVERSITY_LEVELS exactly — keep in sync if
// that list ever changes. GCSE/A-Level/AS-Level (and anything unset) are
// treated as the "simple" school-level case; only genuine university
// levels are held to the more expensive generation model. clean() is the
// same normalizer used for cache keys elsewhere in this file, so this is
// robust to casing/hyphenation drift ("A-Level" vs "a level").
const UNIVERSITY_LEVELS = new Set([
  'undergraduate_year_1',
  'undergraduate_year_2',
  'undergraduate_year_3',
  'undergraduate_year_4',
  'masters',
  'phd',
]);

function isUniversityLevel(qualification: string): boolean {
  return UNIVERSITY_LEVELS.has(clean(qualification));
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
  // NOTE: no `temperature` here — both Opus 4.7+ and Sonnet 5 (the two
  // models this call can use, see generationModel below) reject any
  // explicit temperature value, even 0, with a 400. Omitting it is the
  // only supported option on either; determinism has to come from the
  // prompt itself rather than this parameter.
  // maxTokens raised well above the 2048 default — the default was
  // silently truncating mid-JSON for larger graphs (more nodes = more
  // edges + labels to emit), which then failed JSON.parse and surfaced as
  // an opaque "could not..." error with no indication this was the cause.
  // CHAIN_GENERATION_PROMPT is fixed, ~1.1K tokens, and byte-identical for
  // every concept/student that ever triggers a chain-cache miss — clears
  // both models' 1024-token cache minimum, so mark it cacheable rather
  // than paying full price on every single one of those misses across the
  // app.
  //
  // Sonnet drafts GCSE/A-Level chains (the large majority of concepts in
  // practice); Opus is reserved for university-level ones, where the
  // material is more likely to need deeper/subtler decomposition. Either
  // way, factCheck below is UNCONDITIONALLY Opus and can rewrite the
  // whole graph — so a weaker Sonnet draft still ends up quality-gated by
  // Opus before it's ever cached, this just makes the common case cheaper
  // to produce that first draft.
  const generationModel = isUniversityLevel(qualification) ? MODELS.chainGeneration : MODELS.chainGenerationSimple;
  const rawChain = await callClaudeJSON({
    model: generationModel,
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

  // Skip fact-check for chains too small to have much surface area for
  // error — a 1-3 node graph is just the target plus one or two direct
  // prerequisites, with barely any structure a review pass could catch
  // that generation itself would plausibly get wrong. This is the common
  // case for narrowly-scoped concepts. Nothing here changes what fact-
  // check DOES when it runs (still unconditionally Opus, still able to
  // rewrite the whole graph) — it only skips a genuinely low-value review
  // for chains where there's very little to review. FACT_CHECK_NODE_THRESHOLD
  // is deliberately conservative; raise it if this turns out to skip
  // chains that should have been checked.
  const nodeCount = Array.isArray(chain?.nodes) ? chain.nodes.length : 0;
  if (nodeCount >= FACT_CHECK_NODE_THRESHOLD) {
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
  }

  const { error: insertError } = await supabaseAdmin
    .from('dependency_chains')
    .insert({ concept_key: chainCacheKey, chain });

  if (insertError) throw insertError;

  return { chain, source: 'generated' };
}
