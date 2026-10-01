import { callClaudeJSON, MODELS } from './claudeClient';
import { CORTEX_INTENT_PROMPT } from '../constants/cortexPrompts';
import { checkTopicScope } from './topicScopeService';

// Beyond stripping a code fence, also falls back to the substring between
// the first "{" and the last "}" - covers the model adding a stray
// sentence of commentary before or after the JSON object despite rule 1,
// which plain fence-stripping doesn't touch. Doesn't fix an unescaped
// quote/newline INSIDE the object (that's a genuinely malformed string,
// not surrounding noise) - see CORTEX_INTENT_PROMPT's rule 1 for that.
function stripCodeFences(text: string): string {
  const fenced = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    JSON.parse(fenced);
    return fenced;
  } catch {
    const first = fenced.indexOf('{');
    const last = fenced.lastIndexOf('}');
    if (first !== -1 && last > first) return fenced.slice(first, last + 1);
    return fenced;
  }
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

// Real, confirmed cost problem this fixes: the previous shape serialized
// EVERY subfolder and EVERY page's own title into this one request's
// userContent - uncached, on every single Cortex message regardless of
// what it was actually about - for a real account with a real course
// (hundreds of lesson pages across several subjects), that was the actual
// dominant cost of a Cortex conversation, dwarfing the map/lesson
// generation calls students were blaming instead. Cortex's own job here
// (general conversational grounding - "since you're doing AQA Biology...")
// never needed the full page list, just what's being studied and roughly
// how far into it the student is - counts, not titles.
export interface CortexFolderSummary {
  name: string;
  qualification: string;
  examBoard?: string;
  institution?: string;
  moduleCode?: string;
  subfolderCount: number;
  pageCount: number;
  completedPageCount: number;
}

export interface CortexDueReview {
  conceptId: string;
  label: string;
}

export interface CortexHistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

// Deliberately just a conversational reply, plus two narrow declared-
// intent fields - see cortexPrompts.ts's own top comment for why the old,
// broad structural "actions" system (folder/page/review manipulation,
// curriculum layout-and-creation) stays removed, and why startTopic/
// retryFailedLesson are a different, bounded thing rather than a
// reintroduction of it: Cortex only ever RECOGNIZES one of these two
// specific intents from natural phrasing, it never carries either out -
// the frontend's own deterministic code does that (see
// cortex/index.html's startTopicLearnFlow/pendingLessonRetry).
export interface CortexResult {
  reply: string;
  // True only when the student's own message explicitly asked for the
  // response to be read aloud — the frontend defaults to text-only and
  // speaks automatically only when this is set (see
  // CORTEX_INTENT_PROMPT's speakAloud rule). Every reply still gets its
  // own manual "read aloud" button regardless of this flag.
  speakAloud: boolean;
  // Set only when the student's message (in whatever phrasing) is asking
  // to start learning a brand-new topic - the topic itself, phrased the
  // way it'd be typed into a "teach me ___" box. The frontend builds that
  // topic's knowledge map when this is present; absent otherwise.
  startTopic?: string;
  // Set only when the most recent thing that happened was a lesson that
  // failed to generate (see the bracket-note convention) and the
  // student's message is asking to retry it. The frontend retries that
  // specific lesson when this is true; absent/false otherwise.
  retryFailedLesson?: boolean;
  // Set only when a topic map already exists in this chat (see the
  // bracket-note convention's own "[Built a knowledge map for ...]" note)
  // and the student's message (in whatever phrasing) is asking to begin or
  // continue its lessons - "start the lessons", "can we start with the
  // lessons then please", "generate the first one", "let's carry on". Real,
  // reported gap this closes: the client's own free fast-path only catches
  // a narrow set of exact phrasings for this, and unlike startTopic/
  // retryFailedLesson above, there was previously no general fallback for
  // it at all, so anything outside that narrow set fell through to a plain
  // chat reply that could not actually start anything.
  beginQueuedLessons?: boolean;
  // Set only when a topic map already exists in this chat and the
  // student's message (in whatever phrasing) is asking to extend its
  // prerequisites further back - "I don't understand the first concepts",
  // "can you extend the prerequisite chain backwards", "go back further
  // before that". The frontend adds new, earlier nodes feeding into the
  // map's current root(s) and re-renders it when this is true; absent/
  // false otherwise.
  extendPrerequisitesBackward?: boolean;
  // Mirror of extendPrerequisitesBackward for the forward direction - set
  // only when a topic map already exists and the student is asking to keep
  // going past its current endpoint. The frontend adds new, more advanced
  // nodes beyond the map's current leaf/final-task node(s) and re-renders
  // it when this is true; absent/false otherwise.
  extendPrerequisitesForward?: boolean;
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

  // Cheap (Haiku) pre-flight gate before a real (Sonnet) map generation:
  // "teach me linear algebra" or "teach me chemistry" is broad enough that
  // building a map for it right away tends to either run too shallow or
  // assume the wrong starting point - asking a couple of genuinely useful,
  // topic-specific questions first (never a fixed checklist - see
  // topicScopePrompt.ts) produces a far better map once it actually
  // generates. Only ever gates startTopic, never blocks anything else Cortex
  // can already do - and fails open (see checkTopicScope) so a scope-check
  // problem can never be the reason a student can't start learning
  // something. The student's next reply (answering these questions) is
  // ordinary chat history by the time it comes back - rule in
  // CORTEX_INTENT_PROMPT tells Cortex to fold the answer into a re-scoped
  // startTopic itself, no separate state needs tracking here.
  if (parsed.startTopic) {
    const scope = await checkTopicScope(parsed.startTopic, userId);
    if (!scope.specific) {
      parsed = { ...parsed, reply: `${parsed.reply}\n\n${scope.questions.join(' ')}`, startTopic: undefined };
    }
  }

  return parsed;
}
