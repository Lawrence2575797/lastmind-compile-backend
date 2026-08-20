import { Router, Request, Response } from 'express';
import { requireAuth } from '../services/authMiddleware';
import { syncEndpointLimiter, actionEndpointLimiter } from '../services/rateLimiters';
import { submitResponse, getResponse } from '../services/tutoringResponseService';
import { reportResponse } from '../services/tutoringResponseModerationService';
import { submitRating, getRatingForSession } from '../services/tutoringRatingService';

const router = Router();

router.use('/tutoring-sessions', requireAuth);

// POST /tutoring-sessions/:id/response  { body }
router.post('/tutoring-sessions/:id/response', actionEndpointLimiter, async (req: Request, res: Response) => {
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
router.get('/tutoring-sessions/:id/response', syncEndpointLimiter, async (req: Request, res: Response) => {
  try {
    const view = await getResponse(req.userId as string, req.params.id);
    res.json(view);
  } catch (err: any) {
    console.error('Response fetch failed:', err);
    res.status(404).json({ error: err?.message || 'not found' });
  }
});

// POST /tutoring-sessions/:id/report  { reason }
router.post('/tutoring-sessions/:id/report', actionEndpointLimiter, async (req: Request, res: Response) => {
  const { reason } = req.body ?? {};
  if (typeof reason !== 'string' || !reason.trim()) {
    return res.status(400).json({ error: 'reason (string) is required' });
  }
  try {
    await reportResponse(req.userId as string, req.params.id, reason);
    res.json({ ok: true });
  } catch (err: any) {
    console.error('Report submission failed:', err);
    res.status(400).json({ error: err?.message || 'could not submit your report' });
  }
});

// POST /tutoring-sessions/:id/rating  { quality, helpfulness, timeliness, clarity, wouldRecommend }
router.post('/tutoring-sessions/:id/rating', actionEndpointLimiter, async (req: Request, res: Response) => {
  const { quality, helpfulness, timeliness, clarity, wouldRecommend } = req.body ?? {};
  try {
    const rating = await submitRating(req.userId as string, req.params.id, { quality, helpfulness, timeliness, clarity, wouldRecommend });
    res.json(rating);
  } catch (err: any) {
    console.error('Rating submission failed:', err);
    res.status(400).json({ error: err?.message || 'could not submit your rating' });
  }
});

// GET /tutoring-sessions/:id/rating -> TutoringRating | null
router.get('/tutoring-sessions/:id/rating', syncEndpointLimiter, async (req: Request, res: Response) => {
  try {
    const rating = await getRatingForSession(req.userId as string, req.params.id);
    res.json(rating);
  } catch (err: any) {
    console.error('Rating fetch failed:', err);
    res.status(404).json({ error: err?.message || 'not found' });
  }
});

export default router;
