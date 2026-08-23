import { Router, Request, Response } from 'express';
import { requireAuth, requirePaidTier } from '../services/authMiddleware';
import { syncEndpointLimiter, actionEndpointLimiter } from '../services/rateLimiters';
import {
  createMultiHelperHelpRequest,
  prepareCustomConceptId,
  listEligibleTutorsForBrowsing,
  getHelpRequest,
  sweepExpiredHelpRequests,
} from '../services/peerTutoringMatchService';
import { getNotificationCounts } from '../services/tutoringSessionService';

const router = Router();

router.use('/peer-tutoring', requireAuth, requirePaidTier);

// GET /peer-tutoring/browse-tutors?conceptId=&subject= -> TutorBrowseCard[]
router.get('/peer-tutoring/browse-tutors', syncEndpointLimiter, async (req: Request, res: Response) => {
  const conceptId = typeof req.query.conceptId === 'string' ? req.query.conceptId : '';
  const subject = typeof req.query.subject === 'string' ? req.query.subject : '';
  if (!conceptId.trim() || !subject.trim()) {
    return res.status(400).json({ error: 'conceptId and subject are required' });
  }
  try {
    const tutors = await listEligibleTutorsForBrowsing(req.userId as string, conceptId, subject);
    res.json(tutors);
  } catch (err: any) {
    console.error('Browse-tutors fetch failed:', err);
    res.status(500).json({ error: 'could not load tutors for this' });
  }
});

// POST /peer-tutoring/prepare-custom-concept  { subject, topic?, concept }
// The "add your own" path — filters/normalizes the structured fields and
// returns the resulting conceptId/label WITHOUT creating a help request;
// the frontend opens Browse Tutors with the result (see
// prepareCustomConceptId's own comment for why request-creation is
// deferred until tutors are actually picked).
router.post('/peer-tutoring/prepare-custom-concept', actionEndpointLimiter, async (req: Request, res: Response) => {
  const { subject, topic, concept } = req.body ?? {};
  if (typeof subject !== 'string' || typeof concept !== 'string') {
    return res.status(400).json({ error: 'subject and concept (strings) are required' });
  }
  try {
    const prepared = await prepareCustomConceptId(subject, topic || '', concept);
    res.json(prepared);
  } catch (err: any) {
    console.error('Prepare-custom-concept failed:', err);
    res.status(400).json({ error: err?.message || 'could not prepare that request' });
  }
});

// POST /peer-tutoring/help-requests  { conceptId, subject, topic?, helperIds, questionText?, answerText? }
// Creates the request AND one session per chosen (re-verified) tutor — see
// createMultiHelperHelpRequest. First one to actually submit wins; see
// tutoringResponseService.ts's submitResponse for the resolution.
// questionText/answerText, given TOGETHER, switch this from the default
// "misconception" activity to the "get an answer marked" one — see
// createMultiHelperHelpRequest's own comment for exactly what that changes
// (pricing tier, PII filtering, delayed release).
router.post('/peer-tutoring/help-requests', actionEndpointLimiter, async (req: Request, res: Response) => {
  const { conceptId, subject, topic, helperIds, questionText, answerText } = req.body ?? {};
  if (typeof conceptId !== 'string' || !conceptId.trim()) {
    return res.status(400).json({ error: 'conceptId (string) is required' });
  }
  if (typeof subject !== 'string' || !subject.trim()) {
    return res.status(400).json({ error: 'subject (string) is required' });
  }
  if (!Array.isArray(helperIds) || !helperIds.every((id) => typeof id === 'string')) {
    return res.status(400).json({ error: 'helperIds (string array) is required' });
  }
  const wantsMarking = questionText !== undefined || answerText !== undefined;
  if (wantsMarking && (typeof questionText !== 'string' || !questionText.trim() || typeof answerText !== 'string' || !answerText.trim())) {
    return res.status(400).json({ error: 'questionText and answerText (strings) are both required for a marking request' });
  }
  try {
    const result = await createMultiHelperHelpRequest(
      req.userId as string,
      conceptId,
      subject,
      topic ?? null,
      helperIds,
      wantsMarking ? { questionText, answerText } : undefined
    );
    res.json(result);
  } catch (err: any) {
    console.error('Help request creation failed:', err);
    res.status(400).json({ error: err?.message || 'could not create your help request' });
  }
});

// GET /peer-tutoring/help-requests/:id
router.get('/peer-tutoring/help-requests/:id', syncEndpointLimiter, async (req: Request, res: Response) => {
  try {
    const helpRequest = await getHelpRequest(req.userId as string, req.params.id);
    if (!helpRequest) return res.status(404).json({ error: 'help request not found' });
    res.json(helpRequest);
  } catch (err) {
    console.error('Help request fetch failed:', err);
    res.status(500).json({ error: 'could not load your help request' });
  }
});

// GET /peer-tutoring/notifications -> { needsResponseCount, availableCount, total }
// Sweeps expired requests first, same as GET /tutoring-sessions — the
// topbar badge is checked on load/focus (see learn/index.html), so it's as
// good a trigger for the lazy sweep as any other read.
router.get('/peer-tutoring/notifications', syncEndpointLimiter, async (req: Request, res: Response) => {
  try {
    await sweepExpiredHelpRequests();
    const counts = await getNotificationCounts(req.userId as string);
    res.json(counts);
  } catch (err) {
    console.error('Notification count fetch failed:', err);
    res.status(500).json({ error: 'could not load your notifications' });
  }
});

export default router;
