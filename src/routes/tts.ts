import { Router, Request, Response } from 'express';
import { requireAuth } from '../services/authMiddleware';
import { syncEndpointLimiter } from '../services/rateLimiters';
import { synthesizeSpeech } from '../services/elevenLabsService';

const router = Router();

// POST /tts { subject, text } -> raw audio/mpeg bytes
// Speaks a short word/phrase/question in the target language via
// ElevenLabs, cached by (voice, text) - see elevenLabsService.ts. 404s
// when this subject has no configured voice, so the frontend's on-device
// speechSynthesis fallback (speak() in learn/index.html) can take over.
// syncEndpointLimiter (not costlyEndpointLimiter) because this is cheap
// and cached, and a student clicking several vocabulary words in a row
// while studying is completely normal use, not the rare, deliberate,
// cost-incurring action that tighter limiter is calibrated for.
router.post('/tts', requireAuth, syncEndpointLimiter, async (req: Request, res: Response) => {
  const { subject, text } = req.body ?? {};
  if (typeof subject !== 'string' || !subject.trim()) {
    return res.status(400).json({ error: 'subject is required' });
  }
  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }
  if (text.length > 300) {
    return res.status(400).json({ error: 'text is too long for a single word/phrase clip' });
  }
  try {
    const result = await synthesizeSpeech(subject.trim(), text.trim());
    if (!result) {
      return res.status(404).json({ error: 'No text-to-speech voice configured for this subject.' });
    }
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Cache-Control', 'public, max-age=604800');
    res.send(result.audio);
  } catch (err) {
    console.error('LastMind: TTS request failed.', err);
    res.status(500).json({ error: 'Could not generate audio right now.' });
  }
});

export default router;
