import { resolveModelPricing, USD_PER_LOCK } from '../constants/modelPricing';
import { chargeLocksForUsage } from './lockService';
import type { ClaudeCallUsage } from './claudeClient';

// Converts one real Claude API response's actual token usage into a Locks
// charge - the whole point being that this is measured from what actually
// happened (response.usage), not a hand-estimated flat cost per route.
// Every metered call gets billed exactly what it cost, whether that's a
// single Haiku grading call or a multi-thousand-token Sonnet generation.
// Rounds UP and floors at 1 - a metering system that charges 0 locks for a
// real, non-zero API cost (which a straight Math.round could do for a
// cheap enough call) defeats the entire point of this existing at all.
export function computeLocksForUsage(model: string, usage: ClaudeCallUsage | undefined): number {
  if (!usage) return 1;
  const pricing = resolveModelPricing(model);
  const costUsd =
    ((usage.input_tokens || 0) / 1_000_000) * pricing.input +
    ((usage.output_tokens || 0) / 1_000_000) * pricing.output +
    ((usage.cache_creation_input_tokens || 0) / 1_000_000) * pricing.cacheWrite +
    ((usage.cache_read_input_tokens || 0) / 1_000_000) * pricing.cacheRead;
  return Math.max(1, Math.ceil(costUsd / USD_PER_LOCK));
}

// Called from claudeClient.ts right after a metered call succeeds. Never
// throws to its caller - the real Claude work already happened and cost
// LastMind real money regardless of whether the accounting write itself
// succeeds, so a student's actual answer/lesson must never be lost over a
// logging failure. Uses chargeLocksForUsage (not spendLocks), which allows
// the balance to go negative rather than reject a charge for work that's
// already been delivered - unlike the pre-flight spendLocks check the two
// /start routes use, there is no "before" moment here to refuse at; the
// cost is only known once the response is already in hand.
export async function chargeForClaudeCall(userId: string, model: string, usage: ClaudeCallUsage | undefined): Promise<void> {
  try {
    const locks = computeLocksForUsage(model, usage);
    await chargeLocksForUsage(userId, locks);
  } catch (err) {
    console.error('LastMind: failed to charge Locks for a Claude call (non-fatal, the call itself already succeeded).', { userId, model }, err);
  }
}
