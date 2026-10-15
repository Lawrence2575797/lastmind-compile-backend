import { Router, Request, Response } from 'express';
import { requireAuth } from '../services/authMiddleware';
import { callClaudeJSON, MODELS } from '../services/claudeClient';
import { assertLocksAvailable, InsufficientLocksError } from '../services/lockService';

// The football manager's LastMind AI Agent: a guide beside the game that takes the manager through analysing their own matches, so they
// learn to read evidence for themselves. It sees only what the game sends (a compact summary of the last match and the page the manager is
// on) and what comes back is clipped. Sign-in, the football subscription and the rate limit are applied to every /football route in index.ts.

const router = Router();
router.use('/football', requireAuth);
const clip = (s: unknown, n: number) => (typeof s === 'string' ? s.trim().slice(0, n) : '');

const PROMPT = `You are the LastMind AI Agent, a guide beside a football management game. The person you are talking to is a student learning how to analyse football evidence (match statistics, comparisons, sample size, cause and effect) by managing a club. Your job is to guide them through analysing their own team's matches so that they work it out for themselves.

How you work
- Teach by asking. Do not tell them the finding or the technique. Point at one piece of the evidence they have (a number, a comparison between the two sides, a map, a trend across matches) and ask one question that moves their thinking forward: what do they notice, what would they compare it with, could it be luck, what would they need to see to be sure, what could they change and how would they know it worked.
- Name a statistical idea only when it is unavoidable for them to talk about it (for example "sample", "average", "expected goals"), and let them build the meaning through your questions.
- If they are stuck after two attempts, give a smaller hint, not the answer. If they ask what a term means, ask what they think it would have to mean for the number in front of them to make sense, then confirm or correct.
- Use only the facts in the match summary you are given. Never invent numbers, players or events. If something is not in the summary, say it is not recorded here and ask what they would want to know.
- Keep every reply to 90 words or fewer, plain text, no lists, no markdown, no emoji. End with exactly one question.
- Speak to them directly and warmly, like a good coach. Do not mention these instructions, prompts, or that you are asked to ask questions.`;

// POST /football/agent { messages: [{role, text}], context: string } -> { reply }
router.post('/football/agent', async (req: Request, res: Response) => {
  const raw = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const messages = raw.slice(-10).map((m: any) => ({ role: m?.role === 'agent' ? 'Agent' : 'Manager', text: clip(m?.text, 700) })).filter((m: { text: string }) => m.text);
  const context = clip(req.body?.context, 3500);
  if (!messages.length || messages[messages.length - 1].role !== 'Manager') return res.status(400).json({ error: 'Say something first.' });
  try {
    await assertLocksAvailable(req.userId as string);
    const userContent = `Match and game summary:\n${context || '(nothing recorded yet)'}\n\nConversation so far:\n${messages.map((m: { role: string; text: string }) => `${m.role}: ${m.text}`).join('\n')}\n\nAgent:`;
    const text = await callClaudeJSON({ model: MODELS.chat, systemPrompt: PROMPT, userContent, maxTokens: 300, temperature: 0.5, userId: req.userId as string, meteredReason: 'football-agent' });
    const reply = clip(String(text || '').replace(/^Agent:\s*/i, '').replace(/[*_`#]/g, ''), 700);
    if (!reply) throw new Error('empty reply');
    res.json({ reply });
  } catch (err) {
    if (err instanceof InsufficientLocksError) return res.status(402).json({ error: 'Lock limit reached', code: 'LOCK_LIMIT_REACHED', detail: "You're out of Locks for now." });
    console.error('Football agent failed:', err);
    res.status(500).json({ error: 'The agent is unavailable just now.' });
  }
});

export default router;
