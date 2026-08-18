import { supabaseAdmin } from './supabaseAdmin';
import { getUsersWithMasteryForConcept, getMasteryStatesForConcepts } from './reviewService';
import { getTutoringProfile, markHelperAssigned } from './tutoringProfileService';
import { normalizeConceptKey } from './chainService';
import { applyStructuredPIIFilter } from '../safety/piiFilterStructured';
import { applyContextualPIIFilter } from '../safety/piiFilterContextual';
import { applyHarmfulContentFilter } from '../safety/harmfulContentFilter';
import {
  createAssignedSession,
  listSessionsPastDeadline,
  markMissedDeadline,
  TutoringSession,
} from './tutoringSessionService';

const MAX_FIELD_LENGTH = 60;

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

function filterField(text: string): string {
  const trimmed = (text || '').trim().slice(0, MAX_FIELD_LENGTH);
  const cleaned1 = applyStructuredPIIFilter(trimmed);
  const cleaned2 = applyContextualPIIFilter(cleaned1);
  return applyHarmfulContentFilter(cleaned2);
}

/**
 * The "add your own" path from the Peer Tutoring hub — still three
 * short, structured fields (subject/topic/concept name), never an open
 * "describe your problem" box, and each one runs through the exact same
 * PII/harmful-content pipeline used everywhere else user-typed text
 * becomes visible to another student (see tutoringResponseService.ts).
 * conceptId is built with the SAME normalizeConceptKey used by the
 * chain-generation system (chainService.ts) rather than the raw typed
 * text, so a custom request for a concept a real chain/lesson already
 * exists for has a genuine chance of matching a helper's real
 * concept_reviews row — an ad-hoc unnormalized string never could,
 * since nobody would ever have been FSRS-graded on that literal string.
 */
export async function createCustomHelpRequest(
  userId: string,
  subject: string,
  topic: string,
  concept: string
): Promise<{ helpRequest: HelpRequest; session: TutoringSession | null }> {
  const safeSubject = filterField(subject);
  const safeTopic = filterField(topic);
  const safeConcept = filterField(concept);
  if (!safeSubject || !safeConcept) throw new Error('subject and concept are required');

  const conceptId = normalizeConceptKey(safeSubject, safeTopic, safeConcept);
  return createHelpRequest(userId, conceptId, safeSubject, safeTopic || null);
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

/**
 * The low-liquidity fallback the auto-match alone doesn't cover: when the
 * helper pool is small, `findEligibleHelper` still only ever picks ONE
 * specific person per request — every other equally-eligible helper never
 * sees it at all unless that one person misses their deadline. This lists
 * every currently-open (never matched, or fell back to open after a
 * missed deadline) request this viewer could personally help with —
 * opted in AND verified mastery=2 for that exact concept, checked fresh
 * here rather than trusted from any earlier state — so a capable helper
 * can proactively pick one up instead of waiting on auto-assignment.
 */
export async function listClaimableHelpRequests(userId: string): Promise<HelpRequest[]> {
  const profile = await getTutoringProfile(userId);
  if (!profile.tutoringOptIn) return [];

  const { data, error } = await supabaseAdmin
    .from('help_requests')
    .select('*')
    .eq('status', 'open')
    .neq('requester_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  const openRequests = (data || []).map(rowToHelpRequest);
  if (!openRequests.length) return [];

  const conceptIds = Array.from(new Set(openRequests.map((r) => r.conceptId)));
  const states = await getMasteryStatesForConcepts(userId, conceptIds);
  return openRequests.filter((r) => states.get(r.conceptId) === 2);
}

/**
 * A helper proactively picking up an open request from listClaimableHelpRequests
 * — the counterpart to the automatic path in createHelpRequest/
 * checkAndReassignMissedDeadlines. Re-verifies everything server-side
 * (opt-in, real mastery, still open) rather than trusting the list the
 * client was showing, and uses a conditional update on status='open' to
 * close the race where two helpers claim the same request at once — only
 * the first update actually lands, the second gets back no row and fails
 * cleanly instead of creating two competing sessions for one request.
 */
export async function claimHelpRequest(userId: string, helpRequestId: string): Promise<TutoringSession> {
  const profile = await getTutoringProfile(userId);
  if (!profile.tutoringOptIn) throw new Error('you need to opt in to peer tutoring first');

  const { data: request, error: fetchError } = await supabaseAdmin
    .from('help_requests')
    .select('*')
    .eq('id', helpRequestId)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!request) throw new Error('request not found');
  if (request.requester_id === userId) throw new Error('you cannot help with your own request');

  const states = await getMasteryStatesForConcepts(userId, [request.concept_id]);
  if (states.get(request.concept_id) !== 2) throw new Error('you do not currently have verified mastery of this concept');

  const { data: claimed, error: claimError } = await supabaseAdmin
    .from('help_requests')
    .update({ status: 'assigned' })
    .eq('id', helpRequestId)
    .eq('status', 'open')
    .select()
    .maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) throw new Error('someone else just picked this one up');

  const session = await createAssignedSession(helpRequestId, request.requester_id, userId, request.concept_id);
  await markHelperAssigned(userId);
  return session;
}
