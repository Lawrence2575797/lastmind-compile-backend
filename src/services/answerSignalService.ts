import { supabaseAdmin } from './supabaseAdmin';

// A clean FSRS "good"/"easy" rating can't distinguish "answered fast and
// confidently" from "eventually got there after visibly hesitating" — the
// exact gap the user reported (a genuine but resolved misunderstanding
// that "the system never notices"). This is a lightweight, targeted
// second signal alongside FSRS, not a replacement for it: response time
// against the student's OWN recent history (never a global baseline —
// raw speed varies hugely person to person), with a one-tap confidence
// question asked ONLY on flagged instances to keep the friction cost low.

const MIN_SAMPLES_FOR_BASELINE = 5; // don't flag anything until there's a real personal baseline to compare against
const OUTLIER_MULTIPLIER = 2.5; // notably slower than usual, not just a little
const ROLLING_WINDOW = 20; // recent-history window the baseline is computed from
const LOW_CONFIDENCE_LOOKBACK_DAYS = 30;

export interface AnswerSignalResult {
  id: string;
  promptConfidence: boolean;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Records one retrieval-lesson's final response time, flags it as a
 * personal-baseline outlier when notably slower than usual, and tells the
 * caller whether to ask a follow-up confidence question — only ever when
 * the lesson was a clean pass (no genuine wrong answer anywhere in it)
 * AND slow, since a wrong answer is already caught by FSRS's own rating.
 */
export async function recordAnswerSignal(userId: string, conceptId: string, responseTimeMs: number, cleanPass: boolean): Promise<AnswerSignalResult> {
  const { data: recent, error: recentError } = await supabaseAdmin
    .from('answer_confidence_signals')
    .select('response_time_ms')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(ROLLING_WINDOW);
  if (recentError) throw recentError;

  const priorTimes = (recent || []).map((r) => r.response_time_ms as number);
  const isOutlier = priorTimes.length >= MIN_SAMPLES_FOR_BASELINE && responseTimeMs > median(priorTimes) * OUTLIER_MULTIPLIER;

  const { data, error } = await supabaseAdmin
    .from('answer_confidence_signals')
    .insert({ user_id: userId, concept_id: conceptId, response_time_ms: responseTimeMs, is_time_outlier: isOutlier })
    .select('id')
    .single();
  if (error) throw error;

  return { id: data.id, promptConfidence: cleanPass && isOutlier };
}

export async function recordConfidenceRating(userId: string, signalId: string, rating: number): Promise<void> {
  const { error } = await supabaseAdmin
    .from('answer_confidence_signals')
    .update({ confidence_rating: rating })
    .eq('id', signalId)
    .eq('user_id', userId);
  if (error) throw error;
}

/**
 * Concepts flagged as "technically passed, but slow AND self-reported low
 * confidence" in the last LOW_CONFIDENCE_LOOKBACK_DAYS — used to widen
 * peer-tutoring recommendations beyond raw mastery state (see
 * loadRecommendedConcepts in learn/index.html), since a clean FSRS rating
 * alone can hide exactly this kind of shakiness. `conceptIds` should be
 * the SAME keys concept_reviews itself is queried by for these concepts
 * (normalizeConceptKey for a target concept), matching what
 * recordAnswerSignal is actually called with.
 */
export async function getConceptsWithLowConfidenceSignal(userId: string, conceptIds: string[]): Promise<Set<string>> {
  if (!conceptIds.length) return new Set();
  const cutoff = new Date(Date.now() - LOW_CONFIDENCE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from('answer_confidence_signals')
    .select('concept_id')
    .eq('user_id', userId)
    .in('concept_id', conceptIds)
    .eq('is_time_outlier', true)
    .gte('confidence_rating', 2)
    .gte('created_at', cutoff);
  if (error) throw error;
  return new Set((data || []).map((r) => r.concept_id as string));
}
