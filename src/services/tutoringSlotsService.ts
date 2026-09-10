// Founder tutoring booking calendar - computed weekly grid, not a table of
// manually-created rows. Every day is OPEN by default within a fixed daily
// working-hours template; tutoring_slot_overrides only stores EXCEPTIONS
// (blocked or booked), keyed by exact start_time - see
// scripts/create_tutoring_slots.sql's own comment. No external calendar
// sync: the founder is the only supplier, so he blocks his own busy times
// directly here instead of syncing Google/Outlook.
import { supabaseAdmin } from './supabaseAdmin';

// 9am-9pm, 1-hour slots (12/day) - a plain constant, not configurable yet.
// Both bounds and SLOT_MINUTES are read by the frontend's own matching
// template (learn/index.html's DAY_START_HOUR/DAY_END_HOUR/SLOT_MINUTES) -
// change both together if this ever needs to differ.
const DAY_START_HOUR = 9;
const DAY_END_HOUR = 21;
const SLOT_MINUTES = 60;
const DAYS_PER_WEEK = 7;

export type SlotStatus = 'open' | 'blocked' | 'booked';

export interface WeekSlot {
  startTime: string;
  endTime: string;
  status: SlotStatus;
  bookedName?: string | null;
  bookedEmail?: string | null;
}

interface OverrideRow {
  start_time: string;
  end_time: string;
  status: 'blocked' | 'booked';
  booked_name: string | null;
  booked_email: string | null;
}

/** Every template slot time for the 7 days starting at weekStart (expected to be that week's local midnight Monday - the caller/frontend owns that computation, this just adds fixed offsets). */
function computeWeekTemplate(weekStart: Date): { start: Date; end: Date }[] {
  const slots: { start: Date; end: Date }[] = [];
  for (let day = 0; day < DAYS_PER_WEEK; day++) {
    for (let hour = DAY_START_HOUR; hour < DAY_END_HOUR; hour += SLOT_MINUTES / 60) {
      const start = new Date(weekStart.getTime() + day * 86400000 + hour * 3600000);
      const end = new Date(start.getTime() + SLOT_MINUTES * 60000);
      slots.push({ start, end });
    }
  }
  return slots;
}

async function getOverridesInRange(rangeStart: Date, rangeEnd: Date): Promise<Map<string, OverrideRow>> {
  const { data, error } = await supabaseAdmin
    .from('tutoring_slot_overrides')
    .select('start_time, end_time, status, booked_name, booked_email')
    .gte('start_time', rangeStart.toISOString())
    .lt('start_time', rangeEnd.toISOString());
  if (error) throw error;
  const byStart = new Map<string, OverrideRow>();
  (data as OverrideRow[]).forEach((row) => byStart.set(new Date(row.start_time).toISOString(), row));
  return byStart;
}

/**
 * Computes the full 7-day grid for the week starting at weekStart, overlaid
 * with any stored exceptions. `includeBookingDetails` gates whether a
 * booked slot's name/email come back - true for the founder's own admin
 * view, false for a student browsing before paying (never leak another
 * student's details). Slots already in the past are omitted.
 */
export async function getWeekSlots(weekStart: Date, includeBookingDetails: boolean): Promise<WeekSlot[]> {
  const weekEnd = new Date(weekStart.getTime() + DAYS_PER_WEEK * 86400000);
  const [template, overrides] = await Promise.all([
    computeWeekTemplate(weekStart),
    getOverridesInRange(weekStart, weekEnd),
  ]);
  const now = Date.now();
  return template
    .filter((slot) => slot.start.getTime() > now)
    .map((slot) => {
      const override = overrides.get(slot.start.toISOString());
      const status: SlotStatus = override ? override.status : 'open';
      return {
        startTime: slot.start.toISOString(),
        endTime: slot.end.toISOString(),
        status,
        ...(includeBookingDetails && override
          ? { bookedName: override.booked_name, bookedEmail: override.booked_email }
          : {}),
      };
    });
}

export class SlotAlreadyTakenError extends Error {
  constructor() {
    super('This slot is no longer available.');
    this.name = 'SlotAlreadyTakenError';
  }
}

/**
 * Cycles one slot's state for the founder: open -> blocked, blocked ->
 * open, booked -> open (freeing a cancelled booking). The frontend is
 * expected to confirm with the founder before calling this on a booked
 * slot, since it discards the booking's name/email permanently.
 */
export async function toggleSlot(startTime: string, endTime: string): Promise<SlotStatus> {
  const { data: existing, error: readError } = await supabaseAdmin
    .from('tutoring_slot_overrides')
    .select('status')
    .eq('start_time', startTime)
    .maybeSingle();
  if (readError) throw readError;

  if (!existing) {
    const { error } = await supabaseAdmin
      .from('tutoring_slot_overrides')
      .insert({ start_time: startTime, end_time: endTime, status: 'blocked' });
    if (error) throw error;
    return 'blocked';
  }

  const { error } = await supabaseAdmin.from('tutoring_slot_overrides').delete().eq('start_time', startTime);
  if (error) throw error;
  return 'open';
}

/**
 * Claims a still-open slot for a student. Relies on start_time being the
 * table's own primary key for atomicity - a plain insert fails with a
 * unique-violation if another request already claimed (or blocked) this
 * exact slot between the student's page load and this call, which becomes
 * SlotAlreadyTakenError rather than silently overwriting the winner.
 */
export async function claimSlot(startTime: string, endTime: string, name: string, email: string): Promise<WeekSlot> {
  const { error } = await supabaseAdmin.from('tutoring_slot_overrides').insert({
    start_time: startTime,
    end_time: endTime,
    status: 'booked',
    booked_name: name,
    booked_email: email,
    booked_at: new Date().toISOString(),
  });
  if (error) {
    if (error.code === '23505') throw new SlotAlreadyTakenError();
    throw error;
  }
  return { startTime, endTime, status: 'booked', bookedName: name, bookedEmail: email };
}
