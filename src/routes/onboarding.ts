import { Router, Request, Response } from 'express';
import { requireAuth } from '../services/authMiddleware';
import { syncEndpointLimiter, actionEndpointLimiter } from '../services/rateLimiters';
import { getOnboardingStatus, markTourSeen, OnboardingTier } from '../services/onboardingService';

const router = Router();

router.use('/onboarding', requireAuth);

// GET /onboarding/tour-status -> { seenFreeTour, seenPremiumTour }
router.get('/onboarding/tour-status', syncEndpointLimiter, async (req: Request, res: Response) => {
  try {
    const status = await getOnboardingStatus(req.userId as string);
    res.json(status);
  } catch (err) {
    console.error('Onboarding tour status fetch failed:', err);
    res.status(500).json({ error: 'could not load onboarding status' });
  }
});

// POST /onboarding/tour-seen { tier: 'free' | 'premium' } -> { ok: true }
router.post('/onboarding/tour-seen', actionEndpointLimiter, async (req: Request, res: Response) => {
  const { tier } = req.body ?? {};
  if (tier !== 'free' && tier !== 'premium') {
    return res.status(400).json({ error: 'tier must be "free" or "premium"' });
  }
  try {
    await markTourSeen(req.userId as string, tier as OnboardingTier);
    res.json({ ok: true });
  } catch (err) {
    console.error('Onboarding tour-seen update failed:', err);
    res.status(500).json({ error: 'could not update onboarding status' });
  }
});

export default router;
