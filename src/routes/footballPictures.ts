import { Router, Request, Response } from 'express';
import { requireAuth } from '../services/authMiddleware';
import { falImages, downloadAsDataUrl } from '../services/createImages';
import { assertLocksAvailable, chargeLocksForUsage, InsufficientLocksError } from '../services/lockService';
import { USD_PER_LOCK } from '../constants/modelPricing';

// The football manager game's recruitment pictures: one portrait for a player (made once and kept by the game, so it is only asked for when the
// player has none) and the pictures for the scenes of a transfer (an approach, talks with an agent, a signing). The request carries a few short,
// structured fields rather than free text, and every prompt is assembled here, so nothing a player typed reaches the picture service.
// Sign-in and the rate limit come from footballInstructions.ts, which guards every /football route.

const router = Router();
router.use('/football', requireAuth);   // also set by footballInstructions.ts (which adds the rate limit); stated here so this file is safe on its own
const clip = (s: unknown, n: number) => (typeof s === 'string' ? s.trim().replace(/[^\w\s,.'()-]/g, '').slice(0, n) : '');
const ONE_OF = (v: unknown, list: string[], fallback: string) => (typeof v === 'string' && list.includes(v) ? v : fallback);

const STYLE = 'Photorealistic editorial sports photograph, natural light, shallow depth of field, a fictional person, no logos, no readable text, no numbers, no captions.';
const SCENES: Record<string, string> = {
  declare: 'a football club\'s recruitment analyst at a desk in a modern club office, watching match footage of the player on a large screen, notes and a laptop in front of them',
  approach: 'two club officials in suits shaking hands across a boardroom table in a football stadium office, folders and a pen on the table',
  agent: 'a footballer and his agent sitting opposite a club director across a table in a stadium meeting room, contract papers between them, serious expressions',
  signing: 'a footballer in a club tracksuit signing a contract at a desk, a club director beside him and a photographer behind, a stadium visible through the window',
  unveil: 'a footballer in a plain club shirt holding it up on the stadium pitch at sunset, smiling, a few supporters in the stands behind him',
  rejected: 'a footballer in a tracksuit leaving a stadium meeting room, the door closing, a club director sitting alone at the table looking at papers',
  departure: 'a footballer carrying a kit bag walking out of a training ground gate, shaking hands with a coach in a club tracksuit',
};

// POST /football/picture { kind: 'player' | 'scene', look, scene?, position?, age? } -> { image, locks }
router.post('/football/picture', async (req: Request, res: Response) => {
  const key = process.env.FAL_KEY;
  if (!key) return res.status(501).json({ error: 'pictures are not configured' });
  const userId = req.userId as string;
  const kind = ONE_OF(req.body?.kind, ['player', 'scene'], 'player');
  const look = clip(req.body?.look, 160) || 'a professional footballer in his twenties with short dark hair';
  const age = Math.max(16, Math.min(40, Math.round(Number(req.body?.age)) || 25));
  const position = ONE_OF(req.body?.position, ['GK', 'CB', 'FB', 'DM', 'CM', 'AM', 'WF', 'ST'], 'CM');
  let prompt: string, size: { width: number; height: number };
  if (kind === 'player') {
    prompt = `${STYLE} Head-and-shoulders portrait of a ${age}-year-old professional football player (${position}), ${look}, wearing a plain dark training top, neutral stadium-tunnel background, looking at the camera.`;
    size = { width: 512, height: 640 };
  } else {
    const scene = SCENES[ONE_OF(req.body?.scene, Object.keys(SCENES), 'approach')];
    prompt = `${STYLE} ${scene}. The footballer is ${look}, aged about ${age}.`;
    size = { width: 704, height: 448 };
  }
  try {
    await assertLocksAvailable(userId);
    const urls = await falImages(key, prompt, size, 1);
    if (!urls.length) throw new Error('no image returned');
    const locks = Math.max(1, Math.ceil(0.004 / USD_PER_LOCK));
    await chargeLocksForUsage(userId, locks, 'football-picture');
    res.json({ image: await downloadAsDataUrl(urls[0], false), locks });
  } catch (err) {
    if (err instanceof InsufficientLocksError) return res.status(402).json({ error: 'Lock limit reached', code: 'LOCK_LIMIT_REACHED', detail: "You're out of Locks for now." });
    console.error('Football picture failed:', err);
    res.status(502).json({ error: 'picture unavailable' });
  }
});

export default router;
