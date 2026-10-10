import { Router, Request, Response } from 'express';
import { requireAuth } from '../services/authMiddleware';
import { costlyEndpointLimiter } from '../services/rateLimiters';
import { callClaudeJSON, callClaudeChatCached, MODELS } from '../services/claudeClient';
import { assertLocksAvailable, InsufficientLocksError } from '../services/lockService';
import { FOOTBALL_INSTRUCTION_PROMPT } from '../constants/footballInstructionPrompts';
import { FOOTBALL_REVIEW_PROMPT } from '../constants/footballReviewPrompt';
import { FOOTBALL_ELENA_CHAT_PROMPT } from '../constants/footballElenaChatPrompt';
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
  const stage = ['build', 'midfield', 'final', 'transAtt', 'transDef', 'press', 'without'].includes(req.body?.stage) ? req.body.stage : '';
  const stageNote = stage ? `\nThe manager is writing these instructions for one stage of play only: "${stage}". The game applies that stage to every rule, so do not repeat it in "when"; write the rest of the situation as usual.\n` : '';
  // The shirts the manager has already placed for this stage: where each player stands at the start of it and by the end of it.
  const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? Math.round(Math.max(0, Math.min(1, v)) * 100) / 100 : null);
  const placed = (Array.isArray(req.body?.positions) ? req.body.positions : []).slice(0, 24).map((q: any) => {
    const a = q && q.start, b = q && q.end;
    if (!q || num(a && a.d) == null || num(a && a.w) == null || num(b && b.d) == null || num(b && b.w) == null) return '';
    return `#${Math.round(Number(q.number)) || '?'} ${clip(q.name, 30)} (${clip(q.slot, 6)}): start (d ${num(a.d)}, w ${num(a.w)}) -> end (d ${num(b.d)}, w ${num(b.w)})`;
  }).filter(Boolean);
  const placedNote = placed.length ? `\nThe manager has already placed every shirt on two diagrams for this stage, so these positions are given and need no instruction (d is depth, 0 our goal and 1 theirs; w is width, 0 our left touchline and 1 our right). They are rough guides to where each player should be and act, not strict rules:\n${placed.join('\n')}\n` : '';
  try {
    await assertLocksAvailable(req.userId as string);
    const userContent = `${stageNote}${placedNote}Our squad:\n${own.map(line).join('\n') || '(not given)'}\n\nThe opposition's squad:\n${opp.map(line).join('\n') || '(not given)'}\n\nThe manager's instructions:\n"""\n${text}\n"""`;
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
  const stage = ['build', 'midfield', 'final', 'transAtt', 'transDef', 'press', 'without'].includes(req.body?.stage) ? req.body.stage : 'build';
  const plan = req.body?.opponent && req.body.opponent.plan ? req.body.opponent.plan : null;
  try {
    await assertLocksAvailable(req.userId as string);
    const likely = plan ? clip(plan.rationale, 600) : '(no build-up tests run yet, so nothing has been seen of how they set up)';
    const userContent = [
      `Stage under review: ${stage} (${clip(req.body?.stageName, 40)}). Review this stage only.`,
      `Formation: ${formation || '(unknown)'}`,
      `Our squad:\n${own.map(line).join('\n') || '(not given)'}`,
      `The next opponent: ${oppName || '(unknown)'}\n${opp.map(line).join('\n')}`,
      `How they have set up against you so far (only what showed on the pitch): ${likely}`,
      `The manager's instructions for this stage as the game understood them (one per line):\n${instructions.map((t: string, i: number) => `${i + 1}. ${t}`).join('\n')}`,
    ].join('\n\n');
    let parsed: any = null, lastErr: unknown = null;
    for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
      try {
        const raw = await callClaudeJSON({ model: MODELS.chat, systemPrompt: FOOTBALL_REVIEW_PROMPT, userContent, maxTokens: 1600, temperature: 0.4, userId: req.userId as string, meteredReason: 'football-review' });
        parsed = parseJsonLoose(raw);
      } catch (e) { lastErr = e; }
    }
    if (!parsed) throw lastErr || new Error('no usable answer');
    const item = (x: any, keys: string[]) => { const o: Record<string, string> = {}; keys.forEach((k) => { o[k] = clip(x && x[k], 500); }); return o; };
    res.json({
      summary: clip(parsed.summary, 600),
      concerns: (Array.isArray(parsed.concerns) ? parsed.concerns : []).slice(0, 3).map((x: any) => item(x, ['title', 'why', 'fix'])).filter((x: any) => x.title),
      ifOpposite: parsed.ifOpposite && typeof parsed.ifOpposite === 'object' ? item(parsed.ifOpposite, ['what', 'instruction']) : null,
      improvements: (Array.isArray(parsed.improvements) ? parsed.improvements : []).slice(0, 3).map((x: any) => item(x, ['title', 'suggestion', 'instruction'])).filter((x: any) => x.title),
    });
  } catch (err) {
    if (err instanceof InsufficientLocksError) return res.status(402).json({ error: 'Lock limit reached', code: 'LOCK_LIMIT_REACHED', detail: "You're out of Locks for now." });
    console.error('Football review failed:', err);
    res.status(500).json({ error: 'The assistant could not review those just now. Try again.' });
  }
});

// POST /football/elena-chat { message, history: [{role, content}], panel, level } -> { reply }
// The chat at the bottom of Elena's side tab. Stateless: the page sends the text she is showing and the last few messages every time.
router.post('/football/elena-chat', async (req: Request, res: Response) => {
  const message = clip(req.body?.message, 1500);
  if (!message) return res.status(400).json({ error: 'message is required' });
  const panel = clip(req.body?.panel, 6000), level = clip(req.body?.level, 20);
  const history = (Array.isArray(req.body?.history) ? req.body.history : []).slice(-6)
    .map((m: any) => ({ role: (m && m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant', content: clip(m && m.content, 1500) })).filter((m: any) => m.content);
  try {
    await assertLocksAvailable(req.userId as string);
    const pageContext = `Statistics level the manager chose: ${level || 'not given'}.
What is showing in Elena's panel right now:
\"\"\"
${panel || '(nothing yet)'}
\"\"\"`;
    const reply = await callClaudeChatCached({ model: MODELS.chat, systemPrompt: FOOTBALL_ELENA_CHAT_PROMPT, pageContext, messages: [...history, { role: 'user', content: message }], maxTokens: 700, temperature: 0.3, userId: req.userId as string, meteredReason: 'football-elena-chat' });
    res.json({ reply: reply.trim() });
  } catch (err) {
    if (err instanceof InsufficientLocksError) return res.status(402).json({ error: 'Lock limit reached', code: 'LOCK_LIMIT_REACHED', detail: "You're out of Locks for now." });
    console.error('Football Elena chat failed:', err);
    res.status(500).json({ error: 'Elena could not answer just now. Try again.' });
  }
});

export default router;
