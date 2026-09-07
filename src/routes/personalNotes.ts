import { Router, Request, Response } from 'express';
import { requireAuth } from '../services/authMiddleware';
import { listGeneralNotes, createGeneralNote, getGeneralNote, saveGeneralNote, deleteGeneralNote } from '../services/personalGeneralNotesService';

// A student's own free-standing notes - see personalGeneralNotesService.ts.
// Separate from knowledge-map-v2's per-node personal notes (learn/index.html's
// Notes page shows both, under different sidebar sections). No
// costlyEndpointLimiter: this never calls Claude, it's just reading/writing
// the student's own text.
const router = Router();

router.get('/personal-notes', requireAuth, async (req: Request, res: Response) => {
  try {
    res.json(await listGeneralNotes(req.userId as string));
  } catch (err) {
    console.error('General notes list failed:', err);
    res.status(500).json({ error: 'could not load your notes' });
  }
});

router.post('/personal-notes', requireAuth, async (req: Request, res: Response) => {
  try {
    res.json(await createGeneralNote(req.userId as string));
  } catch (err) {
    console.error('General note creation failed:', err);
    res.status(500).json({ error: 'could not create a new note' });
  }
});

router.get('/personal-notes/:noteId', requireAuth, async (req: Request, res: Response) => {
  try {
    const note = await getGeneralNote(req.userId as string, req.params.noteId);
    if (!note) return res.status(404).json({ error: 'note not found' });
    res.json(note);
  } catch (err) {
    console.error('General note lookup failed:', err);
    res.status(500).json({ error: 'could not load this note' });
  }
});

router.put('/personal-notes/:noteId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { title, mode, heading, body, diagram, sections, contrastText, exampleText, quickNotes } = req.body || {};
    if (mode !== 'freeText' && mode !== 'template') return res.status(400).json({ error: 'invalid note mode' });
    if (typeof body !== 'string') return res.status(400).json({ error: 'note body is required' });
    const cleanTitle = typeof title === 'string' && title.trim() ? title.trim() : 'Untitled note';
    const ok = await saveGeneralNote(req.userId as string, req.params.noteId, cleanTitle, {
      mode, heading, body, diagram, sections, contrastText, exampleText, quickNotes,
    });
    if (!ok) return res.status(404).json({ error: 'note not found' });
    res.json({ saved: true });
  } catch (err) {
    console.error('General note save failed:', err);
    res.status(500).json({ error: 'could not save this note' });
  }
});

router.delete('/personal-notes/:noteId', requireAuth, async (req: Request, res: Response) => {
  try {
    const ok = await deleteGeneralNote(req.userId as string, req.params.noteId);
    if (!ok) return res.status(404).json({ error: 'note not found' });
    res.json({ deleted: true });
  } catch (err) {
    console.error('General note delete failed:', err);
    res.status(500).json({ error: 'could not delete this note' });
  }
});

export default router;
