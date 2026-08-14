import { Router, Request, Response } from 'express';
import { requireAuth } from '../services/authMiddleware';
import { costlyEndpointLimiter } from '../services/rateLimiters';
import { normalizeConceptKey } from '../services/chainService';
import { startRetrievalLesson, continueRetrievalLesson, submitRetrievalAnswer, RetrievalLessonState } from '../services/spacedLessonEngine';

const router = Router();

router.use('/chain-lesson', requireAuth, costlyEndpointLimiter);

// POST /chain-lesson/start  { subject, topic, concept, qualification?, examBoard? }
// Spaced-repetition RETRIEVAL practice for an already-taught concept — no
// prerequisite testing (that already happened at encoding time), just the
// target concept itself, at a scaffolding/interleaving tier derived from
// this student's own current FSRS stability+reps for it. See
// spacedLessonEngine.ts's computeMechanisticReadiness/tierForM. Two-phase
// like /encoding-lesson/start: this returns the first step fast; if
// `contentReady` is false, the frontend must fire /chain-lesson/continue
// in the background before the session can be submitted past that step.
router.post('/chain-lesson/start', async (req: Request, res: Response) => {
  const { subject, topic, concept, qualification, examBoard } = req.body ?? {};
  if (typeof subject !== 'string' || typeof topic !== 'string' || typeof concept !== 'string') {
    return res.status(400).json({ error: 'subject, topic, and concept are all required' });
  }

  try {
    const conceptKey = normalizeConceptKey(subject, topic, concept);
    const result = await startRetrievalLesson(
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
    console.error('Retrieval lesson start failed:', err);
    res.status(500).json({ error: 'could not start this review' });
  }
});

// POST /chain-lesson/continue  { state }
// Only ever called after a /start response came back with
// `contentReady: false` — generates the rest of the session's steps in the
// background while the student answers the first one. Returns the SAME
// state shape with `steps` extended to its full totalSteps length.
router.post('/chain-lesson/continue', async (req: Request, res: Response) => {
  const { state } = req.body ?? {};
  if (!state) {
    return res.status(400).json({ error: 'state is required (from the preceding /chain-lesson/start call)' });
  }

  try {
    const nextState = await continueRetrievalLesson(state as RetrievalLessonState);
    res.json({ state: nextState });
  } catch (err) {
    console.error('Retrieval lesson continuation failed:', err);
    res.status(500).json({ error: 'could not finish generating this review' });
  }
});

// POST /chain-lesson/submit  { state, answer, dontKnow? }
router.post('/chain-lesson/submit', async (req: Request, res: Response) => {
  const { state, answer, dontKnow } = req.body ?? {};
  if (!state) {
    return res.status(400).json({ error: 'state is required (from the previous /chain-lesson/start, /chain-lesson/continue, or /chain-lesson/submit response)' });
  }

  try {
    const result = await submitRetrievalAnswer(req.userId as string, state as RetrievalLessonState, typeof answer === 'string' ? answer : '', !!dontKnow);
    res.json(result);
  } catch (err) {
    console.error('Retrieval lesson answer processing failed:', err);
    res.status(500).json({ error: 'could not process this answer' });
  }
});

export default router;
