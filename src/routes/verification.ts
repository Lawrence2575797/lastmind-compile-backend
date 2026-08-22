import { Router, Request, Response } from 'express';
import { requireAuth } from '../services/authMiddleware';
import { actionEndpointLimiter } from '../services/rateLimiters';
import {
  startVerificationAttempt,
  gradeVerificationAnswer,
  resolveUnclear,
  gradeStructuredFollowUpWithFsrs,
  StructuredFollowUp,
} from '../services/verificationLessonService';

const router = Router();

// Deliberately no paid-tier check anywhere in this router — this is the one
// thing the free tier is meant to be able to do.
router.use('/verification', requireAuth);

// POST /verification/start  { subject, topic?, concept, qualification?, examBoard?, customTitle?, customDescription? }
router.post('/verification/start', actionEndpointLimiter, async (req: Request, res: Response) => {
  const { subject, topic, concept, qualification, examBoard, customTitle, customDescription } = req.body ?? {};
  if (typeof subject !== 'string' || !subject.trim() || typeof concept !== 'string' || !concept.trim()) {
    return res.status(400).json({ error: 'subject and concept (strings) are required' });
  }
  try {
    const result = await startVerificationAttempt(
      req.userId as string,
      subject,
      topic || '',
      concept,
      qualification || '',
      examBoard || '',
      customTitle || '',
      customDescription || ''
    );
    res.json(result);
  } catch (err: any) {
    console.error('Verification start failed:', err);
    res.status(500).json({ error: err?.message || 'could not start verification' });
  }
});

// POST /verification/submit  { concept, conceptId, rubricKey, scenario: {context, startPoint, endPointVariable}, answer }
router.post('/verification/submit', actionEndpointLimiter, async (req: Request, res: Response) => {
  const { concept, conceptId, rubricKey, scenario, answer } = req.body ?? {};
  if ([concept, conceptId, rubricKey, answer].some((v) => typeof v !== 'string' || !v.trim())) {
    return res.status(400).json({ error: 'concept, conceptId, rubricKey, and answer (strings) are all required' });
  }
  if (!scenario || typeof scenario.startPoint !== 'string' || typeof scenario.endPointVariable !== 'string') {
    return res.status(400).json({ error: 'scenario ({context, startPoint, endPointVariable}) is required' });
  }
  try {
    const result = await gradeVerificationAnswer(req.userId as string, concept, conceptId, rubricKey, scenario, answer);
    res.json(result);
  } catch (err: any) {
    console.error('Verification submit failed:', err);
    res.status(500).json({ error: err?.message || 'could not grade your answer' });
  }
});

// POST /verification/resolve-unclear  { concept, conceptId, rubricKey, unclearReason, knowsIt }
router.post('/verification/resolve-unclear', actionEndpointLimiter, async (req: Request, res: Response) => {
  const { concept, conceptId, rubricKey, unclearReason, knowsIt } = req.body ?? {};
  if ([concept, conceptId, rubricKey, unclearReason].some((v) => typeof v !== 'string' || !v.trim()) || typeof knowsIt !== 'boolean') {
    return res.status(400).json({ error: 'concept, conceptId, rubricKey, unclearReason (strings) and knowsIt (boolean) are all required' });
  }
  try {
    const result = await resolveUnclear(req.userId as string, concept, conceptId, rubricKey, unclearReason, knowsIt);
    res.json(result);
  } catch (err: any) {
    console.error('Verification resolve-unclear failed:', err);
    res.status(500).json({ error: err?.message || 'could not resolve that' });
  }
});

// POST /verification/submit-followup  { followUp, submittedAnswer, conceptId }
// The follow-up is now the ONE grading moment for every path that reaches
// it (an outright-wrong free-text answer, or either branch of the unclear
// self-report) — a wrong-then-corrected attempt should still count as a
// genuine pass, so nothing grades 'again' until/unless the follow-up is
// wrong too. See gradeStructuredFollowUpWithFsrs's own comment. The plain
// "correct on the first try" free-text path never reaches this endpoint at
// all — it already graded immediately and has no follow-up.
router.post('/verification/submit-followup', actionEndpointLimiter, async (req: Request, res: Response) => {
  const { followUp, submittedAnswer, conceptId } = req.body ?? {};
  if (!followUp || (followUp.type !== 'fill_gap' && followUp.type !== 'order_words')) {
    return res.status(400).json({ error: 'a valid followUp object is required' });
  }
  if (typeof conceptId !== 'string' || !conceptId.trim()) {
    return res.status(400).json({ error: 'conceptId (string) is required' });
  }
  try {
    const result = await gradeStructuredFollowUpWithFsrs(req.userId as string, conceptId, followUp as StructuredFollowUp, submittedAnswer);
    res.json(result);
  } catch (err: any) {
    console.error('Verification follow-up grading failed:', err);
    res.status(400).json({ error: err?.message || 'could not grade that' });
  }
});

export default router;
