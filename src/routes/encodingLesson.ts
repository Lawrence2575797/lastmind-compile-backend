import { Router, Request, Response } from 'express';
import { requireAuth } from '../services/authMiddleware';
import { costlyEndpointLimiter } from '../services/rateLimiters';
import { normalizeConceptKey } from '../services/chainService';
import { startEncodingLesson, continueEncodingLesson, submitEncodingAnswer, generateNotesFromLesson, getEncodingLessonOutline, answerLessonQuestion, EncodingLessonState } from '../services/encodingLessonService';

const router = Router();

router.use('/encoding-lesson', requireAuth);

// POST /encoding-lesson/outline  { subject, topic, concept, qualification?, examBoard?, customTitle?, customDescription? }
// -> { targetLabel, groundingKnowledge: [{nodeId,label}], recruitedKnowledge: [{nodeId,label}] }
// Shown before the lesson itself starts generating — lets the student see
// what the lesson assumes/will check and flag anything they're not
// actually confident about, before the lesson leans on it. Cheap: only
// reads/generates the dependency graph (already independently cached),
// never touches lesson content. The returned node ids are exactly what a
// following /encoding-lesson/start call's own selfReportedUnsureNodeIds
// should contain — same cached chain, same ids.
router.post('/encoding-lesson/outline', costlyEndpointLimiter, async (req: Request, res: Response) => {
  const { subject, topic, concept, qualification, examBoard, customTitle, customDescription } = req.body ?? {};
  if (typeof subject !== 'string' || typeof topic !== 'string' || typeof concept !== 'string') {
    return res.status(400).json({ error: 'subject, topic, and concept are all required' });
  }
  try {
    const conceptKey = normalizeConceptKey(subject, topic, concept);
    const outline = await getEncodingLessonOutline(
      req.userId as string,
      conceptKey,
      subject,
      topic,
      concept,
      typeof qualification === 'string' ? qualification : '',
      typeof examBoard === 'string' ? examBoard : '',
      typeof customTitle === 'string' ? customTitle : '',
      typeof customDescription === 'string' ? customDescription : ''
    );
    res.json(outline);
  } catch (err) {
    console.error('Encoding lesson outline failed:', err);
    res.status(500).json({ error: 'could not prepare this lesson\'s outline' });
  }
});

// POST /encoding-lesson/start  { subject, topic, concept, qualification?, examBoard?, siblingConcepts?, customTitle?, customDescription?, selfReportedUnsureNodeIds? }
// The first-time lesson for a concept — a novelty hook fact, a
// knowledge-check of its close prerequisites, then deriving the concept
// itself and its implications. See encodingLessonService.ts for the full
// design. qualification/examBoard are optional and only used to bias
// terminology and (rarely) verify a retrieved diagram. siblingConcepts is
// the other page titles (+ completion status) in the same folder/subfolder
// — lets a close prerequisite matching one of the student's own
// not-yet-done pages get taught inline instead of assumed already known.
// customTitle/customDescription are set only for a self-directed "Other"
// folder (no formal qualification) — see chainService.ts's
// customContextDigest — and carried forward through the returned state's
// own customTitle/customDescription fields, so /continue doesn't need them
// resent. selfReportedUnsureNodeIds is the outline-step checklist result
// (see /encoding-lesson/outline) — node ids the student flagged as not
// actually confident about, folded into forceTeach alongside the existing
// unfinished-sibling/technique signals. Optional — omitting it (the
// outline step is skippable, e.g. when it returned nothing to assess)
// behaves exactly as before this existed.
router.post('/encoding-lesson/start', costlyEndpointLimiter, async (req: Request, res: Response) => {
  const { subject, topic, concept, qualification, examBoard, siblingConcepts, customTitle, customDescription, selfReportedUnsureNodeIds } = req.body ?? {};
  if (typeof subject !== 'string' || typeof topic !== 'string' || typeof concept !== 'string') {
    return res.status(400).json({ error: 'subject, topic, and concept are all required' });
  }
  const cleanSiblings = Array.isArray(siblingConcepts)
    ? siblingConcepts.filter((s) => s && typeof s.label === 'string').map((s) => ({ label: s.label, done: !!s.done }))
    : [];
  const cleanUnsureIds = Array.isArray(selfReportedUnsureNodeIds)
    ? selfReportedUnsureNodeIds.filter((id) => typeof id === 'string')
    : [];

  try {
    const conceptKey = normalizeConceptKey(subject, topic, concept);
    const result = await startEncodingLesson(
      req.userId as string,
      conceptKey,
      subject,
      topic,
      concept,
      typeof qualification === 'string' ? qualification : '',
      typeof examBoard === 'string' ? examBoard : '',
      cleanSiblings,
      typeof customTitle === 'string' ? customTitle : '',
      typeof customDescription === 'string' ? customDescription : '',
      cleanUnsureIds
    );
    res.json(result);
  } catch (err) {
    console.error('Encoding lesson start failed:', err);
    res.status(500).json({ error: 'could not start the lesson' });
  }
});

