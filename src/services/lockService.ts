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
