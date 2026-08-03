import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../services/supabaseAdmin';
import { callClaudeJSON, MODELS } from '../services/claudeClient';
import { CHAIN_GENERATION_PROMPT, FACT_CHECK_PROMPT } from '../constants/chainPrompts';

const router = Router();

// Claude occasionally wraps JSON output in markdown code fences despite
// being told not to — strip them defensively rather than let a otherwise-
// valid response fail to parse over formatting alone.
function stripCodeFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}

function normalizeConceptKey(subject: string, topic: string, concept: string): string {
  const clean = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
  return `${clean(subject)}:${clean(topic)}:${clean(concept)}`;
}

router.post('/chains/generate', async (req: Request, res: Response) => {
  const { subject, topic, concept } = req.body ?? {};
  if (typeof subject !== 'string' || typeof topic !== 'string' || typeof concept !== 'string') {
    return res.status(400).json({ error: 'subject, topic, and concept are all required' });
  }

  const conceptKey = normalizeConceptKey(subject, topic, concept);

  try {
    // Cache check first — a verified chain is shared across every student
    // who ever hits this concept, generated exactly once.
    const { data: cached, error: cacheError } = await supabaseAdmin
      .from('dependency_chains')
      .select('chain')
      .eq('concept_key', conceptKey)
      .maybeSingle();

    if (cacheError) throw cacheError;
    if (cached) {
      return res.json({ conceptKey, chain: cached.chain, source: 'cache' });
    }

    // Not cached — generate fresh.
    const generationInput = `Subject: ${subject}\nTopic: ${topic}\nConcept: ${concept}`;
    const rawChain = await callClaudeJSON({
      model: MODELS.chainGeneration,
      systemPrompt: CHAIN_GENERATION_PROMPT,
      userContent: generationInput,
    });

    let chain = JSON.parse(stripCodeFences(rawChain));

    // Fact-check pass — same model, genuinely independent call, checking
    // the first pass's own output rather than trusting it outright.
    const rawFactCheck = await callClaudeJSON({
      model: MODELS.factCheck,
      systemPrompt: FACT_CHECK_PROMPT,
      userContent: JSON.stringify(chain),
    });

    const factCheckResult = JSON.parse(stripCodeFences(rawFactCheck));

    if (!factCheckResult.verified) {
      if (factCheckResult.corrected_graph) {
        chain = factCheckResult.corrected_graph;
      } else {
        const mustFix = (factCheckResult.issues || []).filter((i: any) => i.severity === 'must_fix');
        if (mustFix.length > 0) {
          // The fact-check flagged a real problem but didn't provide a fix
          // to apply. Never silently cache/serve a chain known to have an
          // unresolved must-fix issue — same principle as the diagnostic
          // tree's own catch-all: an unresolved case gets surfaced, not
          // quietly let through.
          console.error(`Chain fact-check found unresolved must_fix issues for "${conceptKey}":`, mustFix);
          return res.status(500).json({
            error: 'Generated chain failed verification and could not be auto-corrected. Not cached.',
            issues: factCheckResult.issues,
          });
        }
        // Only minor issues with no corrected_graph — acceptable to
        // proceed with the original chain as-is.
      }
    }

    // Cache the final (possibly corrected) chain for every future student.
    const { error: insertError } = await supabaseAdmin
      .from('dependency_chains')
      .insert({ concept_key: conceptKey, chain });

    if (insertError) throw insertError;

    res.json({
      conceptKey,
      chain,
      source: 'generated',
      factCheck: {
        verified: factCheckResult.verified,
        issues: factCheckResult.issues || [],
        correctionApplied: !factCheckResult.verified && !!factCheckResult.corrected_graph,
      },
    });
  } catch (err) {
    console.error(`Chain generation failed for "${conceptKey}":`, err);
    res.status(500).json({ error: 'could not generate a dependency chain for this concept' });
  }
});

export default router;