// POST /encoding-lesson/continue  { state, topic, concept, siblingConcepts? }
// Only ever called after a /start response came back with
// `contentReady: false` — fired by the frontend the moment the first step
// is on screen, generating and caching the rest of the lesson in the
// background while the student answers that first step. `state` is the
// exact state object /start returned (carries conceptKey/subject/
// qualification/examBoard/contentKey); `topic`/`concept`/`siblingConcepts`
// are the same values the original /start call used, needed again here to
// regenerate the same close-prerequisite/background-context split. Returns
// the SAME state shape with `steps` now holding the complete lesson — the
// frontend should merge this into its local state before calling
// /encoding-lesson/submit.
router.post('/encoding-lesson/continue', costlyEndpointLimiter, async (req: Request, res: Response) => {
  const { state, topic, concept, siblingConcepts } = req.body ?? {};
  if (!state || typeof topic !== 'string' || typeof concept !== 'string') {
    return res.status(400).json({ error: 'state, topic, and concept are all required (from the preceding /encoding-lesson/start call)' });
  }
  const cleanSiblings = Array.isArray(siblingConcepts)
    ? siblingConcepts.filter((s) => s && typeof s.label === 'string').map((s) => ({ label: s.label, done: !!s.done }))
    : [];

  try {
    const nextState = await continueEncodingLesson(req.userId as string, state as EncodingLessonState, topic, concept, cleanSiblings);
    res.json({ state: nextState });
  } catch (err) {
    console.error('Encoding lesson continuation failed:', err);
    res.status(500).json({ error: 'could not continue generating this lesson' });
  }
});

// POST /encoding-lesson/submit  { state, answer, dontKnow?, bypass? }
// `bypass` is the student-facing "skip this — the question/grading seems
// broken" escape hatch — skips grading entirely and advances exactly as a
// clean pass would (no penalty, no FSRS drag), for the rare case where the
// system itself, not the student's understanding, is what's actually stuck.
router.post('/encoding-lesson/submit', costlyEndpointLimiter, async (req: Request, res: Response) => {
  const { state, answer, dontKnow, bypass } = req.body ?? {};
  if (!state) {
    return res.status(400).json({ error: 'state is required (from the previous /encoding-lesson/start or /encoding-lesson/submit response)' });
  }

  try {
    const result = await submitEncodingAnswer(req.userId as string, state as EncodingLessonState, typeof answer === 'string' ? answer : '', !!dontKnow, !!bypass);
    res.json(result);
  } catch (err) {
    console.error('Encoding lesson answer processing failed:', err);
    res.status(500).json({ error: 'could not process this answer' });
  }
});

// POST /encoding-lesson/ask  { state, question }
// The "ask a question" side panel shown alongside an in-progress
// first-time encoding lesson — a place for genuine curiosity without
// derailing the lesson's own flow (see ASK_PANEL_PROMPT). Purely
// advisory: `state` is read-only here (only used to see which step is
// CURRENTLY pending, so the answer can avoid handing that one away) —
// nothing is graded, nothing touches FSRS or forceTeach, and no state is
// returned, since none of it changed.
router.post('/encoding-lesson/ask', costlyEndpointLimiter, async (req: Request, res: Response) => {
  const { state, question } = req.body ?? {};
  if (!state || typeof question !== 'string' || !question.trim()) {
    return res.status(400).json({ error: 'state and a non-empty question are both required' });
  }

  try {
    const result = await answerLessonQuestion(state as EncodingLessonState, question.trim());
    res.json(result);
  } catch (err) {
    console.error('Encoding lesson ask-panel question failed:', err);
    res.status(500).json({ error: 'could not answer that right now' });
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
