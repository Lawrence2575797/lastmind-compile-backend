import { Router, Request, Response } from 'express';
import { requireAuth } from '../services/authMiddleware';
import { costlyEndpointLimiter } from '../services/rateLimiters';
import { normalizeConceptKey } from '../services/chainService';
import { startChainLesson, processChainLessonAnswer, ChainLessonState } from '../services/spacedLessonEngine';

const router = Router();

router.use('/chain-lesson', requireAuth, costlyEndpointLimiter);

// POST /chain-lesson/start  { subject, topic, concept, qualification?, examBoard? }
// Begins a scaffold-then-chunk lesson session for a chain — the multi-day
// counterpart to the reactive diagnostic engine. Chunking granularity is
// read from chain_lesson_progress automatically, based on how many times
// this chain's lesson has been completed before.
router.post('/chain-lesson/start', async (req: Request, res: Response) => {
  const { subject, topic, concept, qualification, examBoard } = req.body ?? {};
  if (typeof subject !== 'string' || typeof topic !== 'string' || typeof concept !== 'string') {
    return res.status(400).json({ error: 'subject, topic, and concept are all required' });
  }

  try {
    const conceptKey = normalizeConceptKey(subject, topic, concept);
    const result = await startChainLesson(
      req.userId as string,
      conceptKey,
      subject,
      topic,
      concept,
      typeof qualification === 'string' ? qualification : '',
      typeof examBoard === 'string' ? examBoard : ''
    );
    res.json(result);
  } catch (err) {
    console.error('Chain lesson start failed:', err);
    res.status(500).json({ error: 'could not start the chain lesson' });
  }
});

// POST /chain-lesson/submit  { state, answer }
router.post('/chain-lesson/submit', async (req: Request, res: Response) => {
  const { state, answer } = req.body ?? {};
  if (!state) {
    return res.status(400).json({ error: 'state is required (from the previous /chain-lesson/start or /chain-lesson/submit response)' });
  }

  try {
    const result = await processChainLessonAnswer(req.userId as string, state as ChainLessonState, typeof answer === 'string' ? answer : '');
    res.json(result);
  } catch (err) {
    console.error('Chain lesson answer processing failed:', err);
    res.status(500).json({ error: 'could not process this answer' });
  }
});

export default router;
