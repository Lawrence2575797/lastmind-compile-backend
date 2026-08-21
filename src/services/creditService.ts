import { supabaseAdmin } from './supabaseAdmin';

// The app's own currency ("Keys" in the frontend — named here only in
// comments; the actual display name lives entirely in learn/index.html
// so it can be renamed without touching this file, as already happened
// once when this was called "Synapses").
// Deliberately NOT a monthly subscription allotment — see the chat
// discussion this was built from: a recurring free grant would remove the
// actual incentive to tutor, which is the whole point of a two-sided
// credit economy. The only ways a balance grows are (a) this one-time
// signup bonus, solving the cold-start problem before anyone's earned
// anything yet, (b) actually tutoring someone, or (c) buying more
// directly — (b) and (c) are NOT wired to real amounts yet, since the
// per-activity pricing hasn't been decided (see the "Buy more" flow in
// learn/index.html, deliberately a placeholder until then).
const INITIAL_CREDIT_ALLOWANCE = 40;

export interface CreditBalance {
  balance: number;
}

/**
 * Reads a user's current balance, granting the one-time signup bonus (and
 * creating their row) on the very first call for a brand-new user. Every
 * balance change — including this one — is logged to credit_transactions,
 * not just written to the running total, so a real transaction history
 * exists once the "Your Credit Balance" page wants to show one.
 */
export async function getOrCreateBalance(userId: string): Promise<CreditBalance> {
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from('user_credits')
    .select('balance')
    .eq('user_id', userId)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (existing) return { balance: existing.balance };

  const { data: created, error: insertError } = await supabaseAdmin
    .from('user_credits')
    .insert({ user_id: userId, balance: INITIAL_CREDIT_ALLOWANCE })
    .select('balance')
    .single();
  if (insertError) throw insertError;

  const { error: txError } = await supabaseAdmin
    .from('credit_transactions')
    .insert({ user_id: userId, amount: INITIAL_CREDIT_ALLOWANCE, reason: 'signup_bonus' });
  if (txError) throw txError;

  return { balance: created.balance };
}

/**
 * Adjusts a balance and logs why — the one general-purpose primitive
 * every future earn/spend call site (submitting a tutoring response,
 * requesting help, a marked long-form answer) will eventually call once
 * real per-activity amounts are decided. Not called from anywhere yet —
 * see creditService.ts's own top comment.
 */
export async function adjustCredits(userId: string, amount: number, reason: string): Promise<CreditBalance> {
  const current = await getOrCreateBalance(userId);
  const nextBalance = current.balance + amount;
  const { data, error } = await supabaseAdmin
    .from('user_credits')
    .update({ balance: nextBalance, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .select('balance')
    .single();
  if (error) throw error;

  const { error: txError } = await supabaseAdmin.from('credit_transactions').insert({ user_id: userId, amount, reason });
  if (txError) throw txError;

  return { balance: data.balance };
}
