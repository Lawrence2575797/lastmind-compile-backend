import { supabaseAdmin } from './supabaseAdmin';
import { retrievability, rowToCard, ConceptReviewRow } from './fsrsService';
import { MASTERY_STABILITY_THRESHOLD, MIN_REPS_FOR_TRUST } from './reviewService';

// A rough per-graded-event time estimate, used only to give the report a
// "learning time" figure. This app has no dedicated session-duration
// tracking (and building one would mean instrumenting every grading
// route in the app, a much larger and separate effort) - this is a
// deliberate, transparent ESTIMATE derived from how many graded events
// happened, not a real elapsed-time measurement. No new personal data is
// collected to produce it; it's a new summary computed from timestamps
// already recorded for every review.
const AVG_SECONDS_PER_REVIEW = 90;

// A concept is flagged for attention once its current retrievability
// (FSRS's own decay-from-stability estimate of "how likely is a correct
// recall right now") drops below this - deliberately a bit above 50/50
// chance, since "worth revisiting soon" should catch a concept while
// there's still time to act before a real lapse.
const NEEDS_ATTENTION_RETRIEVABILITY = 0.65;

// Recommended-plan estimate - one study session per flagged concept,
// each assumed this long. A product tuning knob, not derived from
// anything - picked as a realistic single-sitting length.
const MINUTES_PER_RECOMMENDED_SESSION = 25;

function mondayOfWeekUTC(d: Date): Date {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diffToMonday);
  return date;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatWeekLabel(weekStart: Date, weekEndInclusive: Date): string {
  const monthFmt = (d: Date) => d.toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });
  const startMonth = monthFmt(weekStart);
  const endMonth = monthFmt(weekEndInclusive);
  if (startMonth === endMonth) {
    return `${weekStart.getUTCDate()}–${weekEndInclusive.getUTCDate()} ${endMonth}`;
  }
  return `${weekStart.getUTCDate()} ${startMonth} – ${weekEndInclusive.getUTCDate()} ${endMonth}`;
}

// The most recently FULLY COMPLETED week (Monday-Sunday, UTC) - a
// report only ever covers a week that has actually finished, per
// explicit instruction that a new one is "released" once its week is
// over, not a live mid-week partial view. weekEnd is EXCLUSIVE (the
// following Monday), so a plain `< weekEnd` bound is correct throughout.
export function mostRecentCompletedWeek(now: Date = new Date()): { weekStart: Date; weekEnd: Date } {
  const thisWeekMonday = mondayOfWeekUTC(now);
  const weekStart = new Date(thisWeekMonday);
  weekStart.setUTCDate(weekStart.getUTCDate() - 7);
  const weekEnd = new Date(thisWeekMonday);
  return { weekStart, weekEnd };
}

interface ReviewLogRow {
  concept_id: string;
  rating: string;
  reviewed_at: string;
  stability_before: number | null;
}

interface NodeInfo {
  label: string;
  subject: string;
}

// Resolves a review_log concept_id (either a node's own concept_id, or an
// edge/integration id in the "fromConceptId->toConceptId::integration"
// format - see getDifficultyAndCapability's own parsing in
// recallTuningService.ts, mirrored here) to a human label + subject for
// display. Best-effort: an id that resolves to nothing (a node since
// deleted/regenerated) is simply left out of whatever list was building
// from it, rather than shown as a broken entry.
async function buildConceptLookup(conceptIds: string[]): Promise<Map<string, NodeInfo>> {
  const direct = new Set<string>();
  const integrationFrom = new Map<string, string>();
  for (const id of conceptIds) {
    if (id.endsWith('::integration')) {
      const withoutSuffix = id.slice(0, -':integration'.length - 1);
      const arrowIndex = withoutSuffix.indexOf('->');
      if (arrowIndex !== -1) integrationFrom.set(id, withoutSuffix.slice(0, arrowIndex));
    } else {
      direct.add(id);
    }
  }
  const allLookupIds = Array.from(new Set([...direct, ...integrationFrom.values()]));
  if (!allLookupIds.length) return new Map();

  const { data: nodes, error } = await supabaseAdmin
    .from('knowledge_map_nodes')
    .select('concept_id, label, subject')
    .in('concept_id', allLookupIds);
  if (error) throw error;
  const byConceptId = new Map((nodes || []).map((n) => [n.concept_id as string, { label: n.label as string, subject: n.subject as string }]));

  const result = new Map<string, NodeInfo>();
  for (const id of conceptIds) {
    if (direct.has(id)) {
      const n = byConceptId.get(id);
      if (n) result.set(id, n);
    } else {
      const fromId = integrationFrom.get(id);
      const n = fromId ? byConceptId.get(fromId) : undefined;
      if (n) result.set(id, { label: `Linking ${n.label}`, subject: n.subject });
    }
  }
  return result;
}

