import { Router, Request, Response } from 'express';
import { requireAuth } from '../services/authMiddleware';
import { costlyEndpointLimiter } from '../services/rateLimiters';
import { callClaudeJSON, MODELS } from '../services/claudeClient';
import { assertLocksAvailable, InsufficientLocksError } from '../services/lockService';
import { FOOTBALL_INSTRUCTION_PROMPT } from '../constants/footballInstructionPrompts';
import { cleanScope, validateRules, GROUPS, Scope } from '../services/footballRules';

// The football manager game: a manager types an instruction in their own words, for the team, a line or one player, and Haiku turns it into the
// fixed rules the match engine runs. One call when the instruction is saved; nothing here runs during a match. Whatever the model returns is
// checked by validateRules, so only vocabulary the engine knows can come out.

const router = Router();
router.use('/football', requireAuth, costlyEndpointLimiter);

const clip = (s: unknown, n: number) => (typeof s === 'string' ? s.trim().slice(0, n) : '');

function parseJsonLoose(text: string): any {
  const t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = t.indexOf('{'), end = t.lastIndexOf('}');
  return JSON.parse(start >= 0 && end > start ? t.slice(start, end + 1) : t);
}

// POST /football/compile-instruction { text, scope, squad: [{ number, name, group, role }] } -> { rules, notIncluded }
router.post('/football/compile-instruction', async (req: Request, res: Response) => {
  const text = clip(req.body?.text, 600);
  if (text.length < 3) return res.status(400).json({ error: 'Write the instruction first.' });
  const squad = (Array.isArray(req.body?.squad) ? req.body.squad : []).slice(0, 22).map((p: any) => ({
    number: Math.round(Number(p && p.number)), name: clip(p && p.name, 40), group: (GROUPS as readonly string[]).includes(p && p.group) ? p.group : '', role: clip(p && p.role, 40),
  })).filter((p: any) => Number.isFinite(p.number) && p.number > 0 && p.group);
  const numbers: number[] = squad.map((p: any) => p.number);
  const scope: Scope = cleanScope(req.body?.scope, numbers) || { kind: 'team' };
  try {
    await assertLocksAvailable(req.userId as string);
    const userContent = `Scope the manager is writing this for: ${JSON.stringify(scope)}\n\nSquad:\n${squad.map((p: any) => `#${p.number} ${p.name} (${p.group}${p.role ? ', ' + p.role : ''})`).join('\n') || '(not given)'}\n\nThe manager's instruction:\n"""\n${text}\n"""`;
    let parsed: any = null, lastErr: unknown = null;
    for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
      try {
        const raw = await callClaudeJSON({ model: MODELS.chat, systemPrompt: FOOTBALL_INSTRUCTION_PROMPT, userContent, maxTokens: 1500, temperature: 0, userId: req.userId as string, meteredReason: 'football-instruction' });
        parsed = parseJsonLoose(raw);
      } catch (e) { lastErr = e; }
    }
    if (!parsed) throw lastErr || new Error('no usable answer');
    const { rules, dropped } = validateRules(parsed.rules, numbers, scope, text);
    const notIncluded = (Array.isArray(parsed.notIncluded) ? parsed.notIncluded : []).map((s: unknown) => clip(s, 240)).filter(Boolean).slice(0, 6)
      .concat(dropped.map((d) => 'Could not turn into something the game can do: ' + d));
    res.json({ rules, notIncluded });
  } catch (err) {
    if (err instanceof InsufficientLocksError) return res.status(402).json({ error: 'Lock limit reached', code: 'LOCK_LIMIT_REACHED', detail: "You're out of Locks for now." });
    console.error('Football instruction compile failed:', err);
    res.status(500).json({ error: 'LastMind could not read that instruction just now. Try again, or build it with the options instead.' });
  }
});

export default router;
