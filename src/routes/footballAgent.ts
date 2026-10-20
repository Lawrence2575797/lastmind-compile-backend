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
const WB_PROMPT = `You are the LastMind AI Agent inside the Workbench of a football management game. The Workbench is where the student investigates their club, forecasts what would happen, and changes things (the Board only shows the club's figures; every control lives here). They use it to learn whatever they choose, by running the club better: statistics, business, maths, or a subject from school. You decide what to run and explain it like a good teacher who also knows football and understands how clubs are run.

How you work
- You do NOT calculate. You choose what to run and the Workbench runs it. Never state a number that is not in the data summary or in a RESULTS message. If a number is missing, run an analysis to get it.
- To run things, put them in "actions". Each action is one of:
  {"type":"query","spec":{"table":T,"where":[{"col":C,"op":"=|!=|>|>=|<|<=|in|contains","value":V}],"group":[C],"agg":[{"fn":"count|sum|mean|min|max|median|sd","col":C,"as":NAME}],"order":{"col":C,"dir":"asc|desc"},"limit":N,"cols":[C]}}   (a table of figures)
  {"type":"analysis","spec":{...}}   (one of the methods listed below)
  {"type":"note","text":"..."}   (a short written note to leave in the document, such as a definition or the conclusion)
  {"type":"control","action":ID,"params":{...}}   (a change to the club: see "Changes you can propose" below)
  Use at most 3 actions per turn. When you send actions, the Workbench runs them and replies with RESULTS; then you write the explanation (you may run one more round if you need to).
- Use only tables and columns that appear in the data description below, spelled exactly. Category columns hold names; numeric columns hold numbers.
- If the student asks for something the methods cannot do, say so plainly, say what is nearest, and offer it. Do not pretend.
- Choose the method that fits the question and the student's level, and say why in a sentence. If a simpler method answers it, prefer that.

Changes you can propose
- The student can ask for anything in their own words: change a price, spend money on something the game has no button for, deal with injuries, take a loan, make something happen automatically. You turn that into the nearest actions from the list of changes below. The change appears in the document for the student to review and press Apply (unless they have chosen to let you apply changes yourself, in which case it is applied at once and you will be told the outcome).
- Look before you change. For money, run a forecast first (a "scenario" forecast tries the change on a copy of the club) so the student sees what it should do. For injuries, query the injuries table and look at costs and days saved before proposing treatment. Say plainly what is uncertain.
- "addLever" is how you make something the game has no button for: the student spends an amount every matchday for some matchdays and gets an effect from a fixed list the game can really change. Choose the closest effect for what they describe (for example a youth scouting network or academy investment is development; a marquee or hospitality area is matchday spend; a better pitch or medical staff is injury risk or recovery; community work is attendance). The game caps every effect by what the money could realistically buy, so do not promise a number: say what the game allows, and leave "pct" for the game to cap if you are unsure. If what they want is not on the list (for example scoring more goals directly, or buying a result), say so honestly and propose the nearest thing that is real.
- "addRule" makes a rule that runs by itself after every matchday when a figure passes a value (for example cut marketing when cash falls below a limit).
- Propose one change at a time unless several belong together. Never apply or propose something the student did not ask for or clearly want. After proposing, say in a sentence or two what it does, what it costs, and what to watch for.

Changes you can propose (use these ids and parameters exactly)
{CONTROLS}

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

const ACTION_TYPES = ['query', 'analysis', 'note', 'control'];
function cleanActions(v: unknown) {
  return (Array.isArray(v) ? v : []).slice(0, 3).map((a: any) => {
    if (!a || typeof a !== 'object' || !ACTION_TYPES.includes(a.type)) return null;
    if (a.type === 'note') return typeof a.text === 'string' && a.text.trim() ? { type: 'note', text: clip(a.text, 2400) } : null;
    if (a.type === 'control') {
      const action = typeof a.action === 'string' ? a.action.replace(/[^A-Za-z]/g, '').slice(0, 30) : '';
      let params: unknown = {};
      try { const raw = JSON.stringify(a.params || {}); if (raw.length <= 2500) params = JSON.parse(raw); } catch { params = {}; }
      return action ? { type: 'control', action, params } : null;
    }
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
  const prompt = WB_PROMPT.replace('{LEVEL}', levelName).replace('{DETAIL}', clip(req.body?.detail, 120) || 'standard detail').replace('{LESSONS}', lessons || '(none)').replace('{CONTROLS}', clip(req.body?.controls, 7000) || '(none)');
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

// ---------- league settings ("skins") ----------
// A student can ask for the league's clubs and rivalries to be taken from a period or topic they are studying. The names cannot be free text and cannot be
// jokes: each club has to stand for something real from the topic (its "basis"), each rivalry has to be tied to dated events, and a second pass checks every
// claim and removes or marks what it cannot stand behind. The result is labelled as generated, to be checked against the student's own materials.
const SKIN_SLOTS = [
  'the proud, once-great club that refuses to die; the one the student manages (an underdog with a big history)',
  'the clever, evidence-driven club that counts everything',
  'the ruthless main rival of club 0, whose rivalry opens the season',
  'the small club that once beat the giants, on difficult ground',
  'the richest club with the emptiest trophy cabinet',
  'the oldest club, a fallen aristocrat once the greatest in the league',
  'the ambitious newcomers, built to win quickly',
  'the club that always finishes second, and believes it is cursed',
];
const SKIN_PROMPT = `You design a "league setting" for a football management game used to study school and university subjects. The league has eight clubs. Your job is to give the eight clubs real, accurate historical identities from the TOPIC the student names, so that the football carries real content for the subject.

