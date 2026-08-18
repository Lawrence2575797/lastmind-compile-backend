import { supabaseAdmin } from './supabaseAdmin';

// A matched-but-not-yet-delivered peer tutoring session — see the plan's
// "assigned task with a deadline" framing (learn/index.html's own
// wording: this appears on the HELPER's side as an obligation they've
// been given, not an invite they can leisurely negotiate). Deliberately
// created directly by peerTutoringMatchService.ts the moment a match is
// found — there's no separate "propose a time, other side confirms"
// negotiation step before this row exists.
//
// Delivery is async (see the plan's Decisions section, revisited after
// Phase 1): the helper writes ONE response by `deadline`; the requester
// separately books `releaseTime` — whenever they want to see it, before
// or after the helper submits. Once both a submission exists AND
// releaseTime has passed, status moves to 'released'. There is no live
// session at any point.
export type TutoringSessionStatus = 'assigned' | 'submitted' | 'released' | 'missed_deadline' | 'cancelled';

// How long a helper has to submit a written response before the
// underlying help_request gets reassigned to someone else — see
// peerTutoringMatchService.checkAndReassignMissedDeadlines. This is the
// actual reliability mechanism a volunteer-helper system needs, not a
// policy statement with nothing enforcing it.
export const DEFAULT_DEADLINE_HOURS = 48;

export interface TutoringSession {
  id: string;
  helpRequestId: string;
  requesterId: string;
  helperId: string;
  conceptId: string;
  status: TutoringSessionStatus;
  assignedAt: string;
  deadline: string;
  releaseTime: string | null;
  submittedAt: string | null;
  releasedAt: string | null;
}

function rowToSession(row: any): TutoringSession {
  return {
    id: row.id,
    helpRequestId: row.help_request_id,
    requesterId: row.requester_id,
    helperId: row.helper_id,
    conceptId: row.concept_id,
    status: row.status,
    assignedAt: row.assigned_at,
    deadline: row.deadline,
    releaseTime: row.release_time,
    submittedAt: row.submitted_at,
    releasedAt: row.released_at,
  };
}

export async function createAssignedSession(
  helpRequestId: string,
  requesterId: string,
  helperId: string,
  conceptId: string
): Promise<TutoringSession> {
  const deadline = new Date(Date.now() + DEFAULT_DEADLINE_HOURS * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from('tutoring_sessions')
    .insert({
      help_request_id: helpRequestId,
      requester_id: requesterId,
      helper_id: helperId,
      concept_id: conceptId,
      status: 'assigned',
      deadline,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToSession(data);
}

export async function getSession(userId: string, sessionId: string): Promise<TutoringSession | null> {
  const { data, error } = await supabaseAdmin
    .from('tutoring_sessions')
    .select('*')
    .eq('id', sessionId)
    .or(`requester_id.eq.${userId},helper_id.eq.${userId}`)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToSession(data) : null;
}

// Only the REQUESTER books a release time in this model — the helper has
// no say in when their (already-moderated) response gets shown, mirroring
// the plan's framing that the helper's obligation is just to write it.
// Can be called any number of times before release to change the booked
// time; once a session is 'released' or 'cancelled' it's fixed.
export async function setReleaseTime(userId: string, sessionId: string, releaseTimeIso: string): Promise<TutoringSession> {
  const session = await getSession(userId, sessionId);
  if (!session) throw new Error('session not found');
  if (session.requesterId !== userId) throw new Error('only the requester can book a release time');
  if (session.status === 'released' || session.status === 'cancelled') {
    throw new Error('this session is no longer open to scheduling');
  }
  const { data, error } = await supabaseAdmin
    .from('tutoring_sessions')
    .update({ release_time: releaseTimeIso, updated_at: new Date().toISOString() })
    .eq('id', sessionId)
    .select()
    .single();
  if (error) throw error;
  return rowToSession(data);
}

export interface TutoringSessionWithContext extends TutoringSession {
  subject: string;
  topic: string | null;
}

async function attachHelpRequestContext(sessions: TutoringSession[]): Promise<TutoringSessionWithContext[]> {
  if (!sessions.length) return [];
  const helpRequestIds = Array.from(new Set(sessions.map((s) => s.helpRequestId)));
  const { data: requests, error } = await supabaseAdmin
    .from('help_requests')
    .select('id, subject, topic')
    .in('id', helpRequestIds);
  if (error) throw error;
  const byId = new Map((requests || []).map((r) => [r.id as string, r]));
  return sessions.map((s) => {
    const req = byId.get(s.helpRequestId);
    return { ...s, subject: req?.subject || '', topic: req?.topic || null };
  });
}

// Powers the "My Tutoring" frontend view — everything a student is
// currently either owed (asRequester) or obligated to write (asHelper),
// enriched with the subject/topic help_requests already knows so the
// frontend never has to make a second round trip per session.
export async function listMyTutoringSessions(
  userId: string
): Promise<{ asRequester: TutoringSessionWithContext[]; asHelper: TutoringSessionWithContext[] }> {
  const { data, error } = await supabaseAdmin
    .from('tutoring_sessions')
    .select('*')
    .or(`requester_id.eq.${userId},helper_id.eq.${userId}`)
    .order('assigned_at', { ascending: false });
  if (error) throw error;
  const sessions = (data || []).map(rowToSession);
  const withContext = await attachHelpRequestContext(sessions);
  return {
    asRequester: withContext.filter((s) => s.requesterId === userId),
    asHelper: withContext.filter((s) => s.helperId === userId),
  };
}

// Every 'assigned' session whose deadline has already passed with no
// submission — the pool peerTutoringMatchService.checkAndReassignMissedDeadlines
// sweeps on each visit to "My Tutoring" (see that function's own comment
// for why this is a lazy, read-triggered sweep rather than a cron job).
export async function listSessionsPastDeadline(): Promise<TutoringSession[]> {
  const { data, error } = await supabaseAdmin
    .from('tutoring_sessions')
    .select('*')
    .eq('status', 'assigned')
    .lt('deadline', new Date().toISOString());
  if (error) throw error;
  return (data || []).map(rowToSession);
}

export async function markMissedDeadline(sessionId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('tutoring_sessions')
    .update({ status: 'missed_deadline', updated_at: new Date().toISOString() })
    .eq('id', sessionId);
  if (error) throw error;
}
