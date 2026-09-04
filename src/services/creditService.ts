import { supabaseAdmin } from './supabaseAdmin';
import { gradeCorrectness } from './reviewService';

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

// Verify and retrieval/spaced lessons both pay in 3 installments as
// spaced_success_count crosses into lesson 1/2/3 of durable mastery
// (DURABLE_RELEARNING_CRITERION in reviewService.ts) — see
// payMasteryInstallment below, the one place this logic lives. Verify pays
// the SAME base amounts here (it's graded through the exact same FSRS
// rating derivation as a real lesson — see knowledgeMap.ts's verify/submit,
// which no longer forces a capped 'hard' rating), just discounted by a
// coefficient since that learning didn't happen on LastMind: 0.6x on the
// free tier, 0.8x on premium (see KM_VERIFY_COEFFICIENT_FREE/PREMIUM
// below) — a smaller discount for premium since encouraging a
// paying user to at least open the app is worth more than a free one's.
// The chain-diagnostic prerequisite gate (chainDiagnosticService.ts's
// gradeComponentOutcome) pays at these SAME coefficients for the same
// reason - being forced through it because a prerequisite was never
// encoded is functionally a Verify of that prerequisite, just triggered
// by the gate rather than chosen directly.
// Exported so a caller can show the un-discounted figure alongside the
// coefficient (e.g. "you earned 6 of the 10 a full lesson would pay").
// Rescaled 2026-09-01 (÷15 from the original [75,150,225], rounded to a
// clean multiple of 5) — the original figures were tuned before the
// knowledge-map's own lesson flow paid credits at all; this is a product
// tuning knob, not derived from anything.
export const MASTERY_INSTALLMENT_KEYS = [5, 10, 15]; // index 0 = lesson 1

// Flat reward for completing a first-time encoding lesson (premium) — see
// encodingLessonService.ts's own gate (index >= 0.5, the same bar its FSRS
// rating already uses to distinguish "hard" from "again") on when this
// actually gets paid. Rescaled 2026-09-01 (÷15 from the original 100,
// rounded down to 5 to land on the same clean scale as
// MASTERY_INSTALLMENT_KEYS's own new figures) — see that constant's comment.
export const ENCODING_LESSON_COMPLETION_KEYS = 5;

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

// Premium gets the smaller discount (0.8 vs free's 0.6) since a paying
// user opening the app at all, even just to verify, is worth more
// encouraging than a free one's equivalent action. Shared by Verify
// (knowledgeMap.ts's verify/submit) and the chain-diagnostic prerequisite
// gate (chainDiagnosticService.ts's gradeComponentOutcome) - both pay a
// student for demonstrating knowledge they didn't actually gain on
// LastMind, just reached through different entry points.
export const KM_VERIFY_COEFFICIENT_FREE = 0.6;
export const KM_VERIFY_COEFFICIENT_PREMIUM = 0.8;

/**
 * Pays the same credit amounts the older encoding/spaced-lesson engines
 * already use — a first-time encoding ('practice' for a node, 'ao1' for
 * Verify's node-level check, or an 'encoding' chain-diagnostic component)
 * is a flat one-off payment, matching encodingLessonService.ts's own
 * ENCODING_LESSON_COMPLETION_KEYS payout on a first-time pass; a
 * transfer/integration pass is a genuine spaced review of an already-
 * encoded edge, paid via the same per-milestone installment schedule
 * spacedLessonEngine.ts uses as spaced_success_count climbs toward durable
 * mastery. `coefficient` is 1.0 for an actual lesson/review, or the
 * KM_VERIFY_COEFFICIENT_* discount for Verify/the chain-diagnostic gate —
 * both are graded through the exact same gradeCorrectness path a real
 * lesson uses (no artificial rating cap), so they earn toward the same
 * milestones, just at a reduced rate. Returns both the amount actually
 * paid AND the un-discounted base, so a caller can show a student exactly
 * how much they left on the table by verifying instead of doing the
 * lesson. `graded` is gradeCorrectness's own return value — its
 * `previousRow` carries spaced_success_count at runtime, just narrower on
 * its declared type (see gradeAndRecordReview's own comment in
 * reviewService.ts).
 */
export async function payLessonCredits(
  userId: string,
  isFirstTimeEncoding: boolean,
  graded: Awaited<ReturnType<typeof gradeCorrectness>>,
  coefficient: number,
  reasonPrefix: string
): Promise<{ paid: number; base: number }> {
  if (isFirstTimeEncoding) {
    const base = ENCODING_LESSON_COMPLETION_KEYS;
    const paid = Math.round(base * coefficient);
    if (paid > 0) await adjustCredits(userId, paid, `${reasonPrefix}_encoding_completed`);
    return { paid, base };
  }
  const priorSpacedSuccessCount = (graded.previousRow as { spaced_success_count?: number } | null)?.spaced_success_count ?? 0;
  const newCount = graded.spacedSuccessCount;
  // Same milestone gate payMasteryInstallment applies internally —
  // duplicated here (rather than changing that shared function's return
  // type, which has three other call sites) purely so `base` is knowable
  // even when nothing was actually paid.
  if (newCount <= priorSpacedSuccessCount || newCount < 1 || newCount > MASTERY_INSTALLMENT_KEYS.length) return { paid: 0, base: 0 };
  const base = MASTERY_INSTALLMENT_KEYS[newCount - 1];
  const paid = await payMasteryInstallment(userId, priorSpacedSuccessCount, newCount, coefficient, `${reasonPrefix}_mastery_${newCount}`);
  return { paid, base };
}
