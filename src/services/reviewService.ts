import { supabaseAdmin } from './supabaseAdmin';
import { newCard, gradeReview, rowToCard, cardToRowFields, Rating, Grade, ConceptReviewRow } from './fsrsService';

// concept_reviews columns that exist alongside the FSRS Card fields but
// aren't part of the Card model itself (see the "successive relearning"
// section below) — kept as a separate extension rather than folded into
// ConceptReviewRow/fsrsService.ts, since that interface deliberately
// mirrors the FSRS Card 1:1.
interface ConceptReviewRowExt extends ConceptReviewRow {
  spaced_success_count: number;
  last_spaced_success_date: string | null;
}

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

// Grace window (days, either direction) for treating a review as "on
// schedule" — same magnitude as getMasteryStatus's own overdue check
// below, applied symmetrically here (early OR late) since an off-schedule
// success in EITHER direction is an uninformative test of durability, not
// just a late one. Not derived from the successive-relearning literature
// itself (there's no universal number there) — a product tuning knob,
// deliberately reusing the one grace figure already established in this
// file rather than inventing a second one.
const SPACED_SUCCESS_GRACE_DAYS = 2;

// How many genuinely spaced-and-on-schedule correct answers count as
// "durably" relearned — the criterion successive-relearning studies
// (Rawson & Dunlosky) commonly design around: practising to a criterion of
// correct recalls across several SEPARATE sessions produces measurably
// better long-term retention than the same total correct count crammed
// into one sitting. This is a genuinely stricter, additional signal on
// top of the existing MASTERY_STABILITY_THRESHOLD/MIN_REPS_FOR_TRUST bar
// below — not a replacement for it, and not a replacement for FSRS's own
// scheduling (see computeSpacedSuccessUpdate's own comment).
export const DURABLE_RELEARNING_CRITERION = 3;

/**
 * Decides whether THIS grading event counts toward the successive-
 * relearning criterion. FSRS still owns WHEN a concept is due — this only
 * judges whether a correct answer actually happened at roughly its
 * correctly-spaced time, on a day distinct from the last one already
 * counted. Three-way outcome, not just increment/no-op:
 * - A genuine miss (again/hard) resets the count to 0 — real evidence
 *   the concept isn't durable yet, the same way a wrong answer is
 *   informative everywhere else FSRS-adjacent state lives in this app.
 * - A correct answer that's ON schedule (within the grace window of its
 *   own due date) AND on a new calendar day increments the count.
 * - A correct answer that's off-schedule (tested too early to be a real
 *   test of spacing, or too late) or on the SAME day as an already-
 *   counted success is neutral — not evidence of forgetting, so no
 *   reset, but not a fresh spaced success either, so no increment.
 * The very first review of a concept (no existingRow) has no due date to
 * test against by definition, so it's neutral too.
 */
function computeSpacedSuccessUpdate(
  existingRow: ConceptReviewRowExt | null,
  fsrsRating: Grade,
  now: Date
): { spaced_success_count: number; last_spaced_success_date: string | null } {
  const priorCount = existingRow?.spaced_success_count ?? 0;
  const priorDate = existingRow?.last_spaced_success_date ?? null;

  if (fsrsRating === Rating.Again || fsrsRating === Rating.Hard) {
    return { spaced_success_count: 0, last_spaced_success_date: null };
  }
  if (!existingRow) {
    return { spaced_success_count: priorCount, last_spaced_success_date: priorDate };
  }

  const dueDate = new Date(existingRow.due).getTime();
  const overdueDays = (now.getTime() - dueDate) / (1000 * 60 * 60 * 24);
  const onSchedule = Math.abs(overdueDays) <= SPACED_SUCCESS_GRACE_DAYS;
  const today = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const isNewDay = priorDate !== today;

  if (onSchedule && isNewDay) {
    return { spaced_success_count: priorCount + 1, last_spaced_success_date: today };
  }
  return { spaced_success_count: priorCount, last_spaced_success_date: priorDate };
}

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
    .maybeSingle<ConceptReviewRowExt>();

  if (fetchError) throw fetchError;

  const currentCard = existingRow ? rowToCard(existingRow) : newCard();
  const { card: updatedCard } = gradeReview(currentCard, fsrsRating);
  const rowFields = cardToRowFields(updatedCard);
  const spacedSuccess = computeSpacedSuccessUpdate(existingRow, fsrsRating, new Date());

  const { error: upsertError } = await supabaseAdmin
    .from('concept_reviews')
    .upsert(
      {
        user_id: userId,
        concept_id: conceptId,
        ...rowFields,
        spaced_success_count: spacedSuccess.spaced_success_count,
        last_spaced_success_date: spacedSuccess.last_spaced_success_date,
        updated_at: new Date().toISOString(),
      },
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
 * Batch existence-check — which of these concept ids has this user EVER
 * reviewed on LastMind at all (any concept_reviews row, regardless of
 * current stability/decay)? Used to tell a grounding-chain prerequisite
 * that's genuinely been engaged with before (it was itself taught as its
 * own page/lesson, or has otherwise been graded) apart from one that's
 * never touched LastMind at all — see encodingLessonService.ts's
 * stripFsrsVerifiedChecks and getEncodingLessonOutline. One query
 * regardless of list size, not N round trips.
 */
