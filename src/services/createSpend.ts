import { resolveModelPricing } from '../constants/modelPricing';
import type { ClaudeCallUsage } from './claudeClient';

// LastMind Create testing budget. Every AI call made by Create (building a case, validating it, compiling it for
// play, every character reply, the closing assessment) and every generated portrait is added to one running total
// per user, and NOTHING is allowed to start if it could take that total past the cap. A hard stop, not a warning.
//
// The cap is checked BEFORE each call against its worst case (all input uncached plus every allowed output token),
// then the real cost from the response's own usage is recorded afterwards. The total lives in memory, so a server
// restart forgets it; the page also remembers what it has been told and sends that back (`clientUsedUsd`), and the
// larger of the two is used, so a restart cannot quietly hand out a fresh budget.
export const CREATE_CAP_USD = Number(process.env.CREATE_CAP_USD) > 0 ? Number(process.env.CREATE_CAP_USD) : 2;

const used = new Map<string, number>();

export class CreateCapError extends Error {
  constructor(public usedUsd: number, public capUsd: number) {
    super(`The $${capUsd.toFixed(2)} LastMind Create testing budget is used up.`);
    this.name = 'CreateCapError';
  }
}

export function costOfUsage(model: string, usage: ClaudeCallUsage | undefined): number {
  if (!usage) return 0;
  const p = resolveModelPricing(model);
  return (
    ((usage.input_tokens || 0) / 1e6) * p.input +
    ((usage.output_tokens || 0) / 1e6) * p.output +
    ((usage.cache_creation_input_tokens || 0) / 1e6) * p.cacheWrite +
    ((usage.cache_read_input_tokens || 0) / 1e6) * p.cacheRead
  );
}

// Conservative: ~3 characters per token, all uncached, and every output token the call is allowed to produce.
export function worstCaseUsd(model: string, inputChars: number, maxTokens: number): number {
  const p = resolveModelPricing(model);
  return (Math.ceil(inputChars / 3) / 1e6) * p.input + (maxTokens / 1e6) * p.output;
}

export function getUsedUsd(userId: string, clientHintUsd?: number): number {
  const server = used.get(userId) || 0;
  const hint = typeof clientHintUsd === 'number' && isFinite(clientHintUsd) && clientHintUsd > 0 ? Math.min(clientHintUsd, CREATE_CAP_USD * 5) : 0;
  const best = Math.max(server, hint);
  if (best > server) used.set(userId, best);
  return best;
}

export function assertCanSpend(userId: string, worstUsd: number, clientHintUsd?: number): void {
  const now = getUsedUsd(userId, clientHintUsd);
  if (now + worstUsd > CREATE_CAP_USD) throw new CreateCapError(now, CREATE_CAP_USD);
}

export function recordSpend(userId: string, usd: number): number {
  const next = (used.get(userId) || 0) + Math.max(0, usd);
  used.set(userId, next);
  return next;
}

export function spendSummary(userId: string) {
  return { usedUsd: Math.round((used.get(userId) || 0) * 10000) / 10000, capUsd: CREATE_CAP_USD };
}
