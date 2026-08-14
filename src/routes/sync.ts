import { Router, Request, Response } from 'express';
import { requireAuth } from '../services/authMiddleware';
import { syncEndpointLimiter } from '../services/rateLimiters';
import { listUserFolders, upsertUserFolder, deleteUserFolder } from '../services/folderSyncService';
import { resetConceptProgress } from '../services/progressResetService';

const router = Router();

router.use('/sync', requireAuth, syncEndpointLimiter);

// POST and GET only — the global CORS config only allows those two methods
// (see index.ts), so upsert/delete are both POST rather than PUT/DELETE
// rather than widening CORS just for this.

// GET /sync/folders -> { folders: [{ folderId, data, updatedAt }] }
// The full per-account folder set, for the boot-time reconcile pass.
router.get('/sync/folders', async (req: Request, res: Response) => {
  try {
    const folders = await listUserFolders(req.userId as string);
    res.json({ folders });
  } catch (err) {
    console.error('Folder sync list failed:', err);
    res.status(500).json({ error: 'could not load synced folders' });
  }
});

// POST /sync/folders  { folderId, data, updatedAt }
// Upserts one folder's full blob. Called after every local IndexedDB write
// (see learn/index.html's putFolder) — best-effort from the client's side;
// a failure here just means this folder gets re-pushed on the next
// reconcile pass (its local updatedAt will still be newer than whatever's
// stored here, or entirely absent), not silently dropped.
router.post('/sync/folders', async (req: Request, res: Response) => {
  const { folderId, data, updatedAt } = req.body ?? {};
  if (typeof folderId !== 'string' || !folderId || !data || typeof updatedAt !== 'string') {
    return res.status(400).json({ error: 'folderId, data, and updatedAt are all required' });
  }
  try {
    await upsertUserFolder(req.userId as string, folderId, data, updatedAt);
    res.json({ ok: true });
  } catch (err) {
    console.error('Folder sync upsert failed:', err);
    res.status(500).json({ error: 'could not sync this folder' });
  }
});

// POST /sync/folders/delete  { folderId }
router.post('/sync/folders/delete', async (req: Request, res: Response) => {
  const { folderId } = req.body ?? {};
  if (typeof folderId !== 'string' || !folderId) {
    return res.status(400).json({ error: 'folderId is required' });
  }
  try {
    await deleteUserFolder(req.userId as string, folderId);
    res.json({ ok: true });
  } catch (err) {
    console.error('Folder sync delete failed:', err);
    res.status(500).json({ error: 'could not delete this synced folder' });
  }
});

// POST /sync/reset-progress  { conceptKeys: string[] }
// Called when a page/subfolder/folder is deleted, so this concept's FSRS
// review schedule and lesson-repetition count are wiped along with it,
// instead of silently surviving under the hood (see resetConceptProgress).
// conceptKeys should include every candidate key format the client can
// derive for the concept(s) being deleted (the normalized
// subject:topic:concept key AND the raw lowercased label) — concept_id's
// format is a known mix of both, so deleting only one format can silently
// leave the other behind.
router.post('/sync/reset-progress', async (req: Request, res: Response) => {
  const { conceptKeys } = req.body ?? {};
  if (!Array.isArray(conceptKeys) || !conceptKeys.length) {
    return res.status(400).json({ error: 'conceptKeys is required' });
  }
  try {
    await resetConceptProgress(req.userId as string, conceptKeys);
    res.json({ ok: true });
  } catch (err) {
    console.error('Progress reset failed:', err);
    res.status(500).json({ error: 'could not reset progress for these concepts' });
  }
});

export default router;
