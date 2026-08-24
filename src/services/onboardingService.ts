import { supabaseAdmin } from './supabaseAdmin';

export interface OnboardingStatus {
  seenFreeTour: boolean;
  seenPremiumTour: boolean;
}

export type OnboardingTier = 'free' | 'premium';

/**
 * Reads which onboarding tours a user has already seen, defaulting to
 * "neither" for a user with no row yet — same shape as studySettingsService's
 * read-with-default, except this one only ever gets a row written on the
 * first tour completion (see markTourSeen), not lazily on every read.
 */
export async function getOnboardingStatus(userId: string): Promise<OnboardingStatus> {
  const { data, error } = await supabaseAdmin
    .from('user_onboarding')
    .select('seen_free_tour, seen_premium_tour')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { seenFreeTour: false, seenPremiumTour: false };
  return { seenFreeTour: data.seen_free_tour, seenPremiumTour: data.seen_premium_tour };
}

/**
 * Marks one tour (free or premium) as seen — upserts only the touched
 * column plus user_id/updated_at, so the other tier's flag (if already
 * true) is left untouched rather than reset to its column default.
 */
export async function markTourSeen(userId: string, tier: OnboardingTier): Promise<void> {
  const column = tier === 'free' ? 'seen_free_tour' : 'seen_premium_tour';
  const { error } = await supabaseAdmin
    .from('user_onboarding')
    .upsert({ user_id: userId, [column]: true, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) throw error;
}
