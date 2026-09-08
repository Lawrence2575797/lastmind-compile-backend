import { supabaseAdmin } from './supabaseAdmin';
import {
  FRESH_GENERATION_CAP_2H,
  FRESH_GENERATION_CAP_DAY,
  FRESH_GENERATION_CAP_WEEK,
  FRESH_GENERATION_CAP_MONTH,
} from '../constants/generationCaps';

// Thrown by assertFreshGenerationWithinCap so the route can tell "you've
// hit today's real limit" apart from a genuine server error and respond
// 429 with the actual window/limit that tripped, rather than a generic
// 500.
export class GenerationCapExceededError extends Error {
  constructor(public window: '2 hours' | 'day' | 'week' | 'month', public limit: number) {
    super(`Fresh-generation cap exceeded for this ${window} (${limit}).`);
    this.name = 'GenerationCapExceededError';
  }
}

function currentMonthStartIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

// 2h/day/week are ROLLING windows (exact lookback from now), deliberately
// - a calendar-boundary reset would let a student burn the whole day's
// cap right before midnight and again right after, defeating the point
// of a burst guard. MONTH alone resets on the calendar boundary, same
// convention as lockService.ts's own currentMonthStart - that's the
// "your allowance is back" moment users actually expect once a month,
// not a rolling 30-day window nobody can predict the reset of.
export async function assertFreshGenerationWithinCap(userId: string): Promise<void> {
  const now = Date.now();
  const since2h = new Date(now - 2 * 60 * 60 * 1000).toISOString();
  const sinceDay = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const sinceWeek = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const sinceMonth = currentMonthStartIso();

  const { count: monthCount, error: monthErr } = await supabaseAdmin
    .from('fresh_generation_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', sinceMonth);
  if (monthErr) throw monthErr;
  if ((monthCount ?? 0) >= FRESH_GENERATION_CAP_MONTH) {
    throw new GenerationCapExceededError('month', FRESH_GENERATION_CAP_MONTH);
  }

  const { count: weekCount, error: weekErr } = await supabaseAdmin
    .from('fresh_generation_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', sinceWeek);
  if (weekErr) throw weekErr;
  if ((weekCount ?? 0) >= FRESH_GENERATION_CAP_WEEK) {
    throw new GenerationCapExceededError('week', FRESH_GENERATION_CAP_WEEK);
  }

  const { count: dayCount, error: dayErr } = await supabaseAdmin
    .from('fresh_generation_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', sinceDay);
  if (dayErr) throw dayErr;
  if ((dayCount ?? 0) >= FRESH_GENERATION_CAP_DAY) {
    throw new GenerationCapExceededError('day', FRESH_GENERATION_CAP_DAY);
  }

  const { count: twoHourCount, error: twoHourErr } = await supabaseAdmin
    .from('fresh_generation_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', since2h);
  if (twoHourErr) throw twoHourErr;
  if ((twoHourCount ?? 0) >= FRESH_GENERATION_CAP_2H) {
    throw new GenerationCapExceededError('2 hours', FRESH_GENERATION_CAP_2H);
  }
}

// Logged AFTER a generation actually succeeds (see routes/knowledgeMap.ts)
// - a failed generation (a parse error, a Claude API failure) never
// happened from the student's perspective and shouldn't count against
// their cap.
export async function recordFreshGenerationEvent(userId: string): Promise<void> {
  const { error } = await supabaseAdmin.from('fresh_generation_events').insert({ user_id: userId });
  if (error) throw error;
}
