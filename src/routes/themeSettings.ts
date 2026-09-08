import { Router, Request, Response } from 'express';
import { requireAuth } from '../services/authMiddleware';
import { syncEndpointLimiter, actionEndpointLimiter } from '../services/rateLimiters';
import { getThemeSettings, setThemeSettings } from '../services/themeSettingsService';

const router = Router();

// Free for every tier, deliberately - no requirePaidTier here, unlike
// study-settings above. Purely cosmetic, costs nothing ongoing (a stored
// preference, no Claude calls involved), so there's no reason to gate it.
router.use('/theme-settings', requireAuth);

// GET /theme-settings -> { textColor, panelColor, bgColor, bgTexture }
router.get('/theme-settings', syncEndpointLimiter, async (req: Request, res: Response) => {
  try {
    const settings = await getThemeSettings(req.userId as string);
    res.json(settings);
  } catch (err) {
    console.error('Theme settings fetch failed:', err);
    res.status(500).json({ error: 'could not load your colour settings' });
  }
});

// POST /theme-settings  { textColor?, panelColor?, bgColor?, bgTexture? }
// Every field optional - a live colour-picker drag fires one field at a
// time, not the whole set together.
router.post('/theme-settings', actionEndpointLimiter, async (req: Request, res: Response) => {
  try {
    const settings = await setThemeSettings(req.userId as string, req.body ?? {});
    res.json(settings);
  } catch (err) {
    console.error('Theme settings save failed:', err);
    res.status(500).json({ error: 'could not save your colour settings' });
  }
});

export default router;
