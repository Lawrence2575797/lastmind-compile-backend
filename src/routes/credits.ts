import { Router, Request, Response } from 'express';
import { requireAuth } from '../services/authMiddleware';
import { syncEndpointLimiter } from '../services/rateLimiters';
import { getOrCreateBalance } from '../services/creditService';

const router = Router();

// Deliberately NOT behind requirePaidTier — Keys/the Key Market are meant
// to be available on the free tier too (the plan is for verification
// itself to earn Keys eventually, not just tutoring), so free accounts
// need their own balance visible from day one.
router.use('/credits', requireAuth);

// GET /credits/balance -> { balance }
// Grants the one-time signup bonus and creates the user's row on their
// very first call — see creditService.ts's getOrCreateBalance.
router.get('/credits/balance', syncEndpointLimiter, async (req: Request, res: Response) => {
  try {
    const balance = await getOrCreateBalance(req.userId as string);
    res.json(balance);
  } catch (err) {
    console.error('Credit balance fetch failed:', err);
    res.status(500).json({ error: 'could not load your credit balance' });
  }
});

export default router;