export async function getReviewedConceptIds(userId: string, conceptIds: string[]): Promise<Set<string>> {
  if (!conceptIds.length) return new Set();
  const { data, error } = await supabaseAdmin
    .from('concept_reviews')
    .select('concept_id')
    .eq('user_id', userId)
    .in('concept_id', conceptIds);
  if (error) throw error;
  return new Set((data || []).map((row) => row.concept_id as string));
}

// Shared between getMasteryStatus and getMasteryStatesForConcepts below —
// hoisted to module scope so both apply the exact same bar rather than two
// copies silently drifting apart. Deliberately requires BOTH a real
// stability figure AND at least one prior rep — a single lucky first
// review can get an artificially confident population-default stability
// estimate, so stability alone isn't trusted on its own.
const MASTERY_STABILITY_THRESHOLD = 30; // days — a real, deliberately conservative bar
const MIN_REPS_FOR_TRUST = 2; // guards against a single lucky first review

/**
 * Checks whether a concept already has enough real review history to skip
 * re-testing it (the MASTERED_THRESHOLD pre-filter from the diagnostic
 * spec).
 */
export async function getMasteryStatus(userId: string, conceptId: string): Promise<{
  row: ConceptReviewRow | null;
  isMastered: boolean;
  // Stricter, ADDITIONAL signal — see DURABLE_RELEARNING_CRITERION/
  // computeSpacedSuccessUpdate above. isMastered above is untouched by
  // this; a concept can be "mastered" (stability/reps bar) without yet
  // being "durably" relearned across correctly-spaced separate sessions.
  isDurablyMastered: boolean;
  spacedSuccessCount: number;
  scheduleWasFollowed: boolean | null; // null if there's no prior review to check
}> {
  const { data: row, error } = await supabaseAdmin
    .from('concept_reviews')
    .select('*')
    .eq('user_id', userId)
    .eq('concept_id', conceptId)
    .maybeSingle<ConceptReviewRowExt>();

  if (error) throw error;
  if (!row) return { row: null, isMastered: false, isDurablyMastered: false, spacedSuccessCount: 0, scheduleWasFollowed: null };

  const isMastered = row.stability >= MASTERY_STABILITY_THRESHOLD && row.reps >= MIN_REPS_FOR_TRUST;
  const spacedSuccessCount = row.spaced_success_count ?? 0;
  const isDurablyMastered = spacedSuccessCount >= DURABLE_RELEARNING_CRITERION;

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

  return { row, isMastered, isDurablyMastered, spacedSuccessCount, scheduleWasFollowed };
}

/**
 * Batch version of getMasteryStatus's own 0/1/2 classification, one query
 * regardless of list size — built for the knowledge-map endpoint (see
 * knowledgeMapService.ts), which needs this for potentially dozens of
 * nodes across a whole folder's merged chain graph at once. Same bar as
 * getMasteryStatus (MASTERY_STABILITY_THRESHOLD/MIN_REPS_FOR_TRUST) so
 * "mastered" means the identical thing here as it does everywhere else
 * FSRS stability already drives a decision in this app: 0 = no review
 * row at all (never covered), 1 = a row exists but hasn't cleared the
 * mastery bar yet (covered, still consolidating/due), 2 = cleared it.
 */
