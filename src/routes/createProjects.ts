import { Router, Request, Response } from 'express';
import { Request as Req, Response as Res, NextFunction } from 'express';
import { requireAuth, requirePaidTier, isAdminEmail } from '../services/authMiddleware';
import { hasProjectAccess } from '../services/projectAccess';
import { syncEndpointLimiter, actionEndpointLimiter } from '../services/rateLimiters';
import { supabaseAdmin } from '../services/supabaseAdmin';

// Saved LastMind Create projects. `data` holds { trial, graph, result }: the creator's case as edited, the compiled
// Case Graph (with portraits) and the last playtest result. A finished case can be marked as a reference example that
// every creator can open (only an admin can set that flag).
const router = Router();
// Saved projects are open to anyone on LastMind+ and to anyone who has bought a project (football or law), since a bought project's
// progress is kept here too.
async function requirePaidOrProject(req: Req, res: Res, next: NextFunction) {
  try {
    const uid = req.userId as string;
    if (uid && ((await hasProjectAccess(uid, 'football', req.userEmail)) || (await hasProjectAccess(uid, 'law', req.userEmail)))) return next();
  } catch (err) {
    console.error('Project access check failed:', err);
  }
  return requirePaidTier(req, res, next);
}
router.use('/create/projects', requireAuth, requirePaidOrProject);

const MAX_BYTES = 5_000_000;

// The table comes from scripts/2026-09-20_create_create_projects.sql. Until it has been run, say so plainly so the
// page can fall back to keeping the project in the browser instead of failing.
const tableMissing = (err: any) => !!err && (err.code === '42P01' || err.code === 'PGRST205' || /does not exist|schema cache/i.test(String(err.message || '')));

// The football season is saved here too. Each save says how far on it is (season and matches played), and a save that is further back than
// what is already stored is refused, so an old browser or a fresh start can never quietly overwrite a season in progress. Replacing a season on
// purpose (a new game) says so, and the season it replaces is kept as a backup first: the newest three are kept.
const progressOf = (data: any): number => { const n = Number(data && data.football && data.football.progress); return Number.isFinite(n) ? n : 0; };
async function backupFootball(userId: string, existing: { title?: string; data: any }) {
  try {
    if (progressOf(existing.data) < 1001) return;   // nothing played yet: nothing worth keeping
    await supabaseAdmin.from('create_projects').insert({ user_id: userId, title: 'Backup: ' + String(existing.title || 'Be the manager').slice(0, 140), kind: 'football-backup', data: existing.data, updated_at: new Date().toISOString() });
    const { data: old } = await supabaseAdmin.from('create_projects').select('id').eq('user_id', userId).eq('kind', 'football-backup').order('updated_at', { ascending: false }).range(3, 50);
    if (old && old.length) await supabaseAdmin.from('create_projects').delete().in('id', old.map((r: { id: string }) => r.id));
  } catch (err) { console.error('Football backup failed (save continues):', err); }
}

// GET /create/projects -> { projects, references } | { unavailable: true }
router.get('/create/projects', syncEndpointLimiter, async (req: Request, res: Response) => {
  const userId = req.userId as string;
  const cols = 'id, title, kind, is_reference, updated_at, data->trial->role, data->trial->minutes, data->football->progress';
  const [mine, refs] = await Promise.all([
    supabaseAdmin.from('create_projects').select(cols).eq('user_id', userId).order('updated_at', { ascending: false }).limit(100),
    supabaseAdmin.from('create_projects').select(cols).eq('is_reference', true).order('updated_at', { ascending: false }).limit(50),
  ]);
  if (tableMissing(mine.error) || tableMissing(refs.error)) return res.json({ unavailable: true });
  if (mine.error || refs.error) { console.error('Create projects list failed:', mine.error || refs.error); return res.status(500).json({ error: 'could not load your projects' }); }
  const shape = (r: any) => ({ id: r.id, title: r.title, kind: r.kind, isReference: r.is_reference, updatedAt: r.updated_at, role: r.role, minutes: r.minutes, progress: r.progress == null ? undefined : Number(r.progress) });
  res.json({ projects: (mine.data || []).map(shape), references: (refs.data || []).filter((r: any) => !(mine.data || []).some((m: any) => m.id === r.id)).map(shape) });
});

