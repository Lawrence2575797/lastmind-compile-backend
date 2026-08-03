import { Router, Request, Response } from 'express';
import { supabaseAdmin, verifyUser } from '../services/supabaseAdmin';
import { newCard, gradeReview, rowToCard, cardToRowFields, Rating, Grade, ConceptReviewRow } from '../services/fsrsService';

const router = Router();

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

const RATING_MAP: Record<string, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

// POST /review  { conceptId: string, rating: 'again'|'hard'|'good'|'easy' }
// Grades one concept through the real FSRS algorithm and persists the
// updated state. This is meant to be called with a rating already decided
// by the diagnostic tree's own verdict — not a raw student self-rating.
router.post('/review', async (req: Request, res: Response) => {
  const accessToken = extractBearerToken(req);
  if (!accessToken) {
    return res.status(401).json({ error: 'missing bearer token' });
  }

  const { conceptId, rating } = req.body ?? {};
  if (typeof conceptId !== 'string' || !conceptId.trim()) {
    return res.status(400).json({ error: 'conceptId is required' });
  }
  const fsrsRating = RATING_MAP[String(rating).toLowerCase()];
  if (!fsrsRating) {
    return res.status(400).json({ error: "rating must be one of 'again', 'hard', 'good', 'easy'" });
  }

  try {
    const userId = await verifyUser(accessToken);
    if (!userId) {
      return res.status(401).json({ error: 'invalid or expired session' });
    }

    const { data: existingRow, error: fetchError } = await supabaseAdmin
      .from('concept_reviews')
      .select('*')
      .eq('user_id', userId)
      .eq('concept_id', conceptId)
      .maybeSingle<ConceptReviewRow>();

    if (fetchError) throw fetchError;

    const currentCard = existingRow ? rowToCard(existingRow) : newCard();
    const { card: updatedCard } = gradeReview(currentCard, fsrsRating);
    const rowFields = cardToRowFields(updatedCard);

    const { error: upsertError } = await supabaseAdmin
      .from('concept_reviews')
      .upsert(
        { user_id: userId, concept_id: conceptId, ...rowFields, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,concept_id' }
      );

    if (upsertError) throw upsertError;

    res.json({ conceptId, ...rowFields });
  } catch (err) {
    console.error('Review grading failed:', err);
    res.status(500).json({ error: 'could not record this review' });
  }
});

// GET /due  — concept IDs currently due for review for the verified user.
// This is what the (still-placeholder) Generate Questions button will
// eventually call, to know what to actually test rather than picking
// randomly.
router.get('/due', async (req: Request, res: Response) => {
  const accessToken = extractBearerToken(req);
  if (!accessToken) {
    return res.status(401).json({ error: 'missing bearer token' });
  }

  try {
    const userId = await verifyUser(accessToken);
    if (!userId) {
      return res.status(401).json({ error: 'invalid or expired session' });
    }

    const { data, error } = await supabaseAdmin
      .from('concept_reviews')
      .select('concept_id, due, stability, difficulty')
      .eq('user_id', userId)
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
