import { Router, Request, Response } from 'express';
import { requireAuth } from '../services/authMiddleware';
import { syncEndpointLimiter } from '../services/rateLimiters';
import { getOrCreateLockBalance } from '../services/lockService';

const router = Router();

router.use('/locks', requireAuth);

// GET /locks/balance -> { balance }
// Grants the monthly allotment and creates the user's row on their very
// first call, and applies the lazy monthly reset if a new calendar month
// has started since the row was last touched — see lockService.ts's
// getOrCreateLockBalance.
router.get('/locks/balance', syncEndpointLimiter, async (req: Request, res: Response) => {
  try {
    const balance = await getOrCreateLockBalance(req.userId as string);
    res.json(balance);
  } catch (err) {
    console.error('Lock balance fetch failed:', err);
    res.status(500).json({ error: 'could not load your Locks balance' });
  }
});

export default router;
