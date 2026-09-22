import { Router, Request, Response } from 'express';
import { requireAuth } from '../services/authMiddleware';
import { syncEndpointLimiter } from '../services/rateLimiters';
import { gradeCorrectness } from '../services/reviewService';

// LastMind Create > Chemistry > Life on Mars: a hand-authored, deterministic colony simulation (see learn/index.html's
// LOM_MISSIONS) - no Claude call anywhere in play, so this route is pure code and free to call as often as the game likes.
// Every mission decision names a real AQA GCSE Chemistry concept_id from the live knowledge map; a correct decision reports
// it here so playing genuinely moves the same FSRS/mastery record an ordinary lesson would (gradeAndRecordReview creates a
// fresh card the first time a concept is graded this way, exactly as it would for any other first-ever correct answer).
const router = Router();

router.post('/life-on-mars/log-concept', requireAuth, syncEndpointLimiter, async (req: Request, res: Response) => {
  const conceptId = typeof req.body?.conceptId === 'string' ? req.body.conceptId.slice(0, 300) : '';
  if (!conceptId) return res.status(400).json({ error: 'conceptId is required' });
  try {
    await gradeCorrectness(req.userId as string, conceptId, true, 0);
    res.json({ ok: true });
  } catch (err) {
    // Best-effort by design - a student's game must never break because a mastery-record write failed.
    console.error('Life on Mars concept log failed (non-fatal):', conceptId, err);
    res.json({ ok: false });
  }
});

export default router;
