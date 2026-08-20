import { supabaseAdmin } from './supabaseAdmin';
import { applyStructuredPIIFilter } from '../safety/piiFilterStructured';
import { applyContextualPIIFilter } from '../safety/piiFilterContextual';
import { applyHarmfulContentFilter } from '../safety/harmfulContentFilter';
import { markSubmitted, maybeReleaseSession } from './tutoringSessionService';
import { adjustCredits } from './creditService';

const MAX_BODY_LENGTH = 4000;

// Flat placeholder, same scale as creditService.ts's own
// INITIAL_CREDIT_ALLOWANCE=40 (roughly 8 free requests from the signup
// bonus alone) — real per-activity pricing hasn't been decided yet
// project-wide, see creditService.ts's own header comment. Charged once,
// only to whichever helper's response actually wins the race (see
// submitResponse below) — the other picked helpers cost nothing, since
// they never did anything.
const HELP_REQUEST_COST = 5;

// Whether to retain the pre-filter original alongside the filtered version
// — off by default. Legal's eventual answer on retention shouldn't require
// a schema migration, only flipping this env var (see the plan's Phase 3).
const RETAIN_RAW_RESPONSES = process.env.RETAIN_RAW_RESPONSES === 'true';

// Heuristic, not ML — same spirit as piiFilterContextual.ts's own regex
// table, honestly documented as such rather than pretending this is a
// real classifier. Two categories worth a human's attention that the PII/
// harmful-content pipeline above isn't aimed at: self-harm language, and
// solicitation to move the conversation off-platform (the actual on-ramp
// to unsupervised minor-to-minor contact this whole feature is designed
// to avoid — see the plan's legal discussion). Checked against the
// ORIGINAL text, not the filtered body, since redaction shouldn't hide
// intent from a reviewer.
const FLAGGED_PATTERNS: RegExp[] = [
  /\b(kill myself|suicid\w*|self[- ]harm|end my life|want(ed)? to die|hurt myself)\b/i,
  /\b(add me on|my (snap(chat)?|insta(gram)?|whatsapp|discord|kik|tiktok) is|dm me on|follow me on|text me (at|on)|call me (at|on))\b/i,
];

function isHeuristicallyFlagged(text: string): boolean {
  return FLAGGED_PATTERNS.some((pattern) => pattern.test(text));
}

export interface TutoringResponse {
  id: string;
  sessionId: string;
  helperId: string;
  body: string;
  flagged: boolean;
  createdAt: string;
}

function rowToResponse(row: any): TutoringResponse {
  return {
    id: row.id,
    sessionId: row.session_id,
    helperId: row.helper_id,
    body: row.body,
    flagged: row.flagged,
    createdAt: row.created_at,
  };
}

// The only way a written response ever reaches persistence — runs through
// the exact same 3-step pipeline routes/compile.ts already uses before
// anything touches Claude, applied here before anything touches the
// requester. There is no path in this feature where an unfiltered body
// gets stored or shown; the entire async delivery model (see the plan's
// Decisions section) depends on this being non-optional.
export async function submitResponse(userId: string, sessionId: string, body: string): Promise<TutoringResponse> {
  const trimmed = (body || '').trim();
  if (!trimmed) throw new Error('a response is required');
  if (trimmed.length > MAX_BODY_LENGTH) throw new Error(`response is too long (max ${MAX_BODY_LENGTH} characters)`);

  const { data: sessionRow, error: sessionError } = await supabaseAdmin
    .from('tutoring_sessions')
    .select('id, helper_id, requester_id, help_request_id, status')
    .eq('id', sessionId)
    .maybeSingle();
  if (sessionError) throw sessionError;
  if (!sessionRow) throw new Error('session not found');
  if (sessionRow.helper_id !== userId) throw new Error('only the assigned helper can submit a response');
  if (sessionRow.status !== 'assigned') throw new Error('this session is not currently awaiting a response');

  const cleaned1 = applyStructuredPIIFilter(trimmed);
  const cleaned2 = applyContextualPIIFilter(cleaned1);
  const safeBody = applyHarmfulContentFilter(cleaned2);
  const flagged = isHeuristicallyFlagged(trimmed);

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('tutoring_responses')
    .insert({
      session_id: sessionId,
      helper_id: userId,
      body: safeBody,
      raw_body: RETAIN_RAW_RESPONSES ? trimmed : null,
      flagged,
    })
    .select()
    .single();
  if (insertError) throw insertError;

  // markSubmitted's own conditional `.eq('status','assigned')` update is
  // the real race-safety here — if a sibling helper's submission already
  // won in between our read above and this call, this throws and nothing
  // below runs. Reaching past this line means THIS session genuinely won.
  await markSubmitted(sessionId);

  // First response wins — every other helper picked for this same
  // help_request never did anything and owes nothing, so their obligation
  // is simply dropped. Best-effort: a picked-but-not-yet-submitted sibling
  // losing this race is a normal, expected outcome, not a failure worth
  // surfacing to anyone.
  const { error: cancelError } = await supabaseAdmin
    .from('tutoring_sessions')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('help_request_id', sessionRow.help_request_id)
    .eq('status', 'assigned')
    .neq('id', sessionId);
  if (cancelError) throw cancelError;

  await Promise.all([
    adjustCredits(sessionRow.requester_id, -HELP_REQUEST_COST, 'tutoring_help_received'),
    adjustCredits(userId, HELP_REQUEST_COST, 'tutoring_response_given'),
  ]);

  return rowToResponse(inserted);
}

export interface TutoringResponseView {
  available: boolean;
  body: string | null;
  releasedAt: string | null;
  heldForReview: boolean;
}

// Requester-only — the helper's own copy of what they wrote isn't
// surfaced back to them in v1 (see the plan's Phase 3: this is a one-shot
// write, not something the helper needs to review afterward). Calls
// maybeReleaseSession first so a release_time that's just now passed is
// caught on this read rather than needing some other trigger.
export async function getResponse(userId: string, sessionId: string): Promise<TutoringResponseView> {
  const { data: sessionRow, error: sessionError } = await supabaseAdmin
    .from('tutoring_sessions')
    .select('id, requester_id')
    .eq('id', sessionId)
    .maybeSingle();
  if (sessionError) throw sessionError;
  if (!sessionRow || sessionRow.requester_id !== userId) throw new Error('session not found');

  const session = await maybeReleaseSession(sessionId);
  if (!session || session.status !== 'released') {
    return { available: false, body: null, releasedAt: null, heldForReview: false };
  }

  const { data: responseRow, error: responseError } = await supabaseAdmin
    .from('tutoring_responses')
    .select('body, flagged')
    .eq('session_id', sessionId)
    .maybeSingle();
  if (responseError) throw responseError;

  // A flagged response stays held even past its release time until a
  // reviewer clears it (there's no admin UI in v1 — see the plan's Phase
  // 4 — so clearing means flipping `flagged` back to false directly in
  // the Supabase console once reviewed). Safer default given everything
  // already discussed about this feature's legal exposure.
  if (responseRow?.flagged) {
    return { available: false, body: null, releasedAt: null, heldForReview: true };
  }

  return { available: true, body: responseRow?.body || null, releasedAt: session.releasedAt, heldForReview: false };
}