export async function getMasteryStatesForConcepts(userId: string, conceptIds: string[]): Promise<Map<string, 0 | 1 | 2>> {
  const states = new Map<string, 0 | 1 | 2>();
  if (!conceptIds.length) return states;

  const { data, error } = await supabaseAdmin
    .from('concept_reviews')
    .select('concept_id, stability, reps')
    .eq('user_id', userId)
    .in('concept_id', conceptIds);
  if (error) throw error;

  (data || []).forEach((row) => {
    const isMastered = row.stability >= MASTERY_STABILITY_THRESHOLD && row.reps >= MIN_REPS_FOR_TRUST;
    states.set(row.concept_id as string, isMastered ? 2 : 1);
  });
  // Any id with no row at all is implicitly 0 — the caller (knowledgeMapService)
  // fills that gap itself since it already knows the full node id list; this
  // function only ever reports what it actually found rows for.
  return states;
}

export interface MasteryDetail {
  state: 0 | 1 | 2;
  stability: number;
  reps: number;
  dueDate: string | null;
  spacedSuccessCount: number;
  isDurablyMastered: boolean;
}

/**
 * Same batch shape and bar as getMasteryStatesForConcepts, but returns the
 * real underlying numbers alongside the 0/1/2 bucket rather than just the
 * bucket — built for showing a student what "mastery" actually means
 * while they're looking at it (the knowledge map's detail panel), not
 * just a dot colour. Two concepts can both read "Mastered" while one has
 * stability=31 days (barely over the bar) and the other has stability=400
 * (rock solid) — the bucket alone can't tell them apart, this can.
 */
export async function getMasteryDetailsForConcepts(userId: string, conceptIds: string[]): Promise<Map<string, MasteryDetail>> {
  const details = new Map<string, MasteryDetail>();
  if (!conceptIds.length) return details;

  const { data, error } = await supabaseAdmin
    .from('concept_reviews')
    .select('concept_id, stability, reps, due, spaced_success_count')
    .eq('user_id', userId)
    .in('concept_id', conceptIds);
  if (error) throw error;

  (data || []).forEach((row) => {
    const isMastered = row.stability >= MASTERY_STABILITY_THRESHOLD && row.reps >= MIN_REPS_FOR_TRUST;
    const spacedSuccessCount = (row as any).spaced_success_count ?? 0;
    details.set(row.concept_id as string, {
      state: isMastered ? 2 : 1,
      stability: row.stability,
      reps: row.reps,
      dueDate: row.due,
      spacedSuccessCount,
      isDurablyMastered: spacedSuccessCount >= DURABLE_RELEARNING_CRITERION,
    });
  });
  return details;
}

/**
 * The inverse shape of getMasteryStatesForConcepts — ONE concept, MANY
 * candidate users, one query regardless of pool size. Built for peer-
 * tutoring matching (see peerTutoringMatchService.ts's findEligibleHelper):
 * "of these opted-in students, which ones currently have real, verified
 * mastery of this exact concept" is the eligibility bar for who's allowed
 * to be matched as a helper. Same MASTERY_STABILITY_THRESHOLD/MIN_REPS_FOR_TRUST
 * bar as everywhere else — a helper's own "mastered" means the identical
 * thing a student's own progress view already means, not a separate,
 * looser standard invented for this feature.
 */
export async function getUsersWithMasteryForConcept(userIds: string[], conceptId: string): Promise<Set<string>> {
  const mastered = new Set<string>();
  if (!userIds.length) return mastered;

  const { data, error } = await supabaseAdmin
    .from('concept_reviews')
    .select('user_id, stability, reps')
    .eq('concept_id', conceptId)
    .in('user_id', userIds);
  if (error) throw error;

  (data || []).forEach((row) => {
    if (row.stability >= MASTERY_STABILITY_THRESHOLD && row.reps >= MIN_REPS_FOR_TRUST) {
      mastered.add(row.user_id as string);
    }
  });
  return mastered;
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
