import { callClaudeJSONWithUsage, MODELS } from './claudeClient';
import { assertCanSpend, costOfUsage, recordSpend, worstCaseUsd, spendSummary } from './createSpend';
import { assertLocksAvailable } from './lockService';
import { USD_PER_LOCK } from '../constants/modelPricing';

// The one door every LastMind Create AI call goes through: Locks check, hard dollar-cap check BEFORE the call
// (worst case), the call itself (thinking off, see claudeClient), then the real cost recorded against the cap.
export async function createAiCall(params: {
  userId: string;
  systemPrompt: string;
  userContent: string;
  maxTokens: number;
  reason: string;
  model?: string;
  temperature?: number;
  cacheSystemPrompt?: boolean;
  clientUsedUsd?: number;
  // Metered in Locks only (the call is always charged to the student's Locks by claudeClient); skips the dollar testing cap.
  capless?: boolean;
}): Promise<{ text: string; costUsd: number; locks: number; spend: { usedUsd: number; capUsd: number } }> {
  const model = params.model || MODELS.compile;
  if (!params.capless) assertCanSpend(params.userId, worstCaseUsd(model, params.systemPrompt.length + params.userContent.length, params.maxTokens), params.clientUsedUsd);
  await assertLocksAvailable(params.userId);
  const { text, usage } = await callClaudeJSONWithUsage({
    model,
    systemPrompt: params.systemPrompt,
    userContent: params.userContent,
    maxTokens: params.maxTokens,
    temperature: params.temperature,
    cacheSystemPrompt: params.cacheSystemPrompt,
    userId: params.userId,
    meteredReason: params.reason,
  });
  const costUsd = costOfUsage(model, usage);
  if (!params.capless) recordSpend(params.userId, costUsd);
  return { text, costUsd, locks: Math.max(1, Math.ceil(costUsd / USD_PER_LOCK)), spend: spendSummary(params.userId) };
}