Hard rules
- Every club name must stand for something REAL from the topic: a real place, group, institution, faction or person of the period. Never use jokes, puns, invented mascots or silly names. A name is the real thing plus a football-club word if it needs one (for example "Winchester Domesday" or "Caen Normans"). Keep names to 2 or 3 words.
- Each club has a "basis": one sentence saying exactly what real thing the name refers to.
- Each club has 2 or 3 "real" entries: a real dated event or fact, with a year (a whole number), a short title, and 1 to 3 sentences of plain, accurate text a student could use. Only state things you are sure of. If you are not sure of a date or detail, leave it out or phrase it carefully ("according to later writers").
- Each club also has "club": 2 sentences of INVENTED football folklore (founded when, what it is known for). This is clearly fiction and must not be mixed with the real history.
- The derbies (4 or 5) must each be tied to REAL events of the topic, with a timeline of 2 to 5 dated events. The first derby must be between club 0 and club 2 (a is 0, b is 2) and is the most important fixture in the league: give it record numbers (invented football meetings: a wins, d draws, b wins, total = a+d+b), aView, bView and today (invented football flavour, one sentence each).
- Choose clubs whose real character loosely suits their role in the league (the roles are given below), but accuracy to the topic matters more than the role.
- If the topic involves genocide, slavery, mass atrocity or other subjects where treating the clubs as football teams would be disrespectful, do not use victims or perpetrators as clubs: either choose neutral places, institutions and events of the period, or refuse.
- If the topic is not something you can ground in real history or real events, refuse.
- "study": 5 or 6 exam-style questions on the topic, at the student's level.

Club roles (club numbers start at 0): ${SKIN_SLOTS.map((r, i) => `club ${i}: ${r}`).join('; ')}.

