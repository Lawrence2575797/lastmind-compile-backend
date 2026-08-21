import { Router, Request, Response } from 'express';
import { requireAuth, requirePaidTier } from '../services/authMiddleware';
import { costlyEndpointLimiter, syncEndpointLimiter, actionEndpointLimiter } from '../services/rateLimiters';
import { generateRevisionPlan, listRevisionPlan, setRevisionPlanItemStatus, RevisionPlanConcept } from '../services/revisionPlanService';

const router = Router();

// POST /revision-plan/generate  { examEventId, concepts: [{subject, topic, concept}] }
// Builds (and persists, replacing any prior plan for this exam) a
// day-by-day revision schedule maximizing total retrievability across the
// exam's own concepts. `concepts` is supplied by the frontend the same way
// POST /knowledge-map already is — see knowledgeMapService.ts's own
// comment on why (folders live in the client's synced blob, not a
// normalized server-side table).
router.post('/revision-plan/generate', requireAuth, requirePaidTier, costlyEndpointLimiter, async (req: Request, res: Response) => {
  const { examEventId, concepts, qualification, examBoard, customTitle, customDescription, examinableLabels } = req.body ?? {};
  if (typeof examEventId !== 'string' || !examEventId) {
    return res.status(400).json({ error: 'examEventId is required' });
  }
  const cleanConcepts: RevisionPlanConcept[] = Array.isArray(concepts)
    ? concepts
        .filter((c) => c && typeof c.concept === 'string' && c.concept.trim())
        .map((c) => ({
          subject: typeof c.subject === 'string' ? c.subject : '',
          topic: typeof c.topic === 'string' ? c.topic : '',
          concept: c.concept,
        }))
    : [];
  if (!cleanConcepts.length) {
    return res.status(400).json({ error: 'concepts (non-empty) is required' });
  }
  const cleanExaminableLabels: string[] = Array.isArray(examinableLabels)
    ? examinableLabels.filter((l) => typeof l === 'string' && l.trim())
    : [];

  try {
    const plan = await generateRevisionPlan(
      req.userId as string,
      examEventId,
      cleanConcepts,
      typeof qualification === 'string' ? qualification : '',
      typeof examBoard === 'string' ? examBoard : '',
      typeof customTitle === 'string' ? customTitle : '',
      typeof customDescription === 'string' ? customDescription : '',
      cleanExaminableLabels
    );
    res.json(plan);
  } catch (err) {
    console.error('Revision plan generation failed:', err);
    res.status(500).json({ error: 'could not build a revision plan for this exam' });
  }
});

// GET /revision-plan?examEventId=  -> { items: RevisionPlanItem[] }
// Currently persisted plan only — does not regenerate.
router.get('/revision-plan', requireAuth, requirePaidTier, syncEndpointLimiter, async (req: Request, res: Response) => {
  const examEventId = req.query.examEventId;
  if (typeof examEventId !== 'string' || !examEventId) {
    return res.status(400).json({ error: 'examEventId is required' });
  }
  try {
    const items = await listRevisionPlan(req.userId as string, examEventId);
    res.json({ items });
  } catch (err) {
    console.error('Revision plan fetch failed:', err);
    res.status(500).json({ error: 'could not load this revision plan' });
  }
});

// POST /revision-plan/item-status  { itemId, status: 'pending'|'done'|'skipped' }
router.post('/revision-plan/item-status', requireAuth, requirePaidTier, actionEndpointLimiter, async (req: Request, res: Response) => {
  const { itemId, status } = req.body ?? {};
  if (typeof itemId !== 'string' || !itemId) {
    return res.status(400).json({ error: 'itemId is required' });
  }
  if (status !== 'pending' && status !== 'done' && status !== 'skipped') {
    return res.status(400).json({ error: "status must be 'pending', 'done', or 'skipped'" });
  }
  try {
    await setRevisionPlanItemStatus(req.userId as string, itemId, status);
    res.json({ ok: true });
  } catch (err) {
    console.error('Revision plan item-status update failed:', err);
    res.status(500).json({ error: 'could not update this item' });
  }
});

export default router;
