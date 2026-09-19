import { Router, Request, Response } from 'express';
import { requireAuth } from '../services/authMiddleware';
import { syncEndpointLimiter, actionEndpointLimiter } from '../services/rateLimiters';
import {
  listDiagrams,
  getDiagram,
  createDiagram,
  updateDiagram,
  deleteDiagram,
  EconomicsDiagramNotFoundError,
} from '../services/economicsDiagramService';

const router = Router();

// Premium-gated, same as the Maths Tool it sits next to in the topbar -
// a personal study tool, not something the core lesson/review loop
// depends on.
router.use('/economics-diagrams', requireAuth);

// GET /economics-diagrams -> [{ id, title, updatedAt }], newest first
router.get('/economics-diagrams', syncEndpointLimiter, async (req: Request, res: Response) => {
  try {
    const diagrams = await listDiagrams(req.userId as string);
    res.json({ diagrams });
  } catch (err) {
    console.error('Economics diagram list failed:', err);
    res.status(500).json({ error: 'could not load your diagrams' });
  }
});

// GET /economics-diagrams/:id -> { id, title, updatedAt, diagramState }
router.get('/economics-diagrams/:id', syncEndpointLimiter, async (req: Request, res: Response) => {
  try {
    const diagram = await getDiagram(req.userId as string, req.params.id);
    res.json(diagram);
  } catch (err) {
    if (err instanceof EconomicsDiagramNotFoundError) return res.status(404).json({ error: 'diagram not found' });
    console.error('Economics diagram fetch failed:', err);
    res.status(500).json({ error: 'could not load that diagram' });
  }
});

// POST /economics-diagrams  { title, diagramState } -> { id, title, updatedAt, diagramState }
router.post('/economics-diagrams', actionEndpointLimiter, async (req: Request, res: Response) => {
  const { title, diagramState } = req.body ?? {};
  if (typeof title !== 'string' || !title.trim()) return res.status(400).json({ error: 'title is required' });
  try {
    const diagram = await createDiagram(req.userId as string, title.trim(), diagramState ?? { curves: [], shades: [], labels: [], arrows: [] });
    res.json(diagram);
  } catch (err) {
    console.error('Economics diagram create failed:', err);
    res.status(500).json({ error: 'could not create that diagram' });
  }
});

// PUT /economics-diagrams/:id  { title?, diagramState? } -> updated diagram
router.put('/economics-diagrams/:id', actionEndpointLimiter, async (req: Request, res: Response) => {
  const { title, diagramState } = req.body ?? {};
  try {
    const diagram = await updateDiagram(req.userId as string, req.params.id, { title, diagramState });
    res.json(diagram);
  } catch (err) {
    if (err instanceof EconomicsDiagramNotFoundError) return res.status(404).json({ error: 'diagram not found' });
    console.error('Economics diagram update failed:', err);
    res.status(500).json({ error: 'could not save that diagram' });
  }
});

// DELETE /economics-diagrams/:id
router.delete('/economics-diagrams/:id', actionEndpointLimiter, async (req: Request, res: Response) => {
  try {
    await deleteDiagram(req.userId as string, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('Economics diagram delete failed:', err);
    res.status(500).json({ error: 'could not delete that diagram' });
  }
});

export default router;
