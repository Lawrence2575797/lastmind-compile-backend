// POST /knowledge-map-v2/topic { topic: string } -> a small knowledge-map
// graph for that free-text topic, generating it live (once, ever, per
// topic) the first time anyone asks for it — see
// topicKnowledgeMapService.ts for the cache-or-generate contract this
// mirrors from the existing per-node lesson route.
import { Router, Request, Response } from 'express';
import { requireAuth, isUserPaid } from '../services/authMiddleware';
import { costlyEndpointLimiter, syncEndpointLimiter } from '../services/rateLimiters';
import { getOrCreateTopicKnowledgeMap } from '../services/topicKnowledgeMapService';
import { getSuggestedNextTopics } from '../services/suggestNextTopicsService';
import { InsufficientLocksError } from '../services/lockService';
import { GenerationCapExceededError } from '../services/generationCapService';

const router = Router();

// GET /knowledge-map-v2/suggest-next -> { suggestions: [string, string, string] }
// Backs Cortex's own "learn something new" suggestion chips - personalized
// against this student's own recent activity (see
// suggestNextTopicsService.ts), falling back to three fixed examples for a
// brand-new account or if generation fails. syncEndpointLimiter, not
// costlyEndpointLimiter: the service itself only ever makes one small,
// cheap (Haiku) call per request, and always resolves to SOME array rather
// than erroring out - there's no cache-miss-shaped cost spike here the way
// a full topic-map generation has.
router.get('/knowledge-map-v2/suggest-next', requireAuth, syncEndpointLimiter, async (req: Request, res: Response) => {
  try {
    const suggestions = await getSuggestedNextTopics(req.userId as string);
    res.json({ suggestions });
  } catch (err) {
    console.error('Suggest-next-topics lookup failed:', err);
    res.status(500).json({ error: 'could not load suggestions' });
  }
});

// costlyEndpointLimiter, not syncEndpointLimiter (contrast with GET
// /knowledge-map-v2 above it): unlike that route, THIS one can trigger a
// real Claude generation on a cache miss, so it needs the tighter "every
// call might cost money" rate limit — the cache-hit case being cheap
// doesn't change that a student (or a bug) hammering this with novel
// topic strings should still be bounded the same way any other
// generation-triggering route already is.
router.post('/knowledge-map-v2/topic', requireAuth, costlyEndpointLimiter, async (req: Request, res: Response) => {
  const { topic } = req.body ?? {};
  if (typeof topic !== 'string' || !topic.trim()) {
    return res.status(400).json({ error: 'topic is required' });
  }
  const userId = req.userId as string;
  try {
    const result = await getOrCreateTopicKnowledgeMap(topic, userId, await isUserPaid(userId), req.userCreatedAt ?? null, req.userEmail);
    res.json(result);
  } catch (err) {
    if (err instanceof InsufficientLocksError) {
      return res.status(402).json({ error: 'Lock limit reached', code: 'LOCK_LIMIT_REACHED', detail: "You're out of Locks for now." });
    }
    if (err instanceof GenerationCapExceededError) {
      return res.status(429).json({ error: 'Generation limit reached', code: 'GENERATION_RATE_LIMIT', window: err.window, limit: err.limit });
    }
    console.error('Topic knowledge map generation failed:', err);
    res.status(500).json({ error: 'could not build a knowledge map for that topic' });
  }
});

export default router;
