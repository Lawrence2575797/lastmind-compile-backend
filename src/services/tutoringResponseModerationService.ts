import { supabaseAdmin } from './supabaseAdmin';

const MAX_REASON_LENGTH = 500;

// Reactive layer behind the pre-release moderation in
// tutoringResponseService.ts (the primary safety mechanism — nothing
// reaches the requester unfiltered or unflagged). Either participant can
// report; no admin UI in v1 — flagged/reported rows get reviewed
// manually via the Supabase console, a legitimate first answer rather
// than building an admin surface nobody's asked for yet (see the plan's
// Phase 4).
export async function reportResponse(userId: string, sessionId: string, reason: string): Promise<void> {
  const trimmedReason = (reason || '').trim().slice(0, MAX_REASON_LENGTH);
  if (!trimmedReason) throw new Error('a reason is required');

  const { data: sessionRow, error: sessionError } = await supabaseAdmin
    .from('tutoring_sessions')
    .select('id, requester_id, helper_id')
    .eq('id', sessionId)
    .maybeSingle();
  if (sessionError) throw sessionError;
  if (!sessionRow || (sessionRow.requester_id !== userId && sessionRow.helper_id !== userId)) {
    throw new Error('session not found');
  }

  const { data: responseRow, error: responseError } = await supabaseAdmin
    .from('tutoring_responses')
    .select('id')
    .eq('session_id', sessionId)
    .maybeSingle();
  if (responseError) throw responseError;

  const { error: insertError } = await supabaseAdmin.from('tutoring_response_reports').insert({
    session_id: sessionId,
    response_id: responseRow?.id || null,
    reporter_id: userId,
    reason: trimmedReason,
  });
  if (insertError) throw insertError;
}
