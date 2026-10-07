import { Router, Request, Response } from 'express';
import { requireAuth, requirePaidTier } from '../services/authMiddleware';
import { costlyEndpointLimiter } from '../services/rateLimiters';
import { decideCortexAction, describeCortexError, CortexResponseTruncatedError, CortexUnavailableError } from '../services/cortexService';
import { assertLocksAvailable, InsufficientLocksError } from '../services/lockService';
import { conversationTurn, validLanguage, ConversationTurn } from '../services/conversationService';

const router = Router();

router.use('/cortex', requireAuth, requirePaidTier, costlyEndpointLimiter);

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
    // Every other metered AI feature in this app refuses upfront when a
    // student's Locks balance is already at zero (see knowledgeMap.ts's own
    // InsufficientLocksError handling) - this route was the one exception,
    // charging normally per message (see cortexService.ts's own
    // callClaudeJSON({ userId, meteredReason: 'cortex-chat' }) - real
    // response.usage, not a flat guess) but with nothing stopping a student
    // already out of Locks from continuing to chat and just going further
    // negative. Real reported gap, fixed to match every other route.
    await assertLocksAvailable(req.userId as string);
    const result = await decideCortexAction(
      message,
      Array.isArray(history) ? history : [],
      Array.isArray(folders) ? folders : [],
      Array.isArray(dueReviews) ? dueReviews : [],
      req.userId as string
    );
    res.json(result);
  } catch (err) {
    if (err instanceof InsufficientLocksError) {
      return res.status(402).json({ error: 'Lock limit reached', code: 'LOCK_LIMIT_REACHED', detail: "You're out of Locks for now." });
    }
    console.error('Cortex message handling failed:', err);
    if (err instanceof CortexResponseTruncatedError || err instanceof CortexUnavailableError) {
      res.status(500).json({ error: err.message });
    } else {
      // The real reason, not a vague apology: it is what the chat shows.
      res.status(500).json({ error: `Cortex chat failed: ${describeCortexError(err)}` });
    }
  }
});

// POST /cortex/conversation  { language, history, message }
// One turn of a practice conversation in the language the student is learning (message empty = open it). Built from what they have
// completed in that language. Stateless like /cortex/message: the frontend holds and resends the turns.
router.post('/cortex/conversation', async (req: Request, res: Response) => {
  const { language, history, message } = req.body ?? {};
  const lang = validLanguage(language);
  if (!lang) return res.status(400).json({ error: 'a language is required' });
  const text = typeof message === 'string' ? message.trim() : '';
  const turns: ConversationTurn[] = (Array.isArray(history) ? history : [])
    .filter((h: any) => h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string')
    .slice(-14);
  try {
    await assertLocksAvailable(req.userId as string);
    res.json(await conversationTurn(req.userId as string, lang, turns, text));
  } catch (err) {
    if (err instanceof InsufficientLocksError) {
      return res.status(402).json({ error: 'Lock limit reached', code: 'LOCK_LIMIT_REACHED', detail: "You're out of Locks for now." });
    }
    console.error('Cortex conversation turn failed:', err);
    res.status(500).json({ error: `The conversation could not continue: ${describeCortexError(err)}` });
  }
});

export default router;
