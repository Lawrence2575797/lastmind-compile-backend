// Locks — usage-based billing, deducted AFTER actual API cost is measured
// Exchange rate: 1 Lock = $0.0001 (1/100th of a cent)
// So: $0.25/month = 2,500 locks, $1.50/month = 15,000 locks, $3.00/month = 30,000 locks
// Extra locks (Max tier only): $1 = 4,500 locks

export type SubscriptionTier = 'free' | 'light' | 'max';

export const MONTHLY_LOCK_ALLOTMENTS: Record<SubscriptionTier, number> = {
  free: 2_500,    // $0.25/month
  light: 15_000,  // $1.50/month
  max: 30_000,    // $3.00/month
};

export const EXTRA_LOCKS_PER_DOLLAR = 4_500; // $1 = 4,500 locks for Max tier

export function getMonthlyAllotment(tier: SubscriptionTier): number {
  return MONTHLY_LOCK_ALLOTMENTS[tier];
}

// Held when booking a weekly calendar lesson slot (src/routes/locks.ts),
// refunded if a qualifying lesson is started inside the booked window,
// forfeited if not. Kept at its previous absolute value (was ~8.3% of the
// old flat 19,200 allotment) rather than re-derived from either new
// tier-specific figure - booking-deposit sizing isn't part of this
// per-tier recalibration.
export const LESSON_DEPOSIT_LOCK_AMOUNT = 1600;
