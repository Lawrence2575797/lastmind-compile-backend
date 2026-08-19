import { Router, Request, Response } from 'express';
import { requireAuth } from '../services/authMiddleware';
import { syncEndpointLimiter, actionEndpointLimiter } from '../services/rateLimiters';
import { getSession, listMyTutoringSessions, setReleaseTime } from '../services/tutoringSessionService';
import { checkAndReassignMissedDeadlines } from '../services/peerTutoringMatchService';

const router = Router();

router.use('/tutoring-sessions', requireAuth);

// GET /tutoring-sessions -> { asRequester: [...], asHelper: [...] }
// Sweeps missed deadlines first — see checkAndReassignMissedDeadlines's
// own comment for why this lazy, read-triggered sweep is the mechanism
// rather than a cron job.
router.get('/tutoring-sessions', syncEndpointLimiter, async (req: Request, res: Response) => {
  try {
    await checkAndReassignMissedDeadlines();
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
    await checkAndReassignMissedDeadlines();
    const session = await getSession(req.userId as string, req.params.id);
    if (!session) return res.status(404).json({ error: 'session not found' });
    res.json(session);
  } catch (err) {
    console.error('Tutoring session fetch failed:', err);
    res.status(500).json({ error: 'could not load that session' });
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
