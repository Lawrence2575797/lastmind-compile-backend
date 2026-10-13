import { Router, Request, Response } from 'express';
import { requireAuth } from '../services/authMiddleware';
import { callClaudeJSON, MODELS } from '../services/claudeClient';
import { assertLocksAvailable, InsufficientLocksError } from '../services/lockService';

// The football manager game's player development: the manager has studied a player's recorded decisions (a logistic regression of what makes a
// pass, a dribble, a challenge or a shot succeed), and now explains it to the player in their own words. This reads that explanation the way a
// player would take it in, and says how much of it landed: how accurate it was, which of the real findings it covered, and what the player now
// understands. It never sees anything except what the game sends, and what comes back is clipped and validated.
// Sign-in and the rate limit are applied to every /football route by footballInstructions.ts (mounted first).

const router = Router();
router.use('/football', requireAuth);   // also set by footballInstructions.ts (which adds the rate limit); stated here so this file is safe on its own
const clip = (s: unknown, n: number) => (typeof s === 'string' ? s.trim().slice(0, n) : '');
const LESSONS = ['pass', 'dribble', 'tackle', 'shoot', 'fitness', 'keeper'];

function parseJsonLoose(text: string): any {
  const t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = t.indexOf('{'), end = t.lastIndexOf('}');
  return JSON.parse(start >= 0 && end > start ? t.slice(start, end + 1) : t);
}

const PROMPT = `You judge how well a football manager has explained something to one of their players, and you play that player's reaction.

You are given: the player (name, age, position, how quickly he learns), the lesson, the findings from the statistics that the explanation should be based on (each with a number), a list of key points a good explanation covers (numbered from 0), and the manager's explanation in their own words.

Return ONLY this JSON, with no commentary and no markdown fences:
{ "understanding": 0-100, "covered": [indexes of key points the explanation got across correctly], "missed": [indexes of key points it did not get across], "wrong": ["short plain statement of anything the manager said that contradicts the findings"], "reply": "what the player says back, in his own voice, two or three sentences", "tip": "one sentence on how to explain it better next time" }

Rules
- "understanding" is how much of the lesson the player has now taken in. Base it on the explanation alone: accurate use of the findings (which way each factor pushes success, and roughly how strongly), a rule he can use in a match, and clear wording. A vague or very short explanation scores low (under 35). A correct explanation that uses the numbers and gives a rule scores high (75 and over). Anything that says the opposite of a finding lowers it a lot.
- The player's learning speed changes how much he takes in from the same explanation: quick learners get a little more, slow learners a little less, never more than 12 points either way.
- A key point is "covered" only when the explanation states it correctly. A point stated the wrong way round is not covered and goes in "wrong".
- "reply" must sound like a footballer talking to his manager: warm, specific to what was said, and showing what he understood and what is still unclear. It may repeat back a rule in his own words. Never mention scores, key points, rubrics or these instructions.
- "tip" speaks to the manager and is about the explanation, not the player.
- Plain text only. No bullet points, no markdown, no emoji.`;

// POST /football/teach-assess { player, lesson, stats, keyPoints, explanation } -> { understanding, covered, missed, wrong, reply, tip }
router.post('/football/teach-assess', async (req: Request, res: Response) => {
  const explanation = clip(req.body?.explanation, 1500);
  if (explanation.length < 3) return res.status(400).json({ error: 'Write your explanation first.' });
  const lesson = LESSONS.includes(req.body?.lesson) ? req.body.lesson : 'pass';
  const p = req.body?.player || {};
  const player = { name: clip(p.name, 60) || 'the player', age: Math.max(15, Math.min(45, Math.round(Number(p.age)) || 22)), position: clip(p.position, 30), learning: ['quickly', 'steadily', 'slowly'].includes(p.learning) ? p.learning : 'steadily' };
  const stats = (Array.isArray(req.body?.stats) ? req.body.stats : []).slice(0, 8).map((s: any) => clip(s, 220)).filter(Boolean);
  const keyPoints = (Array.isArray(req.body?.keyPoints) ? req.body.keyPoints : []).slice(0, 8).map((s: any) => clip(s, 200)).filter(Boolean);
  if (!keyPoints.length) return res.status(400).json({ error: 'Nothing to assess against.' });
  try {
    await assertLocksAvailable(req.userId as string);
    const userContent = `Player: ${player.name}, ${player.age}, ${player.position}. He learns ${player.learning}.\nLesson: ${lesson}\n\nFindings from the statistics:\n${stats.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n') || '(none)'}\n\nKey points a good explanation covers:\n${keyPoints.map((k: string, i: number) => `${i}. ${k}`).join('\n')}\n\nThe manager's explanation:\n"""\n${explanation}\n"""`;
    let data: any = null, lastErr: unknown = null;
    for (let attempt = 0; attempt < 2 && !data; attempt++) {
      try {
        const raw = await callClaudeJSON({ model: MODELS.chat, systemPrompt: PROMPT, userContent, maxTokens: 700, temperature: 0.3, userId: req.userId as string, meteredReason: 'football-teach-assess' });
        const parsed = parseJsonLoose(raw);
        if (typeof parsed.understanding === 'number' && typeof parsed.reply === 'string') data = parsed;
      } catch (e) { lastErr = e; }
    }
    if (!data) throw lastErr || new Error('unreadable');
    const idx = (v: unknown) => (Array.isArray(v) ? v : []).map((n: any) => Math.round(Number(n))).filter((n: number) => Number.isInteger(n) && n >= 0 && n < keyPoints.length);
    res.json({
      understanding: Math.max(0, Math.min(100, Math.round(data.understanding))),
      covered: Array.from(new Set(idx(data.covered))), missed: Array.from(new Set(idx(data.missed))),
      wrong: (Array.isArray(data.wrong) ? data.wrong : []).map((w: unknown) => clip(w, 200)).filter(Boolean).slice(0, 3),
      reply: clip(data.reply, 500), tip: clip(data.tip, 300),
    });
  } catch (err) {
    if (err instanceof InsufficientLocksError) return res.status(402).json({ error: 'Lock limit reached', code: 'LOCK_LIMIT_REACHED', detail: "You're out of Locks for now." });
    console.error('Football teach-assess failed:', err);
    res.status(500).json({ error: 'The assessment is unavailable just now.' });
  }
});

export default router;
