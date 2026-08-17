import { Router, Request, Response } from 'express';
import { requireAuth } from '../services/authMiddleware';
import { syncEndpointLimiter } from '../services/rateLimiters';
import { getTuteeName, setTuteeName } from '../services/tuteeService';

const router = Router();

router.use('/tutee', requireAuth, syncEndpointLimiter);

// GET /tutee -> { name }
router.get('/tutee', async (req: Request, res: Response) => {
  try {
    const name = await getTuteeName(req.userId as string);
    res.json({ name });
  } catch (err) {
    console.error('Tutee fetch failed:', err);
    res.status(500).json({ error: 'could not load your tutee' });
  }
});

// POST /tutee  { name }
router.post('/tutee', async (req: Request, res: Response) => {
  const { name } = req.body ?? {};
  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  try {
    const saved = await setTuteeName(req.userId as string, name);
    res.json({ name: saved });
  } catch (err) {
    console.error('Tutee save failed:', err);
    res.status(500).json({ error: 'could not save your tutee\'s name' });
  }
});

export default router;
