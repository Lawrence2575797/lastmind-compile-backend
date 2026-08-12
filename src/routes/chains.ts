import { Router, Request, Response } from 'express';
import { requireAuth } from '../services/authMiddleware';
import { costlyEndpointLimiter } from '../services/rateLimiters';
import { getOrGenerateChain, normalizeConceptKey } from '../services/chainService';

const router = Router();

router.post('/chains/generate', requireAuth, costlyEndpointLimiter, async (req: Request, res: Response) => {
  const { subject, topic, concept, qualification, examBoard } = req.body ?? {};
  if (typeof subject !== 'string' || typeof topic !== 'string' || typeof concept !== 'string') {
    return res.status(400).json({ error: 'subject, topic, and concept are all required' });
  }

  const conceptKey = normalizeConceptKey(subject, topic, concept);

  try {
    const result = await getOrGenerateChain(
      conceptKey,
      subject,
      topic,
      concept,
      typeof qualification === 'string' ? qualification : '',
      typeof examBoard === 'string' ? examBoard : ''
    );

    if (result.error === 'unresolved_must_fix') {
      return res.status(500).json({ error: 'Generated chain failed verification and could not be auto-corrected. Not cached.' });
    }

    res.json({ conceptKey, chain: result.chain, source: result.source });
  } catch (err) {
    console.error(`Chain generation failed for "${conceptKey}":`, err);
    res.status(500).json({ error: 'could not generate a dependency chain for this concept' });
  }
});

export default router;
