import { Router, Request, Response } from 'express';
import { requireAuth, requireAdmin } from '../services/authMiddleware';
import { syncEndpointLimiter, actionEndpointLimiter } from '../services/rateLimiters';
import { listUnfulfilledHelpRequests, adminClaimHelpRequest } from '../services/adminTutoringService';
import { supabaseAdmin } from '../services/supabaseAdmin';

const router = Router();

router.use('/admin', requireAuth, requireAdmin);

// GET /admin/overdue-requests -> UnfulfilledHelpRequest[]
router.get('/admin/overdue-requests', syncEndpointLimiter, async (req: Request, res: Response) => {
  try {
    const requests = await listUnfulfilledHelpRequests();
    res.json(requests);
  } catch (err) {
    console.error('Overdue-requests fetch failed:', err);
    res.status(500).json({ error: 'could not load overdue requests' });
  }
});

// GET /admin/new-accounts?days=7 -> the accounts created in the last few days (owner only), newest first
router.get('/admin/new-accounts', syncEndpointLimiter, async (req: Request, res: Response) => {
  try {
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 7));
    const since = Date.now() - days * 86_400_000;
    const found: { email: string | null; createdAt: string; provider: string; confirmed: boolean }[] = [];
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      const users = data?.users || [];
      users.forEach((u) => { if (Date.parse(u.created_at) >= since) found.push({ email: u.email || null, createdAt: u.created_at, provider: (u.app_metadata as any)?.provider || 'email', confirmed: !!u.email_confirmed_at }); });
      if (users.length < 200) break;
    }
    found.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json({ days, count: found.length, accounts: found });
  } catch (err) {
    console.error('New-accounts list failed:', err);
    res.status(500).json({ error: 'could not list new accounts' });
  }
});

// POST /admin/overdue-requests/:id/claim
router.post('/admin/overdue-requests/:id/claim', actionEndpointLimiter, async (req: Request, res: Response) => {
  try {
    const session = await adminClaimHelpRequest(req.userId as string, req.params.id);
    res.json(session);
  } catch (err: any) {
    console.error('Admin claim failed:', err);
    res.status(400).json({ error: err?.message || 'could not claim this request' });
  }
});

export default router;