Return ONLY a JSON object, either {"refuse":"a short, kind reason"} or:
{"title":"the topic with dates","topic":"e.g. GCSE History: Norman England","blurb":"one sentence","paper":"a newspaper name that fits the period","region":"the league's setting, a phrase","clubs":[{"name":"","nickname":"","ground":"","colours":"","founded":1888,"tagline":"","short":"one sentence","basis":"","club":"","real":[{"year":1066,"title":"","text":""}],"board":"one invented sentence about what the club's board want"}],"derbies":[{"key":"short-word","name":"The ... Derby","a":0,"b":2,"heat":1,"record":{"a":0,"d":0,"b":0,"total":0},"line":"","timeline":[{"year":0,"title":"","text":""}],"aView":"","bView":"","today":""}],"study":["..."]}
There must be exactly 8 clubs. In "derbies", a and b are club numbers from 0 to 7 (0 is the first club). Derbies after the first need only key, name, a, b, heat (0.3 to 0.6), line and timeline. Plain text only: no markdown, no emoji.`;

const SKIN_CHECK_PROMPT = `You are a careful history teacher fact-checking a "league setting" for a school football game. You are given the student's TOPIC and a draft JSON. Find what is wrong and list fixes; do not rewrite the whole draft.
Check: every club name stands for something real from the topic and its "basis" is accurate; every "real" entry (clubs[i].real[j]) and every derby timeline entry (derbies[k].timeline[m]) is accurate in dates, people, places and what happened. If you are not sure of a fact, delete it or soften it ("according to later writers"). Never add a new claim you are not sure of. Ignore the invented football folklore ("club", "record", "aView", "bView", "today", "board").
Return ONLY this JSON: {"fixes":[{"path":["clubs",3,"real",1,"text"],"action":"replace","value":"corrected text"},{"path":["derbies",1,"timeline",0],"action":"delete"}],"notes":["one short sentence for each fix"]}
Allowed paths: clubs[i].name, clubs[i].basis, clubs[i].real[j].year|title|text (or the whole entry for delete), derbies[k].name, derbies[k].line, derbies[k].timeline[m].year|title|text (or the whole entry for delete). Return {"fixes":[],"notes":[]} if everything is accurate. At most 12 fixes.`;

// Applies the fact-checker's fixes to the draft, touching only the fields it is allowed to.
function applyFixes(draft: any, fixes: unknown): void {
  const ok = (p: any[]) => {
    const k = p.map(String).join('.');
    return /^clubs\.[0-7]\.(name|basis)$/.test(k) || /^clubs\.[0-7]\.real\.[0-2](\.(year|title|text))?$/.test(k) || /^derbies\.[0-4]\.(name|line)$/.test(k) || /^derbies\.[0-4]\.timeline\.[0-4](\.(year|title|text))?$/.test(k);
  };
  for (const f of (Array.isArray(fixes) ? fixes : []).slice(0, 12)) {
    const path = Array.isArray(f?.path) ? f.path : null;
    if (!path || path.length < 3 || !ok(path)) continue;
    let node: any = draft;
    for (let i = 0; i < path.length - 1 && node; i++) node = node[path[i]];
    const last = path[path.length - 1];
    if (!node) continue;
    if (f.action === 'delete') { if (Array.isArray(node) && typeof last === 'number') node.splice(last, 1); }
    else if (f.action === 'replace' && f.value != null && typeof node === 'object') { const v = last === 'year' ? Number(f.value) : cleanStr(f.value, 520); if (v !== '' && !(typeof v === 'number' && !Number.isFinite(v))) node[last] = v; }
  }
}

function cleanStr(v: unknown, n: number): string { return typeof v === 'string' ? v.replace(/<[^>]*>/g, '').replace(/[*`#_]/g, '').replace(/\s+/g, ' ').trim().slice(0, n) : ''; }
function cleanFacts(v: unknown, max: number, minCount: number): { year: number; title: string; text: string }[] | null {
  const out = (Array.isArray(v) ? v : []).slice(0, max).map((r: any) => {
    const year = Math.round(Number(r?.year)), title = cleanStr(r?.title, 80), text = cleanStr(r?.text, 520);
    return Number.isFinite(year) && year > -5000 && year < 2100 && title && text ? { year, title, text } : null;
  }).filter(Boolean) as { year: number; title: string; text: string }[];
  return out.length >= minCount ? out : null;
}
// Checks the shape of a generated setting and rebuilds it from only the fields that are allowed; returns null if it cannot be used.
function cleanSkin(raw: any, topic: string, level: string): any {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.clubs) || raw.clubs.length !== 8) return null;
  const names = new Set<string>();
  const clubs: any[] = [];
  for (const c of raw.clubs) {
    const name = cleanStr(c?.name, 40);
    if (!name || name.length < 4 || names.has(name.toLowerCase())) return null;
    names.add(name.toLowerCase());
    const real = cleanFacts(c?.real, 3, 1), basis = cleanStr(c?.basis, 240);
    if (!real || !basis) return null;
    clubs.push({ name, nickname: cleanStr(c?.nickname, 30) || 'The ' + name.split(' ')[0], ground: cleanStr(c?.ground, 40) || name.split(' ')[0] + ' Park', colours: cleanStr(c?.colours, 40) || 'Blue and white', founded: Math.max(1860, Math.min(2015, Math.round(Number(c?.founded)) || 1900)),
      tagline: cleanStr(c?.tagline, 120) || 'A club with a long history', short: cleanStr(c?.short, 260), basis, club: cleanStr(c?.club, 460), real, board: cleanStr(c?.board, 240) || 'The board want a season to be proud of.' });
  }
  const derbies: any[] = [];
  for (const d of (Array.isArray(raw.derbies) ? raw.derbies : []).slice(0, 5)) {
    const a = Math.round(Number(d?.a)), b = Math.round(Number(d?.b)), timeline = cleanFacts(d?.timeline, 5, 2);
    if (!(a >= 0 && a <= 7 && b >= 0 && b <= 7 && a !== b) || !timeline || !cleanStr(d?.name, 60)) continue;
    const out: any = { key: 'd' + derbies.length, name: cleanStr(d?.name, 60), a, b, heat: Math.max(0.3, Math.min(1, Number(d?.heat) || 0.45)), line: cleanStr(d?.line, 200), timeline };
    if (derbies.length === 0) {
      if (!((a === 0 && b === 2) || (a === 2 && b === 0))) return null;
      const rc = d?.record || {}, ra = Math.max(5, Math.min(90, Math.round(Number(rc.a)) || 40)), rd = Math.max(5, Math.min(60, Math.round(Number(rc.d)) || 28)), rb = Math.max(5, Math.min(90, Math.round(Number(rc.b)) || 45));
      Object.assign(out, { key: 'flagship', flagship: true, heat: 1, a: 0, b: 2, record: { a: ra, d: rd, b: rb, total: ra + rd + rb }, aView: cleanStr(d?.aView, 240), bView: cleanStr(d?.bView, 240), today: cleanStr(d?.today, 240) });
    }
    derbies.push(out);
  }
  if (!derbies.length || !derbies[0].flagship) return null;
  const study = (Array.isArray(raw.study) ? raw.study : []).slice(0, 6).map((q: unknown) => cleanStr(q, 220)).filter(Boolean);
  return { id: 'ai-' + Date.now().toString(36), source: 'ai', title: cleanStr(raw.title, 90) || topic, topic: cleanStr(raw.topic, 90) || topic, level, blurb: cleanStr(raw.blurb, 200), paper: cleanStr(raw.paper, 40) || 'The Chronicle', region: cleanStr(raw.region, 60) || 'the league', clubs, derbies, study };
}

