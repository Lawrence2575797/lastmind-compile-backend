import { supabaseAdmin } from './supabaseAdmin';

// A matched-but-not-yet-scheduled peer tutoring session — see the plan's
// "assigned task with a deadline" framing (learn/index.html's own
// wording: this appears on the HELPER's side as an obligation they've
// been given, not an invite they can leisurely negotiate). Deliberately
// created directly by peerTutoringMatchService.ts the moment a match is
// found — there's no separate "propose a time, other side confirms"
// negotiation step before this row exists.
export type TutoringSessionStatus = 'assigned' | 'scheduled' | 'completed' | 'missed_deadline' | 'cancelled';

// How long a helper has to pick a time and hold the session before the
// underlying help_request gets reassigned to someone else — see
// checkAndReassignMissedDeadlines (added alongside the rest of this
// service's session-lifecycle functions in the next build pass). This is
// the actual reliability mechanism a volunteer-helper system needs, not
// a policy statement with nothing enforcing it.
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
  scheduledTime: string | null;
  completedAt: string | null;
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
    scheduledTime: row.scheduled_time,
    completedAt: row.completed_at,
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
