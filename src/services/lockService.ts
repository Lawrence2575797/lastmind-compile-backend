import { supabaseAdmin } from './supabaseAdmin';
import { MONTHLY_LOCK_ALLOTMENT } from '../constants/locks';

export interface LockBalance {
  balance: number;
}

// Thrown by spendLocks when a user doesn't have enough — routes catch
// this specifically to return 402, distinct from a genuine server error.
export class InsufficientLocksError extends Error {
  constructor() {
    super('insufficient Locks');
    this.name = 'InsufficientLocksError';
  }
}

function currentMonthStart(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

/**
 * Reads a user's current Lock balance, creating their row (with a fresh
 * allotment) on the very first call for a brand-new user, and applying
 * the monthly reset if their stored period_start is before the current
 * calendar month — a lazy, read-triggered check, the same shape as
 * peerTutoringMatchService.ts's sweepExpiredHelpRequests, since this
 * codebase has no cron infrastructure at all. No lock_transactions ledger
 * yet (Keys has one; not needed for v1, easy to add the same way later).
 */
export async function getOrCreateLockBalance(userId: string): Promise<LockBalance> {
  const monthStart = currentMonthStart();

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from('lock_balances')
    .select('balance, period_start')
    .eq('user_id', userId)
    .maybeSingle();
  if (fetchError) throw fetchError;

  if (!existing) {
    const { data: created, error: insertError } = await supabaseAdmin
      .from('lock_balances')
      .insert({ user_id: userId, balance: MONTHLY_LOCK_ALLOTMENT, period_start: monthStart })
      .select('balance')
      .single();
    if (insertError) throw insertError;
    return { balance: created.balance };
  }

  if (existing.period_start < monthStart) {
    const { data: reset, error: resetError } = await supabaseAdmin
      .from('lock_balances')
      .update({ balance: MONTHLY_LOCK_ALLOTMENT, period_start: monthStart, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .select('balance')
      .single();
    if (resetError) throw resetError;
    return { balance: reset.balance };
  }

  return { balance: existing.balance };
}

/**
 * Spends Locks for a new encoding/retrieval lesson start — applies the
 * monthly reset first (via getOrCreateLockBalance) so a spend right after
 * a month rollover sees the fresh allotment, not last month's leftover.
 * Throws InsufficientLocksError rather than allowing the balance to go
 * negative; the caller (a route) is expected to turn that into a 402
 * before any lesson generation happens.
 */
export async function spendLocks(userId: string, amount: number): Promise<LockBalance> {
  const current = await getOrCreateLockBalance(userId);
  if (current.balance < amount) throw new InsufficientLocksError();

  const { data, error } = await supabaseAdmin
    .from('lock_balances')
    .update({ balance: current.balance - amount, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .select('balance')
    .single();
  if (error) throw error;
  return { balance: data.balance };
}

/**
 * Credits a Lock back — used for a deposit refund, never goes through
 * spendLocks (that's a debit-only path with its own insufficient-balance
 * check, which doesn't apply here).
 */
export async function creditLocks(userId: string, amount: number): Promise<LockBalance> {
  const current = await getOrCreateLockBalance(userId);
  const { data, error } = await supabaseAdmin
    .from('lock_balances')
    .update({ balance: current.balance + amount, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .select('balance')
    .single();
  if (error) throw error;
  return { balance: data.balance };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Books a weekly lesson slot — spends the deposit, creates the calendar
 * entry (type 'lesson', reusing calendar_events exactly as busy/exam
 * already do — its `type` column has no database-level enum constraint,
 * confirmed via the live schema, so no migration was needed for this),
 * and creates the 'held' lock_holds row linking them.
 */
export async function depositForLessonBooking(
  userId: string,
  date: string,
  startTime: string | null,
  depositAmount: number
): Promise<{ balance: number; calendarEventId: string; holdId: string }> {
  const { balance } = await spendLocks(userId, depositAmount);

  const { data: event, error: eventError } = await supabaseAdmin
    .from('calendar_events')
    .insert({ user_id: userId, event_date: date, type: 'lesson', start_time: startTime, end_time: null, folder_id: null })
    .select('id')
    .single();
  if (eventError) throw eventError;

  const { data: hold, error: holdError } = await supabaseAdmin
    .from('lock_holds')
    .insert({ user_id: userId, calendar_event_id: event.id, amount: depositAmount, status: 'held' })
    .select('id')
    .single();
  if (holdError) throw holdError;

  return { balance, calendarEventId: event.id, holdId: hold.id };
}

/**
 * Called right after a successful lesson-start spend (encoding or
 * retrieval) — if the student has a 'held' deposit booked for TODAY,
 * showing up and actually starting a lesson is what "completing it"
 * means for refund purposes (not finishing every step, which is fragile
 * to define given a lesson can be exited early — see the plan). Matches
 * by calendar day rather than a tight time window: forgiving of when
 * during the day the lesson actually happens, strict about which day.
 * Silently a no-op if there's no held deposit for today — the common
 * case, most lesson starts aren't against a booking at all.
 */
export async function refundTodaysHeldDepositIfAny(userId: string): Promise<void> {
  const { data: events, error: eventsError } = await supabaseAdmin
    .from('calendar_events')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'lesson')
    .eq('event_date', today());
  if (eventsError) throw eventsError;
  if (!events || !events.length) return;

  const eventIds = events.map((e) => e.id as string);
  const { data: holds, error: holdsError } = await supabaseAdmin
    .from('lock_holds')
    .select('id, user_id, amount')
    .eq('status', 'held')
    .in('calendar_event_id', eventIds);
  if (holdsError) throw holdsError;
  if (!holds || !holds.length) return;

  for (const hold of holds) {
    const { error: updateError } = await supabaseAdmin
      .from('lock_holds')
      .update({ status: 'refunded', resolved_at: new Date().toISOString() })
      .eq('id', hold.id)
      .eq('status', 'held'); // guards against a double-refund race
    if (updateError) throw updateError;
    await creditLocks(userId, hold.amount as number);
  }
}

/**
 * The forfeit sweep — lazy, read-triggered, same shape as
 * peerTutoringMatchService.ts's sweepExpiredHelpRequests (this codebase
 * has no cron infra). Any 'held' hold whose booked calendar day has
 * already fully passed, with no qualifying lesson ever started that day
 * (see refundTodaysHeldDepositIfAny above — if one had been, this row
 * would already be 'refunded', not 'held'), is marked 'forfeited'. The
 * deposit was already deducted at booking time, so forfeiting doesn't
 * move any Locks — it's just closing out the row's status for display.
 */
export async function sweepExpiredLockHolds(userId: string): Promise<void> {
  const { data: pastEvents, error: eventsError } = await supabaseAdmin
    .from('calendar_events')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'lesson')
    .lt('event_date', today());
  if (eventsError) throw eventsError;
  if (!pastEvents || !pastEvents.length) return;

  const { error: updateError } = await supabaseAdmin
    .from('lock_holds')
    .update({ status: 'forfeited', resolved_at: new Date().toISOString() })
    .eq('status', 'held')
    .in('calendar_event_id', pastEvents.map((e) => e.id as string));
  if (updateError) throw updateError;
}
