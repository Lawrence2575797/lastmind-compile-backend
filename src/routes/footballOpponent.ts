import { Router, Request, Response } from 'express';
import { callClaudeJSON, MODELS } from '../services/claudeClient';
import { assertLocksAvailable, InsufficientLocksError } from '../services/lockService';
import { FOOTBALL_OPPONENT_PROMPT } from '../constants/footballOpponentPrompt';
import { validateRules, GROUPS, Opp } from '../services/footballRules';

// The football manager game: the opposition's manager. It is given what its club has scouted about the user's club and the state of the match, and
// returns rules (the same vocabulary the user has) for its own team. Called before kick-off and at a few checkpoints, never on every pass.
// What comes back is checked by validateRules, so the opposition can do nothing the user could not.

const router = Router();
// Sign-in and the rate limit are applied to every /football route by footballInstructions.ts (mounted first), so they are not repeated here.

const clip = (s: unknown, n: number) => (typeof s === 'string' ? s.trim().slice(0, n) : '');

function parseJsonLoose(text: string): any {
  const t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = t.indexOf('{'), end = t.lastIndexOf('}');
  return JSON.parse(start >= 0 && end > start ? t.slice(start, end + 1) : t);
}

// POST /football/opponent-plan { stage, minute, score: { us, them }, scout, squad, opponent, recent, current } -> { rules, rationale, scouted }
// "squad" is the AI club's own players; "opponent" is the user's club; the rules that come back are for the AI club.
router.post('/football/opponent-plan', async (req: Request, res: Response) => {
  const squad = (Array.isArray(req.body?.squad) ? req.body.squad : []).slice(0, 22).map((p: any) => ({
    number: Math.round(Number(p && p.number)), name: clip(p && p.name, 40), group: (GROUPS as readonly string[]).includes(p && p.group) ? p.group : '', role: clip(p && p.role, 40),
  })).filter((p: any) => Number.isFinite(p.number) && p.number > 0 && p.group);
  const opponent: Opp[] = (Array.isArray(req.body?.opponent) ? req.body.opponent : []).slice(0, 22).map((p: any) => ({ number: Math.round(Number(p && p.number)), name: clip(p && p.name, 40) })).filter((p: Opp) => Number.isFinite(p.number) && p.number > 0 && p.name);
  if (!squad.length) return res.status(400).json({ error: 'squad is required' });
  const numbers: number[] = squad.map((p: any) => p.number);
  const stage = ['prematch', 'halftime', 'goal_for', 'goal_against', 'checkin'].includes(req.body?.stage) ? req.body.stage : 'prematch';
  const minute = Math.max(0, Math.min(120, Math.round(Number(req.body?.minute) || 0)));
  const score = { us: Math.round(Number(req.body?.score?.us) || 0), them: Math.round(Number(req.body?.score?.them) || 0) };
  const scout = clip(JSON.stringify(req.body?.scout || {}), 3000);
  const recent = (Array.isArray(req.body?.recent) ? req.body.recent : []).slice(0, 8).map((s: unknown) => clip(s, 160)).filter(Boolean);
  const current = (Array.isArray(req.body?.current) ? req.body.current : []).slice(0, 6).map((s: unknown) => clip(s, 200)).filter(Boolean);
  try {
    await assertLocksAvailable(req.userId as string);
    const userContent = [
      `Stage: ${stage}. Minute ${minute}. Score: your team ${score.us}, the other club ${score.them}.`,
      `What you have scouted about the other club (figures from their recent matches):\n${scout || '(nothing yet)'}`,
      `Your squad:\n${squad.map((p: any) => `#${p.number} ${p.name} (${p.group}${p.role ? ', ' + p.role : ''})`).join('\n')}`,
      `The other club's squad:\n${opponent.map((p) => `#${p.number} ${p.name}`).join('\n') || '(not given)'}`,
      `Recent events in this match:\n${recent.join('\n') || '(none)'}`,
      `Rules you are using now:\n${current.join('\n') || '(none)'}`,
    ].join('\n\n');
    let parsed: any = null, lastErr: unknown = null;
    for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
      try {
        const raw = await callClaudeJSON({ model: MODELS.chat, systemPrompt: FOOTBALL_OPPONENT_PROMPT, userContent, maxTokens: 1600, temperature: 0, userId: req.userId as string, meteredReason: 'football-opponent-plan' });
        parsed = parseJsonLoose(raw);
      } catch (e) { lastErr = e; }
    }
    if (!parsed) throw lastErr || new Error('no usable answer');
    const rationale = clip(parsed.rationale, 700);
    const { rules } = validateRules(parsed.rules, numbers, { kind: 'team' }, rationale, opponent);
    const scouted = (Array.isArray(parsed.scouted) ? parsed.scouted : []).map((x: unknown) => clip(x, 200)).filter(Boolean).slice(0, 4);
    res.json({ rules, rationale, scouted });
  } catch (err) {
    if (err instanceof InsufficientLocksError) return res.status(402).json({ error: 'Lock limit reached', code: 'LOCK_LIMIT_REACHED', detail: "You're out of Locks for now." });
    console.error('Football opponent plan failed:', err);
    res.status(500).json({ error: 'The opposition manager could not be reached just now.' });
  }
});

export default router;
