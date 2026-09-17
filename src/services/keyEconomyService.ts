import { supabaseAdmin } from './supabaseAdmin';

export interface KeyAwardResult {
  awarded: number;
  balance: number | null;
}

export function keysForSpacedSession(previousReps: number): number {
  if (previousReps < 2) return 0;
  const spacedSessionNumber = previousReps - 1;
  if (spacedSessionNumber === 1) return 10;
  if (spacedSessionNumber === 2) return 12;
  return 15;
}

async function awardLearningKeys(
  userId: string,
  amount: number,
  eventKey: string,
  conceptId: string,
  rewardType: string,
  reason: string
): Promise<KeyAwardResult> {
  try {
    const { data, error } = await supabaseAdmin.rpc('award_learning_keys', {
      p_user_id: userId,
      p_amount: amount,
      p_reason: reason,
      p_event_key: eventKey,
      p_concept_id: conceptId,
      p_reward_type: rewardType,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return { awarded: Number(row?.awarded) || 0, balance: row?.balance == null ? null : Number(row.balance) };
  } catch (err) {
    // Learning and scheduling must still complete if the reward ledger is
    // temporarily unavailable. The deterministic event key makes a safe
    // retry possible without ever paying the same event twice.
    console.error('LastMind: Key award failed (non-fatal).', { eventKey, err });
    return { awarded: 0, balance: null };
  }
}

export async function awardDay1Keys(
  userId: string,
  conceptId: string,
  checkId: string,
  firstAttempt: boolean
): Promise<KeyAwardResult> {
  if (!firstAttempt) return { awarded: 0, balance: null };
  return awardLearningKeys(userId, 5, `day1:${checkId}`, conceptId, 'day1_first_try', 'Day-1 check correct first time');
}

export async function awardSpacedReviewKeys(
  userId: string,
  conceptId: string,
  previousReps: number,
  retryCount: number
): Promise<KeyAwardResult> {
  if (retryCount !== 0 || previousReps < 2) return { awarded: 0, balance: null };
  const spacedSessionNumber = previousReps - 1;
  const amount = keysForSpacedSession(previousReps);
  return awardLearningKeys(
    userId,
    amount,
    `spaced:${conceptId}:${spacedSessionNumber}`,
    conceptId,
    `spaced_${spacedSessionNumber}_first_try`,
    `Spaced repetition ${spacedSessionNumber} correct first time`
  );
}

export async function getKeyBalance(userId: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('user_credits')
    .select('balance')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (data) return Number(data.balance) || 0;

  const { data: created, error: createError } = await supabaseAdmin
    .from('user_credits')
    .upsert({ user_id: userId, balance: 0, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    .select('balance')
    .single();
  if (createError) throw createError;
  return Number(created.balance) || 0;
}
