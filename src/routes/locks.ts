import { Router, Request, Response } from 'express';
import { requireAuth, isUserPaid } from '../services/authMiddleware';
import { syncEndpointLimiter, actionEndpointLimiter } from '../services/rateLimiters';
import { getOrCreateLockBalance, sweepExpiredLockHolds, depositForLessonBooking, InsufficientLocksError } from '../services/lockService';
import { LESSON_DEPOSIT_LOCK_AMOUNT, monthlyLockAllotmentForTier } from '../constants/locks';
import { supabaseAdmin } from '../services/supabaseAdmin';

const router = Router();

router.use('/locks', requireAuth);

// GET /locks/balance -> { balance, allotment }
// Grants the monthly allotment and creates the user's row on their very
// first call, applies the lazy monthly reset if a new calendar month has
// started, and sweeps any held deposit whose booked day has fully passed
// into 'forfeited' — see lockService.ts's getOrCreateLockBalance and
// sweepExpiredLockHolds. Same lazy, read-triggered pattern as the
// tutoring queue's own overdue sweep; this codebase has no cron.
// `allotment` added for the sidebar usage bar (learn/index.html) — the
// raw monthly figure is fine to expose (it's a lock COUNT, not a $
// figure), unlike the deliberately-obscured £/Lock exchange rate itself.
router.get('/locks/balance', syncEndpointLimiter, async (req: Request, res: Response) => {
  try {
    await sweepExpiredLockHolds(req.userId as string);
    const [balance, isPaid] = await Promise.all([
      getOrCreateLockBalance(req.userId as string),
      isUserPaid(req.userId as string),
    ]);
    res.json({ ...balance, allotment: monthlyLockAllotmentForTier(isPaid) });
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
      return res.status(402).json({ error: 'Lock limit reached', code: 'LOCK_LIMIT_REACHED', detail: "You don't have enough Locks left this month to book this." });
    }
    console.error('Lock deposit failed:', err);
    res.status(500).json({ error: 'could not book this lesson slot' });
  }
});

// GET /locks/transactions?limit=50 -> { transactions: [...] }
// Real audit trail for "where did my Locks go" - every spend/charge/
// credit since lock_transactions existed (see lockService.ts's
// recordTransaction), newest first. reason/model let a specific charge be
// traced back to the feature/route/Claude call that caused it, something
// this app previously had no way to answer after the fact at all.
router.get('/locks/transactions', syncEndpointLimiter, async (req: Request, res: Response) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  try {
    const { data, error } = await supabaseAdmin
      .from('lock_transactions')
      .select('amount, reason, model, balance_after, created_at')
      .eq('user_id', req.userId as string)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    res.json({ transactions: data || [] });
  } catch (err) {
    console.error('Lock transactions fetch failed:', err);
    res.status(500).json({ error: 'could not load your Locks transaction history' });
  }
});

export default router;
