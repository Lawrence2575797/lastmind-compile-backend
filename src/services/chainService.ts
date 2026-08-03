import { supabaseAdmin } from './supabaseAdmin';
import { callClaudeJSON, MODELS } from './claudeClient';
import { CHAIN_GENERATION_PROMPT, FACT_CHECK_PROMPT } from '../constants/chainPrompts';

function stripCodeFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}

export function normalizeConceptKey(subject: string, topic: string, concept: string): string {
  const clean = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
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
 */
export async function getOrGenerateChain(
  conceptKey: string,
  subject: string,
  topic: string,
  concept: string
): Promise<{ chain: any; source: 'cache' | 'generated'; error?: string }> {
  const { data: cached, error: cacheError } = await supabaseAdmin
    .from('dependency_chains')
    .select('chain')
    .eq('concept_key', conceptKey)
    .maybeSingle();

  if (cacheError) throw cacheError;
  if (cached) {
    return { chain: cached.chain, source: 'cache' };
  }

  const generationInput = `Subject: ${subject}\nTopic: ${topic}\nConcept: ${concept}`;
  const rawChain = await callClaudeJSON({
    model: MODELS.chainGeneration,
    systemPrompt: CHAIN_GENERATION_PROMPT,
    userContent: generationInput,
    temperature: 0,
  });

  let chain = JSON.parse(stripCodeFences(rawChain));

  const rawFactCheck = await callClaudeJSON({
    model: MODELS.factCheck,
    systemPrompt: FACT_CHECK_PROMPT,
    userContent: JSON.stringify(chain),
    temperature: 0,
  });

  const factCheckResult = JSON.parse(stripCodeFences(rawFactCheck));

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
    .insert({ concept_key: conceptKey, chain });

  if (insertError) throw insertError;

  return { chain, source: 'generated' };
}
