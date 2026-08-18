import { supabaseAdmin } from './supabaseAdmin';
import { getUsersWithMasteryForConcept } from './reviewService';
import { markHelperAssigned } from './tutoringProfileService';
import {
  createAssignedSession,
  listSessionsPastDeadline,
  markMissedDeadline,
  TutoringSession,
} from './tutoringSessionService';

export interface HelpRequest {
  id: string;
  requesterId: string;
  conceptId: string;
  subject: string;
  topic: string | null;
  status: 'open' | 'assigned' | 'resolved' | 'cancelled';
}

function rowToHelpRequest(row: any): HelpRequest {
  return {
    id: row.id,
    requesterId: row.requester_id,
    conceptId: row.concept_id,
    subject: row.subject,
    topic: row.topic,
    status: row.status,
  };
}

/**
 * Among the requester's own PAST tutoring_sessions, finds the most
 * recently assigned helper who both (a) helped with this same subject
 * before and (b) is still in the current eligible pool. This is the
 * whole "relationship continuity" mechanism — see the plan's Decisions
 * section: whether a recurring pairing actually adds value is unresolved,
 * so this stays a cheap preference layered on top of ordinary matching,
 * not a hard requirement that could leave a request unmatched.
 */
async function findPriorHelper(requesterId: string, subject: string, eligibleIds: string[]): Promise<string | null> {
  if (!eligibleIds.length) return null;
  const { data: sessions, error } = await supabaseAdmin
    .from('tutoring_sessions')
    .select('helper_id, help_request_id, assigned_at')
    .eq('requester_id', requesterId)
    .in('helper_id', eligibleIds)
    .order('assigned_at', { ascending: false });
  if (error) throw error;
  if (!sessions || !sessions.length) return null;

  const helpRequestIds = sessions.map((s) => s.help_request_id as string);
  const { data: requests, error: reqError } = await supabaseAdmin
    .from('help_requests')
    .select('id, subject')
    .in('id', helpRequestIds)
    .eq('subject', subject);
  if (reqError) throw reqError;
  const matchingRequestIds = new Set((requests || []).map((r) => r.id as string));

  const priorSession = sessions.find((s) => matchingRequestIds.has(s.help_request_id as string));
  return priorSession ? (priorSession.helper_id as string) : null;
}

/**
 * Finds one eligible helper for a concept — opted-in, not the requester,
 * and with real diagnostically-verified mastery of this exact concept
 * (see getUsersWithMasteryForConcept). Prefers a prior helper for this
 * subject when one is still eligible (see findPriorHelper); otherwise
 * falls back to whoever was assigned longest ago (nulls — never assigned
 * — sort first), a simple fairness rule so the same few strong students
 * don't get every request. Not school-scoped yet — see the plan's
 * "Deferred" section; this is the one query that gains a same-school
 * filter once that lands, nothing else about this function's shape needs
 * to change for it. `excludeHelperIds` is used by the missed-deadline
 * reassignment sweep below to also rule out whoever just missed their
 * deadline (plain `excludeUserId` alone only ever ruled out the requester).
 */
export async function findEligibleHelper(
  conceptId: string,
  subject: string,
  excludeUserId: string,
  excludeHelperIds: string[] = []
): Promise<string | null> {
  const excluded = new Set([excludeUserId, ...excludeHelperIds]);
  const { data: candidates, error } = await supabaseAdmin
    .from('tutoring_profiles')
    .select('user_id, last_assigned_at')
    .eq('tutoring_opt_in', true)
    .order('last_assigned_at', { ascending: true, nullsFirst: true });
  if (error) throw error;
  const pool = (candidates || []).filter((c) => !excluded.has(c.user_id as string));
  if (!pool.length) return null;

  const candidateIds = pool.map((c) => c.user_id as string);
  const mastered = await getUsersWithMasteryForConcept(candidateIds, conceptId);
  const eligible = pool.filter((c) => mastered.has(c.user_id as string));
  if (!eligible.length) return null;

  const eligibleIds = eligible.map((c) => c.user_id as string);
  const priorHelperId = await findPriorHelper(excludeUserId, subject, eligibleIds);
  if (priorHelperId) return priorHelperId;

  return eligibleIds[0]; // pool was already ordered least-recently-assigned first
}

