import { Router, Request, Response } from 'express';
import { requireAuth } from '../services/authMiddleware';
import { costlyEndpointLimiter } from '../services/rateLimiters';
import { callClaudeJSON, MODELS } from '../services/claudeClient';
import { assertLocksAvailable, InsufficientLocksError } from '../services/lockService';
import { FOOTBALL_INSTRUCTION_PROMPT } from '../constants/footballInstructionPrompts';
import { FOOTBALL_REVIEW_PROMPT } from '../constants/footballReviewPrompt';
import { validateRules, GROUPS, Opp } from '../services/footballRules';

// The football manager game: a manager writes tactical instructions in their own words, in one box, about any players of either club, and Haiku
// turns them into the rules the match engine runs. One call when the instructions are saved; nothing here runs during a match. Whatever the model
// returns is checked by validateRules, so only things the engine can run come out. A second route reviews the whole set (the assistant's notes).

const router = Router();
router.use('/football', requireAuth, costlyEndpointLimiter);

const clip = (s: unknown, n: number) => (typeof s === 'string' ? s.trim().slice(0, n) : '');

function parseJsonLoose(text: string): any {
  const t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = t.indexOf('{'), end = t.lastIndexOf('}');
  return JSON.parse(start >= 0 && end > start ? t.slice(start, end + 1) : t);
}

type P = { number: number; name: string; group: string; role: string; slot: string };
const readSquad = (raw: unknown): P[] => (Array.isArray(raw) ? raw : []).slice(0, 24).map((p: any) => ({
  number: Math.round(Number(p && p.number)), name: clip(p && p.name, 40), group: (GROUPS as readonly string[]).includes(p && p.group) ? p.group : '', role: clip(p && p.role, 40), slot: clip(p && p.slot, 6),
})).filter((p: P) => Number.isFinite(p.number) && p.number > 0 && p.name);
const line = (p: P) => `#${p.number} ${p.name} (${p.group}${p.slot ? ', ' + p.slot : ''}${p.role ? ', ' + p.role : ''})`;
const asOpp = (l: P[]): Opp[] => l.map((p) => ({ number: p.number, name: p.name, slot: p.slot, group: p.group }));

// POST /football/compile-instruction { text, squad, opponent } -> { rules, notIncluded }
router.post('/football/compile-instruction', async (req: Request, res: Response) => {
  const text = clip(req.body?.text, 3000);
  if (text.length < 3) return res.status(400).json({ error: 'Write the instruction first.' });
  const own = readSquad(req.body?.squad), opp = readSquad(req.body?.opponent);
  const stage = ['build', 'final', 'transAtt', 'transDef', 'press', 'without'].includes(req.body?.stage) ? req.body.stage : '';
  const stageNote = stage ? `\nThe manager is writing these instructions for one stage of play only: "${stage}". The game applies that stage to every rule, so do not repeat it in "when"; write the rest of the situation as usual.\n` : '';
  try {
    await assertLocksAvailable(req.userId as string);
    const userContent = `${stageNote}Our squad:\n${own.map(line).join('\n') || '(not given)'}\n\nThe opposition's squad:\n${opp.map(line).join('\n') || '(not given)'}\n\nThe manager's instructions:\n"""\n${text}\n"""`;
    let parsed: any = null, lastErr: unknown = null;
    for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
      try {
        const raw = await callClaudeJSON({ model: MODELS.chat, systemPrompt: FOOTBALL_INSTRUCTION_PROMPT, userContent, maxTokens: 4000, temperature: 0, userId: req.userId as string, meteredReason: 'football-instruction' });
        parsed = parseJsonLoose(raw);
      } catch (e) { lastErr = e; }
    }
    if (!parsed) throw lastErr || new Error('no usable answer');
    const { rules, dropped } = validateRules(parsed.rules, asOpp(own), { kind: 'team' }, text, asOpp(opp));
    const notIncluded = (Array.isArray(parsed.notIncluded) ? parsed.notIncluded : []).map((s: unknown) => clip(s, 300)).filter(Boolean).slice(0, 8)
      .concat(dropped.map((d) => 'Could not be turned into something the game can run: ' + d));
    res.json({ rules, notIncluded });
  } catch (err) {
    if (err instanceof InsufficientLocksError) return res.status(402).json({ error: 'Lock limit reached', code: 'LOCK_LIMIT_REACHED', detail: "You're out of Locks for now." });
    console.error('Football instruction compile failed:', err);
    res.status(500).json({ error: 'LastMind could not read those instructions just now. Try again.' });
  }
});

// POST /football/review-instructions { formation, squad, opponent: { name, squad }, instructions: [text], rules } -> { summary, effects, concerns, improvements }
// The assistant's reading of the whole set: what it does on the pitch, where it clashes or leaves the team exposed, and what to try next.
router.post('/football/review-instructions', async (req: Request, res: Response) => {
  const own = readSquad(req.body?.squad), opp = readSquad(req.body?.opponent && req.body.opponent.squad);
  const instructions = (Array.isArray(req.body?.instructions) ? req.body.instructions : []).slice(0, 30).map((s: unknown) => clip(s, 400)).filter(Boolean);
  if (!instructions.length) return res.status(400).json({ error: 'There are no instructions to review yet.' });
  const formation = clip(req.body?.formation, 20), oppName = clip(req.body?.opponent && req.body.opponent.name, 60);
  try {
    await assertLocksAvailable(req.userId as string);
    const userContent = `Formation: ${formation || '(unknown)'}\n\nOur squad:\n${own.map(line).join('\n') || '(not given)'}\n\nThe next opponent: ${oppName || '(unknown)'}\n${opp.map(line).join('\n')}\n\nThe manager's instructions as the game understood them (one per line):\n${instructions.map((t: string, i: number) => `${i + 1}. ${t}`).join('\n')}`;
    let parsed: any = null, lastErr: unknown = null;
    for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
      try {
        const raw = await callClaudeJSON({ model: MODELS.chat, systemPrompt: FOOTBALL_REVIEW_PROMPT, userContent, maxTokens: 2200, temperature: 0.2, userId: req.userId as string, meteredReason: 'football-review' });
        parsed = parseJsonLoose(raw);
      } catch (e) { lastErr = e; }
    }
    if (!parsed) throw lastErr || new Error('no usable answer');
    const item = (x: any, keys: string[]) => { const o: Record<string, string> = {}; keys.forEach((k) => { o[k] = clip(x && x[k], 500); }); return o; };
    res.json({
      summary: clip(parsed.summary, 800),
      effects: (Array.isArray(parsed.effects) ? parsed.effects : []).slice(0, 8).map((x: any) => item(x, ['who', 'what'])).filter((x: any) => x.what),
      concerns: (Array.isArray(parsed.concerns) ? parsed.concerns : []).slice(0, 5).map((x: any) => item(x, ['title', 'why', 'fix'])).filter((x: any) => x.title),
      improvements: (Array.isArray(parsed.improvements) ? parsed.improvements : []).slice(0, 5).map((x: any) => item(x, ['title', 'suggestion', 'instruction'])).filter((x: any) => x.title),
    });
  } catch (err) {
    if (err instanceof InsufficientLocksError) return res.status(402).json({ error: 'Lock limit reached', code: 'LOCK_LIMIT_REACHED', detail: "You're out of Locks for now." });
    console.error('Football review failed:', err);
    res.status(500).json({ error: 'The assistant could not review those just now. Try again.' });
  }
});

export default router;
