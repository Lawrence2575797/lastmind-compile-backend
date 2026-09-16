import { supabaseAdmin } from './supabaseAdmin';
import { SubscriptionTier } from '../constants/locks';

export interface UserSubscription {
  user_id: string;
  tier: SubscriptionTier;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  period_start: string;
  period_end: string;
}

export function monthlyPeriod(now = new Date()) {
  return {
    period_start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10),
    period_end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 10),
  };
}

export async function getOrCreateSubscription(userId: string): Promise<UserSubscription> {
  const { data, error } = await supabaseAdmin.from('user_subscriptions').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  if (data) return { ...data, ...monthlyPeriod() };
  // Preserve paid access for customers of the previous single paid plan.
  const { data: legacy, error: legacyError } = await supabaseAdmin.from('subscriptions')
    .select('status,stripe_subscription_id,stripe_customer_id').eq('user_id', userId).maybeSingle();
  if (legacyError) throw legacyError;
  const initial = { user_id: userId, tier: legacy?.status === 'active' ? 'max' : 'free',
    stripe_subscription_id: legacy?.stripe_subscription_id || null,
    stripe_customer_id: legacy?.stripe_customer_id || null, ...monthlyPeriod() };
  const { error: insertError } = await supabaseAdmin.from('user_subscriptions')
    .upsert(initial, { onConflict: 'user_id', ignoreDuplicates: true });
  if (insertError) throw insertError;
  const { data: saved, error: readError } = await supabaseAdmin.from('user_subscriptions').select('*').eq('user_id', userId).single();
  if (readError) throw readError;
  return { ...saved, ...monthlyPeriod() };
}
