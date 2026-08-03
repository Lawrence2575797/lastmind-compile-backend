import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../services/supabaseAdmin';
import { requireAuth } from '../services/authMiddleware';
import { gradeAndRecordReview } from '../services/reviewService';

const router = Router();

// POST /review  { conceptId: string, rating: 'again'|'hard'|'good'|'easy' }
// Grades one concept through the real FSRS algorithm and persists the
// updated state. This is meant to be called with a rating already decided
// by the diagnostic tree's own verdict — not a raw student self-rating.
router.post('/review', requireAuth, async (req: Request, res: Response) => {
  const { conceptId, rating } = req.body ?? {};
  if (typeof conceptId !== 'string' || !conceptId.trim() || typeof rating !== 'string') {
    return res.status(400).json({ error: "conceptId and rating ('again'|'hard'|'good'|'easy') are both required" });
  }

  try {
    const { newState } = await gradeAndRecordReview(req.userId as string, conceptId, rating);
    res.json({ conceptId, ...newState });
  } catch (err) {
    console.error('Review grading failed:', err);
    res.status(500).json({ error: 'could not record this review' });
  }
});

// GET /due  — concept IDs currently due for review for the verified user.
router.get('/due', requireAuth, async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('concept_reviews')
      .select('concept_id, due, stability, difficulty')
      .eq('user_id', req.userId as string)
      .lte('due', new Date().toISOString())
      .order('due', { ascending: true });

    if (error) throw error;

    res.json({ due: data || [] });
  } catch (err) {
    console.error('Fetching due concepts failed:', err);
    res.status(500).json({ error: 'could not fetch due concepts' });
  }
});

export default router;
