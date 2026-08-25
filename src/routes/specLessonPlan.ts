import { Router, Request, Response } from 'express';
import { requireAuth } from '../services/authMiddleware';
import { syncEndpointLimiter } from '../services/rateLimiters';
import { getStoredLessonPlan } from '../services/chainService';

const router = Router();

router.use('/spec-lesson-plan', requireAuth);

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

export default router;
