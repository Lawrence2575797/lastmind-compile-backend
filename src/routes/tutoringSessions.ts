import { Router, Request, Response } from 'express';
import { requireAuth } from '../services/authMiddleware';
import { syncEndpointLimiter, actionEndpointLimiter } from '../services/rateLimiters';
import { getSession, listMyTutoringSessions, setReleaseTime, suggestReleaseTime } from '../services/tutoringSessionService';
import { sweepExpiredHelpRequests } from '../services/peerTutoringMatchService';

const router = Router();

router.use('/tutoring-sessions', requireAuth);

// GET /tutoring-sessions -> { asRequester: [...], asHelper: [...] }
// Sweeps expired requests first — see sweepExpiredHelpRequests's own
// comment for why this lazy, read-triggered sweep is the mechanism rather
// than a cron job.
router.get('/tutoring-sessions', syncEndpointLimiter, async (req: Request, res: Response) => {
  try {
    await sweepExpiredHelpRequests();
    const sessions = await listMyTutoringSessions(req.userId as string);
    res.json(sessions);
  } catch (err) {
    console.error('Tutoring sessions fetch failed:', err);
    res.status(500).json({ error: 'could not load your tutoring sessions' });
  }
});

// GET /tutoring-sessions/:id
router.get('/tutoring-sessions/:id', syncEndpointLimiter, async (req: Request, res: Response) => {
  try {
    await sweepExpiredHelpRequests();
    const session = await getSession(req.userId as string, req.params.id);
    if (!session) return res.status(404).json({ error: 'session not found' });
    res.json(session);
  } catch (err) {
    console.error('Tutoring session fetch failed:', err);
    res.status(500).json({ error: 'could not load that session' });
  }
});

// GET /tutoring-sessions/:id/suggest-release-time -> { suggested: ISOString }
// A calendar-aware default the frontend pre-fills into the booking input —
// never forced, always overridable via the release-time route below.
router.get('/tutoring-sessions/:id/suggest-release-time', syncEndpointLimiter, async (req: Request, res: Response) => {
  try {
    const suggested = await suggestReleaseTime(req.userId as string, req.params.id);
    res.json({ suggested });
  } catch (err: any) {
    console.error('Release-time suggestion failed:', err);
    res.status(400).json({ error: err?.message || 'could not suggest a release time' });
  }
});

// POST /tutoring-sessions/:id/release-time  { releaseTime }
router.post('/tutoring-sessions/:id/release-time', async (req: Request, res: Response) => {
  const { releaseTime } = req.body ?? {};
  if (typeof releaseTime !== 'string' || !releaseTime.trim()) {
    return res.status(400).json({ error: 'releaseTime (ISO string) is required' });
  }
  try {
    const session = await setReleaseTime(req.userId as string, req.params.id, releaseTime);
    res.json(session);
  } catch (err: any) {
    console.error('Setting release time failed:', err);
    res.status(400).json({ error: err?.message || 'could not book that release time' });
  }
});

export default router;
