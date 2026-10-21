import { supabaseAdmin } from './supabaseAdmin';
import { SubscriptionTier } from '../constants/locks';
import { notifyNewAccount } from './newAccountNotice';

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

// Accounts that are always on the paid tier, found by sign-in email. The account's tier row is brought up to 'premium' the first time it is
// looked at (once per account per server start), so every screen and every gate sees the same thing.
const PREMIUM_EMAILS = new Set(['jamesmwood@btinternet.com']);
const premiumChecked = new Set<string>();
export async function ensurePremiumAccount(userId: string): Promise<void> {
  if (premiumChecked.has(userId)) return;
  try {
    const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
    const email = (data?.user?.email || '').toLowerCase();
    if (email && PREMIUM_EMAILS.has(email)) {
      const { error } = await supabaseAdmin.from('user_subscriptions').upsert({ user_id: userId, tier: 'premium', ...monthlyPeriod() }, { onConflict: 'user_id' });
      if (error) throw error;
    }
    premiumChecked.add(userId);
  } catch (err) {
    console.error('Premium account check failed:', err);   // not cached: tried again next time
  }
}

export async function getOrCreateSubscription(userId: string): Promise<UserSubscription> {
  await ensurePremiumAccount(userId);
  const { data, error } = await supabaseAdmin.from('user_subscriptions').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  if (data) return { ...data, ...monthlyPeriod() };
  // Preserve paid access for customers of the previous single paid plan.
  const { data: legacy, error: legacyError } = await supabaseAdmin.from('subscriptions')
    .select('status,stripe_subscription_id,stripe_customer_id').eq('user_id', userId).maybeSingle();
  if (legacyError) throw legacyError;
  const initial = { user_id: userId, tier: legacy?.status === 'active' ? 'premium' : 'free',
    stripe_subscription_id: legacy?.stripe_subscription_id || null,
    stripe_customer_id: legacy?.stripe_customer_id || null, ...monthlyPeriod() };
  const { data: inserted, error: insertError } = await supabaseAdmin.from('user_subscriptions')
    .upsert(initial, { onConflict: 'user_id', ignoreDuplicates: true }).select('user_id');
  if (insertError) throw insertError;
  if (inserted && inserted.length) void notifyNewAccount(userId);   // this call made the row: it is the account's first visit
  const { data: saved, error: readError } = await supabaseAdmin.from('user_subscriptions').select('*').eq('user_id', userId).single();
  if (readError) throw readError;
  return { ...saved, ...monthlyPeriod() };
}
