import { Router, Request, Response } from 'express';
import { requireAuth } from '../services/authMiddleware';
import { syncEndpointLimiter, actionEndpointLimiter } from '../services/rateLimiters';
import { getStudySettings, setStudySettings } from '../services/studySettingsService';

const router = Router();

router.use('/study-settings', requireAuth);

// GET /study-settings -> { dailyMinutesBudget }
router.get('/study-settings', syncEndpointLimiter, async (req: Request, res: Response) => {
  try {
    const settings = await getStudySettings(req.userId as string);
    res.json(settings);
  } catch (err) {
    console.error('Study settings fetch failed:', err);
    res.status(500).json({ error: 'could not load your study settings' });
  }
});

// POST /study-settings  { dailyMinutesBudget }
router.post('/study-settings', actionEndpointLimiter, async (req: Request, res: Response) => {
  const { dailyMinutesBudget } = req.body ?? {};
  if (typeof dailyMinutesBudget !== 'number' || !Number.isFinite(dailyMinutesBudget)) {
    return res.status(400).json({ error: 'dailyMinutesBudget (number) is required' });
  }
  try {
    const settings = await setStudySettings(req.userId as string, dailyMinutesBudget);
    res.json(settings);
  } catch (err) {
    console.error('Study settings save failed:', err);
    res.status(500).json({ error: 'could not save your study settings' });
  }
});

export default router;
