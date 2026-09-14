import { Router, Request, Response } from 'express';
import { requireAuth } from '../services/authMiddleware';
import { syncEndpointLimiter } from '../services/rateLimiters';
import { pickEncouragementMessage } from '../services/encouragementService';

const router = Router();

// Free for every tier - no requirePaidTier, same reasoning as
// theme-settings: purely cosmetic, no Claude call, no ongoing cost, and
// the free-tier Knowledge Map/LastMind Untracked feed shows correct-answer
// feedback too.
router.use('/encouragement-message', requireAuth);

// POST /encouragement-message  { toughConcept?, studentName?, recentlyShown? }
// -> { message }
// Fired from the question feed right after a correct-answer submit
// resolves (see learn/index.html's sfShowCorrectFeedback) - toughConcept
// true when this question needed at least one wrong attempt first (the
// frontend's own retryCount > 0), which switches the pool from routine
// correct-answer copy to the heartfelt "you just got through something
// hard" one. syncEndpointLimiter, not actionEndpointLimiter - this fires
// on every correct answer in a fast question session, not on a deliberate
// once-in-a-while click.
router.post('/encouragement-message', syncEndpointLimiter, (req: Request, res: Response) => {
  const { toughConcept, studentName, recentlyShown } = req.body ?? {};
  const message = pickEncouragementMessage(
    !!toughConcept,
    typeof studentName === 'string' ? studentName : null,
    Array.isArray(recentlyShown) ? recentlyShown : []
  );
  res.json({ message });
});

export default router;
