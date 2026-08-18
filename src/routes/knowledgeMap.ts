import { Router, Request, Response } from 'express';
import { requireAuth } from '../services/authMiddleware';
import { costlyEndpointLimiter } from '../services/rateLimiters';
import { getKnowledgeMapForFolder, FolderConcept } from '../services/knowledgeMapService';

const router = Router();

// POST /knowledge-map  { subject, qualification?, examBoard?, customTitle?, customDescription?, concepts: [{ topic, concept }] }
// -> { nodes: [{id,name}], edges: [{source,target}], mastery: {[nodeId]: 0|1|2} }
// Backs the "Your Progress" knowledge map (see learn/index.html's
// fetchKnowledgeMapData) — POST rather than GET because `concepts` is a
// list, not a scalar the querystring can carry cleanly. `concepts` is
// every page/lesson the student has actually added to this folder
// (already known client-side, see collectFolderConcepts) — the backend
// has no independent read path for a folder's own contents (folder sync
// stores one opaque JSON blob per folder, not parsed server-side), so the
// frontend supplies the concept list directly, the same way it already
// supplies subject/topic/concept to every other chain/lesson route rather
// than the backend re-deriving it.
router.post('/knowledge-map', requireAuth, costlyEndpointLimiter, async (req: Request, res: Response) => {
  const { subject, qualification, examBoard, customTitle, customDescription, concepts } = req.body ?? {};
  if (typeof subject !== 'string' || !subject.trim()) {
    return res.status(400).json({ error: 'subject is required' });
  }
  const cleanConcepts: FolderConcept[] = Array.isArray(concepts)
    ? concepts
        .filter((c) => c && typeof c.concept === 'string' && c.concept.trim())
        .map((c) => ({ topic: typeof c.topic === 'string' ? c.topic : '', concept: c.concept }))
    : [];

  try {
    const result = await getKnowledgeMapForFolder(
      req.userId as string,
      subject,
      typeof qualification === 'string' ? qualification : '',
      typeof examBoard === 'string' ? examBoard : '',
      typeof customTitle === 'string' ? customTitle : '',
      typeof customDescription === 'string' ? customDescription : '',
      cleanConcepts
    );
    res.json(result);
  } catch (err) {
    console.error('Knowledge map generation failed:', err);
    res.status(500).json({ error: 'could not build your progress map' });
  }
});

export default router;
