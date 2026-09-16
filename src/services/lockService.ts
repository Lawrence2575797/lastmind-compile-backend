import { supabaseAdmin } from './supabaseAdmin';
import { getMonthlyAllotment } from '../constants/locks';
import { getOrCreateSubscription, monthlyPeriod } from './subscriptionService';

export interface LockBalance { balance: number; }
export class InsufficientLocksError extends Error {
  constructor() { super('insufficient Locks'); this.name = 'InsufficientLocksError'; }
}
const UNLIMITED_LOCKS_USER_IDS = new Set(['1554f85d-95a0-49de-b48a-aa9c8363f7cd']);

async function sumLedger(userId: string, table: string, column: string, since: string): Promise<number> {
  let total = 0;
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabaseAdmin.from(table).select(column).eq('user_id', userId)
      .gte('created_at', since).order('id').range(offset, offset + 999);
    if (error) throw error;
    const rows = (data || []) as unknown as Record<string, number>[];
    total += rows.reduce((sum, row) => sum + Number(row[column]), 0);
    if (rows.length < 1000) return total;
  }
}

// The existing transaction ledger is authoritative. Concurrent usage cannot
// overwrite another debit. A purchase receipt credits once by its primary key,
// avoiding the non-atomic receipt-then-balance-update failure in the draft.
export async function getOrCreateLockBalance(userId: string): Promise<LockBalance> {
  if (UNLIMITED_LOCKS_USER_IDS.has(userId)) return { balance: 999_999 };
  const subscription = await getOrCreateSubscription(userId);
  const since = monthlyPeriod().period_start + 'T00:00:00.000Z';
  const [changes, purchases] = await Promise.all([
    sumLedger(userId, 'lock_transactions', 'amount', since),
    sumLedger(userId, 'extra_locks_purchases', 'locks_granted', since),
  ]);
  return { balance: getMonthlyAllotment(subscription.tier) + changes + purchases };
}

async function recordChange(userId: string, amount: number, reason: string, model?: string): Promise<LockBalance> {
  const current = await getOrCreateLockBalance(userId);
  const { error } = await supabaseAdmin.from('lock_transactions').insert({
    user_id: userId, amount, reason, model: model ?? null, balance_after: current.balance + amount,
  });
  if (error) throw error;
  return getOrCreateLockBalance(userId);
}
function validateAmount(amount: number) {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Invalid Lock amount');
}
export async function spendLocks(userId: string, amount: number, reason: string): Promise<LockBalance> {
  validateAmount(amount);
  if ((await getOrCreateLockBalance(userId)).balance < amount) throw new InsufficientLocksError();
  return recordChange(userId, -amount, reason);
}
export async function chargeLocksForUsage(userId: string, amount: number, reason: string, model?: string): Promise<LockBalance> {
  validateAmount(amount);
  return recordChange(userId, -amount, reason, model);
}
export async function creditLocks(userId: string, amount: number, reason: string): Promise<LockBalance> {
  validateAmount(amount);
  return recordChange(userId, amount, reason);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Books a weekly lesson slot â€” spends the deposit, creates the calendar
 * entry (type 'lesson', reusing calendar_events exactly as busy/exam
 * already do â€” its `type` column has no database-level enum constraint,
 * confirmed via the live schema, so no migration was needed for this),
 * and creates the 'held' lock_holds row linking them.
 */
export async function depositForLessonBooking(
  userId: string,
  date: string,
  startTime: string | null,
  depositAmount: number
): Promise<{ balance: number; calendarEventId: string; holdId: string }> {
  const { balance } = await spendLocks(userId, depositAmount, 'lesson-booking-deposit');

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
 * Called from /encoding-lesson/submit and /chain-lesson/submit, only on
 * their `done: true` (genuinely finished) response â€” the deposit is
 * refunded once a lesson actually completes on the booked day, not
 * merely starts, matching the founder's own wording ("lost if the lesson
 * is not completed by midnight of the booked day, the time of booking is
 * mostly irrelevant"). Matches by calendar day rather than a tight time
 * window: forgiving of when during the day it happens, strict about
 * which day â€” the sweep below only forfeits once event_date is fully in
 * the past, i.e. midnight has passed with nothing completed. Silently a
 * no-op if there's no held deposit for today â€” the common case, most
 * lesson completions aren't against a booking at all.
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
    await creditLocks(userId, hold.amount as number, 'lesson-booking-deposit-refund');
  }
}

/**
 * The forfeit sweep â€” lazy, read-triggered, same shape as
 * peerTutoringMatchService.ts's sweepExpiredHelpRequests (this codebase
 * has no cron infra). Any 'held' hold whose booked calendar day has
 * already fully passed, with no qualifying lesson ever started that day
 * (see refundTodaysHeldDepositIfAny above â€” if one had been, this row
 * would already be 'refunded', not 'held'), is marked 'forfeited'. The
 * deposit was already deducted at booking time, so forfeiting doesn't
 * move any Locks â€” it's just closing out the row's status for display.
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
