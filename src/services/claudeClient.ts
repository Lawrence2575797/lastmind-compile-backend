import Anthropic from '@anthropic-ai/sdk';

const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;

if (!CLAUDE_API_KEY) {
  // Fail loudly at startup rather than silently at request time.
  console.error(
    'CLAUDE_API_KEY is not set. Create a .env from .env.example and put a ' +
      'freshly-generated key there (never in code or chat).'
  );
}

const anthropic = new Anthropic({
  apiKey: CLAUDE_API_KEY,
});

// One model per task, not one model for everything. Centralized here so a
// future model swap is a one-line change, not a search-and-replace across
// the codebase.
export const MODELS = {
  // Compile — everyday note restructuring, high volume.
  compile: process.env.CLAUDE_MODEL || 'claude-sonnet-5',
  // Dependency chain generation + its fact-check pass — rare (generated
  // once per concept+qualification+examBoard, then cached and reused
  // across every student who hits that same tier), but high-leverage: a
  // wrong chain silently corrupts every diagnosis built on top of it.
  // factCheck stays on Opus unconditionally regardless of which
  // generation model drafted the chain — it's the actual quality gate
  // (it can rewrite the whole graph via corrected_graph), so cost savings
  // on the draft never come at the expense of the final result. See
  // chainService.ts's isUniversityLevel for how chainGeneration vs
  // chainGenerationSimple is chosen.
  chainGeneration: 'claude-opus-4-8',
  chainGenerationSimple: process.env.CLAUDE_MODEL || 'claude-sonnet-5',
  factCheck: 'claude-opus-4-8',
  // The diagnostic tree itself — corrections, contrastive cues, the
  // nuanced pedagogical judgment calls.
  diagnosticTree: process.env.CLAUDE_MODEL || 'claude-sonnet-5',
  // Simple, high-volume, low-stakes calls — a single retrieval question,
  // the careless-slip micro-probe. Runs on every diagnostic event, so
  // savings here compound across the whole user base.
  simpleQuestion: 'claude-haiku-4-5-20251001',
} as const;

const TUTOR_SYSTEM_PROMPT =
  "You are an AI tutor. The following text is a student's notes. Improve them into clear, structured revision notes.";

const FALLBACK_MESSAGE = 'There was an issue processing your notes. Please try again.';

/**
 * Sends already-filtered text to Claude and returns its response.
 * `safeText` must already have passed through both PII filters and the
 * harmful-content filter before it reaches this function — this module
 * does not re-check that; the route handler is responsible for ordering.
 */
export async function processNotes(safeText: string): Promise<string> {
  try {
    const response = await anthropic.messages.create({
      model: MODELS.compile,
      max_tokens: 1024,
      system: TUTOR_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: safeText,
        },
      ],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    if (textBlock && textBlock.type === 'text') {
      return textBlock.text;
    }

    return FALLBACK_MESSAGE;
  } catch (err) {
    console.error('Claude API request failed:', err);
    return FALLBACK_MESSAGE;
  }
}

function isTemperatureDeprecatedError(err: unknown): boolean {
  const message = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : '';
  return message.includes('temperature') && message.includes('deprecated');
}

/**
 * Generic call for anything expecting a strict JSON response (chain
 * generation, fact-checking, diagnostic tree steps). Unlike processNotes,
 * this does NOT swallow errors into a fallback string — a caller building
 * a dependency chain needs to know a real failure happened, not silently
 * receive fallback text formatted as if it were valid JSON.
 *
 * On a "temperature is deprecated for this model" error, automatically
 * retries once WITHOUT temperature, rather than trying to predict ahead of
 * time which models will reject it. Predicting via model-name pattern
 * matching turned out fragile in practice — it depends on correctly
 * guessing every current and future naming variant Anthropic might use,
 * including whatever a deployment's CLAUDE_MODEL env var happens to be
 * set to, which this code has no visibility into. Reacting to the actual
 * error Anthropic returns works regardless of the model or naming scheme
 * involved, now or in the future.
 */
// Prompt caching lives only under the beta.promptCaching namespace at this
// SDK version (0.32.1) — cache_control isn't typed on the plain
// anthropic.messages.create() here (that only happened in later SDK
// releases, once caching went GA). Its cache_control shape is also older:
// {type: 'ephemeral'} only, no ttl variant — every cache write here uses
// the fixed ~5 minute default TTL, not the 1h option newer SDKs expose.
// response.content/.stop_reason/.usage.{input,output}_tokens are the same
// shape as the plain endpoint's Message, so callers below don't need to
// know or care which path served a given call.
// claude-sonnet-5 and claude-opus-5 run ADAPTIVE THINKING BY DEFAULT when
// the `thinking` param is simply omitted — a behavior change from every
// prior model (Opus 4.8/4.7, Sonnet 4.6, ...), which ran with no thinking
// unless explicitly requested. Every call in this codebase is a rule-driven
// structured-JSON task (chain generation, lesson generation, answer
// checking) that doesn't need extended reasoning — but with thinking on
// and no explicit budget, the model can spend the ENTIRE max_tokens
// allowance on internal thinking and return zero actual output
// (stop_reason: max_tokens, content: [thinking], no text block at all).
// Explicitly disabling it here is what actually fixes that, not a bigger
// max_tokens — a bigger budget just gives it more room to think instead of
// answering. Scoped to the specific model IDs that default to on, rather
// than applied unconditionally: older/other models (Opus 4.8, Haiku) don't
// document a "disabled" thinking type at all and may reject it.
const THINKS_BY_DEFAULT_MODELS = new Set(['claude-sonnet-5', 'claude-opus-5']);

