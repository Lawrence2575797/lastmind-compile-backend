import { supabaseAdmin } from './supabaseAdmin';

// User-created calendar entries alongside the FSRS-derived due-review
// schedule (see reviewService.ts / GET /schedule) — deliberately carries
// NO free text field of any kind. A "busy" event is only ever a date +
// time range; an "exam" event is only ever a date + a reference to an
// existing folder (structured, not typed) — enough for future revision-
// scheduling logic to intensify review before an exam date, without ever
// collecting anything the student might type personal information into.
export interface CalendarEvent {
  id: string;
  date: string; // YYYY-MM-DD
  type: 'busy' | 'exam';
  startTime: string | null; // HH:MM, 24h
  endTime: string | null;
  folderId: string | null; // exam only
}

export async function listCalendarEvents(userId: string): Promise<CalendarEvent[]> {
  const { data, error } = await supabaseAdmin
    .from('calendar_events')
    .select('id, event_date, type, start_time, end_time, folder_id')
    .eq('user_id', userId);
  if (error) throw error;
  return (data || []).map((row) => ({
    id: row.id,
    date: row.event_date,
    type: row.type,
    startTime: row.start_time,
    endTime: row.end_time,
    folderId: row.folder_id,
  }));
}

export async function createCalendarEvent(
  userId: string,
  event: { date: string; type: 'busy' | 'exam'; startTime: string | null; endTime: string | null; folderId: string | null }
): Promise<CalendarEvent> {
  const { data, error } = await supabaseAdmin
    .from('calendar_events')
    .insert({
      user_id: userId,
      event_date: event.date,
      type: event.type,
      start_time: event.startTime,
      end_time: event.endTime,
      folder_id: event.folderId,
    })
    .select('id, event_date, type, start_time, end_time, folder_id')
    .single();
  if (error) throw error;
  return { id: data.id, date: data.event_date, type: data.type, startTime: data.start_time, endTime: data.end_time, folderId: data.folder_id };
}

// FSRS-derived due reviews aren't rows in this table at all (they come
// from concept_reviews via GET /schedule) — this delete can only ever
// touch a user-created busy/exam event, never a review schedule entry,
// which is exactly the "can't remove/move spaced repetition" constraint:
// there's simply no code path here that reaches concept_reviews.
export async function deleteCalendarEvent(userId: string, eventId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('calendar_events')
    .delete()
    .eq('user_id', userId)
    .eq('id', eventId);
  if (error) throw error;
}
