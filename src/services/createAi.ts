import { callClaudeJSONWithUsage, MODELS } from './claudeClient';
import { assertCanSpend, costOfUsage, recordSpend, worstCaseUsd, spendSummary } from './createSpend';
import { assertLocksAvailable } from './lockService';

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
}): Promise<{ text: string; costUsd: number; spend: { usedUsd: number; capUsd: number } }> {
  const model = params.model || MODELS.compile;
  assertCanSpend(params.userId, worstCaseUsd(model, params.systemPrompt.length + params.userContent.length, params.maxTokens), params.clientUsedUsd);
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
  recordSpend(params.userId, costUsd);
  return { text, costUsd, spend: spendSummary(params.userId) };
}
