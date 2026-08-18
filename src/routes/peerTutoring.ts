import { Router, Request, Response } from 'express';
import { requireAuth } from '../services/authMiddleware';
import { syncEndpointLimiter } from '../services/rateLimiters';
import {
  createHelpRequest,
  createCustomHelpRequest,
  getHelpRequest,
  checkAndReassignMissedDeadlines,
  listClaimableHelpRequests,
  claimHelpRequest,
} from '../services/peerTutoringMatchService';
import { getNotificationCounts } from '../services/tutoringSessionService';

const router = Router();

router.use('/peer-tutoring', requireAuth, syncEndpointLimiter);

// POST /peer-tutoring/help-requests
// Either { conceptId, subject, topic? } — the "recommended" path, conceptId
// already a real chain node id from the knowledge map — or { subject,
// topic?, concept } — the "add your own" path (structured fields, no free
// text; see createCustomHelpRequest for the filtering/normalization).
router.post('/peer-tutoring/help-requests', async (req: Request, res: Response) => {
  const { conceptId, subject, topic, concept } = req.body ?? {};
  try {
    if (typeof conceptId === 'string' && conceptId.trim()) {
      if (typeof subject !== 'string' || !subject.trim()) {
        return res.status(400).json({ error: 'subject (string) is required' });
      }
      const result = await createHelpRequest(req.userId as string, conceptId, subject, topic ?? null);
      return res.json(result);
    }
    if (typeof subject === 'string' && typeof concept === 'string') {
      const result = await createCustomHelpRequest(req.userId as string, subject, topic || '', concept);
      return res.json(result);
    }
    return res.status(400).json({ error: 'either conceptId+subject, or subject+concept, is required' });
  } catch (err: any) {
    console.error('Help request creation failed:', err);
    res.status(400).json({ error: err?.message || 'could not create your help request' });
  }
});

// GET /peer-tutoring/claimable — open requests this opted-in helper has
// verified mastery for (see listClaimableHelpRequests's own comment on
// why this exists alongside the automatic single-assignment path).
router.get('/peer-tutoring/claimable', async (req: Request, res: Response) => {
  try {
    const requests = await listClaimableHelpRequests(req.userId as string);
    res.json(requests);
  } catch (err) {
    console.error('Claimable help requests fetch failed:', err);
    res.status(500).json({ error: 'could not load open requests' });
  }
});

// POST /peer-tutoring/help-requests/:id/claim
router.post('/peer-tutoring/help-requests/:id/claim', async (req: Request, res: Response) => {
  try {
    const session = await claimHelpRequest(req.userId as string, req.params.id);
    res.json(session);
  } catch (err: any) {
    console.error('Claim failed:', err);
    res.status(400).json({ error: err?.message || 'could not claim this request' });
  }
});

// GET /peer-tutoring/help-requests/:id
router.get('/peer-tutoring/help-requests/:id', async (req: Request, res: Response) => {
  try {
    const helpRequest = await getHelpRequest(req.userId as string, req.params.id);
    if (!helpRequest) return res.status(404).json({ error: 'help request not found' });
    res.json(helpRequest);
  } catch (err) {
    console.error('Help request fetch failed:', err);
    res.status(500).json({ error: 'could not load your help request' });
  }
});

// GET /peer-tutoring/notifications -> { needsResponseCount, availableCount, total }
// Sweeps missed deadlines first, same as GET /tutoring-sessions — the
// topbar badge is checked on load/focus (see learn/index.html), so it's
// as good a trigger for the lazy reassignment sweep as any other read.
router.get('/peer-tutoring/notifications', async (req: Request, res: Response) => {
  try {
    await checkAndReassignMissedDeadlines();
    const counts = await getNotificationCounts(req.userId as string);
    res.json(counts);
  } catch (err) {
    console.error('Notification count fetch failed:', err);
    res.status(500).json({ error: 'could not load your notifications' });
  }
});

export default router;