// GET /create/projects/:id -> { id, title, data, isReference }
router.get('/create/projects/:id', syncEndpointLimiter, async (req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin.from('create_projects').select('id, user_id, title, kind, data, is_reference').eq('id', req.params.id).maybeSingle();
  if (tableMissing(error)) return res.json({ unavailable: true });
  if (error) { console.error('Create project fetch failed:', error); return res.status(500).json({ error: 'could not load that project' }); }
  if (!data || (data.user_id !== req.userId && !data.is_reference)) return res.status(404).json({ error: 'project not found' });
  res.json({ id: data.id, title: data.title, kind: data.kind, data: data.data, isReference: data.is_reference, mine: data.user_id === req.userId });
});

// POST /create/projects { id?, title, kind?, data, asReference? } -> { id }
router.post('/create/projects', actionEndpointLimiter, async (req: Request, res: Response) => {
  const b = (req.body ?? {}) as Record<string, any>;
  const title = typeof b.title === 'string' ? b.title.trim().slice(0, 160) : '';
  if (!title || !b.data || typeof b.data !== 'object') return res.status(400).json({ error: 'title and data are required' });
  if (JSON.stringify(b.data).length > MAX_BYTES) return res.status(413).json({ error: 'project is too large' });
  const userId = req.userId as string;
  const row: Record<string, unknown> = { user_id: userId, title, kind: typeof b.kind === 'string' ? b.kind.slice(0, 40) : 'criminal-trial', data: b.data, updated_at: new Date().toISOString() };
  if (b.asReference !== undefined) {
    if (b.asReference && !isAdminEmail(req.userEmail ?? undefined)) return res.status(403).json({ error: 'only an admin can publish a reference example' });
    row.is_reference = !!b.asReference;
  }
  if (typeof b.id === 'string' && b.id) {
    const { data: existing } = await supabaseAdmin.from('create_projects').select('id, user_id, kind, title, data').eq('id', b.id).maybeSingle();
    if (existing && existing.user_id === userId) {
      if (existing.kind === 'football-manager' && row.kind === 'football-manager') {
        const before = progressOf(existing.data), after = progressOf(b.data);
        if (after < before) {
          if (!b.replace) return res.status(409).json({ error: 'a further-on season is already saved', code: 'PROGRESS_REGRESSION', stored: before, sent: after });
          await backupFootball(userId, existing);
        }
      }
      const { error } = await supabaseAdmin.from('create_projects').update(row).eq('id', b.id);
      if (tableMissing(error)) return res.json({ unavailable: true });
      if (error) { console.error('Create project update failed:', error); return res.status(500).json({ error: 'could not save' }); }
      return res.json({ id: b.id });
    }
  }
  const { data, error } = await supabaseAdmin.from('create_projects').insert(row).select('id').single();
  if (tableMissing(error)) return res.json({ unavailable: true });
  if (error) { console.error('Create project insert failed:', error); return res.status(500).json({ error: 'could not save' }); }
  res.json({ id: data.id });
});

// DELETE /create/projects/:id
router.delete('/create/projects/:id', actionEndpointLimiter, async (req: Request, res: Response) => {
  const { data: gone } = await supabaseAdmin.from('create_projects').select('user_id, kind, title, data').eq('id', req.params.id).maybeSingle();
  if (gone && gone.user_id === req.userId && gone.kind === 'football-manager') await backupFootball(req.userId as string, gone);
  const { error } = await supabaseAdmin.from('create_projects').delete().eq('id', req.params.id).eq('user_id', req.userId as string);
  if (tableMissing(error)) return res.json({ unavailable: true });
  if (error) { console.error('Create project delete failed:', error); return res.status(500).json({ error: 'could not delete' }); }
  res.json({ ok: true });
});

export default router;
