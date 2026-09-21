import { Router, Request, Response } from 'express';
import { requireAuth } from '../services/authMiddleware';
import { syncEndpointLimiter } from '../services/rateLimiters';
import { getKeyBalance, getOwnedBackgroundRewards, redeemBackgroundReward } from '../services/keyEconomyService';

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

const BACKGROUND_REWARD_KEYS = new Set([
  'havnstad', 'wildwest', 'castle', 'riverside', 'space', 'tokyonight',
  'cosycafe', 'samurai', 'scholarsdesk', 'ancientrome', 'sakuragarden', 'minimalist',
  // Economics Drawing Tool backgrounds (equipped as the tool's default).
  'diagram-countryside', 'diagram-seventies', 'diagram-futuristic', 'diagram-football',
]);
const DIAGRAM_BACKGROUND_COST = 25;
const BACKGROUND_REWARD_COST = 75;
const FREE_BACKGROUND_REWARD_KEYS = new Set(['cosycafe', 'diagram-seventies', 'minimalist']);
const backgroundRewardCost = (rewardKey: string): number => {
  if (FREE_BACKGROUND_REWARD_KEYS.has(rewardKey)) return 0;
  return rewardKey.startsWith('diagram-') ? DIAGRAM_BACKGROUND_COST : BACKGROUND_REWARD_COST;
};

router.get('/keys/background-rewards', requireAuth, syncEndpointLimiter, async (req: Request, res: Response) => {
  try {
    const userId = req.userId as string;
    const [balance, owned] = await Promise.all([getKeyBalance(userId), getOwnedBackgroundRewards(userId)]);
    res.json({ balance, owned, cost: BACKGROUND_REWARD_COST });
  } catch (err) {
    console.error('Background rewards fetch failed:', err);
    res.status(500).json({ error: 'could not load background rewards' });
  }
});

router.post('/keys/redeem-background', requireAuth, syncEndpointLimiter, async (req: Request, res: Response) => {
  const rewardKey = typeof req.body?.rewardKey === 'string' ? req.body.rewardKey : '';
  if (!BACKGROUND_REWARD_KEYS.has(rewardKey)) return res.status(400).json({ error: 'unknown background reward' });
  const cost = backgroundRewardCost(rewardKey);
  try {
    const result = await redeemBackgroundReward(req.userId as string, rewardKey, cost);
    res.json({ ...result, rewardKey, cost });
  } catch (err) {
    if (err instanceof Error && err.name === 'InsufficientKeysError') {
      return res.status(402).json({ error: 'Not enough Keys', code: 'INSUFFICIENT_KEYS', cost });
    }
    console.error('Background reward redemption failed:', err);
    res.status(500).json({ error: 'could not redeem this background' });
  }
});

export default router;
