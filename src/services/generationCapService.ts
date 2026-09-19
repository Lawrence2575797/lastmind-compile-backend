import { supabaseAdmin } from './supabaseAdmin';
import { ADMIN_EMAILS } from './authMiddleware';
import { FRESH_GENERATION_CAP_MONTH, FREE_GENERATION_CAP_MONTH } from '../constants/generationCaps';

// Thrown by assertFreshGenerationWithinCap so the route can tell "you've
// hit today's real limit" apart from a genuine server error and respond
// 429 with the actual window/limit that tripped, rather than a generic
// 500. 'hour' only ever comes from a free account (its shortest window);
// 'week' comes from a free account too - see this window structure isn't identical between tiers.
export class GenerationCapExceededError extends Error {
  constructor(public window: 'hour' | '2 hours' | 'day' | 'week' | 'month', public limit: number) {
    super(`Fresh-generation cap exceeded for this ${window} (${limit}).`);
    this.name = 'GenerationCapExceededError';
  }
}

function currentMonthStartIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

// Free accounts reset their monthly generation cap on their own signup
// anniversary day each month, not the calendar boundary - a student who
// joined on the 5th resets every 5th. Clamped to the last day of a
// shorter month (e.g. joined on the 31st - resets on the 28th/29th/30th
// in a month that doesn't have a 31st), same convention billing-anchor
// dates commonly use, rather than overflowing into the next month.
export function currentAnchorMonthStartIso(accountCreatedAt: string, now: Date = new Date()): string {
  const signupDay = new Date(accountCreatedAt).getUTCDate();
  const lastDayOfThisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const anchorDayThisMonth = Math.min(signupDay, lastDayOfThisMonth);
  let anchor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), anchorDayThisMonth));

  if (anchor.getTime() > now.getTime()) {
    // This month's anchor day hasn't happened yet - the current window
    // started on last month's anchor day instead.
    const prevMonthLastDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)).getUTCDate();
    const anchorDayPrevMonth = Math.min(signupDay, prevMonthLastDay);
    anchor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, anchorDayPrevMonth));
  }
  return anchor.toISOString();
}

async function countEventsSince(userId: string, sinceIso: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('fresh_generation_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', sinceIso);
  if (error) throw error;
  return count ?? 0;
}

// Both tiers are capped here - free accounts used to bypass this check
// entirely (see generationCaps.ts's own comment on why that changed).
// isPaid decides which cap set and which month-reset shape applies;
// accountCreatedAt (the student's own auth.users.created_at, threaded
// through from requireAuth) is only ever read for a free account's
// anchor-day month window - null falls back to the calendar boundary
// rather than throwing, since every real authenticated user has one, but
// a defensive default costs nothing. email (also threaded from
// requireAuth) exempts the founder's own account entirely (see
// ADMIN_EMAILS's own comment) - these caps exist to bound a real
// student's runaway generation cost, not to throttle the person actually
// building and testing the product day to day.
export async function assertFreshGenerationWithinCap(userId: string, isPaid: boolean, accountCreatedAt: string | null, email?: string | null): Promise<void> {
  if (email && ADMIN_EMAILS.has(email.toLowerCase())) return;
  const now = Date.now();

  // Only the monthly cap binds. The hourly, two-hourly, daily and weekly
  // windows were removed on purpose: spending is bounded by the month.
  if (isPaid) {
    if ((await countEventsSince(userId, currentMonthStartIso())) >= FRESH_GENERATION_CAP_MONTH) {
      throw new GenerationCapExceededError('month', FRESH_GENERATION_CAP_MONTH);
    }
    return;
  }

  const sinceMonth = accountCreatedAt ? currentAnchorMonthStartIso(accountCreatedAt) : currentMonthStartIso();
  if ((await countEventsSince(userId, sinceMonth)) >= FREE_GENERATION_CAP_MONTH) {
    throw new GenerationCapExceededError('month', FREE_GENERATION_CAP_MONTH);
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
