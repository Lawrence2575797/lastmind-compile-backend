import { Router, Request, Response } from 'express';
import { requireAuth } from '../services/authMiddleware';
import { costlyEndpointLimiter } from '../services/rateLimiters';
import { getKnowledgeMapForFolder, getKnowledgeMapForSubject, FolderConcept } from '../services/knowledgeMapService';
import { supabaseAdmin } from '../services/supabaseAdmin';

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

// GET /knowledge-map-v2?subject=&qualification=&examBoard=
// -> { nodes: [{id,conceptId,label,subtopic,theme}], edges: [{source,target}], mastery: {[nodeId]: 0|1|2}, masteryDetail }
// The api-generated, subject-wide map (see scripts/generate_knowledge_map.js
// + ingest_knowledge_map.js) - one shared graph per (subject, qualification,
// examBoard), not derived per-student like the /knowledge-map route above.
// Backs the new folder-click main-content view in learn/index.html,
// replacing the old "Your Progress" overlay for any subject this pipeline
// has actually been run for; a subject with no rows yet just returns an
// empty graph, which the frontend renders as an empty state.
router.get('/knowledge-map-v2', requireAuth, costlyEndpointLimiter, async (req: Request, res: Response) => {
  const { subject, qualification, examBoard } = req.query;
  if (typeof subject !== 'string' || !subject.trim()) {
    return res.status(400).json({ error: 'subject is required' });
  }
  try {
    const result = await getKnowledgeMapForSubject(
      req.userId as string,
      subject,
      typeof qualification === 'string' ? qualification : '',
      typeof examBoard === 'string' ? examBoard : ''
    );
    res.json(result);
  } catch (err) {
    console.error('Subject knowledge map lookup failed:', err);
    res.status(500).json({ error: 'could not load the knowledge map' });
  }
});

// GET /knowledge-map-v2/node/:nodeId/lesson -> the stored encoding lesson
// { explanation, practiceQuestion } for one node (see
// scripts/generate_lesson_content.js + create_knowledge_map_node_lessons.sql).
// Read-only lookup by uuid - no generation happens here, this pipeline is
// one-time/offline by design (see the lesson-generation prompts' own
// comment on why lessons are never generated live).
router.get('/knowledge-map-v2/node/:nodeId/lesson', requireAuth, async (req: Request, res: Response) => {
  const { nodeId } = req.params;
  try {
    const { data, error } = await supabaseAdmin
      .from('knowledge_map_node_lessons')
      .select('encoding_content')
      .eq('node_id', nodeId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'no lesson generated for this concept yet' });
    res.json(data.encoding_content);
  } catch (err) {
    console.error('Node lesson lookup failed:', err);
    res.status(500).json({ error: 'could not load this lesson' });
  }
});

// GET /knowledge-map-v2/edge/:fromNodeId/:toNodeId/lesson -> the stored
// edge lesson { linkTeaching, transferQuestion, integrationQuestion } for
// the prerequisite relationship between two nodes (see
// scripts/generate_edge_lessons_haiku_fast.js + create_knowledge_map_edge_lessons.sql).
// Same read-only, one-time-generation contract as the node lesson route
// above - looks the edge up by its endpoints since the frontend graph
// only knows node ids, then joins to its lesson row.
router.get('/knowledge-map-v2/edge/:fromNodeId/:toNodeId/lesson', requireAuth, async (req: Request, res: Response) => {
  const { fromNodeId, toNodeId } = req.params;
  try {
    const { data, error } = await supabaseAdmin
      .from('knowledge_map_edges')
      .select('id, knowledge_map_edge_lessons(link_teaching_content, transfer_question, integration_question)')
      .eq('from_node_id', fromNodeId)
      .eq('to_node_id', toNodeId)
      .maybeSingle();
    if (error) throw error;
    const lessonRow = Array.isArray(data?.knowledge_map_edge_lessons)
      ? data?.knowledge_map_edge_lessons[0]
      : data?.knowledge_map_edge_lessons;
    if (!data || !lessonRow) return res.status(404).json({ error: 'no lesson generated for this connection yet' });
    res.json({
      linkTeaching: lessonRow.link_teaching_content,
      transferQuestion: lessonRow.transfer_question,
      integrationQuestion: lessonRow.integration_question,
    });
  } catch (err) {
    console.error('Edge lesson lookup failed:', err);
    res.status(500).json({ error: 'could not load this lesson' });
  }
});

export default router;
