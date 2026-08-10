import { Router, Request, Response } from 'express';
import { requireAuth } from '../services/authMiddleware';
import { costlyEndpointLimiter } from '../services/rateLimiters';
import { normalizeConceptKey } from '../services/chainService';
import { startEncodingLesson, submitEncodingAnswer, generateNotesFromLesson, EncodingLessonState } from '../services/encodingLessonService';

const router = Router();

router.use('/encoding-lesson', requireAuth);

// POST /encoding-lesson/start  { subject, topic, concept, qualification?, examBoard?, siblingConcepts? }
// The first-time lesson for a concept — a novelty hook fact, a
// knowledge-check of its close prerequisites, then deriving the concept
// itself and its implications. See encodingLessonService.ts for the full
// design. qualification/examBoard are optional and only used to bias
// terminology and (rarely) verify a retrieved diagram. siblingConcepts is
// the other page titles (+ completion status) in the same folder/subfolder
// — lets a close prerequisite matching one of the student's own
// not-yet-done pages get taught inline instead of assumed already known.
router.post('/encoding-lesson/start', costlyEndpointLimiter, async (req: Request, res: Response) => {
  const { subject, topic, concept, qualification, examBoard, siblingConcepts } = req.body ?? {};
  if (typeof subject !== 'string' || typeof topic !== 'string' || typeof concept !== 'string') {
    return res.status(400).json({ error: 'subject, topic, and concept are all required' });
  }
  const cleanSiblings = Array.isArray(siblingConcepts)
    ? siblingConcepts.filter((s) => s && typeof s.label === 'string').map((s) => ({ label: s.label, done: !!s.done }))
    : [];

  try {
    const conceptKey = normalizeConceptKey(subject, topic, concept);
    const result = await startEncodingLesson(
      conceptKey,
      subject,
      topic,
      concept,
      typeof qualification === 'string' ? qualification : '',
      typeof examBoard === 'string' ? examBoard : '',
      cleanSiblings
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

// POST /encoding-lesson/generate-notes  { subject, pageTitle, lessons: [{ concept, hookFact, steps }] }
// Opt-in, triggered by a checkbox once a page's encoding lesson(s) are
// complete — compiles what was actually taught into standalone revision
// notes for that page. `lessons` is one entry per concept the page covers
// (a single-lesson page sends an array of one); each entry's `steps` is
// the same array that concept's own /start response returned
// (label/type/text/checkQuestion per step).
router.post('/encoding-lesson/generate-notes', costlyEndpointLimiter, async (req: Request, res: Response) => {
  const { subject, pageTitle, lessons } = req.body ?? {};
  if (typeof subject !== 'string' || typeof pageTitle !== 'string' || !Array.isArray(lessons) || !lessons.length) {
    return res.status(400).json({ error: 'subject, pageTitle, and a non-empty lessons array are all required' });
  }
  const validLessons = lessons.every(
    (l) =>
      l &&
      typeof l.concept === 'string' &&
      typeof l.hookFact === 'string' &&
      Array.isArray(l.steps) &&
      l.steps.length &&
      l.steps.every(
        (s: any) => s && typeof s.label === 'string' && typeof s.type === 'string' && typeof s.text === 'string' && (s.checkQuestion === undefined || typeof s.checkQuestion === 'string')
      )
  );
  if (!validLessons) {
    return res.status(400).json({ error: 'each lesson requires concept, hookFact, and a non-empty steps array (each step needs label, type, text, optional checkQuestion)' });
  }

  try {
    const notes = await generateNotesFromLesson(subject, pageTitle, lessons);
    res.json({ notes });
  } catch (err) {
    console.error('Encoding lesson notes generation failed:', err);
    res.status(500).json({ error: 'could not generate notes for this lesson' });
  }
});

export default router;
