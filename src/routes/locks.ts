import { Router, Request, Response } from 'express';
import { requireAuth } from '../services/authMiddleware';
import { syncEndpointLimiter, actionEndpointLimiter } from '../services/rateLimiters';
import { getOrCreateLockBalance, sweepExpiredLockHolds, depositForLessonBooking, InsufficientLocksError } from '../services/lockService';
import { LESSON_DEPOSIT_LOCK_AMOUNT } from '../constants/locks';

const router = Router();

router.use('/locks', requireAuth);

// GET /locks/balance -> { balance }
// Grants the monthly allotment and creates the user's row on their very
// first call, applies the lazy monthly reset if a new calendar month has
// started, and sweeps any held deposit whose booked day has fully passed
// into 'forfeited' — see lockService.ts's getOrCreateLockBalance and
// sweepExpiredLockHolds. Same lazy, read-triggered pattern as the
// tutoring queue's own overdue sweep; this codebase has no cron.
router.get('/locks/balance', syncEndpointLimiter, async (req: Request, res: Response) => {
  try {
    await sweepExpiredLockHolds(req.userId as string);
    const balance = await getOrCreateLockBalance(req.userId as string);
    res.json(balance);
  } catch (err) {
    console.error('Lock balance fetch failed:', err);
    res.status(500).json({ error: 'could not load your Locks balance' });
  }
});

// POST /locks/deposit  { date, startTime? } -> { balance, calendarEventId, holdId }
// Books a weekly lesson slot: spends LESSON_DEPOSIT_LOCK_AMOUNT, creates
// the calendar entry, and creates the 'held' hold linking them. Refunded
// automatically the moment a lesson is actually started on the booked
// day (see lockService.ts's refundTodaysHeldDepositIfAny, called from
// both /encoding-lesson/start and /chain-lesson/start); forfeited by the
// sweep above if the day passes with nothing started.
router.post('/locks/deposit', actionEndpointLimiter, async (req: Request, res: Response) => {
  const { date, startTime } = req.body ?? {};
  if (typeof date !== 'string' || !date) {
    return res.status(400).json({ error: 'date is required' });
  }
  try {
    const result = await depositForLessonBooking(
      req.userId as string,
      date,
      typeof startTime === 'string' && startTime ? startTime : null,
      LESSON_DEPOSIT_LOCK_AMOUNT
    );
    res.json(result);
  } catch (err) {
    if (err instanceof InsufficientLocksError) {
      return res.status(402).json({ error: "You don't have enough Locks left this month to book this." });
    }
    console.error('Lock deposit failed:', err);
    res.status(500).json({ error: 'could not book this lesson slot' });
  }
});

export default router;
