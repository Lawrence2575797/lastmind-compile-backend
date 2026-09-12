import { Router, Request, Response } from 'express';
import { requireAuth } from '../services/authMiddleware';
import { actionEndpointLimiter } from '../services/rateLimiters';
import { supabaseAdmin } from '../services/supabaseAdmin';
import { deleteOwnAccount } from '../services/accountDeletionService';

const router = Router();

router.use('/account', requireAuth);

// POST /account/delete { confirmEmail } -> { ok: true }
// Irreversible - requires the caller to re-type their own account email
// as a real confirmation step (checked server-side, not just a client-side
// UI gate), on top of the already-verified JWT requireAuth enforces. Never
// touches any Stripe/PayPal subscription - the frontend must tell the
// student to cancel an active subscription separately first.
router.post('/account/delete', actionEndpointLimiter, async (req: Request, res: Response) => {
  const { confirmEmail } = req.body ?? {};
  if (typeof confirmEmail !== 'string' || !confirmEmail.trim()) {
    return res.status(400).json({ error: 'confirmEmail is required' });
  }
  try {
    const userId = req.userId as string;
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (userError || !userData?.user) {
      return res.status(404).json({ error: 'account not found' });
    }
    if (confirmEmail.trim().toLowerCase() !== (userData.user.email || '').toLowerCase()) {
      return res.status(400).json({ error: 'the email you typed does not match this account' });
    }
    await deleteOwnAccount(userId);
    res.json({ ok: true });
  } catch (err) {
    console.error('Account deletion failed:', err);
    res.status(500).json({ error: 'something went wrong deleting your account - this is safe to retry (it picks up where it left off), or contact support if it keeps failing' });
  }
});

export default router;
