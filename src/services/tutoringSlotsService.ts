// Founder tutoring booking calendar - one shared tutoring_slots table
// (see scripts/create_tutoring_slots.sql). No external calendar sync: the
// founder is the only supplier, so he opens/blocks his own slots directly
// here instead of through Google/Outlook. Booking is deliberately
// PAY-FIRST, CLAIM-SECOND - see routes/tutoringSlots.ts's own comment on
// why claiming trusts the post-payment redirect rather than verifying a
// Stripe webhook (a real, explicitly-flagged trade-off, not an oversight).
import { supabaseAdmin } from './supabaseAdmin';

export type SlotStatus = 'open' | 'blocked' | 'booked';

export interface AdminSlot {
  id: string;
  startTime: string;
  endTime: string;
  status: SlotStatus;
  bookedName: string | null;
  bookedEmail: string | null;
}

export interface PublicSlot {
  id: string;
  startTime: string;
  endTime: string;
  // Collapsed to a plain open/unavailable flag for non-admins - a student
  // browsing the calendar before paying never needs (or should see)
  // whether a taken slot is blocked-by-the-founder vs already booked by
  // someone else, and never sees another student's name/email.
  available: boolean;
}

interface SlotRow {
  id: string;
  start_time: string;
  end_time: string;
  status: SlotStatus;
  booked_name: string | null;
  booked_email: string | null;
}

function toAdminSlot(row: SlotRow): AdminSlot {
  return {
    id: row.id,
    startTime: row.start_time,
    endTime: row.end_time,
    status: row.status,
    bookedName: row.booked_name,
    bookedEmail: row.booked_email,
  };
}

/** Every upcoming slot, full detail - admin (founder) use only. */
export async function listAdminSlots(): Promise<AdminSlot[]> {
  const { data, error } = await supabaseAdmin
    .from('tutoring_slots')
    .select('id, start_time, end_time, status, booked_name, booked_email')
    .gte('start_time', new Date().toISOString())
    .order('start_time', { ascending: true });
  if (error) throw error;
  return (data as SlotRow[]).map(toAdminSlot);
}

/** Every upcoming slot, collapsed to open/unavailable - for any signed-in student to browse. */
export async function listPublicSlots(): Promise<PublicSlot[]> {
  const { data, error } = await supabaseAdmin
    .from('tutoring_slots')
    .select('id, start_time, end_time, status')
    .gte('start_time', new Date().toISOString())
    .order('start_time', { ascending: true });
  if (error) throw error;
  return (data as Pick<SlotRow, 'id' | 'start_time' | 'end_time' | 'status'>[]).map((row) => ({
    id: row.id,
    startTime: row.start_time,
    endTime: row.end_time,
    available: row.status === 'open',
  }));
}

export async function createSlot(startTime: string, endTime: string): Promise<AdminSlot> {
  const { data, error } = await supabaseAdmin
    .from('tutoring_slots')
    .insert({ start_time: startTime, end_time: endTime, status: 'open' })
    .select('id, start_time, end_time, status, booked_name, booked_email')
    .single();
  if (error) throw error;
  return toAdminSlot(data as SlotRow);
}

/** Admin-only status change - open<->blocked, or freeing a booked slot back to open (e.g. a cancellation). */
export async function setSlotStatus(id: string, status: 'open' | 'blocked'): Promise<AdminSlot> {
  const { data, error } = await supabaseAdmin
    .from('tutoring_slots')
    .update({ status, booked_name: null, booked_email: null, booked_at: null })
    .eq('id', id)
    .select('id, start_time, end_time, status, booked_name, booked_email')
    .single();
  if (error) throw error;
  return toAdminSlot(data as SlotRow);
}

export async function deleteSlot(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from('tutoring_slots').delete().eq('id', id);
  if (error) throw error;
}

export class SlotAlreadyTakenError extends Error {
  constructor() {
    super('This slot is no longer available.');
    this.name = 'SlotAlreadyTakenError';
  }
}

/**
 * Claims an 'open' slot for a student - conditional on the row STILL being
 * 'open' at write time (the .eq('status', 'open') below), so two students
 * racing for the same slot can never both win it; the loser gets
 * SlotAlreadyTakenError instead of silently overwriting the winner's
 * booking.
 */
export async function claimSlot(id: string, name: string, email: string): Promise<AdminSlot> {
  const { data, error } = await supabaseAdmin
    .from('tutoring_slots')
    .update({ status: 'booked', booked_name: name, booked_email: email, booked_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'open')
    .select('id, start_time, end_time, status, booked_name, booked_email')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new SlotAlreadyTakenError();
  return toAdminSlot(data as SlotRow);
}