function ratingToScore(rating: string): number {
  switch (rating) {
    case 'easy': return 100;
    case 'good': return 75;
    case 'hard': return 50;
    default: return 25; // again
  }
}

function isSuccess(rating: string): boolean {
  return rating === 'good' || rating === 'easy';
}

async function fetchReviewLog(userId: string, from: Date, to: Date): Promise<ReviewLogRow[]> {
  const { data, error } = await supabaseAdmin
    .from('review_log')
    .select('concept_id, rating, reviewed_at, stability_before')
    .eq('user_id', userId)
    .gte('reviewed_at', from.toISOString())
    .lt('reviewed_at', to.toISOString())
    .order('reviewed_at', { ascending: true });
  if (error) throw error;
  return (data || []) as ReviewLogRow[];
}

function accuracyPct(rows: ReviewLogRow[]): number {
  if (!rows.length) return 0;
  return Math.round((100 * rows.filter((r) => isSuccess(r.rating)).length) / rows.length);
}

// Longest run of consecutive calendar dates (UTC) with at least one
// review among the given rows.
function longestConsecutiveDayRun(dates: Set<string>): number {
  const sorted = Array.from(dates).sort();
  let longest = 0;
  let current = 0;
  let prev: number | null = null;
  for (const d of sorted) {
    const t = new Date(`${d}T00:00:00Z`).getTime();
    if (prev !== null && t - prev === 24 * 60 * 60 * 1000) current += 1;
    else current = 1;
    longest = Math.max(longest, current);
    prev = t;
  }
  return longest;
}

