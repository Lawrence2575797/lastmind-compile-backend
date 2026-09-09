import { Router, Request, Response } from 'express';
import { requireAuth } from '../services/authMiddleware';
import { syncEndpointLimiter } from '../services/rateLimiters';
import { getStoredLessonPlan, getSpecLessonTree } from '../services/chainService';

const router = Router();

router.use('/spec-lesson-plan', requireAuth);
router.use('/spec-lesson-tree', requireAuth);

// GET /spec-lesson-plan?subject=&qualification=&examBoard= -> { subtopics: StoredLessonPlanSubtopic[] | null }
// Lets the frontend build a folder's subfolder/page structure directly from
// spec_lesson_plans at folder-creation time, with no AI call involved.
router.get('/spec-lesson-plan', syncEndpointLimiter, async (req: Request, res: Response) => {
  const { subject, qualification, examBoard } = req.query;
  if (typeof subject !== 'string' || !subject || typeof qualification !== 'string' || !qualification) {
    return res.status(400).json({ error: 'subject and qualification are required' });
  }
  try {
    const subtopics = await getStoredLessonPlan(subject, qualification, typeof examBoard === 'string' ? examBoard : '');
    res.json({ subtopics });
  } catch (err) {
    console.error('Stored lesson plan fetch failed:', err);
    res.status(500).json({ error: 'could not load stored lesson plan' });
  }
});

// GET /spec-lesson-tree?subject=&qualification=&examBoard= -> { themes: SpecLessonTreeTheme[] | null }
// The real Theme -> Subtopic -> spec-lesson hierarchy for the standalone
// Practice Questions page's own sidebar - one level deeper than
// /spec-lesson-plan above. themes is null when nothing's seeded yet for
// this subject/board (e.g. a subject before its own spec_lesson_plans
// seed exists) - the frontend renders a "not set up yet" state for that.
router.get('/spec-lesson-tree', syncEndpointLimiter, async (req: Request, res: Response) => {
  const { subject, qualification, examBoard } = req.query;
  if (typeof subject !== 'string' || !subject || typeof qualification !== 'string' || !qualification) {
    return res.status(400).json({ error: 'subject and qualification are required' });
  }
  try {
    const themes = await getSpecLessonTree(subject, qualification, typeof examBoard === 'string' ? examBoard : '');
    res.json({ themes });
  } catch (err) {
    console.error('Spec lesson tree fetch failed:', err);
    res.status(500).json({ error: 'could not load the spec lesson tree' });
  }
});

export default router;
