import { Router, Request, Response } from 'express';
import { requireAuth } from '../services/authMiddleware';
import { syncEndpointLimiter, actionEndpointLimiter } from '../services/rateLimiters';
import { normalizeConceptKey } from '../services/chainService';
import {
  listPracticeQuestions,
  submitPracticeAnswer,
  generateModelAnswer,
  generateAssistance,
  PracticeQuestionNotFoundError,
  PracticeQuestionAlreadyAnsweredError,
} from '../services/practiceQuestionService';

const router = Router();

router.use('/practice-questions', requireAuth);

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

// POST /practice-questions/:id/model-answer -> { modelAnswerText, selfCheck }
// Two real, separately-metered Claude calls (generate, then self-check
// grade) - deliberately not a flat-rate action (see generateModelAnswer's
// own comment), the Locks charge reflects the real combined cost.
router.post('/practice-questions/:id/model-answer', actionEndpointLimiter, async (req: Request, res: Response) => {
  try {
    const result = await generateModelAnswer(req.userId as string, req.params.id);
    res.json(result);
  } catch (err) {
    if (err instanceof PracticeQuestionNotFoundError) {
      return res.status(404).json({ error: 'that question no longer exists' });
    }
    console.error('Model answer generation failed:', err);
    res.status(500).json({ error: 'could not generate a model answer right now' });
  }
});

// POST /practice-questions/:id/assistance  { assistanceTypes: string[] } -> { assistance }
router.post('/practice-questions/:id/assistance', actionEndpointLimiter, async (req: Request, res: Response) => {
  const { assistanceTypes } = req.body ?? {};
  if (!Array.isArray(assistanceTypes) || !assistanceTypes.length) {
    return res.status(400).json({ error: 'at least one assistanceTypes entry is required' });
  }
  try {
    const result = await generateAssistance(req.userId as string, req.params.id, assistanceTypes);
    res.json(result);
  } catch (err) {
    if (err instanceof PracticeQuestionNotFoundError) {
      return res.status(404).json({ error: 'that question no longer exists' });
    }
    console.error('Practice question assistance failed:', err);
    res.status(500).json({ error: 'could not get assistance right now' });
  }
});

export default router;
