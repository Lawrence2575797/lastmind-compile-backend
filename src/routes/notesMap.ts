import { Router, Request, Response } from 'express';
import { requireAuth, requirePaidTier } from '../services/authMiddleware';
import { costlyEndpointLimiter } from '../services/rateLimiters';
import { assertLocksAvailable, InsufficientLocksError } from '../services/lockService';
import { syncNotesToMap, NotesPageIn } from '../services/notesMapService';

// POST /notes-map/sync { pages: [{ id, title, folder, text }] } -> { pages, created, updated, skipped }
// The Notes page sends the pages that changed; each becomes concepts on the student's knowledge map (see notesMapService.ts).
const router = Router();
router.use('/notes-map', requireAuth, requirePaidTier, costlyEndpointLimiter);

const clip = (s: unknown, n: number) => (typeof s === 'string' ? s.trim().slice(0, n) : '');

router.post('/notes-map/sync', async (req: Request, res: Response) => {
  const raw = Array.isArray(req.body?.pages) ? req.body.pages : [];
  const pages: NotesPageIn[] = raw.slice(0, 5).map((p: any) => ({ id: clip(p && p.id, 60), title: clip(p && p.title, 120), folder: clip(p && p.folder, 60), text: clip(p && p.text, 8000) }))
    .filter((p: NotesPageIn) => p.id && p.text.length >= 60);
  if (!pages.length) return res.json({ pages: 0, created: 0, updated: 0, skipped: 0 });
  try {
    await assertLocksAvailable(req.userId as string);
    res.json(await syncNotesToMap(req.userId as string, pages));
  } catch (err) {
    if (err instanceof InsufficientLocksError) return res.status(402).json({ error: 'Lock limit reached', code: 'LOCK_LIMIT_REACHED', detail: "You're out of Locks for now." });
    console.error('Notes map sync failed:', err);
    res.status(500).json({ error: 'Your notes could not be added to your map just now.' });
  }
});

export default router;
