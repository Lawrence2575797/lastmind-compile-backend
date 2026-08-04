import { Router, Request, Response } from 'express';
import { requireAuth } from '../services/authMiddleware';
import { costlyEndpointLimiter } from '../services/rateLimiters';
import { startPlacementCheck } from '../services/placementService';

const router = Router();

// POST /placement/start  { subject, topic, concept }
// The first thing a student sees for a brand-new lesson: a mechanism
// question testing whether they can reconstruct the reasoning chain
// leading up to (not including) today's new material. If the concept has
// no real prerequisite chain, hasPrerequisite comes back false and the
// frontend should skip straight past this step.
//
// Deliberately has no matching /placement/submit endpoint — the ANSWER to
// this question is submitted through the existing, already-built
// /diagnostics/submit-answer, treating it exactly like any other first
// question (same slip-check, same encoding-check, same atomic/mechanistic
// branching, same real corrections). No new diagnostic logic needed here,
// only the question generation itself is new.
router.post('/placement/start', requireAuth, costlyEndpointLimiter, async (req: Request, res: Response) => {
  const { subject, topic, concept } = req.body ?? {};
  if (typeof subject !== 'string' || typeof topic !== 'string' || typeof concept !== 'string') {
    return res.status(400).json({ error: 'subject, topic, and concept are all required' });
  }

  try {
    const result = await startPlacementCheck(subject, topic, concept);
    res.json(result);
  } catch (err) {
    console.error('Placement check failed:', err);
    res.status(500).json({ error: 'could not generate the placement question' });
  }
});

export default router;
