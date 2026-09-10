import { Router, Request, Response } from 'express';
import { requireAuth, requireAdmin } from '../services/authMiddleware';
import { actionEndpointLimiter, syncEndpointLimiter } from '../services/rateLimiters';
import {
  listAdminSlots,
  listPublicSlots,
  createSlot,
  setSlotStatus,
  deleteSlot,
  claimSlot,
  SlotAlreadyTakenError,
} from '../services/tutoringSlotsService';

const router = Router();

// GET /tutoring-slots -> PublicSlot[] (open/unavailable only, no names) -
// any signed-in user can browse this BEFORE paying, so they know a slot
// they want is likely to exist. Booking itself only happens after payment
// (see /tutoring-slots/:id/claim below).
router.get('/tutoring-slots', requireAuth, syncEndpointLimiter, async (req: Request, res: Response) => {
  try {
    res.json(await listPublicSlots());
  } catch (err) {
    console.error('LastMind: failed to list tutoring slots.', err);
    res.status(500).json({ error: 'Could not load the tutoring calendar.' });
  }
});

// GET /tutoring-slots/am-i-admin -> {isAdmin:true} or 403 - lets the
// frontend decide whether to show the founder's own availability-
// management controls, without hardcoding an email client-side.
router.get('/tutoring-slots/am-i-admin', requireAuth, requireAdmin, (_req: Request, res: Response) => {
  res.json({ isAdmin: true });
});

// GET /tutoring-slots/admin -> AdminSlot[] (full detail, incl. who booked
// what) - founder only.
router.get('/tutoring-slots/admin', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    res.json(await listAdminSlots());
  } catch (err) {
    console.error('LastMind: failed to list admin tutoring slots.', err);
    res.status(500).json({ error: 'Could not load the tutoring calendar.' });
  }
});

// POST /tutoring-slots { startTime, endTime } -> AdminSlot - founder adds
// a new open slot to their own availability.
router.post('/tutoring-slots', requireAuth, requireAdmin, actionEndpointLimiter, async (req: Request, res: Response) => {
  const { startTime, endTime } = req.body ?? {};
  if (typeof startTime !== 'string' || typeof endTime !== 'string') {
    return res.status(400).json({ error: 'startTime and endTime are required' });
  }
  if (!(new Date(startTime).getTime() < new Date(endTime).getTime())) {
    return res.status(400).json({ error: 'endTime must be after startTime' });
  }
  try {
    res.json(await createSlot(startTime, endTime));
  } catch (err) {
    console.error('LastMind: failed to create a tutoring slot.', err);
    res.status(500).json({ error: 'Could not create this slot.' });
  }
});

// PATCH /tutoring-slots/:id { status: 'open' | 'blocked' } - founder
// blocks a slot (busy with uni work etc), reopens one, or frees a booked
// slot back to open (e.g. a cancellation).
router.patch('/tutoring-slots/:id', requireAuth, requireAdmin, actionEndpointLimiter, async (req: Request, res: Response) => {
  const { status } = req.body ?? {};
  if (status !== 'open' && status !== 'blocked') {
    return res.status(400).json({ error: "status must be 'open' or 'blocked'" });
  }
  try {
    res.json(await setSlotStatus(req.params.id, status));
  } catch (err) {
    console.error('LastMind: failed to update a tutoring slot.', err);
    res.status(500).json({ error: 'Could not update this slot.' });
  }
});

router.delete('/tutoring-slots/:id', requireAuth, requireAdmin, actionEndpointLimiter, async (req: Request, res: Response) => {
  try {
    await deleteSlot(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('LastMind: failed to delete a tutoring slot.', err);
    res.status(500).json({ error: 'Could not delete this slot.' });
  }
});

// POST /tutoring-slots/:id/claim { name, email } -> AdminSlot
//
// Deliberately trusts that the student reaching this page already paid
// (it's only linked from the Stripe Payment Link's own post-payment
// redirect - see learn/index.html's claimSlot deep link) rather than
// verifying a Stripe webhook first. This is a real, accepted trade-off
// for a v1: a Payment Link (not a Checkout Session our backend creates)
// has no session id to correlate here without also standing up a webhook
// endpoint for it. Impact if abused is low (a signed-in student manually
// navigating straight to the claim URL could book a slot without paying)
// and self-correcting (the founder sees every booking against their own
// Stripe payments and can free a slot with no matching payment) - worth
// hardening with a real webhook later if abuse actually shows up, not
// worth blocking this feature on now.
router.post('/tutoring-slots/:id/claim', requireAuth, actionEndpointLimiter, async (req: Request, res: Response) => {
  const { name, email } = req.body ?? {};
  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  if (typeof email !== 'string' || !email.trim()) {
    return res.status(400).json({ error: 'email is required' });
  }
  try {
    res.json(await claimSlot(req.params.id, name.trim(), email.trim()));
  } catch (err) {
    if (err instanceof SlotAlreadyTakenError) {
      return res.status(409).json({ error: err.message });
    }
    console.error('LastMind: failed to claim a tutoring slot.', err);
    res.status(500).json({ error: 'Could not book this slot.' });
  }
});

export default router;
