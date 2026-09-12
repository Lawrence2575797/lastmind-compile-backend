import { Router, Request, Response } from 'express';
import { requireAuth, requirePaidTier } from '../services/authMiddleware';
import { syncEndpointLimiter, actionEndpointLimiter } from '../services/rateLimiters';
import { listUnresolvedCorrections, submitCorrectionAnswer, ExamPrepCorrectionNotFoundError } from '../services/examPrepCorrectionService';

const router = Router();

router.use('/exam-prep-corrections', requireAuth, requirePaidTier);

// GET /exam-prep-corrections -> ExamPrepCorrection[], oldest-first, unresolved only
router.get('/exam-prep-corrections', syncEndpointLimiter, async (req: Request, res: Response) => {
  try {
    const corrections = await listUnresolvedCorrections(req.userId as string);
    res.json(corrections);
  } catch (err) {
    console.error('Exam Prep corrections fetch failed:', err);
    res.status(500).json({ error: 'could not load corrections' });
  }
});

// POST /exam-prep-corrections/:id/submit { answerText } -> { correct, feedback }
router.post('/exam-prep-corrections/:id/submit', actionEndpointLimiter, async (req: Request, res: Response) => {
  const { answerText } = req.body ?? {};
  if (typeof answerText !== 'string' || !answerText.trim()) {
    return res.status(400).json({ error: 'answerText is required' });
  }
  try {
    const result = await submitCorrectionAnswer(req.userId as string, req.params.id, answerText.trim());
    res.json(result);
  } catch (err) {
    if (err instanceof ExamPrepCorrectionNotFoundError) {
      return res.status(404).json({ error: 'that correction no longer exists' });
    }
    console.error('Exam Prep correction submission failed:', err);
    res.status(500).json({ error: 'could not mark your answer' });
  }
});

export default router;
