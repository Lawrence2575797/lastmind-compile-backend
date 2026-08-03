import { createEmptyCard, fsrs, generatorParameters, Rating, Grade, Card, State } from 'ts-fsrs';

// 92% is the retention target settled on for LastMind — deliberately on
// the higher end of FSRS's typical 85-95% range. The asymmetry: a student
// reviewing slightly more than strictly optimal costs a little time; a
// student whose system let something genuinely decay past recall right
// before a real exam is a much worse failure for a product whose whole
// pitch is "we catch what you don't know."
const params = generatorParameters({
  request_retention: 0.92,
  maximum_interval: 36500, // ~100 years — effectively "no cap", let the algorithm decide
});

const scheduler = fsrs(params);

export { Rating, State };
export type { Card, Grade };

/** A fresh card for a concept node that's never been reviewed before. */
export function newCard(now: Date = new Date()): Card {
  return createEmptyCard(now);
}

/**
 * Runs one graded review through the real FSRS algorithm, returning the
 * updated card state. `rating` must come from the diagnostic tree's own
 * verdict — never a student self-rating (see the diagnosis-to-grade
 * mapping this is meant to be called from):
 *   Encoding failure              -> Rating.Again
 *   Retrieval failure             -> Rating.Hard
 *   Clean pass                    -> Rating.Good or Rating.Easy
 *   Careless slip (once resolved) -> does not affect the concept's own
 *                                    grade at all — a slip is a statement
 *                                    about execution, not about whether
 *                                    the concept itself is known.
 */
export function gradeReview(card: Card, rating: Grade, now: Date = new Date()) {
  return scheduler.next(card, now, rating); // { card: <new state>, log: <review log> }
}

// The shape a concept_reviews row takes in Supabase — timestamps as ISO
// strings (how Postgres/Supabase hands them back), everything else a
// direct mirror of ts-fsrs's own Card fields. Kept as an explicit type
// (rather than trusting `any`) specifically so a field-name mismatch
// against the real installed library fails at `npm run build` time, not
// silently at runtime.
export interface ConceptReviewRow {
  user_id: string;
  concept_id: string;
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  state: number;
  last_review: string | null;
}

export function rowToCard(row: ConceptReviewRow): Card {
  return {
    due: new Date(row.due),
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsed_days,
    scheduled_days: row.scheduled_days,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state as State,
    last_review: row.last_review ? new Date(row.last_review) : undefined,
  } as Card;
}

export function cardToRowFields(card: Card): Omit<ConceptReviewRow, 'user_id' | 'concept_id'> {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state as unknown as number,
    last_review: card.last_review ? new Date(card.last_review).toISOString() : null,
  };
}