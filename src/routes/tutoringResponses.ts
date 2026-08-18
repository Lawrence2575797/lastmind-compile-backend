import { Router, Request, Response } from 'express';
import { requireAuth } from '../services/authMiddleware';
import { syncEndpointLimiter } from '../services/rateLimiters';
import { submitResponse, getResponse } from '../services/tutoringResponseService';

const router = Router();

router.use('/tutoring-sessions', requireAuth, syncEndpointLimiter);

// POST /tutoring-sessions/:id/response  { body }
router.post('/tutoring-sessions/:id/response', async (req: Request, res: Response) => {
  const { body } = req.body ?? {};
  if (typeof body !== 'string') {
    return res.status(400).json({ error: 'body (string) is required' });
  }
  try {
    const response = await submitResponse(req.userId as string, req.params.id, body);
    res.json(response);
  } catch (err: any) {
    console.error('Response submission failed:', err);
    res.status(400).json({ error: err?.message || 'could not submit your response' });
  }
});

// GET /tutoring-sessions/:id/response -> { available, body, releasedAt }
router.get('/tutoring-sessions/:id/response', async (req: Request, res: Response) => {
  try {
    const view = await getResponse(req.userId as string, req.params.id);
    res.json(view);
  } catch (err: any) {
    console.error('Response fetch failed:', err);
    res.status(404).json({ error: err?.message || 'not found' });
  }
});

export default router;
