import { Router, Request, Response } from 'express';
import { requireAuth, requirePaidTier } from '../services/authMiddleware';
import { syncEndpointLimiter, costlyEndpointLimiter } from '../services/rateLimiters';
import {
  getAvailableTypes,
  generateSpecLessonPracticeQuestion,
  SpecLessonNotFoundError,
  QuestionTypeNotFoundError,
  PicksExhaustedError,
  TypeAlreadyPickedError,
} from '../services/specLessonPracticeService';

const router = Router();

router.use('/spec-lesson-practice', requireAuth, requirePaidTier);

// GET /spec-lesson-practice/:conceptId/available-types -> AvailableTypesResult
// The shrinking pick-list for this (student, spec-lesson) - see
// specLessonPracticeService.ts's MAX_PICKS_PER_SPEC_LESSON.
router.get('/spec-lesson-practice/:conceptId/available-types', syncEndpointLimiter, async (req: Request, res: Response) => {
  try {
    const result = await getAvailableTypes(req.userId as string, req.params.conceptId);
    res.json(result);
  } catch (err) {
    if (err instanceof SpecLessonNotFoundError) {
      return res.status(404).json({ error: 'that spec-lesson could not be found' });
    }
    console.error('Spec lesson available-types fetch failed:', err);
    res.status(500).json({ error: 'could not load available question types' });
  }
});

// POST /spec-lesson-practice/:conceptId/generate  { typeKey } -> PracticeQuestionSummary
// A real, live, metered generation call (see callJSON's userId param) -
// costlyEndpointLimiter, same tier as the other generation-triggering
// routes (encoding-lesson/start etc).
router.post('/spec-lesson-practice/:conceptId/generate', costlyEndpointLimiter, async (req: Request, res: Response) => {
  const { typeKey } = req.body ?? {};
  if (typeof typeKey !== 'string' || !typeKey) {
    return res.status(400).json({ error: 'typeKey is required' });
  }
  try {
    const question = await generateSpecLessonPracticeQuestion(req.userId as string, req.params.conceptId, typeKey);
    res.json(question);
  } catch (err) {
    if (err instanceof SpecLessonNotFoundError) {
      return res.status(404).json({ error: 'that spec-lesson could not be found' });
    }
    if (err instanceof QuestionTypeNotFoundError) {
      return res.status(404).json({ error: 'that question type is not available for this subject' });
    }
    if (err instanceof PicksExhaustedError) {
      return res.status(409).json({ error: 'all 3 questions for this lesson have already been picked', code: 'PICKS_EXHAUSTED' });
    }
    if (err instanceof TypeAlreadyPickedError) {
      return res.status(409).json({ error: 'this question type has already been picked for this lesson', code: 'TYPE_ALREADY_PICKED' });
    }
    console.error('Spec lesson practice question generation failed:', err);
    res.status(500).json({ error: 'could not generate this question' });
  }
});

export default router;
