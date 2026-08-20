import { supabaseAdmin } from './supabaseAdmin';

// The 5 dimensions the requester rates a helper on, once per session — see
// the plan's rationale: quality/helpfulness/timeliness were the user's own
// pick, clarity and wouldRecommend were added to round out "was the CONTENT
// right" (quality) vs "was it communicated well" (clarity) vs "did it
// actually move me forward" (helpfulness) vs "was it prompt" (timeliness)
// vs an overall trust signal (wouldRecommend) without any two dimensions
// measuring the same thing.
export interface RatingDimensions {
  quality: number;
  helpfulness: number;
  timeliness: number;
  clarity: number;
  wouldRecommend: number;
}

export interface TutoringRating extends RatingDimensions {
  id: string;
  sessionId: string;
  raterId: string;
  rateeId: string;
  createdAt: string;
}

function rowToRating(row: any): TutoringRating {
  return {
    id: row.id,
    sessionId: row.session_id,
    raterId: row.rater_id,
    rateeId: row.ratee_id,
    quality: row.quality,
    helpfulness: row.helpfulness,
    timeliness: row.timeliness,
    clarity: row.clarity,
    wouldRecommend: row.would_recommend,
    createdAt: row.created_at,
  };
}

function validateDimensions(d: RatingDimensions): void {
  const values = [d.quality, d.helpfulness, d.timeliness, d.clarity, d.wouldRecommend];
  if (values.some((v) => !Number.isInteger(v) || v < 1 || v > 5)) {
    throw new Error('every rating dimension must be a whole number from 1 to 5');
  }
}

// Only the requester rates, only once the session is genuinely 'released'
// (so they've actually seen the response first) — the unique constraint on
// tutoring_ratings.session_id is the real backstop against a second rating,
// this status check just gives a cleaner error before hitting it.
export async function submitRating(userId: string, sessionId: string, dimensions: RatingDimensions): Promise<TutoringRating> {
  validateDimensions(dimensions);

  const { data: sessionRow, error: sessionError } = await supabaseAdmin
    .from('tutoring_sessions')
    .select('id, requester_id, helper_id, status')
    .eq('id', sessionId)
    .maybeSingle();
  if (sessionError) throw sessionError;
  if (!sessionRow) throw new Error('session not found');
  if (sessionRow.requester_id !== userId) throw new Error('only the requester can rate this session');
  if (sessionRow.status !== 'released') throw new Error('you can only rate a session once the response has been released');

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('tutoring_ratings')
    .insert({
      session_id: sessionId,
      rater_id: userId,
      ratee_id: sessionRow.helper_id,
      quality: dimensions.quality,
      helpfulness: dimensions.helpfulness,
      timeliness: dimensions.timeliness,
      clarity: dimensions.clarity,
      would_recommend: dimensions.wouldRecommend,
    })
    .select()
    .single();
  if (insertError) throw insertError;
  return rowToRating(inserted);
}

// Either party can read the rating back — the requester to see what they
// gave, the helper to see what they received.
export async function getRatingForSession(userId: string, sessionId: string): Promise<TutoringRating | null> {
  const { data: sessionRow, error: sessionError } = await supabaseAdmin
    .from('tutoring_sessions')
    .select('id, requester_id, helper_id')
    .eq('id', sessionId)
    .maybeSingle();
  if (sessionError) throw sessionError;
  if (!sessionRow || (sessionRow.requester_id !== userId && sessionRow.helper_id !== userId)) {
    throw new Error('session not found');
  }

  const { data, error } = await supabaseAdmin.from('tutoring_ratings').select('*').eq('session_id', sessionId).maybeSingle();
  if (error) throw error;
  return data ? rowToRating(data) : null;
}

export interface TutorRatingSummary {
  quality: number;
  helpfulness: number;
  timeliness: number;
  clarity: number;
  wouldRecommend: number;
  overall: number;
  ratedSessionCount: number;
}

// Batched per-dimension + overall averages for the Browse Tutors ranking —
// one query regardless of how many candidates are in the eligible pool,
// same "batch, don't N+1" convention as getMasteryStatesForConcepts.
export async function getTutorRatingSummary(helperIds: string[]): Promise<Map<string, TutorRatingSummary>> {
  const summaries = new Map<string, TutorRatingSummary>();
  if (!helperIds.length) return summaries;

  const { data, error } = await supabaseAdmin
    .from('tutoring_ratings')
    .select('ratee_id, quality, helpfulness, timeliness, clarity, would_recommend')
    .in('ratee_id', helperIds);
  if (error) throw error;

  const totals = new Map<string, { quality: number; helpfulness: number; timeliness: number; clarity: number; wouldRecommend: number; count: number }>();
  (data || []).forEach((row) => {
    const rateeId = row.ratee_id as string;
    if (!totals.has(rateeId)) totals.set(rateeId, { quality: 0, helpfulness: 0, timeliness: 0, clarity: 0, wouldRecommend: 0, count: 0 });
    const t = totals.get(rateeId)!;
    t.quality += row.quality;
    t.helpfulness += row.helpfulness;
    t.timeliness += row.timeliness;
    t.clarity += row.clarity;
    t.wouldRecommend += row.would_recommend;
    t.count += 1;
  });

  totals.forEach((t, rateeId) => {
    const quality = t.quality / t.count;
    const helpfulness = t.helpfulness / t.count;
    const timeliness = t.timeliness / t.count;
    const clarity = t.clarity / t.count;
    const wouldRecommend = t.wouldRecommend / t.count;
    const overall = (quality + helpfulness + timeliness + clarity + wouldRecommend) / 5;
    summaries.set(rateeId, { quality, helpfulness, timeliness, clarity, wouldRecommend, overall, ratedSessionCount: t.count });
  });

  return summaries;
}
