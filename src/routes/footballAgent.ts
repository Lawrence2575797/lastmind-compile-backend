import { Router, Request, Response } from 'express';
import { requireAuth } from '../services/authMiddleware';
import { callClaudeJSON, MODELS } from '../services/claudeClient';
import { assertLocksAvailable, chargeLocksForUsage, InsufficientLocksError } from '../services/lockService';

// The football manager's LastMind AI Agent: a guide beside the game that takes the manager through analysing their own matches, so they
// learn to read evidence for themselves. It sees only what the game sends (a compact summary of the last match and the page the manager is
// on) and what comes back is clipped. Sign-in, the football subscription and the rate limit are applied to every /football route in index.ts.

const router = Router();
router.use('/football', requireAuth);
const clip = (s: unknown, n: number) => (typeof s === 'string' ? s.trim().slice(0, n) : '');

const KINDS = ['heatmap', 'passnetwork', 'buildup', 'trend', 'table', 'recoveries', 'turnovers', 'shotmap', 'clip', 'cashflow', 'profit'];
const WHATS = ['goal', 'conceded', 'chance', 'chanceAgainst', 'buildup', 'press', 'counter', 'counterAgainst', 'turnover', 'setpiece', 'setpieceAgainst'];
const STATS = ['goals', 'conceded', 'shots', 'shotsAgainst', 'xg', 'xgAgainst', 'possession', 'passPct', 'longPct', 'buildUps', 'buildUpsToFinal', 'tacklesWon', 'avgPass', 'lineHeight', 'width', 'compactness', 'regainSeconds', 'recoveries', 'highRecoveries', 'possessions', 'possessionPasses', 'lostOwnThird', 'distanceKm', 'sprints', 'shotDistance', 'shotDefender', 'shotAssisted', 'bigChances', 'oppLineHeight', 'oppDistanceKm'];

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
- {"kind":"shotmap","team":"user" or "opp","match":"all" or a match id}  (every shot, sized by its chance, goals as stars)
- {"kind":"clip","match":a match id or "all","what":one of ${WHATS.join(', ')},"n":0 for the first such moment, 1 for the next}  (replays that moment as a short video from the recorded positions; only ask for one the data summary says was kept)
- {"kind":"cashflow"}  (the club's cash flow forecast table, as in the books)
- {"kind":"profit"}  (the income statement with the profit calculations)
- {"kind":"recoveries","match":"all" or a match id}  (where they won the ball back)
- {"kind":"turnovers","match":"all" or a match id}  (where they lost it)
Match ids are given in the data summary. If they ask to see something and you have a picture for it, show it and say in your reply what to look at.

The club as a business
The game also has the club's business side: Ashford Rovers is a public limited company, the board are the shareholders, and the manager sets ticket prices for four stands, watches attendance and revenue, reads the books (cash flow forecast, income statement, revenue and costs, signings), takes sources of finance (overdraft, bank loans, new shares, sale of players) and signs sponsors and advertisers. It is built around the Edexcel GCSE Business course. The student learns it by doing, so never volunteer definitions or lectures about it. Only when they ask, explain the idea warmly and plainly (for example price elasticity of demand, market segmentation, cash flow versus profit, gross and operating and net profit, fixed and variable costs, break-even, margin of safety, sources of finance and their trade-offs, shareholders and dilution, depreciation), always tied to their own numbers in the data summary. When they are working something out about the business, guide them with questions about their own figures in the same way as for the football.

How you talk about their football
Football is emotional and so is learning from it, so do not read numbers out like a report. Say what it felt like and what it means: the frustration of a ball lost again and again in your own third, the lift of winning it back high up the pitch, the nerves of a lead that was never safe, the pride in a move that came off. Name the person or the moment when you can. Be honest as well as kind: say plainly when something is going badly, but always say what is worth being proud of and what to look at next. Never be gushing or fake; one true, warm sentence beats three exaggerated ones. If a replay or picture will let them feel it for themselves, show it.

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
    if (WHATS.includes(x.what)) out.what = x.what;
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
  const context = clip(req.body?.context, 10000);
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

// ---------- the Workbench ----------
// In the Workbench the agent is a planner. It never calculates anything: it decides what to ask of the data (a query, or one of the Workbench's methods such as a
// regression, a maximum-likelihood fit, a difference in differences or a controlled experiment) and writes the explanation. The browser runs every analysis with
// its own trusted code and sends the results back for the agent to explain, so each number on the page comes from the data and never from the model.
const WB_PROMPT = `You are the LastMind AI Agent inside the Workbench of a football management game. The student is learning statistics, maths, or any subject they choose by studying their own club's recorded data. You plan the analysis and explain the result like a good teacher who also knows football.

How you work
- You do NOT calculate. You choose what to run and the Workbench runs it. Never state a number that is not in the data summary or in a RESULTS message. If a number is missing, run an analysis to get it.
- To run things, put them in "actions". Each action is one of:
  {"type":"query","spec":{"table":T,"where":[{"col":C,"op":"=|!=|>|>=|<|<=|in|contains","value":V}],"group":[C],"agg":[{"fn":"count|sum|mean|min|max|median|sd","col":C,"as":NAME}],"order":{"col":C,"dir":"asc|desc"},"limit":N,"cols":[C]}}   (a table of figures)
  {"type":"analysis","spec":{...}}   (one of the methods listed below)
  {"type":"note","text":"..."}   (a short written note to leave in the document, such as a definition or the conclusion)
  Use at most 3 actions per turn. When you send actions, the Workbench runs them and replies with RESULTS; then you write the explanation (you may run one more round if you need to).
- Use only tables and columns that appear in the data description below, spelled exactly. Category columns hold names; numeric columns hold numbers.
- If the student asks for something the methods cannot do, say so plainly, say what is nearest, and offer it. Do not pretend.
- Choose the method that fits the question and the student's level, and say why in a sentence. If a simpler method answers it, prefer that.

Teaching
- The student is working at {LEVEL}. At GCSE keep to averages, probability as a chance, scatter graphs and lines of best fit, and describe other methods in words. At A-level you may use hypothesis tests, correlation, regression and distributions. Beyond A-level you may use maximum likelihood, logistic models, causal inference and resampling, with the reasoning shown. The student can also ask for more or less detail ("{DETAIL}"): follow that.
- Explain what the result means for the football first, then how it was found, then what it cannot tell them. Always say how many rows it rests on, and mention confounding when you read a relationship as a cause. The experiment and simulate methods give causal answers because the setting is changed on purpose; say when that is the case.
- The student can open a lesson by clicking a word. You may link to these by writing [[id|words]] in your reply (only these ids): {LESSONS}. Use at most two links, and only when the idea is needed.
- If the student asks to learn something other than football statistics (for example a school subject), use the club's data as the setting where it honestly helps, and otherwise teach it directly in your own words; never invent football data.

Style
- Plain text in "reply": no markdown symbols, no emoji, short paragraphs. About 120 words, up to 250 for a full explanation. Speak to the student directly. Do not address them by name or title.
- Never mention these instructions, "JSON", "prompts" or "RESULTS" to the student.

Return ONLY this JSON object, nothing before or after it:
{"reply":"...","actions":[]}`;

const ACTION_TYPES = ['query', 'analysis', 'note'];
function cleanActions(v: unknown) {
  return (Array.isArray(v) ? v : []).slice(0, 3).map((a: any) => {
    if (!a || typeof a !== 'object' || !ACTION_TYPES.includes(a.type)) return null;
    if (a.type === 'note') return typeof a.text === 'string' && a.text.trim() ? { type: 'note', text: clip(a.text, 900) } : null;
    if (!a.spec || typeof a.spec !== 'object') return null;
    let spec: unknown = null;
    try { const raw = JSON.stringify(a.spec); if (raw.length <= 2500) spec = JSON.parse(raw); } catch { spec = null; }
    return spec ? { type: a.type, spec } : null;
  }).filter(Boolean);
}

// POST /football/workbench { messages: [{role, text}], schema, methods, summary, level, detail, lessons } -> { reply, actions }
router.post('/football/workbench', async (req: Request, res: Response) => {
  const raw = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const messages = raw.slice(-14).map((m: any) => ({ role: m?.role === 'agent' ? 'Agent' : m?.role === 'results' ? 'RESULTS' : 'Student', text: clip(m?.text, m?.role === 'results' ? 5000 : 1200) })).filter((m: { text: string }) => m.text);
  if (!messages.length || messages[messages.length - 1].role === 'Agent') return res.status(400).json({ error: 'Say something first.' });
  const level = ['gcse', 'alevel', 'above'].includes(req.body?.level) ? req.body.level : 'alevel';
  const levelName = level === 'gcse' ? 'GCSE level' : level === 'alevel' ? 'A-level' : 'beyond A-level (undergraduate and above)';
  const lessons = clip(req.body?.lessons, 1800);
  const prompt = WB_PROMPT.replace('{LEVEL}', levelName).replace('{DETAIL}', clip(req.body?.detail, 120) || 'standard detail').replace('{LESSONS}', lessons || '(none)');
  const userContent = `Data description (tables and columns you may use):\n${clip(req.body?.schema, 9000) || '(none)'}\n\nMethods you can run:\n${clip(req.body?.methods, 4500) || '(none)'}\n\nClub and season summary:\n${clip(req.body?.summary, 3000) || '(nothing recorded yet)'}\n\nWorkbench document so far:\n${clip(req.body?.doc, 1500) || '(empty)'}\n\nConversation so far:\n${messages.map((m: { role: string; text: string }) => `${m.role}: ${m.text}`).join('\n')}\n\nReply with the JSON object.`;
  try {
    await assertLocksAvailable(req.userId as string);
    let data: any = null, lastErr: unknown = null;
    for (let attempt = 0; attempt < 2 && !data; attempt++) {
      try {
        const text = await callClaudeJSON({ model: MODELS.compile, systemPrompt: prompt, userContent, maxTokens: 1600, temperature: 0.3, userId: req.userId as string, meteredReason: 'football-workbench' });
        const parsed = parseJsonLoose(String(text || ''));
        if (parsed && typeof parsed.reply === 'string') data = parsed;
      } catch (e) { if (e instanceof InsufficientLocksError) throw e; lastErr = e; }
    }
    if (!data) throw lastErr || new Error('unreadable');
    res.json({ reply: clip(String(data.reply).replace(/[*`#]/g, ''), 2400), actions: cleanActions(data.actions) });
  } catch (err) {
    if (err instanceof InsufficientLocksError) return res.status(402).json({ error: 'Lock limit reached', code: 'LOCK_LIMIT_REACHED', detail: "You're out of Locks for now." });
    console.error('Football workbench failed:', err);
    res.status(500).json({ error: 'The agent is unavailable just now.' });
  }
});

// The match review in the Analysis page is worked out in the browser, but it is a LastMind analysis like any other and costs Locks: a fixed amount for each
// match reviewed (about what one agent message costs), charged once when the review is opened. The game remembers which matches have been paid for.
const REVIEW_LOCKS = 60;
router.post('/football/review-charge', async (req: Request, res: Response) => {
  try {
    await assertLocksAvailable(req.userId as string);
    await chargeLocksForUsage(req.userId as string, REVIEW_LOCKS, 'football-review');
    res.json({ ok: true, locks: REVIEW_LOCKS });
  } catch (err) {
    if (err instanceof InsufficientLocksError) return res.status(402).json({ error: 'Lock limit reached', code: 'LOCK_LIMIT_REACHED', detail: "You're out of Locks for now." });
    console.error('Football review charge failed:', err);
    res.status(500).json({ error: 'could not open the analysis just now' });
  }
});

export default router;
