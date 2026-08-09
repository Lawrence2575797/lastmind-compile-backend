import { Router, Request, Response } from 'express';
import { requireAuth } from '../services/authMiddleware';
import { costlyEndpointLimiter } from '../services/rateLimiters';
import { normalizeConceptKey } from '../services/chainService';
import { startEncodingLesson, submitEncodingAnswer, checkEncodingDraft, EncodingLessonState } from '../services/encodingLessonService';

const router = Router();

router.use('/encoding-lesson', requireAuth, costlyEndpointLimiter);

// POST /encoding-lesson/start  { subject, topic, concept }
// The first-time lesson for a concept — a novelty hook fact, then a
// Socratic walk forward through its dependency chain. See
// encodingLessonService.ts for the full design.
router.post('/encoding-lesson/start', async (req: Request, res: Response) => {
  const { subject, topic, concept } = req.body ?? {};
  if (typeof subject !== 'string' || typeof topic !== 'string' || typeof concept !== 'string') {
    return res.status(400).json({ error: 'subject, topic, and concept are all required' });
  }

  try {
    const conceptKey = normalizeConceptKey(subject, topic, concept);
    const result = await startEncodingLesson(conceptKey, subject, topic, concept);
    res.json(result);
  } catch (err) {
    console.error('Encoding lesson start failed:', err);
    res.status(500).json({ error: 'could not start the lesson' });
  }
});

// POST /encoding-lesson/submit  { state, answer }
router.post('/encoding-lesson/submit', async (req: Request, res: Response) => {
  const { state, answer } = req.body ?? {};
  if (!state) {
    return res.status(400).json({ error: 'state is required (from the previous /encoding-lesson/start or /encoding-lesson/submit response)' });
  }

  try {
    const result = await submitEncodingAnswer(state as EncodingLessonState, typeof answer === 'string' ? answer : '');
    res.json(result);
  } catch (err) {
    console.error('Encoding lesson answer processing failed:', err);
    res.status(500).json({ error: 'could not process this answer' });
  }
});

// POST /encoding-lesson/check-draft  { nodeLabel, promptText, draft }
// Cheap, frequent — the frontend debounces calls to this while the
// student is still typing, well before they submit.
router.post('/encoding-lesson/check-draft', async (req: Request, res: Response) => {
  const { nodeLabel, promptText, draft } = req.body ?? {};
  if (typeof nodeLabel !== 'string' || typeof promptText !== 'string' || typeof draft !== 'string') {
    return res.status(400).json({ error: 'nodeLabel, promptText, and draft are all required' });
  }

  try {
    const result = await checkEncodingDraft(nodeLabel, promptText, draft);
    res.json(result);
  } catch (err) {
    console.error('Encoding draft check failed:', err);
    res.status(500).json({ error: 'could not check this draft' });
  }
});

export default router;
