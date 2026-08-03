import Anthropic from '@anthropic-ai/sdk';

const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5';

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
      model: CLAUDE_MODEL,
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
