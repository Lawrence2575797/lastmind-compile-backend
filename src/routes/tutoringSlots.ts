import { Router, Request, Response } from 'express';
import { requireAuth, requireAdmin } from '../services/authMiddleware';
import { actionEndpointLimiter, syncEndpointLimiter } from '../services/rateLimiters';
import { getWeekSlots, toggleSlot, setDayStatus, claimSlot, SlotAlreadyTakenError } from '../services/tutoringSlotsService';

const router = Router();

function parseWeekStart(raw: unknown): Date | null {
  if (typeof raw !== 'string' || !raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

// GET /tutoring-slots/week?weekStart=ISO -> WeekSlot[] (open/unavailable
// only, no names) - any signed-in user can browse this BEFORE paying.
// weekStart is that week's local Monday midnight, computed client-side
// (see learn/index.html's getMondayOfWeek) - the backend just adds fixed
// hour offsets to it, so it never needs its own timezone logic.
router.get('/tutoring-slots/week', requireAuth, syncEndpointLimiter, async (req: Request, res: Response) => {
  const weekStart = parseWeekStart(req.query.weekStart);
  if (!weekStart) return res.status(400).json({ error: 'weekStart is required' });
  try {
    const slots = await getWeekSlots(weekStart, false);
    res.json(slots.map((s) => ({ startTime: s.startTime, endTime: s.endTime, status: s.status === 'open' ? 'open' : 'unavailable' })));
  } catch (err) {
    console.error('LastMind: failed to load the tutoring calendar.', err);
    res.status(500).json({ error: 'Could not load the tutoring calendar.' });
  }
});

// GET /tutoring-slots/week/admin?weekStart=ISO -> WeekSlot[] (full detail,
// incl. who booked what) - founder only.
router.get('/tutoring-slots/week/admin', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const weekStart = parseWeekStart(req.query.weekStart);
  if (!weekStart) return res.status(400).json({ error: 'weekStart is required' });
  try {
    res.json(await getWeekSlots(weekStart, true));
  } catch (err) {
    console.error('LastMind: failed to load the admin tutoring calendar.', err);
    res.status(500).json({ error: 'Could not load the tutoring calendar.' });
  }
});

// GET /tutoring-slots/am-i-admin -> {isAdmin:true} or 403 - lets the
// frontend decide whether to show the founder's own availability-
// management controls, without hardcoding an email client-side.
router.get('/tutoring-slots/am-i-admin', requireAuth, requireAdmin, syncEndpointLimiter, (_req: Request, res: Response) => {
  res.json({ isAdmin: true });
});

// POST /tutoring-slots/toggle { startTime, endTime } -> {status} - founder
// clicks a calendar cell: open->blocked, blocked->open, or booked->open
// (freeing a cancelled booking - the frontend confirms with the founder
// first since this discards the booking's name/email for good).
router.post('/tutoring-slots/toggle', requireAuth, requireAdmin, actionEndpointLimiter, async (req: Request, res: Response) => {
  const { startTime, endTime } = req.body ?? {};
  if (typeof startTime !== 'string' || typeof endTime !== 'string') {
    return res.status(400).json({ error: 'startTime and endTime are required' });
  }
  try {
    const status = await toggleSlot(startTime, endTime);
    res.json({ status });
  } catch (err) {
    console.error('LastMind: failed to toggle a tutoring slot.', err);
    res.status(500).json({ error: 'Could not update this slot.' });
  }
});

// POST /tutoring-slots/day { dayStart, targetStatus } - bulk block/reopen
// a WHOLE day in one call (e.g. "busy all day with uni work"), instead of
// toggling each of that day's ~12 hourly cells one at a time. Never
// touches a booked slot either way - freeing an actual booking stays a
// deliberate single-slot /toggle action with its own confirmation.
router.post('/tutoring-slots/day', requireAuth, requireAdmin, actionEndpointLimiter, async (req: Request, res: Response) => {
  const dayStart = parseWeekStart(req.body?.dayStart);
  const { targetStatus } = req.body ?? {};
  if (!dayStart) return res.status(400).json({ error: 'dayStart is required' });
  if (targetStatus !== 'open' && targetStatus !== 'blocked') {
    return res.status(400).json({ error: "targetStatus must be 'open' or 'blocked'" });
  }
  try {
    await setDayStatus(dayStart, targetStatus);
    res.json({ ok: true });
  } catch (err) {
    console.error('LastMind: failed to bulk-update a tutoring day.', err);
    res.status(500).json({ error: 'Could not update this day.' });
  }
});

// POST /tutoring-slots/claim { startTime, endTime, name, email } -> WeekSlot
//
// Deliberately trusts that the student reaching this page already paid
// (it's only linked from the Stripe Payment Link's own post-payment
// redirect - see learn/index.html's claimSlot deep link) rather than
// verifying a Stripe webhook first - a real, accepted trade-off for v1
// (see tutoringSlotsService.ts's own comment on claimSlot's atomicity for
// the part that IS enforced: two students can never win the same slot).
router.post('/tutoring-slots/claim', requireAuth, actionEndpointLimiter, async (req: Request, res: Response) => {
  const { startTime, endTime, name, email } = req.body ?? {};
  if (typeof startTime !== 'string' || typeof endTime !== 'string') {
    return res.status(400).json({ error: 'startTime and endTime are required' });
  }
  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  if (typeof email !== 'string' || !email.trim()) {
    return res.status(400).json({ error: 'email is required' });
  }
  try {
    res.json(await claimSlot(startTime, endTime, name.trim(), email.trim()));
  } catch (err) {
    if (err instanceof SlotAlreadyTakenError) {
      return res.status(409).json({ error: err.message });
    }
    console.error('LastMind: failed to claim a tutoring slot.', err);
    res.status(500).json({ error: 'Could not book this slot.' });
  }
});

export default router;
