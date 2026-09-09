import { Router, Request, Response } from 'express';
import { requireAuth } from '../services/authMiddleware';
import { costlyEndpointLimiter, actionEndpointLimiter } from '../services/rateLimiters';
import { classifySubjectTitle, planObjectiveCourse } from '../services/objectiveCourseService';

const router = Router();

// POST /classify-subject-title { title } -> { isLanguage: boolean }
// Fired once when a student leaves the +Other folder's title field, to
// decide whether to reveal the "Full course" vs "Crash course" choice at
// all - see learn/index.html's openCustomFolderModal.
router.post('/classify-subject-title', requireAuth, actionEndpointLimiter, async (req: Request, res: Response) => {
  const { title } = req.body ?? {};
  if (typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'title is required' });
  }
  try {
    const isLanguage = await classifySubjectTitle(title.trim(), req.userId as string);
    res.json({ isLanguage });
  } catch (err) {
    console.error('LastMind: classify-subject-title failed.', err);
    res.status(500).json({ error: 'Could not classify subject title.' });
  }
});

// POST /objective-course/plan { subject, goalAndPace } ->
// { nodeIds, estimatedLessons, estimatedDays, goal, minutesPerDay }
// Plans a goal-scoped crash course over an already-generated language
// knowledge map - see objectiveCourseService.ts. Nothing is persisted
// here; the frontend shows this as a confirmation before creating the
// folder with an objectiveScope.
router.post('/objective-course/plan', requireAuth, costlyEndpointLimiter, async (req: Request, res: Response) => {
  const { subject, goalAndPace } = req.body ?? {};
  if (typeof subject !== 'string' || !subject.trim()) {
    return res.status(400).json({ error: 'subject is required' });
  }
  if (typeof goalAndPace !== 'string' || !goalAndPace.trim()) {
    return res.status(400).json({ error: 'goalAndPace is required' });
  }
  try {
    const plan = await planObjectiveCourse(req.userId as string, subject.trim(), goalAndPace.trim());
    res.json(plan);
  } catch (err) {
    console.error('LastMind: objective-course/plan failed.', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Could not plan objective course.' });
  }
});

export default router;
