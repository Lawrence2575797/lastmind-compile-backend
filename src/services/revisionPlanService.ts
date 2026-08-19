import { supabaseAdmin } from './supabaseAdmin';
import { normalizeConceptKey } from './chainService';
import {
  getMasteryDetailsForConcepts,
  getReviewRowsForConcepts,
  projectRetrievability,
  simulateGoodReview,
  MasteryDetail,
  ConceptReviewRow,
} from './reviewService';
import { getCalendarEvent, listCalendarEvents } from './calendarEventsService';
import { getStudySettings } from './studySettingsService';
import { computeMechanisticReadiness, tierForM, STEPS_PER_TIER } from './spacedLessonEngine';

// One concept the caller wants scoped into this exam's plan — same shape
// as knowledgeMapService.ts's FolderConcept, plus `subject` since a plan
// isn't generated per-folder server-side (the frontend supplies the
// folder's own concept list directly, same reasoning as the knowledge map:
// folders live in the client's synced blob, not a normalized table).
export interface RevisionPlanConcept {
  subject: string;
  topic: string;
  concept: string;
}

export interface RevisionPlanItem {
  id?: string;
  conceptId: string;
  conceptLabel: string;
  scheduledDate: string; // YYYY-MM-DD
  estimatedMinutes: number;
  itemType: 'concept' | 'exam_practice';
  status: 'pending' | 'done' | 'skipped';
}

export interface RevisionPlanResult {
  items: RevisionPlanItem[];
  atRisk: { conceptId: string; conceptLabel: string }[];
  projectedAverageRetrievability: number;
}

// A concept never covered at all (mastery state 0) needs a real first
// lesson, not a quick review — this is a fixed, documented placeholder for
// that cost, not derived from any real per-student timing data yet (see
// STEPS_PER_TIER's own comment on the same tradeoff).
const NEVER_COVERED_MINUTES = 20;

// Minutes assumed per retrieval-lesson step, reusing STEPS_PER_TIER's own
// tiering (fewer steps for a more consolidated concept) rather than
// inventing a separate time model. A calibratable assumption, not a
// measured constant — review_log exists to calibrate this for real later.
const MINUTES_PER_STEP = 3;

// The final slice of the revision window closest to the exam is reserved
// for exam-format practice rather than more concept drilling — the actual
// practice CONTENT engine is future work (see the approved plan); this
// only reserves the time so the plan doesn't read as "cram concepts right
// up to the bell with zero practice."
const EXAM_PRACTICE_FRACTION = 0.2;
const EXAM_PRACTICE_MIN_DAYS = 1;

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return toDateOnly(d);
}

function daysBetween(fromStr: string, toStr: string): number {
  const from = new Date(`${fromStr}T00:00:00Z`).getTime();
  const to = new Date(`${toStr}T00:00:00Z`).getTime();
  return Math.round((to - from) / (24 * 60 * 60 * 1000));
}

function busyMinutesOnDay(events: { date: string; startTime: string | null; endTime: string | null }[], dailyBudget: number): number {
  let total = 0;
  for (const ev of events) {
    if (!ev.startTime || !ev.endTime) return dailyBudget; // no times given -> the whole day is unavailable
    const [sh, sm] = ev.startTime.split(':').map(Number);
    const [eh, em] = ev.endTime.split(':').map(Number);
    total += Math.max(0, eh * 60 + em - (sh * 60 + sm));
  }
  return total;
}

function estimatedMinutesFor(detail: MasteryDetail | undefined): number {
  if (!detail || detail.state === 0) return NEVER_COVERED_MINUTES;
  const m = computeMechanisticReadiness(detail.stability, detail.spacedSuccessCount);
  const tier = tierForM(m);
  return STEPS_PER_TIER[tier] * MINUTES_PER_STEP;
}

/**
 * Builds a day-by-day revision plan for one exam, maximizing total
 * retrievability across the exam's own concepts subject to actual
 * available study time — see the approved plan for the full objective.
 * Deletes and replaces any prior plan for this exam (same delete-then-
 * insert convention calendar_events editing already uses).
 */
