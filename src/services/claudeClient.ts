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
  // once per concept, then cached and reused across every student who
  // hits it), but high-leverage: a wrong chain silently corrupts every
  // diagnosis built on top of it. Worth paying more per call here
  // specifically because the cost doesn't scale with usage volume.
  chainGeneration: 'claude-opus-4-8',
  factCheck: 'claude-opus-4-8',
  // The diagnostic tree itself — corrections, contrastive cues, the
  // nuanced pedagogical judgment calls.
  diagnosticTree: process.env.CLAUDE_MODEL || 'claude-sonnet-5',
  // Simple, high-volume, low-stakes calls — a single retrieval question,
  // the careless-slip micro-probe. Runs on every diagnostic event, so
  // savings here compound across the whole user base.
  simpleQuestion: 'claude-haiku-4-5-20251001',
} as const;

// Anthropic deprecated the `temperature` (and top_p/top_k) parameter
// entirely for Claude Opus 4.7 and all later models, including the
// claude-opus-4-8 used above — any explicit value, even 0, now returns a
// 400 error. Checked centrally here, once, rather than relying on every
// call site to remember not to pass it — that approach already caused two
// separate outages today (chainService.ts, then spacedLessonEngine.ts's
// own call using MODELS.diagnosticTree, which resolves to an Opus model
// whenever CLAUDE_MODEL happens to be set to one).
function modelSupportsTemperature(model: string): boolean {
  return !/opus-4-[7-9]/.test(model) && !/opus-4-\d{2,}/.test(model);
}

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

/**
 * Generic call for anything expecting a strict JSON response (chain
 * generation, fact-checking, diagnostic tree steps). Unlike processNotes,
 * this does NOT swallow errors into a fallback string — a caller building
 * a dependency chain needs to know a real failure happened, not silently
 * receive fallback text formatted as if it were valid JSON.
 */
export async function callClaudeJSON(params: {
  model: string;
  systemPrompt: string;
  userContent: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const response = await anthropic.messages.create({
    model: params.model,
    max_tokens: params.maxTokens ?? 2048,
    ...(modelSupportsTemperature(params.model) ? { temperature: params.temperature } : {}),
    system: params.systemPrompt,
    messages: [{ role: 'user', content: params.userContent }],
  });

  const textBlock = response.content.find((block) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude response contained no text content');
  }
  return textBlock.text;
}
