import { supabaseAdmin } from './supabaseAdmin';
import { getUsersWithMasteryForConcept, formatConceptOrLinkLabel } from './reviewService';
import { markHelperAssigned } from './tutoringProfileService';
import { getTutorRatingSummary, TutorRatingSummary } from './tutoringRatingService';
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

// A sanity guard, not a product limit — re-verified eligibility below is
// the real defense; this just stops one request from fanning out
// unreasonably far.
const MAX_HELPERS_PER_REQUEST = 10;

export interface HelpRequest {
  id: string;
  requesterId: string;
  conceptId: string;
  subject: string;
  topic: string | null;
  status: 'open' | 'assigned' | 'resolved' | 'cancelled' | 'unfulfilled';
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
 * Every eligible id (opted-in AND helper_id !== requesterId) who has
 * genuinely helped THIS requester before, in this subject, before —
 * "genuinely" meaning a real past tutoring_sessions row on a help_requests
 * row of the same subject, not just general tutoring experience. Used as a
 * "helped you before" badge in Browse Tutors, not a hard override — the
 * old auto-match's single-pick preference for this is gone along with
 * auto-match itself; the student now sees and decides for themselves.
 */
async function findPriorHelperIds(requesterId: string, subject: string, eligibleIds: string[]): Promise<Set<string>> {
  if (!eligibleIds.length) return new Set();
  const { data: sessions, error } = await supabaseAdmin
    .from('tutoring_sessions')
    .select('helper_id, help_request_id')
    .eq('requester_id', requesterId)
    .in('helper_id', eligibleIds);
  if (error) throw error;
  if (!sessions || !sessions.length) return new Set();

  const helpRequestIds = Array.from(new Set(sessions.map((s) => s.help_request_id as string)));
  const { data: requests, error: reqError } = await supabaseAdmin
    .from('help_requests')
    .select('id, subject')
    .in('id', helpRequestIds)
    .eq('subject', subject);
  if (reqError) throw reqError;
  const matchingRequestIds = new Set((requests || []).map((r) => r.id as string));

  const priorHelperIds = new Set<string>();
  sessions.forEach((s) => {
    if (matchingRequestIds.has(s.help_request_id as string)) priorHelperIds.add(s.helper_id as string);
  });
  return priorHelperIds;
}

// Live "how busy are they right now" signal for Browse Tutors — a count of
// a candidate's own currently-'assigned' (unanswered) obligations, rather
// than a manual "I'm available" toggle tutors would have to remember to
// maintain. Lower is more available.
async function getPendingLoadCounts(helperIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (!helperIds.length) return counts;
  const { data, error } = await supabaseAdmin
    .from('tutoring_sessions')
    .select('helper_id')
    .eq('status', 'assigned')
    .in('helper_id', helperIds);
  if (error) throw error;
  (data || []).forEach((row) => {
    const id = row.helper_id as string;
    counts.set(id, (counts.get(id) || 0) + 1);
  });
  return counts;
}

export interface TutorBrowseCard {
  helperId: string;
  displayName: string | null;
  ratingSummary: TutorRatingSummary | null;
  helpedYouBefore: boolean;
  pendingLoad: number;
}

/**
 * The ranked pool Browse Tutors shows for one concept/link — opted-in,
 * excludes the requester themselves, and genuinely verified (mastery=2,
 * see getUsersWithMasteryForConcept — fully generic over conceptId, so a
 * LINK's `${a}->${b}` compound key works exactly like a plain concept id
 * with zero extra logic here). Sorted: rated tutors by overall rating desc,
 * then unrated tutors (so a new opted-in tutor isn't invisible forever),
 * tie-broken within each group by lowest current pending load.
 */
export async function listEligibleTutorsForBrowsing(requesterId: string, conceptId: string, subject: string): Promise<TutorBrowseCard[]> {
  const { data: candidates, error } = await supabaseAdmin
    .from('tutoring_profiles')
    .select('user_id, display_name, last_assigned_at')
    .eq('tutoring_opt_in', true);
  if (error) throw error;
  const pool = (candidates || []).filter((c) => c.user_id !== requesterId);
  if (!pool.length) return [];

  const candidateIds = pool.map((c) => c.user_id as string);
  const mastered = await getUsersWithMasteryForConcept(candidateIds, conceptId);
  const eligible = pool.filter((c) => mastered.has(c.user_id as string));
  if (!eligible.length) return [];
  const eligibleIds = eligible.map((c) => c.user_id as string);

  const [ratingSummaries, priorHelperIds, pendingLoads] = await Promise.all([
    getTutorRatingSummary(eligibleIds),
    findPriorHelperIds(requesterId, subject, eligibleIds),
    getPendingLoadCounts(eligibleIds),
  ]);

  const lastAssignedById = new Map(eligible.map((c) => [c.user_id as string, c.last_assigned_at as string | null]));
  const cards: TutorBrowseCard[] = eligible.map((c) => ({
    helperId: c.user_id as string,
    displayName: c.display_name,
    ratingSummary: ratingSummaries.get(c.user_id as string) || null,
    helpedYouBefore: priorHelperIds.has(c.user_id as string),
    pendingLoad: pendingLoads.get(c.user_id as string) || 0,
  }));

  cards.sort((a, b) => {
    const aRated = a.ratingSummary !== null;
    const bRated = b.ratingSummary !== null;
    if (aRated !== bRated) return aRated ? -1 : 1;
    if (aRated && bRated) {
      const diff = b.ratingSummary!.overall - a.ratingSummary!.overall;
      if (diff !== 0) return diff;
    }
    if (a.pendingLoad !== b.pendingLoad) return a.pendingLoad - b.pendingLoad;
    // Final tiebreak among otherwise-equal candidates — the same "prefer
    // whoever's gone longest without being picked" fairness signal the old
    // auto-match used as its own last resort (markHelperAssigned bumps
    // this on every new assignment), now just a quiet tiebreaker instead
    // of a hard pick, since the student decides for themselves here.
    const aLast = lastAssignedById.get(a.helperId) ? new Date(lastAssignedById.get(a.helperId)!).getTime() : 0;
    const bLast = lastAssignedById.get(b.helperId) ? new Date(lastAssignedById.get(b.helperId)!).getTime() : 0;
    return aLast - bLast;
  });

  return cards;
}

/**
 * The requester picking N tutors from Browse Tutors — replaces the old
 * server-auto-picks-one flow entirely. One help_requests row, one
 * tutoring_sessions row per chosen (and re-verified) helper, all racing to
 * be the first to actually submit — see tutoringResponseService.ts's
 * submitResponse for the winner-take-all resolution. Eligibility is
 * re-checked server-side rather than trusted from the client, same
 * discipline the old claim flow used.
 */
export async function createMultiHelperHelpRequest(
  requesterId: string,
  conceptId: string,
  subject: string,
  topic: string | null,
  helperIds: string[]
): Promise<{ helpRequest: HelpRequest; sessions: TutoringSession[] }> {
  const dedupedHelperIds = Array.from(new Set(helperIds)).filter((id) => id !== requesterId);
  if (!dedupedHelperIds.length) throw new Error('pick at least one tutor');
  if (dedupedHelperIds.length > MAX_HELPERS_PER_REQUEST) {
    throw new Error(`you can request help from at most ${MAX_HELPERS_PER_REQUEST} tutors at once`);
  }

  const mastered = await getUsersWithMasteryForConcept(dedupedHelperIds, conceptId);
  const { data: profiles, error: profileError } = await supabaseAdmin
    .from('tutoring_profiles')
    .select('user_id')
    .eq('tutoring_opt_in', true)
    .in('user_id', dedupedHelperIds);
  if (profileError) throw profileError;
  const optedIn = new Set((profiles || []).map((p) => p.user_id as string));
  const verifiedHelperIds = dedupedHelperIds.filter((id) => mastered.has(id) && optedIn.has(id));
  if (!verifiedHelperIds.length) throw new Error('none of the selected tutors are currently eligible to help with this');

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('help_requests')
    .insert({ requester_id: requesterId, concept_id: conceptId, subject, topic })
    .select()
    .single();
  if (insertError) throw insertError;

  const sessions = await Promise.all(
    verifiedHelperIds.map((helperId) => createAssignedSession(inserted.id, requesterId, helperId, conceptId))
  );
  await Promise.all(verifiedHelperIds.map((helperId) => markHelperAssigned(helperId)));

  return { helpRequest: rowToHelpRequest(inserted), sessions };
}

function filterField(text: string): string {
  const trimmed = (text || '').trim().slice(0, MAX_FIELD_LENGTH);
  const cleaned1 = applyStructuredPIIFilter(trimmed);
  const cleaned2 = applyContextualPIIFilter(cleaned1);
  return applyHarmfulContentFilter(cleaned2);
}

export interface PreparedConcept {
  conceptId: string;
  subject: string;
  topic: string | null;
  label: string;
}

/**
 * The "add your own" path from the Peer Tutoring hub — three short,
 * structured fields (subject/topic/concept name), run through the exact
 * same PII/harmful-content pipeline used everywhere else user-typed text
 * becomes visible to another student. Deliberately does NOT write to the
 * DB — Browse Tutors is opened with the returned conceptId, and a request
 * only actually gets created once the student picks tutor(s) there (see
 * createMultiHelperHelpRequest).
 */
export async function prepareCustomConceptId(subject: string, topic: string, concept: string): Promise<PreparedConcept> {
  const safeSubject = filterField(subject);
  const safeTopic = filterField(topic);
  const safeConcept = filterField(concept);
  if (!safeSubject || !safeConcept) throw new Error('subject and concept are required');

  const conceptId = normalizeConceptKey(safeSubject, safeTopic, safeConcept);
  return { conceptId, subject: safeSubject, topic: safeTopic || null, label: formatConceptOrLinkLabel(conceptId) };
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
 * Lazy, read-triggered sweep (no cron infra in this codebase) — marks any
 * 'assigned' session whose deadline has passed as 'missed_deadline', with
 * NO auto-reassignment: unlike the old single-auto-match flow, the student
 * explicitly chose who to ask, so silently swapping in someone they never
 * picked doesn't fit the new model. If every one of a help_request's
 * sessions ends up missed with nobody ever having submitted, the whole
 * request is marked 'unfulfilled' — that's exactly the queue the owner's
 * admin view (see adminTutoringService.ts) reads to personally step in and
 * fulfil the guarantee.
 */
export async function sweepExpiredHelpRequests(): Promise<void> {
  const overdue = await listSessionsPastDeadline();
  await Promise.all(overdue.map((session) => markMissedDeadline(session.id)));
  if (!overdue.length) return;

  const { data: inFlightOrDone, error: inFlightError } = await supabaseAdmin
    .from('tutoring_sessions')
    .select('help_request_id')
    .in('status', ['assigned', 'submitted', 'released']);
  if (inFlightError) throw inFlightError;
  const notUnfulfilledIds = new Set((inFlightOrDone || []).map((r) => r.help_request_id as string));

  const { data: missed, error: missedError } = await supabaseAdmin
    .from('tutoring_sessions')
    .select('help_request_id')
    .eq('status', 'missed_deadline');
  if (missedError) throw missedError;
  const missedHelpRequestIds = new Set((missed || []).map((r) => r.help_request_id as string));

  const unfulfilledIds = Array.from(missedHelpRequestIds).filter((id) => !notUnfulfilledIds.has(id));
  if (unfulfilledIds.length) {
    const { error: updateError } = await supabaseAdmin
      .from('help_requests')
      .update({ status: 'unfulfilled' })
      .in('id', unfulfilledIds)
      .neq('status', 'unfulfilled');
    if (updateError) throw updateError;
  }
}
