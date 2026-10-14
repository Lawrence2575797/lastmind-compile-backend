import { Router, Request, Response } from 'express';
import { requireAuth } from '../services/authMiddleware';
import { syncEndpointLimiter } from '../services/rateLimiters';
import { hasProjectAccess, PROJECTS, Project } from '../services/projectAccess';

// POST /projects/access { project } -> { allowed }
// What the project cards and the football page ask before they open a project (the checkout is shown when the answer is no). The answer is only
// for the signed-in account.
const router = Router();
router.post('/projects/access', syncEndpointLimiter, requireAuth, async (req: Request, res: Response) => {
  const project = String((req.body || {}).project || '') as Project;
  if (PROJECTS.indexOf(project) < 0) return res.status(400).json({ error: 'unknown project' });
  try {
    res.json({ project, allowed: await hasProjectAccess(req.userId as string, project, req.userEmail) });
  } catch (err) {
    console.error('Project access lookup failed:', err);
    res.status(500).json({ error: 'could not check your subscription' });
  }
});
export default router;
