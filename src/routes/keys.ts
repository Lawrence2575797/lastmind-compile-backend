import { Router, Request, Response } from 'express';
import { requireAuth } from '../services/authMiddleware';
import { syncEndpointLimiter } from '../services/rateLimiters';
import { getKeyBalance } from '../services/keyEconomyService';

const router = Router();

router.get('/keys/balance', requireAuth, syncEndpointLimiter, async (req: Request, res: Response) => {
  try {
    const balance = await getKeyBalance(req.userId as string);
    res.json({ balance });
  } catch (err) {
    console.error('Key balance fetch failed:', err);
    res.status(500).json({ error: 'could not load your Keys balance' });
  }
});

export default router;
