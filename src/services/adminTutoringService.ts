import { supabaseAdmin } from './supabaseAdmin';
import { formatConceptOrLinkLabel } from './reviewService';
import { createAssignedSession, TutoringSession } from './tutoringSessionService';

export interface UnfulfilledHelpRequest {
  id: string;
  requesterId: string;
  conceptId: string;
  conceptLabel: string;
  subject: string;
  topic: string | null;
  createdAt: string;
  missedHelperCount: number;
}

/**
 * The owner's personal safety net — every help_request
 * sweepExpiredHelpRequests marked 'unfulfilled' because every tutor picked
 * for it missed the deadline with nobody ever submitting. Enriched with
 * how many tutors actually missed it, purely as context for the owner
 * deciding what to answer first.
 */
export async function listUnfulfilledHelpRequests(): Promise<UnfulfilledHelpRequest[]> {
  const { data: requests, error } = await supabaseAdmin
    .from('help_requests')
    .select('id, requester_id, concept_id, subject, topic, created_at')
    .eq('status', 'unfulfilled')
    .order('created_at', { ascending: true });
  if (error) throw error;
  if (!requests || !requests.length) return [];

  const requestIds = requests.map((r) => r.id as string);
  const { data: sessions, error: sessionError } = await supabaseAdmin
    .from('tutoring_sessions')
    .select('help_request_id')
    .in('help_request_id', requestIds)
    .eq('status', 'missed_deadline');
  if (sessionError) throw sessionError;
  const missedCounts = new Map<string, number>();
  (sessions || []).forEach((s) => {
    const id = s.help_request_id as string;
    missedCounts.set(id, (missedCounts.get(id) || 0) + 1);
  });

  return requests.map((r) => ({
    id: r.id,
    requesterId: r.requester_id,
    conceptId: r.concept_id,
    conceptLabel: formatConceptOrLinkLabel(r.concept_id),
    subject: r.subject,
    topic: r.topic,
    createdAt: r.created_at,
    missedHelperCount: missedCounts.get(r.id as string) || 0,
  }));
}

/**
 * The owner steps in personally on one unfulfilled request — creates a
 * completely normal tutoring_sessions row assigning them as helper (via
 * the same createAssignedSession every other tutor's session goes through),
 * deliberately bypassing the opt-in/mastery eligibility checks every other
 * helper is re-verified against — that's the whole point of an admin
 * fallback. From here on the owner's OWN account uses the exact same
 * My-Tutoring "asHelper" flow to write and submit a response.
 */
export async function adminClaimHelpRequest(adminUserId: string, helpRequestId: string): Promise<TutoringSession> {
  const { data: request, error: fetchError } = await supabaseAdmin
    .from('help_requests')
    .select('id, concept_id, requester_id, status')
    .eq('id', helpRequestId)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!request) throw new Error('help request not found');
  if (request.status !== 'unfulfilled') throw new Error('this request is not currently unfulfilled');

  const session = await createAssignedSession(helpRequestId, request.requester_id, adminUserId, request.concept_id);

  const { error: updateError } = await supabaseAdmin
    .from('help_requests')
    .update({ status: 'assigned' })
    .eq('id', helpRequestId);
  if (updateError) throw updateError;

  return session;
}
