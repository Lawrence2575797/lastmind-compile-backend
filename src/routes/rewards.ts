import { Router, Request, Response } from 'express';
import { requireAuth } from '../services/authMiddleware';
import { syncEndpointLimiter } from '../services/rateLimiters';
import { listActiveRewards } from '../services/rewardsService';

const router = Router();

// Deliberately NOT behind requirePaidTier — same reasoning as
// routes/credits.ts: the Key Market is available on the free tier too.
router.use('/rewards', requireAuth);

// GET /rewards -> Reward[]
router.get('/rewards', syncEndpointLimiter, async (req: Request, res: Response) => {
  try {
    const rewards = await listActiveRewards();
    res.json(rewards);
  } catch (err) {
    console.error('Rewards fetch failed:', err);
    res.status(500).json({ error: 'could not load rewards' });
  }
});

export default router;
