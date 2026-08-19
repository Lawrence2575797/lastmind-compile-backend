import { Router, Request, Response } from 'express';
import { requireAuth } from '../services/authMiddleware';
import { syncEndpointLimiter, actionEndpointLimiter } from '../services/rateLimiters';
import { getTutoringProfile, setTutoringProfile } from '../services/tutoringProfileService';

const router = Router();

router.use('/tutoring-profile', requireAuth);

// GET /tutoring-profile -> { displayName, tutoringOptIn }
router.get('/tutoring-profile', syncEndpointLimiter, async (req: Request, res: Response) => {
  try {
    const profile = await getTutoringProfile(req.userId as string);
    res.json(profile);
  } catch (err) {
    console.error('Tutoring profile fetch failed:', err);
    res.status(500).json({ error: 'could not load your tutoring profile' });
  }
});

// POST /tutoring-profile  { displayName?, tutoringOptIn }
router.post('/tutoring-profile', actionEndpointLimiter, async (req: Request, res: Response) => {
  const { displayName, tutoringOptIn } = req.body ?? {};
  if (typeof tutoringOptIn !== 'boolean') {
    return res.status(400).json({ error: 'tutoringOptIn (boolean) is required' });
  }
  if (displayName !== undefined && displayName !== null && typeof displayName !== 'string') {
    return res.status(400).json({ error: 'displayName must be a string or null' });
  }
  try {
    const profile = await setTutoringProfile(req.userId as string, displayName ?? null, tutoringOptIn);
    res.json(profile);
  } catch (err) {
    console.error('Tutoring profile save failed:', err);
    res.status(500).json({ error: 'could not save your tutoring profile' });
  }
});

export default router;
