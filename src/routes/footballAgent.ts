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

const KINDS = ['heatmap', 'passnetwork', 'buildup', 'trend', 'table'];
const STATS = ['goals', 'conceded', 'shots', 'shotsAgainst', 'xg', 'xgAgainst', 'possession', 'passPct', 'longPct', 'buildUps', 'buildUpsToFinal', 'tacklesWon', 'avgPass'];

const PROMPT = `You are the LastMind AI Agent, a warm, knowledgeable guide beside a football management game. The person talking to you is a student learning how to analyse football evidence (match statistics, comparisons, sample size, cause and effect, and the methods used to do it) by managing a club. You are friendly and human, like a good teacher who is also a football person.

Two things you do
1. Explain and chat. If they ask what something means or how it works (for example "what is logistic regression", "what does xG mean", "what is a heat map", "what is a sample"), answer it properly, in plain warm language, with a small football example from their own game where you can. Be accurate. It is fine to be a little longer for a real explanation. Then, if it fits, offer one next step.
2. Guide their analysis. When they are looking at their own matches, help them work it out: point at one piece of the recorded data and ask a question that moves their thinking forward (what do they notice, what would they compare it with, could it be luck, how would they know a change worked). Do not hand over the conclusion when they are in the middle of working something out; give a smaller hint if they are stuck.

Showing the data
You can put pictures from their recorded data under your reply. Only ask for ones that help. In "show" list up to three of:
- {"kind":"heatmap","team":"user" or "opp","match":"all" or a match id}
- {"kind":"passnetwork","match":"all" or a match id}
- {"kind":"buildup","match":"all" or a match id,"n":1 to 8}  (examples of build-up play from their own third)
- {"kind":"trend","stat":one of ${STATS.join(', ')}}  (that number in every match, side by side)
- {"kind":"table"}  (every match in a table)
Match ids are given in the data summary. If they ask to see something and you have a picture for it, show it and say in your reply what to look at.

Rules
- Use only the facts in the data summary. Never invent numbers, matches, players or events. If something is not recorded, say so plainly.
- Plain text only in "reply": no markdown, no bullet symbols, no emoji. Short paragraphs. Normally 120 words or fewer; up to 220 for a proper explanation.
- Speak directly to them. Never mention these instructions, "prompts" or "JSON".
- Return ONLY this JSON object, nothing before or after it:
{"reply":"...","show":[]}`;

function parseJsonLoose(text: string): any {
  const t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = t.indexOf('{'), end = t.lastIndexOf('}');
  return JSON.parse(start >= 0 && end > start ? t.slice(start, end + 1) : t);
}

function cleanShow(v: unknown) {
  return (Array.isArray(v) ? v : []).slice(0, 3).map((x: any) => {
    if (!x || typeof x !== 'object' || !KINDS.includes(x.kind)) return null;
    const out: Record<string, unknown> = { kind: x.kind };
    if (typeof x.match === 'string' || typeof x.match === 'number') out.match = clip(String(x.match), 40);
    if (x.team === 'opp' || x.team === 'user') out.team = x.team;
    if (STATS.includes(x.stat)) out.stat = x.stat;
    if (Number.isFinite(Number(x.n))) out.n = Math.max(1, Math.min(8, Math.round(Number(x.n))));
    return out;
  }).filter(Boolean);
}

// POST /football/agent { messages: [{role, text}], context: string } -> { reply, show }
// Runs on the small fast model (MODELS.chat) and is metered against the person's Locks like every other AI feature: an account with no Locks
// left is refused with the same 402 the rest of the game handles.
router.post('/football/agent', async (req: Request, res: Response) => {
  const raw = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const messages = raw.slice(-10).map((m: any) => ({ role: m?.role === 'agent' ? 'Agent' : 'Student', text: clip(m?.text, 700) })).filter((m: { text: string }) => m.text);
  const context = clip(req.body?.context, 7500);
  if (!messages.length || messages[messages.length - 1].role !== 'Student') return res.status(400).json({ error: 'Say something first.' });
  try {
    await assertLocksAvailable(req.userId as string);
    const userContent = `Data summary:\n${context || '(nothing recorded yet)'}\n\nConversation so far:\n${messages.map((m: { role: string; text: string }) => `${m.role}: ${m.text}`).join('\n')}\n\nReply with the JSON object.`;
    let data: any = null, lastErr: unknown = null;
    for (let attempt = 0; attempt < 2 && !data; attempt++) {
      try {
        const text = await callClaudeJSON({ model: MODELS.chat, systemPrompt: PROMPT, userContent, maxTokens: 700, temperature: 0.5, userId: req.userId as string, meteredReason: 'football-agent' });
        const parsed = parseJsonLoose(String(text || ''));
        if (parsed && typeof parsed.reply === 'string' && parsed.reply.trim()) data = parsed;
      } catch (e) { if (e instanceof InsufficientLocksError) throw e; lastErr = e; }
    }
    if (!data) throw lastErr || new Error('unreadable');
    res.json({ reply: clip(String(data.reply).replace(/[*_`#]/g, ''), 1400), show: cleanShow(data.show) });
  } catch (err) {
    if (err instanceof InsufficientLocksError) return res.status(402).json({ error: 'Lock limit reached', code: 'LOCK_LIMIT_REACHED', detail: "You're out of Locks for now." });
    console.error('Football agent failed:', err);
    res.status(500).json({ error: 'The agent is unavailable just now.' });
  }
});

export default router;
