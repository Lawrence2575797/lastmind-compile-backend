import { Router, Request, Response } from 'express';
import { requireAuth } from '../services/authMiddleware';
import { syncEndpointLimiter } from '../services/rateLimiters';
import { listNoteNodes, pushNoteNodes, listNoteImageIds, saveNoteImage, getNoteImage } from '../services/notesSyncService';

// The Notes page's own storage, per account - see notesSyncService.ts. Never calls Claude: it only reads and writes
// the student's own pages, so there is no costly-endpoint limiter, just the global one.
const router = Router();
router.use('/notes-sync', requireAuth, syncEndpointLimiter);

const ID = /^[A-Za-z0-9_-]{1,64}$/;

// GET /notes-sync -> { nodes: [{ id, data, updatedAt, deletedAt }], imageIds: [string] }
router.get('/notes-sync', async (req: Request, res: Response) => {
  try {
    const [nodes, imageIds] = await Promise.all([listNoteNodes(req.userId as string), listNoteImageIds(req.userId as string)]);
    res.json({ nodes, imageIds });
  } catch (err) {
    console.error('Notes sync list failed:', err);
    res.status(500).json({ error: 'could not load your notes' });
  }
});

// POST /notes-sync/push { nodes: [{ id, data }], deleted: [id] } -> { stamps: { id: updatedAt } }
router.post('/notes-sync/push', async (req: Request, res: Response) => {
  const body = req.body || {};
  const nodes = Array.isArray(body.nodes) ? body.nodes : [];
  const deleted = Array.isArray(body.deleted) ? body.deleted : [];
  if (nodes.length > 500 || deleted.length > 2000) return res.status(400).json({ error: 'too many notes in one request' });
  if (nodes.some((n: any) => !n || typeof n.id !== 'string' || !ID.test(n.id) || typeof n.data !== 'object' || !n.data) || deleted.some((d: any) => typeof d !== 'string' || !ID.test(d))) {
    return res.status(400).json({ error: 'invalid notes' });
  }
  try {
    const stamps = await pushNoteNodes(req.userId as string, nodes.map((n: any) => ({ id: n.id, data: n.data })), deleted);
    res.json({ stamps });
  } catch (err) {
    console.error('Notes sync push failed:', err);
    res.status(500).json({ error: 'could not save your notes' });
  }
});

// POST /notes-sync/image { id, dataUrl }
router.post('/notes-sync/image', async (req: Request, res: Response) => {
  const { id, dataUrl } = req.body || {};
  if (typeof id !== 'string' || !ID.test(id) || typeof dataUrl !== 'string' || !/^data:image\/(png|jpeg|jpg|webp|gif);base64,/.test(dataUrl) || dataUrl.length > 7000000) {
    return res.status(400).json({ error: 'invalid picture' });
  }
  try {
    await saveNoteImage(req.userId as string, id, dataUrl);
    res.json({ ok: true });
  } catch (err) {
    console.error('Notes picture save failed:', err);
    res.status(500).json({ error: 'could not save this picture' });
  }
});

// GET /notes-sync/image/:id -> { dataUrl }
router.get('/notes-sync/image/:id', async (req: Request, res: Response) => {
  if (!ID.test(req.params.id)) return res.status(400).json({ error: 'invalid picture' });
  try {
    const dataUrl = await getNoteImage(req.userId as string, req.params.id);
    if (!dataUrl) return res.status(404).json({ error: 'picture not found' });
    res.json({ dataUrl });
  } catch (err) {
    console.error('Notes picture load failed:', err);
    res.status(500).json({ error: 'could not load this picture' });
  }
});

export default router;
