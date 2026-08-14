import { Router, Request, Response } from 'express';
import { requireAuth } from '../services/authMiddleware';
import { costlyEndpointLimiter } from '../services/rateLimiters';
import { decideCortexAction } from '../services/cortexService';

const router = Router();

router.use('/cortex', requireAuth, costlyEndpointLimiter);

// POST /cortex/message  { message, history, folders, dueReviews }
// { reply, speakAloud, actions }
//
// The single stateful-feeling entry point for Cortex, but actually
// stateless server-side — the frontend holds and resends the chat
// history each call, same pattern as the diagnostic engine's `state`.
// "actions" is a list (see CortexResult), applied by the frontend strictly
// in order — a single message can now genuinely ask for several steps at
// once. Any "generate_notes" action already has its note content generated
// and attached by the time this responds.
router.post('/cortex/message', async (req: Request, res: Response) => {
  const { message, history, folders, dueReviews } = req.body ?? {};
  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }

  try {
    const result = await decideCortexAction(
      message,
      Array.isArray(history) ? history : [],
      Array.isArray(folders) ? folders : [],
      Array.isArray(dueReviews) ? dueReviews : []
    );
    res.json(result);
  } catch (err) {
    console.error('Cortex message handling failed:', err);
    res.status(500).json({ error: 'could not process this message' });
  }
});

export default router;
