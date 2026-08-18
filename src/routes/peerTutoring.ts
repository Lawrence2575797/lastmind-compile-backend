import { Router, Request, Response } from 'express';
import { requireAuth } from '../services/authMiddleware';
import { syncEndpointLimiter } from '../services/rateLimiters';
import { createHelpRequest, getHelpRequest } from '../services/peerTutoringMatchService';

const router = Router();

router.use('/peer-tutoring', requireAuth, syncEndpointLimiter);

// POST /peer-tutoring/help-requests  { conceptId, subject, topic? }
router.post('/peer-tutoring/help-requests', async (req: Request, res: Response) => {
  const { conceptId, subject, topic } = req.body ?? {};
  if (typeof conceptId !== 'string' || !conceptId.trim()) {
    return res.status(400).json({ error: 'conceptId (string) is required' });
  }
  if (typeof subject !== 'string' || !subject.trim()) {
    return res.status(400).json({ error: 'subject (string) is required' });
  }
  try {
    const result = await createHelpRequest(req.userId as string, conceptId, subject, topic ?? null);
    res.json(result);
  } catch (err) {
    console.error('Help request creation failed:', err);
    res.status(500).json({ error: 'could not create your help request' });
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

export default router;
