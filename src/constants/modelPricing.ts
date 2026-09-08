// Real per-million-token USD pricing, fetched live from claude.com/pricing
// (2026-09-08) - the source of truth for the usage-based Locks charge on
// every metered Claude call (see generationCostService.ts). Update here if
// pricing changes; nothing else needs touching. Cache write/read multipliers
// follow Anthropic's standard ratios (1.25x base input to write, 0.1x base
// input to read) - not independently fetched per model, since none of this
// app's cache_control calls have had their exact cache-tier price quoted
// separately from the live pricing page.
export interface ModelPricing {
  input: number; // $ per 1M input tokens
  output: number; // $ per 1M output tokens
  cacheWrite: number; // $ per 1M tokens written to the prompt cache
  cacheRead: number; // $ per 1M tokens read from the prompt cache
}

function withCacheTiers(input: number, output: number): ModelPricing {
  return { input, output, cacheWrite: input * 1.25, cacheRead: input * 0.1 };
}

// Keyed by BASE model name - resolveModelPricing below matches a
// dated/pinned snapshot (e.g. "claude-sonnet-5-20260115") back to its base
// the same way claudeClient.ts's own modelThinksByDefault does, so a
// CLAUDE_MODEL override doesn't silently price as "unknown model".
export const MODEL_PRICING_PER_MTOK: Record<string, ModelPricing> = {
  'claude-sonnet-5': withCacheTiers(2, 10),
  'claude-haiku-4-5-20251001': withCacheTiers(1, 5),
  'claude-haiku-4-5': withCacheTiers(1, 5),
  'claude-opus-4-8': withCacheTiers(5, 25),
};

// A conservative fallback for any model string that doesn't match a known
// base (should never happen in practice, but a metering system silently
// charging $0 for an unrecognised model is a worse failure than slightly
// over-charging against the most expensive tier this app actually uses).
const FALLBACK_PRICING = MODEL_PRICING_PER_MTOK['claude-opus-4-8'];

export function resolveModelPricing(model: string): ModelPricing {
  const exact = MODEL_PRICING_PER_MTOK[model];
  if (exact) return exact;
  const base = Object.keys(MODEL_PRICING_PER_MTOK).find((b) => model.startsWith(`${b}-`));
  return base ? MODEL_PRICING_PER_MTOK[base] : FALLBACK_PRICING;
}

// Derived from the existing lock economy's own calibration
// (MONTHLY_LOCK_ALLOTMENT=120 locks ~= £10/month of Claude spend, per
// constants/locks.ts's own comment) - kept as the same real-world exchange
// rate every OTHER lock cost in this app is priced against, not a second,
// inconsistent one invented for this. £10 / 120 locks ~= £0.0833/lock;
// converted to USD at ~1.26 GBP/USD.
export const USD_PER_LOCK = 0.105;
