import { Router, Request, Response } from 'express';
import { requireAuth } from '../services/authMiddleware';
import { costlyEndpointLimiter } from '../services/rateLimiters';
import { normalizeConceptKey } from '../services/chainService';
import { startEncodingLesson, submitEncodingAnswer, generateNotesFromLesson, EncodingLessonState } from '../services/encodingLessonService';

const router = Router();

router.use('/encoding-lesson', requireAuth);

// POST /encoding-lesson/start  { subject, topic, concept, qualification?, examBoard? }
// The first-time lesson for a concept — a novelty hook fact, a
// knowledge-check of its close prerequisites, then deriving the concept
// itself and its implications. See encodingLessonService.ts for the full
// design. qualification/examBoard are optional and only used to bias
// terminology and (rarely) verify a retrieved diagram.
router.post('/encoding-lesson/start', costlyEndpointLimiter, async (req: Request, res: Response) => {
  const { subject, topic, concept, qualification, examBoard } = req.body ?? {};
  if (typeof subject !== 'string' || typeof topic !== 'string' || typeof concept !== 'string') {
    return res.status(400).json({ error: 'subject, topic, and concept are all required' });
  }

  try {
    const conceptKey = normalizeConceptKey(subject, topic, concept);
    const result = await startEncodingLesson(
      conceptKey,
      subject,
      topic,
      concept,
      typeof qualification === 'string' ? qualification : '',
      typeof examBoard === 'string' ? examBoard : ''
    );
    res.json(result);
  } catch (err) {
    console.error('Encoding lesson start failed:', err);
    res.status(500).json({ error: 'could not start the lesson' });
  }
});

// POST /encoding-lesson/submit  { state, answer, dontKnow? }
router.post('/encoding-lesson/submit', costlyEndpointLimiter, async (req: Request, res: Response) => {
  const { state, answer, dontKnow } = req.body ?? {};
  if (!state) {
    return res.status(400).json({ error: 'state is required (from the previous /encoding-lesson/start or /encoding-lesson/submit response)' });
  }

  try {
    const result = await submitEncodingAnswer(req.userId as string, state as EncodingLessonState, typeof answer === 'string' ? answer : '', !!dontKnow);
    res.json(result);
  } catch (err) {
    console.error('Encoding lesson answer processing failed:', err);
    res.status(500).json({ error: 'could not process this answer' });
  }
});

// POST /encoding-lesson/generate-notes  { subject, concept, hookFact, steps }
// Opt-in, triggered by a checkbox at the end of a just-completed encoding
// lesson — compiles what the lesson actually taught into standalone
// revision notes for that page. `steps` is the same array the lesson's
// own /start response returned (label/type/text/checkQuestion per step).
router.post('/encoding-lesson/generate-notes', costlyEndpointLimiter, async (req: Request, res: Response) => {
  const { subject, concept, hookFact, steps } = req.body ?? {};
  if (typeof subject !== 'string' || typeof concept !== 'string' || typeof hookFact !== 'string' || !Array.isArray(steps) || !steps.length) {
    return res.status(400).json({ error: 'subject, concept, hookFact, and a non-empty steps array are all required' });
  }
  const validSteps = steps.every(
    (s) => s && typeof s.label === 'string' && typeof s.type === 'string' && typeof s.text === 'string' && (s.checkQuestion === undefined || typeof s.checkQuestion === 'string')
  );
  if (!validSteps) {
    return res.status(400).json({ error: 'each step requires label, type, text (checkQuestion optional)' });
  }

  try {
    const notes = await generateNotesFromLesson(subject, concept, hookFact, steps);
    res.json({ notes });
  } catch (err) {
    console.error('Encoding lesson notes generation failed:', err);
    res.status(500).json({ error: 'could not generate notes for this lesson' });
  }
});

export default router;
