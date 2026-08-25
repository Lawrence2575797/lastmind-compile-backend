import { Router, Request, Response } from 'express';
import { requireAuth, requirePaidTier } from '../services/authMiddleware';
import { syncEndpointLimiter, actionEndpointLimiter } from '../services/rateLimiters';
import { normalizeConceptKey } from '../services/chainService';
import { listPracticeQuestions, submitPracticeAnswer, PracticeQuestionNotFoundError, PracticeQuestionAlreadyAnsweredError } from '../services/practiceQuestionService';

const router = Router();

router.use('/practice-questions', requireAuth, requirePaidTier);

// GET /practice-questions?subject=&topic=&concept= -> PracticeQuestionSummary[]
router.get('/practice-questions', syncEndpointLimiter, async (req: Request, res: Response) => {
  const { subject, topic, concept } = req.query;
  if (typeof subject !== 'string' || !subject || typeof concept !== 'string' || !concept) {
    return res.status(400).json({ error: 'subject and concept are required' });
  }
  const conceptId = normalizeConceptKey(subject, typeof topic === 'string' ? topic : '', concept);
  try {
    const questions = await listPracticeQuestions(conceptId, req.userId as string);
    res.json(questions);
  } catch (err) {
    console.error('Practice questions fetch failed:', err);
    res.status(500).json({ error: 'could not load practice questions' });
  }
});

// POST /practice-questions/:id/submit  { answerText } -> { markAwarded, markTariff, feedback }
router.post('/practice-questions/:id/submit', actionEndpointLimiter, async (req: Request, res: Response) => {
  const { answerText } = req.body ?? {};
  if (typeof answerText !== 'string' || !answerText.trim()) {
    return res.status(400).json({ error: 'answerText is required' });
  }
  try {
    const result = await submitPracticeAnswer(req.userId as string, req.params.id, answerText.trim());
    res.json(result);
  } catch (err) {
    if (err instanceof PracticeQuestionNotFoundError) {
      return res.status(404).json({ error: 'that question no longer exists' });
    }
    if (err instanceof PracticeQuestionAlreadyAnsweredError) {
      return res.status(409).json({ error: 'this question has already been answered', ...err.existing });
    }
    console.error('Practice question submission failed:', err);
    res.status(500).json({ error: 'could not mark your answer' });
  }
});

export default router;
