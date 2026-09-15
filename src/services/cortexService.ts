import { callClaudeJSON, MODELS } from './claudeClient';
import { CORTEX_INTENT_PROMPT } from '../constants/cortexPrompts';

function stripCodeFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}

// Thrown specifically when the reply call's response couldn't be parsed as
// JSON — almost always because it got cut off mid-output (stop_reason:
// max_tokens) rather than a genuinely malformed reply, since
// CORTEX_INTENT_PROMPT's rule 1 is "output ONLY valid JSON". Kept as its
// own type so routes/cortex.ts can hand back an actionable message ("ask
// for less at once") instead of the generic catch-all — a plain rethrow
// here is indistinguishable from every other failure mode by the time it
// reaches the route.
export class CortexResponseTruncatedError extends Error {
  constructor() {
    super('That was a lot to take in at once, so the response got cut off. Try asking again in a shorter or more specific way.');
    this.name = 'CortexResponseTruncatedError';
  }
}

export interface CortexPageSummary {
  title: string;
  done: boolean;
}

export interface CortexFolderSummary {
  name: string;
  qualification: string;
  examBoard?: string;
  institution?: string;
  moduleCode?: string;
  subfolders: { name: string; pages: CortexPageSummary[] }[];
  pages: CortexPageSummary[];
}

export interface CortexDueReview {
  conceptId: string;
  label: string;
}

export interface CortexHistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

// Deliberately just a conversational reply now - see cortexPrompts.ts's
// own top comment for why the structural "actions" system (folder/page/
// review manipulation, curriculum layout-and-creation) was removed
// entirely, by explicit product decision. Cortex is general learning
// assistance only; it no longer does anything to the student's account.
export interface CortexResult {
  reply: string;
  // True only when the student's own message explicitly asked for the
  // response to be read aloud — the frontend defaults to text-only and
  // speaks automatically only when this is set (see
  // CORTEX_INTENT_PROMPT's speakAloud rule). Every reply still gets its
  // own manual "read aloud" button regardless of this flag.
  speakAloud: boolean;
}

/**
 * Answers one Cortex chat turn, from a single JSON-schema Claude call —
 * same convention every other prompt in this backend uses, deliberately
 * not the SDK's native tool-use, so this doesn't introduce a second
 * pattern for the same job. Chat history is passed in fresh each call
 * rather than stored server-side, matching how the diagnostic engine's
 * `state` is round-tripped opaquely elsewhere. folders/dueReviews are
 * passed purely as background context so answers can refer to what the
 * student is actually studying - Cortex never acts on them.
 */
export async function decideCortexAction(
  message: string,
  history: CortexHistoryTurn[],
  folders: CortexFolderSummary[],
  dueReviews: CortexDueReview[],
  userId: string
): Promise<CortexResult> {
  const userContent = [
    `Folder structure (context only):\n${JSON.stringify(folders)}`,
    `Due reviews (context only):\n${JSON.stringify(dueReviews)}`,
    history.length
      ? `Recent conversation:\n${history.map((h) => `${h.role}: ${h.content}`).join('\n')}`
      : 'No prior conversation this session.',
    `Student's latest message: ${message}`,
  ].filter(Boolean).join('\n\n');

  let raw: string;
  try {
    raw = await callClaudeJSON({
      model: MODELS.diagnosticTree,
      systemPrompt: CORTEX_INTENT_PROMPT,
      userContent,
      temperature: 0.3,
      maxTokens: 4096,
      cacheSystemPrompt: true,
      userId,
      meteredReason: 'cortex-chat',
    });
  } catch (err) {
    console.error('LastMind: Cortex reply call produced no usable text (likely max_tokens with no output).', err);
    throw new CortexResponseTruncatedError();
  }

  let parsed: CortexResult;
  try {
    parsed = JSON.parse(stripCodeFences(raw)) as CortexResult;
  } catch (err) {
    console.error('LastMind: Cortex reply call returned invalid JSON (likely truncated).', { raw });
    throw new CortexResponseTruncatedError();
  }
  return parsed;
}
