// POST /knowledge-map-v2/topic { topic: string } -> a small knowledge-map
// graph for that free-text topic, generated fresh and privately every time
// (see topicKnowledgeMapService.ts's own top comment for why this is no
// longer cached/shared across requests).
import { Router, Request, Response } from 'express';
import { requireAuth, isUserPaid } from '../services/authMiddleware';
import { costlyEndpointLimiter, syncEndpointLimiter } from '../services/rateLimiters';
import { getOrCreateTopicKnowledgeMap, extendTopicMapBackward, extendTopicMapForward } from '../services/topicKnowledgeMapService';
import { getSuggestedNextTopics } from '../services/suggestNextTopicsService';
import { getMasteryDetailsForConcepts } from '../services/reviewService';
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
    // Real, reported problem this fixes: whether a node has already been
    // taught used to live only in a client-side reconstruction (scanning
    // this session's own chat history for past completions) - fragile, and
    // useless the moment a completion predated that tracking existing at
    // all, or came from a different device/session. concept_reviews is the
    // same real, durable progress table every lesson completion already
    // writes to (see POST /knowledge-map-v2/derivation/complete) - a row
    // existing for a concept here means it has genuinely been taught at
    // least once, regardless of which device or session did it.
    const masteryByConcept = await getMasteryDetailsForConcepts(userId, result.nodes.map((n) => n.conceptId));
    const nodes = result.nodes.map((n) => ({ ...n, completed: masteryByConcept.has(n.conceptId) }));
    res.json({ ...result, nodes });
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

// Adds new, earlier prerequisite nodes in front of an existing topic map's
// current root(s) - fired when a student says the map/lessons assume too
// much and they don't understand the starting concepts (see
// extendPrerequisitesBackward in cortexPrompts.ts/cortex/index.html).
// costlyEndpointLimiter for the same reason as the route above: this can
// trigger a real Claude generation.
router.post('/knowledge-map-v2/topic/extend-backward', requireAuth, costlyEndpointLimiter, async (req: Request, res: Response) => {
  const { topic, examBoard } = req.body ?? {};
  if (typeof topic !== 'string' || !topic.trim()) {
    return res.status(400).json({ error: 'topic is required' });
  }
  if (typeof examBoard !== 'string' || !examBoard) {
    return res.status(400).json({ error: 'examBoard (the specific map instance) is required' });
  }
  const userId = req.userId as string;
  try {
    const result = await extendTopicMapBackward(topic, examBoard, userId, await isUserPaid(userId), req.userCreatedAt ?? null, req.userEmail);
    const masteryByConcept = await getMasteryDetailsForConcepts(userId, result.nodes.map((n) => n.conceptId));
    const nodes = result.nodes.map((n) => ({ ...n, completed: masteryByConcept.has(n.conceptId) }));
    res.json({ ...result, nodes });
  } catch (err) {
    if (err instanceof InsufficientLocksError) {
      return res.status(402).json({ error: 'Lock limit reached', code: 'LOCK_LIMIT_REACHED', detail: "You're out of Locks for now." });
    }
    if (err instanceof GenerationCapExceededError) {
      return res.status(429).json({ error: 'Generation limit reached', code: 'GENERATION_RATE_LIMIT', window: err.window, limit: err.limit });
    }
    console.error('Topic knowledge map backward-extension failed:', err);
    res.status(500).json({ error: 'could not extend the knowledge map backward for that topic' });
  }
});

// Mirror of the backward route above for the forward direction - fired
// when a student wants to keep going past the map's current endpoint (see
// extendPrerequisitesForward in cortexPrompts.ts/cortex/index.html). Just
// as important a direction as backward: the product optimises for the
// student actually making progress, not stopping at whatever node budget
// the original generation happened to use.
router.post('/knowledge-map-v2/topic/extend-forward', requireAuth, costlyEndpointLimiter, async (req: Request, res: Response) => {
  const { topic, examBoard } = req.body ?? {};
  if (typeof topic !== 'string' || !topic.trim()) {
    return res.status(400).json({ error: 'topic is required' });
  }
  if (typeof examBoard !== 'string' || !examBoard) {
    return res.status(400).json({ error: 'examBoard (the specific map instance) is required' });
  }
  const userId = req.userId as string;
  try {
    const result = await extendTopicMapForward(topic, examBoard, userId, await isUserPaid(userId), req.userCreatedAt ?? null, req.userEmail);
    const masteryByConcept = await getMasteryDetailsForConcepts(userId, result.nodes.map((n) => n.conceptId));
    const nodes = result.nodes.map((n) => ({ ...n, completed: masteryByConcept.has(n.conceptId) }));
    res.json({ ...result, nodes });
  } catch (err) {
    if (err instanceof InsufficientLocksError) {
      return res.status(402).json({ error: 'Lock limit reached', code: 'LOCK_LIMIT_REACHED', detail: "You're out of Locks for now." });
    }
    if (err instanceof GenerationCapExceededError) {
      return res.status(429).json({ error: 'Generation limit reached', code: 'GENERATION_RATE_LIMIT', window: err.window, limit: err.limit });
    }
    console.error('Topic knowledge map forward-extension failed:', err);
    res.status(500).json({ error: 'could not extend the knowledge map forward for that topic' });
  }
});

export default router;
