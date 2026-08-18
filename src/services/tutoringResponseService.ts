import { supabaseAdmin } from './supabaseAdmin';
import { applyStructuredPIIFilter } from '../safety/piiFilterStructured';
import { applyContextualPIIFilter } from '../safety/piiFilterContextual';
import { applyHarmfulContentFilter } from '../safety/harmfulContentFilter';
import { markSubmitted, maybeReleaseSession } from './tutoringSessionService';

const MAX_BODY_LENGTH = 4000;

// Whether to retain the pre-filter original alongside the filtered version
// — off by default. Legal's eventual answer on retention shouldn't require
// a schema migration, only flipping this env var (see the plan's Phase 3).
const RETAIN_RAW_RESPONSES = process.env.RETAIN_RAW_RESPONSES === 'true';

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
    .select('id, helper_id, status')
    .eq('id', sessionId)
    .maybeSingle();
  if (sessionError) throw sessionError;
  if (!sessionRow) throw new Error('session not found');
  if (sessionRow.helper_id !== userId) throw new Error('only the assigned helper can submit a response');
  if (sessionRow.status !== 'assigned') throw new Error('this session is not currently awaiting a response');

  const cleaned1 = applyStructuredPIIFilter(trimmed);
  const cleaned2 = applyContextualPIIFilter(cleaned1);
  const safeBody = applyHarmfulContentFilter(cleaned2);

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('tutoring_responses')
    .insert({
      session_id: sessionId,
      helper_id: userId,
      body: safeBody,
      raw_body: RETAIN_RAW_RESPONSES ? trimmed : null,
    })
    .select()
    .single();
  if (insertError) throw insertError;

  await markSubmitted(sessionId);

  return rowToResponse(inserted);
}

export interface TutoringResponseView {
  available: boolean;
  body: string | null;
  releasedAt: string | null;
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
    return { available: false, body: null, releasedAt: null };
  }

  const { data: responseRow, error: responseError } = await supabaseAdmin
    .from('tutoring_responses')
    .select('body')
    .eq('session_id', sessionId)
    .maybeSingle();
  if (responseError) throw responseError;

  return { available: true, body: responseRow?.body || null, releasedAt: session.releasedAt };
}
