import { Router, Request, Response } from 'express';
import { requireAuth } from '../services/authMiddleware';
import { costlyEndpointLimiter } from '../services/rateLimiters';
import { startPlacementCheck } from '../services/placementService';

const router = Router();

// POST /placement/start  { subject, topic, concept }
// The first thing a student sees for a brand-new lesson: one mechanism
// question per DIRECT prerequisite branch of the lesson's own concept, all
// generated from a single Claude call. If the concept has no real
// prerequisite chain, hasPrerequisites comes back false with an empty
// questions array and the frontend should treat the lesson as already
// unlocked.
//
// Deliberately has no matching /placement/submit endpoint — each
// question's answer is submitted through the existing, already-built
// /diagnostics/submit-answer, one branch at a time, treating it exactly
// like any other first question (same slip-check, same encoding-check,
// same atomic/mechanistic branching down to the actual root cause, same
// real corrections). No new diagnostic logic needed here, only the
// batched question generation itself is new.
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
