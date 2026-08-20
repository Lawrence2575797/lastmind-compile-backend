import { Router, Request, Response } from 'express';
import { requireAuth, requireAdmin } from '../services/authMiddleware';
import { syncEndpointLimiter, actionEndpointLimiter } from '../services/rateLimiters';
import { listUnfulfilledHelpRequests, adminClaimHelpRequest } from '../services/adminTutoringService';

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
