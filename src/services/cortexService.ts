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

// Kept so older frontends that match on this exact sentence still behave, but
// nothing in the chat path throws it any more: a reply is plain text now, so
// there is no JSON to get cut off in the middle.
export class CortexResponseTruncatedError extends Error {
  constructor() {
    super('That was a lot to take in at once, so the response got cut off. Try asking again in a shorter or more specific way.');
    this.name = 'CortexResponseTruncatedError';
  }
}

// Thrown only when every attempt at a reply failed (the model call itself
// errored or came back empty, on the chat model and on the fallback). The
// real cause is logged where it happens. This message says what is actually
// true, instead of blaming the student's message for a service problem.
export class CortexUnavailableError extends Error {
  constructor(detail?: string) {
    super(detail ? `LastMind couldn't reply: ${detail}` : "LastMind couldn't reply just now. Please try again in a moment.");
    this.name = 'CortexUnavailableError';
  }
}

// One readable line saying what actually went wrong, for the message the
// student (and we) see instead of a vague apology: the HTTP status and the
// provider's own wording when there is one ("credit balance is too low",
// "model not found", "overloaded"). Anything that looks like a key or token
// is removed first, and the length is capped.
export function describeCortexError(err: unknown): string {
  const e = err as { status?: number; message?: string; error?: { error?: { message?: string } } } | undefined;
  const status = e && typeof e.status === 'number' ? `HTTP ${e.status}` : '';
  const raw = (e && (e.error?.error?.message || e.message)) || String(err);
  const msg = String(raw)
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, '[key]')
    .replace(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_.-]+/g, '[token]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [token]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
  return [status, msg].filter(Boolean).join(': ') || 'unknown error';
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
  // Set only when the student asks to practise a conversation in a language they are learning. The frontend opens the practice
  // conversation (see /cortex/conversation); the value is the language's name.
  startConversation?: string;
}

// The reply is ordinary text. When the message is one of the few recognized
// requests, the model adds one last line, "@@FLAGS {json}", that the app reads
// and the student never sees. This tolerates every way that can go slightly
// wrong - a missing line, broken JSON after the marker, a stray code fence, or
// the model replying with the old JSON object from habit - and only returns
// null when there is genuinely no reply text at all.
export const CORTEX_FLAGS_MARKER = '@@FLAGS';
export function parseCortexReply(raw: string): CortexResult | null {
  const text = (raw || '').trim();
  if (!text) return null;
  const build = (reply: string, flags: Record<string, unknown>): CortexResult | null => {
    let r = reply.trim();
    const topic = typeof flags.startTopic === 'string' && flags.startTopic.trim() ? flags.startTopic.trim() : undefined;
    if (!r && topic) r = 'On it.';
    if (!r) return null;
    const out: CortexResult = { reply: r, speakAloud: flags.speakAloud === true };
    if (topic) out.startTopic = topic;
    if (flags.beginQueuedLessons === true) out.beginQueuedLessons = true;
    if (flags.retryFailedLesson === true) out.retryFailedLesson = true;
    if (flags.extendPrerequisitesBackward === true) out.extendPrerequisitesBackward = true;
    if (flags.extendPrerequisitesForward === true) out.extendPrerequisitesForward = true;
    if (typeof flags.startConversation === 'string' && /^[A-Za-z][A-Za-z '\-]{1,30}$/.test(flags.startConversation.trim())) out.startConversation = flags.startConversation.trim();
    return out;
  };
  const jsonish = stripCodeFences(text);
  if (jsonish.startsWith('{')) {
    try {
      const p = JSON.parse(jsonish) as Record<string, unknown>;
      if (typeof p.reply === 'string' && p.reply.trim()) return build(p.reply, p);
    } catch {
      // not JSON after all - treat as plain text below
    }
  }
  const idx = text.lastIndexOf(CORTEX_FLAGS_MARKER);
  if (idx === -1) return build(text, {});
  let flags: Record<string, unknown> = {};
  const tail = text.slice(idx + CORTEX_FLAGS_MARKER.length);
  const first = tail.indexOf('{'), last = tail.lastIndexOf('}');
  if (first !== -1 && last > first) {
    try { flags = JSON.parse(tail.slice(first, last + 1)); } catch { flags = {}; }
  }
  return build(text.slice(0, idx), flags);
}

/**
 * Answers one Cortex chat turn. General chat runs on the small, fast chat
 * model (Haiku) and is a plain conversation, like talking to any assistant,
 * not a structured generation. If a call errors or comes back empty it is
 * tried once more, then once on the larger model as a fallback, so one
 * hiccup never reaches the student. Chat history is passed in fresh each
 * call rather than stored server-side. folders/dueReviews are passed purely
 * as background context so answers can refer to what the student is
 * actually studying - Cortex never acts on them.
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

  const attempts = [MODELS.chat, MODELS.chat, MODELS.diagnosticTree];
  let parsed: CortexResult | null = null;
  const details: string[] = [];
  const note = (d: string) => { if (!details.includes(d)) details.push(d); };
  for (let i = 0; i < attempts.length && !parsed; i++) {
    try {
      const raw = await callClaudeJSON({
        model: attempts[i],
        systemPrompt: CORTEX_INTENT_PROMPT,
        userContent,
        temperature: 0.5,
        maxTokens: 1600,
        userId,
        meteredReason: 'cortex-chat',
      });
      parsed = parseCortexReply(raw);
      if (!parsed) { note(`the model (${attempts[i]}) returned an empty reply`); console.error(`LastMind: Cortex reply from "${attempts[i]}" had no text (attempt ${i + 1} of ${attempts.length}).`, { raw }); }
    } catch (err) {
      note(`${attempts[i]} - ${describeCortexError(err)}`);
      console.error(`LastMind: Cortex reply call to "${attempts[i]}" failed (attempt ${i + 1} of ${attempts.length}).`, err);
    }
  }
  if (!parsed) throw new CortexUnavailableError(details.join(' | ').slice(0, 600));

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
