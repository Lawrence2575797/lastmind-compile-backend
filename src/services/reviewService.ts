import { supabaseAdmin } from './supabaseAdmin';
import { newCard, gradeReview, rowToCard, cardToRowFields, Rating, Grade, ConceptReviewRow } from './fsrsService';

export const RATING_MAP: Record<string, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

// Shared across every caller that derives an FSRS rating algorithmically
// from lesson/review performance (rather than a student self-rating) —
// see encodingLessonService.ts and spacedLessonEngine.ts's own submit
// handlers for how each maps step-level correctness onto this scale.
export type FsrsRatingKey = 'again' | 'hard' | 'good' | 'easy';

/**
 * Grades one concept through the real FSRS algorithm and persists the
 * updated state for a given user. Also returns the PREVIOUS row (before
 * this grade), since the diagnostic engine needs it for two things: the
 * MASTERED_THRESHOLD skip-check (is this node already solid enough to
 * skip re-testing) and the "was the schedule actually followed" check
 * (comparing when a review was due against when it actually happened).
 */
export async function gradeAndRecordReview(
  userId: string,
  conceptId: string,
  ratingKey: string
): Promise<{ previousRow: ConceptReviewRow | null; newState: ReturnType<typeof cardToRowFields> }> {
  const fsrsRating = RATING_MAP[ratingKey.toLowerCase()];
  if (!fsrsRating) {
    throw new Error(`Invalid rating: ${ratingKey}`);
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

  // Pure audit trail for a future FSRS parameter-optimization pass —
  // concept_reviews only ever holds the LATEST state (this upsert just
  // overwrote it), so without this there is no history of individual
  // review events to fit personalized weights against at all. Logged
  // loudly, not thrown — losing one training-data row must never break a
  // real grading event for the student in front of it; the optimizer this
  // feeds doesn't exist yet, so nothing here is load-bearing today.
  const { error: logError } = await supabaseAdmin
    .from('review_log')
    .insert({
      user_id: userId,
      concept_id: conceptId,
      rating: ratingKey.toLowerCase(),
      elapsed_days: rowFields.elapsed_days,
      stability_before: existingRow?.stability ?? null,
      difficulty_before: existingRow?.difficulty ?? null,
    });
  if (logError) {
    console.error('LastMind: failed to write review_log row (non-fatal, grading itself still succeeded).', logError);
  }

  return { previousRow: existingRow, newState: rowFields };
}

/**
 * Checks whether a concept already has enough real review history to skip
 * re-testing it (the MASTERED_THRESHOLD pre-filter from the diagnostic
 * spec). Deliberately requires BOTH a real stability figure AND at least
 * one prior rep — a single lucky first review can get an artificially
 * confident population-default stability estimate, so stability alone
 * isn't trusted on its own.
 */
export async function getMasteryStatus(userId: string, conceptId: string): Promise<{
  row: ConceptReviewRow | null;
  isMastered: boolean;
  scheduleWasFollowed: boolean | null; // null if there's no prior review to check
}> {
  const { data: row, error } = await supabaseAdmin
    .from('concept_reviews')
    .select('*')
    .eq('user_id', userId)
    .eq('concept_id', conceptId)
    .maybeSingle<ConceptReviewRow>();

  if (error) throw error;
  if (!row) return { row: null, isMastered: false, scheduleWasFollowed: null };

  const MASTERY_STABILITY_THRESHOLD = 30; // days — a real, deliberately conservative bar
  const MIN_REPS_FOR_TRUST = 2; // guards against a single lucky first review
  const isMastered = row.stability >= MASTERY_STABILITY_THRESHOLD && row.reps >= MIN_REPS_FOR_TRUST;

  // Was this review actually done on schedule, or overdue? Compares the
  // gap between when it was due and roughly now (the review happening
  // right now IS the "actual review date" in this context).
  let scheduleWasFollowed: boolean | null = null;
  if (row.last_review) {
    const dueDate = new Date(row.due).getTime();
    const now = Date.now();
    const overdueDays = (now - dueDate) / (1000 * 60 * 60 * 24);
    // A generous grace window — a day or two late is normal life, not
    // "the schedule wasn't followed."
    scheduleWasFollowed = overdueDays <= 2;
  }

  return { row, isMastered, scheduleWasFollowed };
}

function clean(s: string): string {
  return (s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

// Best-effort readable label from a concept_id — concept_id is a known mix
// of raw labels (atomic-path testing) and normalized "subject:topic:concept"
// keys (chain-level tracking), same gap noted throughout this codebase
// (e.g. learn/index.html's own conceptKeyToLabel). Good enough as LLM
// generation context; never shown to the student verbatim.
function conceptIdToLabel(conceptId: string): string {
  const lastSegment = conceptId.split(':').pop() || conceptId;
  return lastSegment.replace(/_/g, ' ');
}

// A concept only "counts" as consolidated enough to interleave with a
// DIFFERENT concept's retrieval practice once its own stability clears this
// floor — otherwise you'd be leaning on something not yet solid to test
// something else, confounding two separate failure signals into one
// question. 14 days is a starting point, not a derived constant.
const INTERLEAVE_STABILITY_FLOOR_DAYS = 14;

/**
 * Other concepts this same student has reviewed, in the same subject+topic
 * scope, that have themselves reached enough stability to safely appear
 * alongside a DIFFERENT concept's own retrieval question — see
 * spacedLessonEngine.ts's tiered interleaving design. Scoped to
 * subject+topic (not the whole subject) so "sibling" means genuinely
 * nearby in the same schema, not just anything the student has ever
 * studied. Only chain-tracked concept_ids (the normalized
 * "subject:topic:concept" form) can be matched this way — an
 * atomic-path-tracked raw-label concept_id has no subject/topic to prefix
 * against, so it's silently excluded rather than mismatched.
 */
export async function listEligibleSiblingConcepts(
  userId: string,
  subject: string,
  topic: string,
  excludeConceptId: string
): Promise<string[]> {
  const prefix = `${clean(subject)}:${clean(topic)}:`;
  const { data, error } = await supabaseAdmin
    .from('concept_reviews')
    .select('concept_id, stability')
    .eq('user_id', userId)
    .ilike('concept_id', `${prefix}%`)
    .gte('stability', INTERLEAVE_STABILITY_FLOOR_DAYS);
  if (error) throw error;
  return (data || [])
    .filter((row) => row.concept_id !== excludeConceptId)
    .map((row) => conceptIdToLabel(row.concept_id));
}
