import { Router, Request, Response } from 'express';
import { requireAuth } from '../services/authMiddleware';
import { syncEndpointLimiter } from '../services/rateLimiters';
import { listCalendarEvents, createCalendarEvent, deleteCalendarEvent } from '../services/calendarEventsService';

const router = Router();

router.use('/calendar-events', requireAuth, syncEndpointLimiter);

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

// GET /calendar-events -> { events: CalendarEvent[] }
router.get('/calendar-events', async (req: Request, res: Response) => {
  try {
    const events = await listCalendarEvents(req.userId as string);
    res.json({ events });
  } catch (err) {
    console.error('Calendar events list failed:', err);
    res.status(500).json({ error: 'could not load calendar events' });
  }
});

// POST /calendar-events  { date, type: 'busy'|'exam', startTime?, endTime?, folderId? }
// CRITICAL — no free-text field exists anywhere in this shape, deliberately.
// "busy" carries only a date + time range; "exam" carries only a date +
// folderId (an existing folder the student picks, not typed). The
// frontend's calendar UI never collects a text description for either
// type — see learn/index.html's day-click modal.
router.post('/calendar-events', async (req: Request, res: Response) => {
  const { date, type, startTime, endTime, folderId } = req.body ?? {};
  if (typeof date !== 'string' || !DATE_PATTERN.test(date)) {
    return res.status(400).json({ error: 'date (YYYY-MM-DD) is required' });
  }
  if (type !== 'busy' && type !== 'exam') {
    return res.status(400).json({ error: 'type must be "busy" or "exam"' });
  }
  if (type === 'exam' && (typeof folderId !== 'string' || !folderId)) {
    return res.status(400).json({ error: 'folderId is required for an exam event' });
  }
  if (startTime !== undefined && startTime !== null && (typeof startTime !== 'string' || !TIME_PATTERN.test(startTime))) {
    return res.status(400).json({ error: 'startTime must be HH:MM' });
  }
  if (endTime !== undefined && endTime !== null && (typeof endTime !== 'string' || !TIME_PATTERN.test(endTime))) {
    return res.status(400).json({ error: 'endTime must be HH:MM' });
  }

  try {
    const event = await createCalendarEvent(req.userId as string, {
      date,
      type,
      startTime: typeof startTime === 'string' ? startTime : null,
      endTime: typeof endTime === 'string' ? endTime : null,
      folderId: type === 'exam' ? folderId : null,
    });
    res.json({ event });
  } catch (err) {
    console.error('Calendar event create failed:', err);
    res.status(500).json({ error: 'could not create this calendar event' });
  }
});

// POST /calendar-events/delete  { id }
// Only ever deletes a row from calendar_events (user-created busy/exam
// blocks) — the FSRS due-review schedule lives entirely in a different
// table (concept_reviews) that nothing in this router ever touches, so
// there is no path from this endpoint to removing/moving a spaced-
// repetition schedule entry.
router.post('/calendar-events/delete', async (req: Request, res: Response) => {
  const { id } = req.body ?? {};
  if (typeof id !== 'string' || !id) {
    return res.status(400).json({ error: 'id is required' });
  }
  try {
    await deleteCalendarEvent(req.userId as string, id);
    res.json({ ok: true });
  } catch (err) {
    console.error('Calendar event delete failed:', err);
    res.status(500).json({ error: 'could not delete this calendar event' });
  }
});

export default router;
