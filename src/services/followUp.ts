import crypto from 'crypto';
import { parseModelJson } from './jsonParsing';

// A wrong answer no longer sends the student back to edit the same answer:
// the marker's own call also writes a fresh question aimed at the specific
// thing they got wrong (see FOLLOW_UP_RULE in knowledgeMapAnswerCheckPrompt.ts),
// costing only the extra output tokens of the one call already being made.
//
// The follow-up's mark scheme must never reach the client, yet the retry has
// to be graded against it, so it travels as an AES-GCM sealed token bound to
// the user - stateless (survives restarts, needs no table) and unreadable /
// unforgeable from the browser. The retry goes to the SAME route as the
// original submit with `followUpToken` added; that route swaps the question
// and mark scheme for the token's and otherwise runs unchanged, so retry
// counts, scheduling and unlocks behave exactly as for an ordinary retry.
const KEY = crypto
  .createHash('sha256')
  .update(`lastmind-follow-up:${process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_URL || 'dev-only-key'}`)
  .digest();
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

export interface FollowUpQuestion {
  questionText: string;
  markScheme: string;
}

function seal(userId: string, q: FollowUpQuestion): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const body = Buffer.concat([cipher.update(JSON.stringify({ u: userId, q: q.questionText, m: q.markScheme, t: Date.now() }), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
}

export function openFollowUp(userId: string, token: unknown): FollowUpQuestion | null {
  if (typeof token !== 'string' || !token) return null;
  try {
    const buf = Buffer.from(token, 'base64url');
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(12, 28));
    const parsed = JSON.parse(Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8')) as { u: string; q: string; m: string; t: number };
    if (parsed.u !== userId || Date.now() - parsed.t > MAX_AGE_MS) return null;
    return { questionText: parsed.q, markScheme: parsed.m };
  } catch {
    return null;
  }
}

// What the client receives with a wrong answer: the question text to show
// and the sealed token to send back with the retry.
export interface FollowUpForClient {
  questionText: string;
  token: string;
}

// Best-effort: a missing or malformed follow-up simply means the student gets
// the old edit-and-retry behaviour, never a failed submission.
export function followUpFromGrading(userId: string, raw: string): FollowUpForClient | undefined {
  try {
    const parsed = parseModelJson<{ followUpQuestion?: unknown; followUpMarkScheme?: unknown }>(raw);
    const questionText = typeof parsed.followUpQuestion === 'string' ? parsed.followUpQuestion.trim() : '';
    const markScheme = typeof parsed.followUpMarkScheme === 'string' ? parsed.followUpMarkScheme.trim() : '';
    if (!questionText || !markScheme) return undefined;
    return { questionText, token: seal(userId, { questionText, markScheme }) };
  } catch {
    return undefined;
  }
}