// The actual computation - pulls everything from review_log/
// concept_reviews/knowledge_map_nodes, all data this app already
// collects for every graded event across every feature (encoding
// lessons, recalls, day1 checks, practice questions, node reviews). No
// new data is gathered to build this report - it's a new SUMMARY of
// existing timestamps and ratings, not a new collection.
export async function computeWeeklyReport(userId: string, weekStart: Date, weekEnd: Date) {
  const lastWeekStart = new Date(weekStart);
  lastWeekStart.setUTCDate(lastWeekStart.getUTCDate() - 7);

  const [thisWeekRows, lastWeekRows] = await Promise.all([
    fetchReviewLog(userId, weekStart, weekEnd),
    fetchReviewLog(userId, lastWeekStart, weekStart),
  ]);

  const thisWeekConceptIds = Array.from(new Set(thisWeekRows.map((r) => r.concept_id)));
  const strengthenedThisWeek = new Set(thisWeekRows.filter((r) => isSuccess(r.rating)).map((r) => r.concept_id));
  const strengthenedLastWeek = new Set(lastWeekRows.filter((r) => isSuccess(r.rating)).map((r) => r.concept_id));

  const pctChangeVsLastWeek = strengthenedLastWeek.size
    ? Math.round(((strengthenedThisWeek.size - strengthenedLastWeek.size) / strengthenedLastWeek.size) * 100)
    : null;

  // Momentum
  const datesThisWeek = new Set(thisWeekRows.map((r) => r.reviewed_at.slice(0, 10)));
  const eventsByDate = new Map<string, ReviewLogRow[]>();
  thisWeekRows.forEach((r) => {
    const d = r.reviewed_at.slice(0, 10);
    if (!eventsByDate.has(d)) eventsByDate.set(d, []);
    eventsByDate.get(d)!.push(r);
  });
  let bestDay: { date: string; minutes: number; conceptsStrengthened: number } | null = null;
  for (const [date, rows] of eventsByDate) {
    if (!bestDay || rows.length > eventsByDate.get(bestDay.date)!.length) {
      bestDay = {
        date,
        minutes: Math.round((rows.length * AVG_SECONDS_PER_REVIEW) / 60),
        conceptsStrengthened: new Set(rows.filter((r) => isSuccess(r.rating)).map((r) => r.concept_id)).size,
      };
    }
  }

  // Subject-level lookup for everything touched this week.
  const conceptLookup = await buildConceptLookup(thisWeekConceptIds);
  const subjectsThisWeek = new Set(Array.from(conceptLookup.values()).map((n) => n.subject));

  // "Reached a new stability level" this week - concept_reviews.stability
  // now clears MASTERY_STABILITY_THRESHOLD, and the review_log row that
  // most recently updated it this week shows stability_before it didn't -
  // a real, data-grounded "this genuinely happened this week" check, not
  // just "is currently mastered". Computed up front so both bySubject and
  // the top-level "mastered" list can share it.
  const { data: currentStateRows } = thisWeekConceptIds.length
    ? await supabaseAdmin.from('concept_reviews').select('*').eq('user_id', userId).in('concept_id', thisWeekConceptIds)
    : { data: [] as ConceptReviewRow[] };
  const currentStateByConceptId = new Map(((currentStateRows || []) as ConceptReviewRow[]).map((r) => [r.concept_id, r]));

  const lastEventByConceptThisWeek = new Map<string, ReviewLogRow>();
  thisWeekRows.forEach((r) => lastEventByConceptThisWeek.set(r.concept_id, r)); // rows are ordered ascending, so this ends up on the last one

  function crossedMasteryThisWeek(conceptId: string): boolean {
    const current = currentStateByConceptId.get(conceptId);
    const lastEvent = lastEventByConceptThisWeek.get(conceptId);
    if (!current || !lastEvent) return false;
    const nowMastered = current.stability >= MASTERY_STABILITY_THRESHOLD && current.reps >= MIN_REPS_FOR_TRUST;
    const wasBelowBefore = (lastEvent.stability_before ?? 0) < MASTERY_STABILITY_THRESHOLD;
    return nowMastered && wasBelowBefore;
  }

  const bySubject = Array.from(subjectsThisWeek).map((subject) => {
    const conceptIdsInSubject = thisWeekConceptIds.filter((id) => conceptLookup.get(id)?.subject === subject);
    const rowsInSubject = thisWeekRows.filter((r) => conceptIdsInSubject.includes(r.concept_id));
    const lastWeekRowsInSubject = lastWeekRows.filter((r) => conceptLookup.get(r.concept_id)?.subject === subject);
    const strengthened = new Set(rowsInSubject.filter((r) => isSuccess(r.rating)).map((r) => r.concept_id)).size;
    const thisAcc = accuracyPct(rowsInSubject);
    const lastAcc = lastWeekRowsInSubject.length ? accuracyPct(lastWeekRowsInSubject) : null;
    const pctAccuracyChange = lastAcc !== null ? thisAcc - lastAcc : null;
    const newStabilityMilestones = conceptIdsInSubject.filter(crossedMasteryThisWeek).length;
    return { subject, conceptsStrengthened: strengthened, pctAccuracyChange, newStabilityMilestones };
  })
    .sort((a, b) => b.conceptsStrengthened - a.conceptsStrengthened)
    .slice(0, 3);
  const maxStrengthened = Math.max(1, ...bySubject.map((s) => s.conceptsStrengthened));

  // Mastered this week - genuinely crossed the bar (same check as above),
  // across ALL subjects, not just the top 3.
  const masteredConceptIds = thisWeekConceptIds.filter(crossedMasteryThisWeek);
  const mastered = masteredConceptIds
    .map((id) => ({ id, stability: currentStateByConceptId.get(id)!.stability, label: conceptLookup.get(id)?.label || id }))
    .sort((a, b) => b.stability - a.stability)
    .slice(0, 3)
    .map((m) => ({ conceptId: m.id, label: m.label, stabilityDays: Math.round(m.stability) }));

  // Needs attention - a live snapshot of current retrievability across
  // every concept this student has ever reviewed (not scoped to this
  // week), same as the rest of the app treats "what's due/weak now".
  const { data: allReviewedRows } = await supabaseAdmin
    .from('concept_reviews')
    .select('*')
    .eq('user_id', userId)
    .gte('reps', 1);
  const now = new Date();
  const withRetrievability = ((allReviewedRows || []) as ConceptReviewRow[]).map((row) => ({
    conceptId: row.concept_id,
    retrievability: retrievability(rowToCard(row), now),
  }));
  const weakIds = withRetrievability
    .filter((r) => r.retrievability < NEEDS_ATTENTION_RETRIEVABILITY)
    .sort((a, b) => a.retrievability - b.retrievability);
  const weakLookup = await buildConceptLookup(weakIds.slice(0, 12).map((r) => r.conceptId)); // small headroom past 3/6 in case some don't resolve
  const needsAttention = weakIds.slice(0, 3).map((r) => ({
    conceptId: r.conceptId,
    label: weakLookup.get(r.conceptId)?.label || r.conceptId,
    recallStrengthPct: Math.round(r.retrievability * 100),
  }));

  // Biggest win - the concept with the most review_log events this week
  // whose FIRST event was a miss (again/hard) and LAST event was a
  // success (good/easy) - real turnaround evidence, not just "got it
  // right once". Ratings are mapped onto a 0-100 scale (see
  // ratingToScore) to give a genuine, data-derived point swing rather
  // than a fabricated percentage.
  let biggestWin: { label: string; startScore: number; endScore: number; pointsImprovement: number } | null = null;
  const eventsByConceptThisWeek = new Map<string, ReviewLogRow[]>();
  thisWeekRows.forEach((r) => {
    if (!eventsByConceptThisWeek.has(r.concept_id)) eventsByConceptThisWeek.set(r.concept_id, []);
    eventsByConceptThisWeek.get(r.concept_id)!.push(r);
  });
  for (const [conceptId, events] of eventsByConceptThisWeek) {
    if (events.length < 2) continue;
    const first = events[0];
    const last = events[events.length - 1];
    if (isSuccess(first.rating) || !isSuccess(last.rating)) continue;
    const startScore = ratingToScore(first.rating);
    const endScore = ratingToScore(last.rating);
    const improvement = endScore - startScore;
    if (!biggestWin || improvement > biggestWin.pointsImprovement) {
      biggestWin = { label: conceptLookup.get(conceptId)?.label || conceptId, startScore, endScore, pointsImprovement: improvement };
    }
  }

  // Monthly (last 30 days, rolling from weekEnd)
  const monthStart = new Date(weekEnd);
  monthStart.setUTCDate(monthStart.getUTCDate() - 30);
  const monthRows = await fetchReviewLog(userId, monthStart, weekEnd);
  const monthConceptIds = Array.from(new Set(monthRows.map((r) => r.concept_id)));
  const monthLookup = await buildConceptLookup(monthConceptIds);
  const monthSubjects = new Set(Array.from(monthLookup.values()).map((n) => n.subject));
  const halfwayPoint = new Date((monthStart.getTime() + weekEnd.getTime()) / 2).toISOString();
  const monthly = Array.from(monthSubjects).map((subject) => {
    const rowsInSubject = monthRows.filter((r) => monthLookup.get(r.concept_id)?.subject === subject);
    const firstHalf = rowsInSubject.filter((r) => r.reviewed_at < halfwayPoint);
    const secondHalf = rowsInSubject.filter((r) => r.reviewed_at >= halfwayPoint);
    const strengthened = new Set(rowsInSubject.filter((r) => isSuccess(r.rating)).map((r) => r.concept_id)).size;
    return {
      subject,
      startAccuracyPct: firstHalf.length ? accuracyPct(firstHalf) : accuracyPct(rowsInSubject),
      endAccuracyPct: secondHalf.length ? accuracyPct(secondHalf) : accuracyPct(rowsInSubject),
      conceptsStrengthened: strengthened,
    };
  }).sort((a, b) => b.conceptsStrengthened - a.conceptsStrengthened).slice(0, 3);
  const maxMonthlyStrengthened = Math.max(1, ...monthly.map((m) => m.conceptsStrengthened));

  // Recommendations - same live weak-concept list as "needs attention",
  // but every subject, not capped to what showed up this week.
  const priorityLookup = await buildConceptLookup(weakIds.slice(0, 3).map((r) => r.conceptId));
  const priority = weakIds.slice(0, 3).map((r) => ({ conceptId: r.conceptId, label: priorityLookup.get(r.conceptId)?.label || r.conceptId }));
  const priorityBySubject = new Map<string, number>();
  weakIds.slice(0, 8).forEach((r) => {
    const subject = weakLookup.get(r.conceptId)?.subject;
    if (!subject) return;
    priorityBySubject.set(subject, (priorityBySubject.get(subject) || 0) + 1);
  });
  const plan = Array.from(priorityBySubject.entries()).map(([subject, count]) => ({ subject, sessions: Math.max(1, Math.ceil(count / 2)) }));
  const estimatedMinutes = plan.reduce((sum, p) => sum + p.sessions, 0) * MINUTES_PER_RECOMMENDED_SESSION;

  // Lifetime total - every concept this student has ever gotten to at
  // least one real rep, across their whole account history.
  const { count: lifetimeCount } = await supabaseAdmin
    .from('concept_reviews')
    .select('concept_id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('reps', 1);

  return {
    weekStart: isoDate(weekStart),
    weekEnd: isoDate(new Date(weekEnd.getTime() - 1)), // inclusive label date
    weekLabel: formatWeekLabel(weekStart, new Date(weekEnd.getTime() - 24 * 60 * 60 * 1000)),
    headline: {
      conceptsStrengthened: strengthenedThisWeek.size,
      pctChangeVsLastWeek,
    },
    glance: {
      conceptsStrengthened: strengthenedThisWeek.size,
      learningTimeMinutes: Math.round((thisWeekRows.length * AVG_SECONDS_PER_REVIEW) / 60),
      averageAccuracyPct: accuracyPct(thisWeekRows),
      momentumDays: datesThisWeek.size,
    },
    bySubject: bySubject.map((s) => ({ ...s, barPct: Math.round((s.conceptsStrengthened / maxStrengthened) * 100) })),
    mastered,
    needsAttention,
    biggestWin: biggestWin ? {
      label: biggestWin.label,
      startAccuracyPct: biggestWin.startScore,
      endAccuracyPct: biggestWin.endScore,
      pointsImprovement: biggestWin.pointsImprovement,
    } : null,
    monthly: monthly.map((m) => ({ ...m, barPct: Math.round((m.conceptsStrengthened / maxMonthlyStrengthened) * 100) })),
    momentum: {
      daysStudied: datesThisWeek.size,
      longestRun: longestConsecutiveDayRun(datesThisWeek),
      bestDay,
    },
    recommendations: { priority, plan, estimatedMinutes },
    lifetimeConceptsStrengthened: lifetimeCount || 0,
  };
}

export type WeeklyProgressReport = Awaited<ReturnType<typeof computeWeeklyReport>>;

// Lazy sweep, same convention as lockService's monthly reset / peer-
// tutoring's expired-request sweep (this app has no cron infrastructure)
// - the first request for a given (user, week) computes and stores it;
// every request after that (including from a different device) reads
// back the exact same stored snapshot rather than recomputing live, so
// a report never silently changes after it was first shown ("released"
// once, per explicit instruction).
export async function getOrGenerateWeeklyReport(userId: string): Promise<WeeklyProgressReport> {
  const { weekStart, weekEnd } = mostRecentCompletedWeek();
  const weekStartIso = isoDate(weekStart);

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from('weekly_progress_reports')
    .select('report_json')
    .eq('user_id', userId)
    .eq('week_start', weekStartIso)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (existing) return existing.report_json as WeeklyProgressReport;

  const report = await computeWeeklyReport(userId, weekStart, weekEnd);

  const { error: insertError } = await supabaseAdmin
    .from('weekly_progress_reports')
    .upsert(
      { user_id: userId, week_start: weekStartIso, report_json: report },
      { onConflict: 'user_id,week_start' }
    );
  if (insertError) console.error('LastMind: failed to persist weekly progress report (non-fatal, still returning it fresh).', insertError);

  return report;
}

// Every past report a student has - the "history" view. Read-only, never
// regenerates anything (a stored report stays exactly as first released).
export async function listPastWeeklyReports(userId: string): Promise<{ weekStart: string; weekLabel: string }[]> {
  const { data, error } = await supabaseAdmin
    .from('weekly_progress_reports')
    .select('week_start, report_json')
    .eq('user_id', userId)
    .order('week_start', { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => ({
    weekStart: row.week_start as string,
    weekLabel: (row.report_json as WeeklyProgressReport).weekLabel,
  }));
}

export async function getWeeklyReportByWeekStart(userId: string, weekStartIso: string): Promise<WeeklyProgressReport | null> {
  const { data, error } = await supabaseAdmin
    .from('weekly_progress_reports')
    .select('report_json')
    .eq('user_id', userId)
    .eq('week_start', weekStartIso)
    .maybeSingle();
  if (error) throw error;
  return data ? (data.report_json as WeeklyProgressReport) : null;
}
