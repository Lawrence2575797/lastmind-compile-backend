import { Router, Request, Response } from 'express';
import { requireAuth } from '../services/authMiddleware';
import { syncEndpointLimiter } from '../services/rateLimiters';
import { getOrGenerateWeeklyReport, listPastWeeklyReports, getWeeklyReportByWeekStart } from '../services/weeklyProgressReportService';

const router = Router();

// Free for every tier, deliberately - same reasoning as theme-settings:
// this reads/summarizes data the student already generated themselves,
// no Claude call involved, no reason to gate it.
router.use('/progress-report', requireAuth);

// GET /progress-report -> the most recently RELEASED (fully completed)
// week's report, generating and persisting it on first request (see
// getOrGenerateWeeklyReport's own comment on why it's a stable snapshot
// from then on, not recomputed live on every view).
router.get('/progress-report', syncEndpointLimiter, async (req: Request, res: Response) => {
  try {
    const report = await getOrGenerateWeeklyReport(req.userId as string);
    res.json(report);
  } catch (err) {
    console.error('Weekly progress report fetch failed:', err);
    res.status(500).json({ error: 'could not load your progress report' });
  }
});

// GET /progress-report/history -> [{ weekStart, weekLabel }, ...], newest first
router.get('/progress-report/history', syncEndpointLimiter, async (req: Request, res: Response) => {
  try {
    const weeks = await listPastWeeklyReports(req.userId as string);
    res.json({ weeks });
  } catch (err) {
    console.error('Weekly progress report history fetch failed:', err);
    res.status(500).json({ error: 'could not load your past reports' });
  }
});

// GET /progress-report/:weekStart -> one specific already-released report
// (weekStart is the YYYY-MM-DD Monday date from the history list above).
// Never generates a new one here - only getOrGenerateWeeklyReport (the
// bare /progress-report route) is allowed to create the current week's,
// so a mistyped/future date just 404s instead of quietly computing
// something that hasn't actually been released yet.
router.get('/progress-report/:weekStart', syncEndpointLimiter, async (req: Request, res: Response) => {
  try {
    const report = await getWeeklyReportByWeekStart(req.userId as string, req.params.weekStart);
    if (!report) return res.status(404).json({ error: 'no report for that week' });
    res.json(report);
  } catch (err) {
    console.error('Weekly progress report lookup failed:', err);
    res.status(500).json({ error: 'could not load that report' });
  }
});

export default router;