export async function generateRevisionPlan(
  userId: string,
  examEventId: string,
  concepts: RevisionPlanConcept[]
): Promise<RevisionPlanResult> {
  const examEvent = await getCalendarEvent(userId, examEventId);
  if (!examEvent || examEvent.type !== 'exam') {
    throw new Error('exam event not found');
  }
  const examDate = examEvent.date;
  const today = toDateOnly(new Date());

  const withIds = concepts
    .filter((c) => c.concept && c.concept.trim())
    .map((c) => ({ ...c, conceptId: normalizeConceptKey(c.subject, c.topic, c.concept) }));
  const conceptIds = withIds.map((c) => c.conceptId);

  const [masteryDetails, rows, allEvents, studySettings] = await Promise.all([
    getMasteryDetailsForConcepts(userId, conceptIds),
    getReviewRowsForConcepts(userId, conceptIds),
    listCalendarEvents(userId),
    getStudySettings(userId),
  ]);

  const busyEvents = allEvents.filter((e) => e.type === 'busy' && e.date >= today && e.date < examDate);
  const busyByDay = new Map<string, { date: string; startTime: string | null; endTime: string | null }[]>();
  busyEvents.forEach((e) => {
    if (!busyByDay.has(e.date)) busyByDay.set(e.date, []);
    busyByDay.get(e.date)!.push(e);
  });

  const windowDays = Math.max(0, daysBetween(today, examDate));
  const allDays: string[] = [];
  for (let i = 0; i < windowDays; i++) allDays.push(addDays(today, i));

  const practiceDayCount = allDays.length ? Math.max(EXAM_PRACTICE_MIN_DAYS, Math.round(allDays.length * EXAM_PRACTICE_FRACTION)) : 0;
  const practiceDays = new Set(allDays.slice(Math.max(0, allDays.length - practiceDayCount)));
  const conceptDays = allDays.filter((d) => !practiceDays.has(d));

  const capacityByDay = new Map<string, number>();
  allDays.forEach((d) => {
    const busy = busyMinutesOnDay(busyByDay.get(d) || [], studySettings.dailyMinutesBudget);
    capacityByDay.set(d, Math.max(0, studySettings.dailyMinutesBudget - busy));
  });

  // "Retrievability if this concept is never touched again before the
  // exam" — the baseline every candidate review is measured against.
  // Never-reviewed concepts get 0 by definition (there's nothing to decay).
  function retrievabilityIfSkipped(row: ConceptReviewRow | undefined): number {
    if (!row || !row.last_review) return 0;
    const elapsed = daysBetween(row.last_review.slice(0, 10), examDate);
    return projectRetrievability(row.stability, elapsed);
  }

  function marginalGainOnDay(row: ConceptReviewRow | undefined, day: string): number {
    const hypotheticalStability = simulateGoodReview(row ?? null, new Date(`${day}T12:00:00Z`));
    const elapsedFromReviewToExam = Math.max(0, daysBetween(day, examDate));
    const retrievabilityIfReviewed = projectRetrievability(hypotheticalStability, elapsedFromReviewToExam);
    return Math.max(0, retrievabilityIfReviewed - retrievabilityIfSkipped(row));
  }

  const pending = new Set(conceptIds);
  const items: RevisionPlanItem[] = [];
  const scheduledRetrievability = new Map<string, number>();

  for (const day of conceptDays) {
    let remaining = capacityByDay.get(day) || 0;
    if (remaining <= 0 || !pending.size) continue;

    const ranked = withIds
      .filter((c) => pending.has(c.conceptId))
      .map((c) => {
        const row = rows.get(c.conceptId);
        const minutes = estimatedMinutesFor(masteryDetails.get(c.conceptId));
        const gain = marginalGainOnDay(row, day);
        return { ...c, minutes, valuePerMinute: minutes > 0 ? gain / minutes : 0, gain };
      })
      .sort((a, b) => b.valuePerMinute - a.valuePerMinute);

    for (const candidate of ranked) {
      if (candidate.minutes > remaining) continue;
      remaining -= candidate.minutes;
      pending.delete(candidate.conceptId);
      const row = rows.get(candidate.conceptId);
      const hypotheticalStability = simulateGoodReview(row ?? null, new Date(`${day}T12:00:00Z`));
      const elapsedFromReviewToExam = Math.max(0, daysBetween(day, examDate));
      scheduledRetrievability.set(candidate.conceptId, projectRetrievability(hypotheticalStability, elapsedFromReviewToExam));
      items.push({
        conceptId: candidate.conceptId,
        conceptLabel: candidate.concept,
        scheduledDate: day,
        estimatedMinutes: candidate.minutes,
        itemType: 'concept',
        status: 'pending',
      });
    }
  }

  Array.from(practiceDays)
    .sort()
    .forEach((day) => {
      const minutes = capacityByDay.get(day) || 0;
      if (minutes <= 0) return;
      items.push({
        conceptId: 'exam_practice',
        conceptLabel: 'Exam practice',
        scheduledDate: day,
        estimatedMinutes: minutes,
        itemType: 'exam_practice',
        status: 'pending',
      });
    });

  const atRisk = withIds
    .filter((c) => pending.has(c.conceptId))
    .map((c) => ({ conceptId: c.conceptId, conceptLabel: c.concept }));

  const retrievabilityValues = withIds.map((c) => scheduledRetrievability.get(c.conceptId) ?? retrievabilityIfSkipped(rows.get(c.conceptId)));
  const projectedAverageRetrievability = retrievabilityValues.length
    ? retrievabilityValues.reduce((a, b) => a + b, 0) / retrievabilityValues.length
    : 0;

  await supabaseAdmin.from('revision_plan_items').delete().eq('user_id', userId).eq('exam_event_id', examEventId);
  if (items.length) {
    const { error } = await supabaseAdmin.from('revision_plan_items').insert(
      items.map((it) => ({
        user_id: userId,
        exam_event_id: examEventId,
        concept_id: it.conceptId,
        concept_label: it.conceptLabel,
        scheduled_date: it.scheduledDate,
        estimated_minutes: it.estimatedMinutes,
        item_type: it.itemType,
        status: it.status,
      }))
    );
    if (error) throw error;
  }

  return { items, atRisk, projectedAverageRetrievability };
}

export async function listRevisionPlan(userId: string, examEventId: string): Promise<RevisionPlanItem[]> {
  const { data, error } = await supabaseAdmin
    .from('revision_plan_items')
    .select('id, concept_id, concept_label, scheduled_date, estimated_minutes, item_type, status')
    .eq('user_id', userId)
    .eq('exam_event_id', examEventId)
    .order('scheduled_date', { ascending: true });
  if (error) throw error;
  return (data || []).map((row) => ({
    id: row.id,
    conceptId: row.concept_id,
    conceptLabel: row.concept_label,
    scheduledDate: row.scheduled_date,
    estimatedMinutes: row.estimated_minutes,
    itemType: row.item_type,
    status: row.status,
  }));
}

export async function setRevisionPlanItemStatus(userId: string, itemId: string, status: 'pending' | 'done' | 'skipped'): Promise<void> {
  const { error } = await supabaseAdmin
    .from('revision_plan_items')
    .update({ status })
    .eq('user_id', userId)
    .eq('id', itemId);
  if (error) throw error;
}