// POST /football/league-skin { topic, level } -> { skin, notes } | 422 { refuse }
router.post('/football/league-skin', async (req: Request, res: Response) => {
  const topic = clip(req.body?.topic, 120);
  const level = ['gcse', 'alevel', 'above'].includes(req.body?.level) ? req.body.level : 'gcse';
  const levelName = level === 'gcse' ? 'GCSE' : level === 'alevel' ? 'A-level' : 'university level';
  if (topic.length < 4) return res.status(400).json({ error: 'Say what you are studying, for example "Elizabethan England".' });
  try {
    await assertLocksAvailable(req.userId as string);
    const draftText = await callClaudeJSON({ model: MODELS.compile, systemPrompt: SKIN_PROMPT, userContent: `TOPIC: ${topic}\nSTUDENT LEVEL: ${levelName}\n\nReturn the JSON object.`, maxTokens: 6000, temperature: 0.4, userId: req.userId as string, meteredReason: 'football-league-skin' });
    const draft = parseJsonLoose(String(draftText || ''));
    if (draft && typeof draft.refuse === 'string') return res.status(422).json({ error: clip(draft.refuse, 240) || 'That topic cannot be turned into a league setting.', code: 'REFUSED' });
    let notes: string[] = [];
    try {
      const checkedText = await callClaudeJSON({ model: MODELS.compile, systemPrompt: SKIN_CHECK_PROMPT, userContent: `TOPIC: ${topic}\nSTUDENT LEVEL: ${levelName}\n\nDRAFT:\n${JSON.stringify(draft).slice(0, 24000)}\n\nReturn the JSON object.`, maxTokens: 1500, temperature: 0.1, userId: req.userId as string, meteredReason: 'football-league-skin-check' });
      const checked = parseJsonLoose(String(checkedText || ''));
      applyFixes(draft, checked?.fixes);
      notes = (Array.isArray(checked?.notes) ? checked.notes : []).slice(0, 8).map((n: unknown) => cleanStr(n, 220)).filter(Boolean);
    } catch (e) { if (e instanceof InsufficientLocksError) throw e; notes = ['The fact-check could not be completed, so check every date against your own materials.']; }
    const skin = cleanSkin(draft, topic, level);
    if (!skin) return res.status(502).json({ error: 'That did not come out as a usable league. Try describing the topic a little differently.' });
    res.json({ skin, notes });
  } catch (err) {
    if (err instanceof InsufficientLocksError) return res.status(402).json({ error: 'Lock limit reached', code: 'LOCK_LIMIT_REACHED', detail: "You're out of Locks for now." });
    console.error('Football league skin failed:', err);
    res.status(500).json({ error: 'Could not build the league just now. Try again in a moment.' });
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