async function makeMessageRequest(
  model: string,
  systemPrompt: string,
  content: string | Array<Anthropic.Messages.TextBlockParam | Anthropic.Messages.ImageBlockParam>,
  maxTokens: number | undefined,
  temperature: number | undefined,
  includeTemperature: boolean,
  cacheSystemPrompt: boolean
) {
  const params = {
    model,
    max_tokens: maxTokens ?? 2048,
    ...(includeTemperature ? { temperature } : {}),
    ...(THINKS_BY_DEFAULT_MODELS.has(model) ? { thinking: { type: 'disabled' as const } } : {}),
    messages: [{ role: 'user' as const, content }],
  };
  // Only worth marking cacheable for the handful of large, FIXED prompts
  // (chain generation, encoding lesson batch generation) that are
  // byte-identical across every concept and every student — the whole
  // point of a prefix cache. Below Claude's per-model minimum (1024
  // tokens on the Opus/Sonnet models this codebase uses) a cache_control
  // marker silently does nothing, so opt-in per call rather than always-on
  // to avoid spending the write premium on prompts too small to benefit
  // (fact-check, step repair, diagram verification are all under it).
  if (cacheSystemPrompt) {
    return anthropic.beta.promptCaching.messages.create({
      ...params,
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
    });
  }
  return anthropic.messages.create({ ...params, system: systemPrompt });
}

async function sendWithTemperatureRetry(
  model: string,
  systemPrompt: string,
  content: string | Array<Anthropic.Messages.TextBlockParam | Anthropic.Messages.ImageBlockParam>,
  maxTokens: number | undefined,
  temperature: number | undefined,
  cacheSystemPrompt = false
): Promise<string> {
  let response;
  try {
    response = await makeMessageRequest(model, systemPrompt, content, maxTokens, temperature, true, cacheSystemPrompt);
  } catch (err) {
    if (!isTemperatureDeprecatedError(err)) throw err;
    console.warn(`Claude call to "${model}" rejected temperature — retrying without it.`);
    response = await makeMessageRequest(model, systemPrompt, content, maxTokens, temperature, false, cacheSystemPrompt);
  }

  const textBlock = response.content.find((block) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    // Bare "no text content" alone isn't enough to diagnose which of several
    // very different causes this was (ran out of max_tokens before any text
    // block started, a refusal, an empty content array) — stop_reason and
    // the actual block types are the only things that tell them apart, and
    // there's no way to get them again after the fact, so log them now.
    throw new Error(
      `Claude response contained no text content (model=${model}, stop_reason=${response.stop_reason}, ` +
        `blocks=[${response.content.map((b) => b.type).join(', ')}], output_tokens=${response.usage?.output_tokens})`
    );
  }
  return textBlock.text;
}

export async function callClaudeJSON(params: {
  model: string;
  systemPrompt: string;
  userContent: string;
  maxTokens?: number;
  temperature?: number;
  // Opt-in ephemeral cache_control (1h TTL) on the system prompt — only
  // worth setting for large, FIXED prompts reused verbatim across many
  // calls (e.g. chain generation, encoding lesson batch generation). See
  // makeMessageRequest's comment for why this isn't just always-on.
  cacheSystemPrompt?: boolean;
}): Promise<string> {
  return sendWithTemperatureRetry(params.model, params.systemPrompt, params.userContent, params.maxTokens, params.temperature, params.cacheSystemPrompt);
}

export interface ClaudeImageInput {
  mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
  base64Data: string;
  label: string; // e.g. "Candidate 1: <title>" — precedes the image so Claude can refer back to it by index reliably
}

/**
 * Same as callClaudeJSON, but for calls that need to show Claude one or
 * more images alongside the text (e.g. picking the best diagram candidate).
 * Kept as a separate function rather than an optional param on
 * callClaudeJSON so the common text-only path stays simple.
 */
export async function callClaudeJSONWithImages(params: {
  model: string;
  systemPrompt: string;
  userText: string;
  images: ClaudeImageInput[];
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const content: Array<Anthropic.Messages.TextBlockParam | Anthropic.Messages.ImageBlockParam> = [{ type: 'text', text: params.userText }];
  for (const image of params.images) {
    content.push({ type: 'text', text: image.label });
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: image.mediaType, data: image.base64Data },
    });
  }
  return sendWithTemperatureRetry(params.model, params.systemPrompt, content, params.maxTokens, params.temperature);
}
