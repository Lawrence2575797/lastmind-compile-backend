import { supabaseAdmin } from './supabaseAdmin';

// The app's own currency ("Keys" in the frontend — named here only in
// comments; the actual display name lives entirely in learn/index.html
// so it can be renamed without touching this file, as already happened
// once when this was called "Synapses").
// Deliberately NOT a monthly subscription allotment — see the chat
// discussion this was built from: a recurring free grant would remove the
// actual incentive to tutor, which is the whole point of a two-sided
// credit economy. The ways a balance grows: (a) this one-time signup
// bonus, solving the cold-start problem before anyone's earned anything
// yet; (b) actually tutoring someone (tutoringResponseService.ts, priced
// per activity type — see TUTORING_ACTIVITY_KEYS there); (c) completing a
// lesson (see payMasteryInstallment/ENCODING_LESSON_COMPLETION_KEYS
// below); (d) buying more directly — NOT wired to a real amount yet (see
// the "Buy more" flow in learn/index.html, deliberately a placeholder
// until then).
const INITIAL_CREDIT_ALLOWANCE = 40;

// Verification (free tier) and retrieval/spaced lessons (premium) both pay
// in 3 installments as spaced_success_count crosses into lesson 1/2/3 of
// durable mastery (DURABLE_RELEARNING_CRITERION in reviewService.ts) — see
// payMasteryInstallment below, the one place this logic lives. Verification
// applies a 0.6x coefficient on top of these base amounts: that learning
// didn't happen on LastMind, so it's rewarded with less confidence than
// practice that did.
const MASTERY_INSTALLMENT_KEYS = [75, 150, 225]; // index 0 = lesson 1

// Flat reward for completing a first-time encoding lesson (premium) — see
// encodingLessonService.ts's own gate (index >= 0.5, the same bar its FSRS
// rating already uses to distinguish "hard" from "again") on when this
// actually gets paid.
export const ENCODING_LESSON_COMPLETION_KEYS = 100;

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
 * every earn/spend call site goes through (tutoring's symmetric transfer
 * in tutoringResponseService.ts, the signup bonus above,
 * payMasteryInstallment/encoding-lesson completion below).
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

/**
 * Pays the Keys installment for reaching lesson 1/2/3 of durable mastery —
 * the ONE place the installment-amount/coefficient logic lives, called by
 * both the free-tier verification flow (coefficient 0.6 — this learning
 * didn't happen on LastMind, rewarded with less confidence) and premium
 * retrieval lessons (coefficient 1.0). `priorCount`/`newCount` are
 * spaced_success_count before/after this grading event (see
 * gradeAndRecordReview's own return in reviewService.ts) — paying only
 * when `newCount` is a genuine increase into 1, 2, or 3 is what stops this
 * from re-paying an already-earned milestone, paying for a review that
 * didn't land as a genuinely spaced pass at all, or paying indefinitely
 * once spaced_success_count keeps climbing past 3 with continued reviews.
 * Returns the amount actually paid (0 if nothing was earned this time).
 */
export async function payMasteryInstallment(
  userId: string,
  priorCount: number,
  newCount: number,
  coefficient: number,
  reason: string
): Promise<number> {
  if (newCount <= priorCount || newCount < 1 || newCount > MASTERY_INSTALLMENT_KEYS.length) return 0;
  const amount = Math.round(MASTERY_INSTALLMENT_KEYS[newCount - 1] * coefficient);
  await adjustCredits(userId, amount, reason);
  return amount;
}