/**
 * Always requester-initiated — the struggling student raises this, never
 * a helper browsing and picking who to help. If an eligible helper exists
 * right now, the match and the resulting tutoring_sessions row (see
 * tutoringSessionService.createAssignedSession) happen synchronously in
 * this same call — there's no separate "browse candidates" step for the
 * student to go through. If nobody's currently eligible, the request just
 * stays open; there's no retry/background job in v1 (see the plan) — a
 * genuinely newly-eligible helper appearing later won't automatically
 * pick this up yet.
 */
export async function createHelpRequest(
  userId: string,
  conceptId: string,
  subject: string,
  topic: string | null
): Promise<{ helpRequest: HelpRequest; session: TutoringSession | null }> {
  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('help_requests')
    .insert({ requester_id: userId, concept_id: conceptId, subject, topic })
    .select()
    .single();
  if (insertError) throw insertError;

  const helperId = await findEligibleHelper(conceptId, subject, userId);
  if (!helperId) {
    return { helpRequest: rowToHelpRequest(inserted), session: null };
  }

  const session = await createAssignedSession(inserted.id, userId, helperId, conceptId);
  await markHelperAssigned(helperId);

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('help_requests')
    .update({ status: 'assigned' })
    .eq('id', inserted.id)
    .select()
    .single();
  if (updateError) throw updateError;

  return { helpRequest: rowToHelpRequest(updated), session };
}

export async function getHelpRequest(userId: string, helpRequestId: string): Promise<HelpRequest | null> {
  const { data, error } = await supabaseAdmin
    .from('help_requests')
    .select('*')
    .eq('id', helpRequestId)
    .eq('requester_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToHelpRequest(data) : null;
}

/**
 * The actual reliability guarantee behind the "assigned task with a
 * deadline" framing: every session whose helper missed their deadline
 * gets marked missed_deadline and, if a different eligible helper exists
 * (excluding both the requester and whoever just missed it), immediately
 * reassigned via a fresh tutoring_sessions row on the SAME help_request —
 * the student never has to notice or re-request. If nobody else is
 * eligible right now, the help_request drops back to 'open' rather than
 * silently staying 'assigned' to a helper who's no longer doing anything.
 *
 * Deliberately a lazy, read-triggered sweep rather than a cron job — this
 * codebase has no scheduler infrastructure anywhere (see the plan's "What
 * doesn't exist" section), and a routine sweep with no urgency doesn't
 * justify adding one. It's called from routes/tutoringSessions.ts at the
 * top of every "My Tutoring" read, so missed deadlines get caught the
 * next time ANY user (not necessarily a party to that session) loads
 * their own tutoring view — eventually consistent within however often
 * this app's users are actually opening that page, which for a deadline
 * measured in days is more than fast enough.
 */
export async function checkAndReassignMissedDeadlines(): Promise<void> {
  const overdue = await listSessionsPastDeadline();
  for (const session of overdue) {
    await markMissedDeadline(session.id);

    const { data: helpRequest, error } = await supabaseAdmin
      .from('help_requests')
      .select('subject')
      .eq('id', session.helpRequestId)
      .maybeSingle();
    if (error) throw error;
    const subject = helpRequest?.subject || '';

    const newHelperId = await findEligibleHelper(session.conceptId, subject, session.requesterId, [session.helperId]);
    if (newHelperId) {
      await createAssignedSession(session.helpRequestId, session.requesterId, newHelperId, session.conceptId);
      await markHelperAssigned(newHelperId);
    } else {
      await supabaseAdmin.from('help_requests').update({ status: 'open' }).eq('id', session.helpRequestId);
    }
  }
}
