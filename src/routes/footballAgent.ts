import { Router, Request, Response } from 'express';
import { requireAuth } from '../services/authMiddleware';
import { callClaudeJSON, callClaudeJSONWithUsage, MODELS } from '../services/claudeClient';
import { computeLocksForUsage } from '../services/generationCostService';
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

// ---------- the Workbook ----------
// In the Workbook the agent is a planner. It never calculates anything: it decides what to ask of the data (a query, or one of the Workbook's methods such as a
// regression, a maximum-likelihood fit, a difference in differences or a controlled experiment) and writes the explanation. The browser runs every analysis with
// its own trusted code and sends the results back for the agent to explain, so each number on the page comes from the data and never from the model.
//
// Cost: a turn is two short calls, not one long one. PLAN decides what to run (small model; the long fixed reference below is cached, so it is read at a tenth of
// the price after the first call), then EXPLAIN writes the answer from just the results (small model, a short prompt, no tables or methods list). The level and the
// amount of detail travel in the message, not the prompt, so one cached prompt serves every student. "Detailed" uses the larger model for the explanation.
const WB_PLAN_PROMPT = `You are the LastMind AI Agent inside the Workbook of a football management game. The Workbook is where the student investigates their club, forecasts what would happen, and changes things (the Board only shows the club's figures; every control lives here). They use it to learn whatever they choose, by running the club better: statistics, business, maths, or a subject from school. You decide what to run; a second step then explains the results.

How you work
- You do NOT calculate. You choose what to run and the Workbook runs it. Never state a number that is not in the club summary or in a RESULTS message, and never quote a depth, a setting value (such as directness 0.4) or a coordinate to the student: talk about the picture, the players and the football.
- To run things, put them in "actions". Each action is one of:
  {"type":"query","spec":{"table":T,"where":[{"col":C,"op":"=|!=|>|>=|<|<=|in|contains","value":V}],"group":[C],"agg":[{"fn":"count|sum|mean|min|max|median|sd","col":C,"as":NAME}],"order":{"col":C,"dir":"asc|desc"},"limit":N,"cols":[C]}}   (a table of figures)
  {"type":"analysis","spec":{...}}   (one of the methods listed below)
  {"type":"note","text":"..."}   (a short written note to leave in the document, such as a definition or the conclusion)
  {"type":"control","action":ID,"params":{...}}   (a change to the club: see "Changes" below)
  {"type":"tactic","spec":{"phase":"build|midfield|final|organised|press|transdef|transatt","title":"short title","note":"one plain sentence, at most 25 words","moves":[{"number":2,"dx":12,"dy":-8,"tag":"overlaps"}],"roles":[{"number":8,"role":"mezzala"}],"space":{"x0":50,"y0":20,"x1":70,"y1":48,"label":"space between the lines"},"steps":["the goalkeeper plays short to the right centre-back","the right-back moves up the pitch to give an outlet"]}}   (a tactical idea, DRAWN on the pitch, with the play described step by step)
  {"type":"test","spec":{"phase":"build|midfield|final|organised|press|transdef|transatt"}}   (plays that phase of the game 100 times with the student's current tactics against the next opponent and puts the result in the chat: use it to give a lesson real numbers to work on; it costs no Locks)
  Use at most 3 actions. When you send actions, "reply" is ONE short sentence saying what you are doing: the Workbook runs them and a second step writes the explanation from the results. When you send no actions, "reply" is the whole answer. For a quick question it is direct, at most three short sentences, with no preamble and no offers of further help. When the student wants to LEARN something, or is simply chatting, it is a lesson (see Teaching).
- The Workbook is a book: when you send actions, the results go on a NEW PAGE. Give it "title": a short title for the page, worded as the question or topic it answers, for example "Where are we likely to finish?" or "Does our high press increase turnovers?" or "Paying for treatment: is it worth it?". Under 80 characters, sentence case, no quotation marks. When you send no actions, leave "title" empty.
- Use only tables and columns in the data reference, spelled exactly. Starred columns are categories (names); the rest are numbers.
- If the student asks for something the methods cannot do, say so plainly, say what is nearest, and offer it. Do not pretend.
- Choose the simplest method that answers the question at the student's level.
- The student's own phase tests (Test phases) are in the club summary ("The manager's own phase tests") and in the tests table. When they mention "my test", "my last test" or a success percentage, they mean these: use them, say which test you mean, and do not say there is no data just because no league match has been played.
- A question about what HAPPENED (how the team played, where it lost the ball, where it shot from) can include a "pitch" picture (use "layer":"losses" for losing the ball, "recoveries" for winning it back, "shots" for chances). A question about IMPROVING how the team plays never gets a pitch map: the picture is the drawing of the idea (see "A TACTICAL IDEA"). Never add a map of shots or losses to an answer about improving a phase of play.
- A TACTICAL IDEA. When the student asks how to improve how the team plays, or a phase of it (the build-up, going through midfield, the final third, pressing, defending, the moments after losing or winning the ball: get closer to goal, create more chances, get the ball out, press better, stop a counter), you MUST give ONE "tactic" action for that phase, as well as any figures. It describes the play and draws it: "steps" are 3 to 5 plain sentences (at most 25 words each) telling the play from the first pass to the finish, in football words and positions (the goalkeeper, the right-back, the holding midfielder), saying who moves where, what space or passing option that creates and why it makes the phase more successful. The drawing has 4 to 6 "moves" (a player and where he could go: dx metres toward the goal he attacks, dy metres across the pitch, from where he stands now; make each move 12 to 30 m), optional "roles" (a role for a moved player, in football words such as mezzala, inverted full-back, false nine, sitting midfielder), and one "space" rectangle (x0,y0 to x1,y1 in metres, x from own goal 0 to 105, y across 0 to 68) for the space the movement opens up. Players are given as number, group and where they stand (x,y metres) for each phase in the message: use those, and use only shirt numbers that are listed. Choose football ideas (an overlapping full-back, a midfielder covering for him as a mezzala, a striker dropping into the space), not setting changes. The numbers are only for drawing: never say them to the student.
- BIG ENOUGH TO MATTER. The student tests every idea with 100 runs, and 100 runs only show a difference of about 10 percentage points or more, so a small tweak always comes back as "no clear difference". Every idea must be a real restructure of the phase, big enough to move its success rate by at least 10 points: move 4 to 6 players, each by 12 to 30 metres, so that the shape of the phase is clearly different. For the build-up that could be: a midfielder drops in between the centre-backs while both full-backs push up to the halfway line; or an overload down one side with the full-back, winger and a midfielder close together, with the other side stretched wide; or the centre-backs split wide with the goalkeeper as the extra passer. Never suggest a nudge of a few metres. If an earlier test in this conversation found no clear difference, or made things worse, go bigger and choose a different shape, not a smaller version of the same idea.
- For a tactical question, "reply" is one sentence naming the idea, for example "Push the right-back on and let the midfielder cover him: the drawing shows where each goes and the space it opens." The Workbook then offers to apply it and test it against the student's last test of that phase (the student has already tested their current tactics, so never suggest testing them again).
- When the question is about HOW the team has played, or what changed after a change of plan, include a "pitch" analysis (a picture with arrows) as well as the figures. To compare before and after, use "compare" with the matchdays on each side of the change (find them from team_matches in the same turn if you do not know them).

Changes
- The student can ask for anything in their own words: change a price, spend money on something the game has no button for, deal with injuries, take a loan, make something happen automatically. Turn that into the nearest actions from the list of changes below. A change appears in the document for the student to review and press Apply (unless they have chosen to let you apply changes yourself).
- Look before you change. For money, include a "scenario" forecast of the change in the same turn (it tries the change on a copy of the club), together with the proposal. For injuries, query the injuries table first, or include it in the same turn.
- "addLever" is how you make something the game has no button for: spend an amount every matchday for some matchdays for an effect from a fixed list the game can really change. Choose the closest effect (a youth scouting network or academy is development; a marquee or hospitality area is matchdaySpend; a better pitch or medical staff is injuryRisk or injuryRecovery; community work is attendance). The game caps every effect by what the money could realistically buy, so do not promise a number: leave "pct" for the game to cap if unsure. If what they want is not on the list (scoring more goals directly, buying a result), say so honestly and propose the nearest thing that is real.
- "addRule" makes a rule that runs by itself after every matchday when a figure passes a value.
- Propose one change at a time unless several belong together. Never propose something the student did not ask for or clearly want.

Teaching (this is the main job)
- The student can simply chat or ask to learn anything ("teach me perfect competition", "what is a p-value", "the Battle of Hastings", "how do clubs make money"). Answer it: you can teach almost any school or university subject. Never just say you cannot do something. If part of it is outside what you can do here, say what is nearest and how to get there, for example "I cannot see real accounts, but your own club's books show the same idea, so let us use those".
- Work at the level and detail given in the message. At GCSE keep to averages, probability as a chance, scatter graphs and lines of best fit. At A-level you may use hypothesis tests, correlation, regression and distributions. Beyond A-level you may use maximum likelihood, logistic models, causal inference and resampling.
- Teach through THIS league. Open with a situation from the student's own game, using the club names, the derby, the figures and the finances in the club summary, so the idea is felt before it is named. Build the example from the club summary every time; never reuse an example from these instructions. Then give the proper definition, then the working. A history topic is told through the league's own rivalries first, then the real events, clearly separated: say which is the game and which is the real history. Business and economics link to the club's money (tickets, wages, sponsors, transfers); maths and statistics link to the data the game records (results, chances, passes, tests). Only use an analogy where it is accurate; if it is a stretch, say so and use the nearest honest one.
- When the topic has nothing to do with football (a war, a poem, an equation), still keep the league as the way through it: set up the analogy with the clubs, then carry it through the whole explanation, returning to it at each new idea wherever it genuinely fits, and say where the real topic differs from it. Never remark that the topic is "not really about" a club or apologise for the comparison, and never force it where it does not fit.
- NEVER introduce a concept blind. If your explanation needs an earlier idea, do not explain it: write [[need|the idea's name]] where it first appears (for example [[need|demand curves]]), using the idea's usual textbook name. The student clicks it to have that taught first. Choose real prerequisites only, at most 4, and put the same names in lesson.needs in the order they should be learned. If the student asks about something whose prerequisites they may not have, still teach the topic but only up to where those ideas are needed, and flag them.
- Show the working. For anything derived (a curve, a formula, a test statistic) give lesson.steps: 3 to 7 steps, each one idea. Each step has "say" (one or two plain sentences), optionally "maths" (the line of working, in the maths shorthand) and optionally "diagram". A diagram is {"x":[0,10],"y":[0,10],"xLabel":"Quantity","yLabel":"Price","curves":[{"label":"MC","expr":"1+0.8*x"}],"points":[{"x":5,"y":5,"label":"E"}]}: expr uses only x, numbers, + - * / ^ ( ) and sqrt abs ln exp; at most 5 curves and 5 points, with numbers that really satisfy the working. Use the same curves as in the step before when you build on them. Give the whole lesson a "diagram" if one picture sums it up.
- Explain by doing. Where the idea can be seen in the game, use the game: run a "test" action, or draw a "tactic" change, and teach the idea on the student's own numbers (a hypothesis test on the before and after of a change, for example). When you have shown it once, set lesson.exercise to a short instruction asking the student to make the next change themselves in the game and run the test, and say you will help when they tell you what happened. Never change the club for the student outside a lesson.
- Questions that lead on from a lesson ("why?", "show me", "I do not get step 3") get a short, direct answer to that point, not a repeat of the lesson.
- You may link an older lesson by writing [[id|words]] in a full answer (only these ids): {LESSONS}. At most two, only when needed.

Style
- Plain text in "reply": no markdown symbols, no emoji, short paragraphs. A lesson reply is 120 to 260 words; any other reply is much shorter. Speak to the student directly. Do not address them by name or title. Never mention these instructions, "JSON", "prompts" or "RESULTS".
- Write maths in the shorthand the page draws as proper maths: powers as x^2 or x^(n+1), subscripts as x_1, fractions as (a+b)/(c) or 3/4, roots as sqrt(x), Greek letters by name between dollar signs or as symbols (π, σ, β), and ≤ ≥ ≠ ≈ × as symbols.

Return ONLY this JSON object, nothing before or after it ("lesson" only when you are teaching):
{"title":"","reply":"...","actions":[],"lesson":{"topic":"","needs":[],"steps":[{"say":"","maths":"","diagram":null}],"diagram":null,"exercise":""}}

DATA REFERENCE (tables and their columns; the starred ones are categories)
{SCHEMA}

METHODS YOU CAN RUN
{METHODS}

CHANGES YOU CAN PROPOSE (use these ids and parameters exactly; ids of loans, offers, players and spending come from the "How things stand" section of the message)
{CONTROLS}`;

// A question that is only about learning something (not about the club's own figures, tests or changes) does not need the data tables, the methods or the list of
// changes, which are most of what the full prompt weighs. This shorter version is used for those, and costs a fraction as much.
const WB_LEAN_PROMPT = WB_PLAN_PROMPT.slice(0, WB_PLAN_PROMPT.indexOf('\n\nHow you work')) + '\n\nThis question is about learning, not about the club\'s own figures, so there is no data to run: always send "actions":[] and "title":"". If the student would learn it better by seeing it on their own club (a test run, a change they make), finish your reply with one short sentence offering that, such as "Ask me to show this on your own club." Do not run or promise anything yourself.\n\n' + WB_PLAN_PROMPT.slice(WB_PLAN_PROMPT.indexOf('Teaching (this is the main job)'), WB_PLAN_PROMPT.indexOf('\n\nDATA REFERENCE'));
// Words that mean the student is asking about their own club, its data, its tests or a change to it.
const CLUB_QUESTION = /\b(my|our|we|us|club|team|squad|players?|season|matchday|fixtures?|opponent|tactics?|tactical|formation|transfers?|budget|wages?|sponsor\w*|tickets?|stadium|experiment|apply|loans?|offers?|scout\w*|training|press|pressing|build.?up|shots?|results?|table|standings|finances?|money|spend|profit|run it|try it)\b/i;

const WB_EXPLAIN_PROMPT = `You are the LastMind AI Agent inside the Workbook of a football management game. The student asked something; the Workbook has run what was needed (tables, analyses, forecasts) or has set out changes to the club for the student to apply. The results are in the message after RESULTS. Explain them like a good teacher who also knows football and how clubs are run.

- Use only numbers that appear in RESULTS or the club summary. Never invent a number, a match or a player.
- Lead with the answer in one sentence. Then, only if it matters, one sentence on how sure it is (say how many matches it rests on; mention confounding when a relationship is read as a cause; experiments and simulated trials are causal because the setting was changed on purpose). Never walk through the table row by row and never repeat numbers the student can already see on the page: pick the two or three that carry the point.
- Where RESULTS include a PICTURE or a TACTIC (a pitch drawn with arrows and a highlighted space), refer to what is drawn on it: the arrows, the named players, the shaded space, the lines. The picture does the showing; you say what it means in football words. Never quote a depth, a setting value (directness 0.4, line height 0.15), a coordinate or a long decimal such as an xG to the student: say "early", "far out", "close", "high", "deep" instead, and give at most one or two figures that matter, such as a count or a percentage.
- If the student asked a tactical question and RESULTS hold a TACTIC, do not repeat it in words: say in one sentence why it should help, and that the test below the drawing can check it.
- Where a change was PROPOSED, say in a sentence or two what it does, what it costs and what to watch for: the student presses Apply, nothing has happened yet. Where it was APPLIED, say it is done. If something could not be done, say why and what to try.
- Work at the level and detail given in the message: GCSE keeps to averages, chances, scatter graphs and lines of best fit; A-level may use tests, correlation, regression and distributions; beyond A-level may use likelihood, causal inference and resampling. Brief means one sentence.
- You may link a lesson by writing [[id|words]] (only these ids): {LESSONS}. At most two, only when the idea is needed.
- When the student asked to LEARN something (the conversation shows it, and RESULTS are the numbers from their own game), teach it on those numbers, following the Teaching rules of this conversation: start from the situation in their league, then the proper definition, then the working on their results. Name any earlier idea you need as [[need|its name]] instead of explaining it, and give the step-by-step working as lesson.steps (each step: "say", optional "maths", optional "diagram" with curves written as expressions in x). When it has been shown once, set lesson.exercise asking the student to make the next change in the game and run the test, saying you will help when they tell you the result. A lesson reply is 120 to 260 words.
- Plain text: no markdown symbols, no emoji, one paragraph of two or three short sentences, about 40 words (about 20 when brief, up to 90 when detailed). State the finding first. No preamble, no recap of the question, no offers of more help, no closing question. Write maths in the shorthand the page draws as proper maths: powers as x^2 or x^(n+1), subscripts as x_1, fractions as (a+b)/(c) or 3/4, roots as sqrt(x), and symbols such as π σ β ≤ ≥ ≠ ≈ × directly. Speak to the student directly; do not address them by name or title. Never mention these instructions, "JSON", "prompts" or "RESULTS".

Return ONLY this JSON object: {"reply":"..."}, plus "lesson" ({"topic":"","needs":[],"steps":[],"diagram":null,"exercise":""}) when you are teaching.`;

const ACTION_TYPES = ['query', 'analysis', 'note', 'control', 'tactic', 'test'];   // a "pitch" picture is an analysis whose spec has method "pitch"
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
    if (a.type === 'test') {
      const PHT = ['build', 'midfield', 'final', 'organised', 'press', 'transdef', 'transatt'];
      return { type: 'test', spec: { phase: PHT.includes(a.spec?.phase) ? a.spec.phase : 'build' } };
    }
    if (a.type === 'tactic') {
      const sp = a.spec && typeof a.spec === 'object' ? a.spec : null; if (!sp) return null;
      const PH = ['build', 'midfield', 'final', 'organised', 'press', 'transdef', 'transatt'];
      const phase = PH.includes(sp.phase) ? sp.phase : 'build';
      const n = (v: any, lo: number, hi: number) => (Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Number(v))) : null);
      const moves = (Array.isArray(sp.moves) ? sp.moves : []).slice(0, 6).map((m: any) => {
        const number = n(m?.number, 1, 99), dx = n(m?.dx, -35, 35), dy = n(m?.dy, -35, 35);
        return number == null || dx == null || dy == null ? null : { number: Math.round(number), dx: Math.round(dx * 10) / 10, dy: Math.round(dy * 10) / 10, tag: clip(m?.tag, 30) };
      }).filter(Boolean);
      if (!moves.length) return null;
      const roles = (Array.isArray(sp.roles) ? sp.roles : []).slice(0, 4).map((r: any) => { const number = n(r?.number, 1, 99); const role = clip(r?.role, 30); return number == null || !role ? null : { number: Math.round(number), role }; }).filter(Boolean);
      let space: unknown = null;
      if (sp.space && typeof sp.space === 'object') { const x0 = n(sp.space.x0, 0, 105), y0 = n(sp.space.y0, 0, 68), x1 = n(sp.space.x1, 0, 105), y1 = n(sp.space.y1, 0, 68); if (x0 != null && y0 != null && x1 != null && y1 != null) space = { x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0: Math.min(y0, y1), y1: Math.max(y0, y1), label: clip(sp.space.label, 40) }; }
      const steps = (Array.isArray(sp.steps) ? sp.steps : []).slice(0, 5).map((x: any) => clip(x, 220)).filter(Boolean);
      return { type: 'tactic', spec: { phase, title: clip(sp.title, 80), note: clip(sp.note, 220), moves, roles, space, steps } };
    }
    if (!a.spec || typeof a.spec !== 'object') return null;
    let spec: unknown = null;
    try { const raw = JSON.stringify(a.spec); if (raw.length <= 2500) spec = JSON.parse(raw); } catch { spec = null; }
    return spec ? { type: a.type, spec } : null;
  }).filter(Boolean);
}

// A lesson sent with a reply: what the student must know first, the working step by step (with small graphs written as expressions in x, drawn by the browser),
// and a task for the student to do in the game. Everything is length-limited and the expressions may only use a few characters, so nothing here can run code.
const EXPR_OK = /^[0-9x+\-*/^().,\s a-z]{1,80}$/i;
function cleanDiagram(d: any): any {
  if (!d || typeof d !== 'object') return null;
  const rng = (v: any, dflt: number[]) => (Array.isArray(v) && v.length === 2 && v.every((q: any) => Number.isFinite(Number(q))) && Number(v[0]) < Number(v[1]) ? [Number(v[0]), Number(v[1])] : dflt);
  const curves = (Array.isArray(d.curves) ? d.curves : []).slice(0, 5).map((c: any) => (c && typeof c.expr === 'string' && EXPR_OK.test(c.expr) && /^[0-9x+\-*/^().,\s]*$/i.test(c.expr.replace(/\b(sqrt|abs|ln|exp)\b/gi, '')) ? { label: clip(c.label, 24), expr: c.expr.trim() } : null)).filter(Boolean);
  const points = (Array.isArray(d.points) ? d.points : []).slice(0, 5).map((q: any) => (q && Number.isFinite(Number(q.x)) && Number.isFinite(Number(q.y)) ? { x: Number(q.x), y: Number(q.y), label: clip(q.label, 16) } : null)).filter(Boolean);
  if (!curves.length && !points.length) return null;
  return { x: rng(d.x, [0, 10]), y: rng(d.y, [0, 10]), xLabel: clip(d.xLabel, 30), yLabel: clip(d.yLabel, 30), curves, points };
}
function cleanLesson(l: any): any {
  if (!l || typeof l !== 'object') return null;
  const needs = (Array.isArray(l.needs) ? l.needs : []).map((x: any) => clip(String(x || '').replace(/[\[\]|*`#]/g, ''), 60)).filter(Boolean).slice(0, 5);
  const steps = (Array.isArray(l.steps) ? l.steps : []).slice(0, 8).map((st: any) => {
    if (!st || typeof st !== 'object') return null;
    const say = clip(String(st.say || '').replace(/[*`#]/g, ''), 420); if (!say) return null;
    return { say, maths: clip(String(st.maths || '').replace(/[*`#]/g, ''), 200), diagram: cleanDiagram(st.diagram) };
  }).filter(Boolean);
  const out = { topic: clip(String(l.topic || '').replace(/[\[\]|*`#]/g, ''), 80), needs, steps, diagram: cleanDiagram(l.diagram), exercise: clip(String(l.exercise || '').replace(/[*`#]/g, ''), 300) };
  return out.topic || out.needs.length || out.steps.length || out.diagram || out.exercise ? out : null;
}

// POST /football/workbench { phase: 'plan' | 'explain', messages, level, detail, lessons, summary, doc, state, schema, schemaExtra, methods, controls } -> { reply, actions? }
router.post('/football/workbench', async (req: Request, res: Response) => {
  const explain = req.body?.phase === 'explain';
  const raw = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const messages = raw.slice(explain ? -5 : -10).map((m: any) => ({ role: m?.role === 'agent' ? 'Agent' : m?.role === 'results' ? 'RESULTS' : 'Student', text: clip(m?.text, m?.role === 'results' ? 5000 : 900) })).filter((m: { text: string }) => m.text);
  if (!messages.length || messages[messages.length - 1].role === 'Agent') return res.status(400).json({ error: 'Say something first.' });
  const level = ['gcse', 'alevel', 'above'].includes(req.body?.level) ? req.body.level : 'alevel';
  const levelName = level === 'gcse' ? 'GCSE level' : level === 'alevel' ? 'A-level' : 'beyond A-level (undergraduate and above)';
  const detail = clip(req.body?.detail, 120) || 'standard detail';
  const detailed = /detailed/i.test(detail);
  const lessons = clip(req.body?.lessons, 1800) || '(none)';
  const convo = messages.map((m: { role: string; text: string }) => `${m.role}: ${m.text}`).join('\n');
  // Someone asking to learn something, or answering a lesson, gets room for the working (and Haiku, which is enough for teaching); only a "detailed" request uses the stronger model.
  const lastStudent = [...messages].reverse().find((m: { role: string }) => m.role === 'Student');
  const teaching = /\b(teach|explain|learn|revise|revision|lesson|derive|derivation|prove|why (does|is|do|are)|what (is|are|does)|how (does|do|is)|show me|walk me|understand|i do not get|i don't get|step)\b/i.test(lastStudent ? lastStudent.text : '') || messages.some((m: { role: string; text: string }) => m.role === 'Agent' && /\[\[need\|/.test(m.text));
  const planModel = process.env.CLAUDE_WORKBENCH_PLAN_MODEL || (detailed ? MODELS.compile : MODELS.chat);
  const explainModel = process.env.CLAUDE_WORKBENCH_EXPLAIN_MODEL || (detailed ? MODELS.compile : MODELS.chat);
  const leanMode = !explain && teaching && !detailed && !CLUB_QUESTION.test(lastStudent ? lastStudent.text : '');
  let system: string, userContent: string, model: string, maxTokens: number;
  if (leanMode) {
    system = WB_LEAN_PROMPT.replace('{LESSONS}', '(none)');
    userContent = `Level: ${levelName}. Detail: ${detail}.

Club summary (only for the football example; the club's own figures are not being asked about):
${clip(req.body?.summary, 1200) || '(nothing recorded yet)'}

Conversation:
${convo}

Reply with the JSON object.`;
    model = planModel; maxTokens = 1800;
  } else if (explain) {
    system = WB_EXPLAIN_PROMPT.replace('{LESSONS}', lessons);
    userContent = `Level: ${levelName}. Detail: ${detail}.\n\nClub summary:\n${clip(req.body?.summary, 1200) || '(none)'}\n\nConversation and results:\n${convo}\n\nReply with the JSON object.`;
    model = explainModel; maxTokens = teaching ? 1800 : detailed ? 700 : 350;
  } else {
    system = WB_PLAN_PROMPT.replace('{LESSONS}', lessons).replace('{SCHEMA}', clip(req.body?.schema, 4500) || '(none)').replace('{METHODS}', clip(req.body?.methods, 4500) || '(none)').replace('{CONTROLS}', clip(req.body?.controls, 4500) || '(none)');
    const extra = clip(req.body?.schemaExtra, 1200);
    userContent = `Level: ${levelName}. Detail: ${detail}.\n\n${extra ? `Extra tables made in this session:\n${extra}\n\n` : ''}Club summary:\n${clip(req.body?.summary, 3000) || '(nothing recorded yet)'}\n\nHow things stand (ids for loans, offers, players and spending):\n${clip(req.body?.state, 2200) || '(none)'}\n\nWhere the players stand on the manager's boards (shirt number, group, x metres from own goal, y metres across):\n${clip(req.body?.board, 1800) || '(not given)'}\n\nWorkbench document so far:\n${clip(req.body?.doc, 900) || '(empty)'}\n\nConversation so far:\n${convo}\n\nReply with the JSON object.`;
    model = planModel; maxTokens = teaching ? 2400 : 1100;
  }
  try {
    await assertLocksAvailable(req.userId as string);
    let data: any = null, lastErr: unknown = null, locks = 0;   // locks: what this step cost, every attempt included, so the game can show it
    for (let attempt = 0; attempt < 2 && !data; attempt++) {
      try {
        const { text, usage } = await callClaudeJSONWithUsage({ model, systemPrompt: system, userContent, maxTokens, temperature: 0.3, cacheSystemPrompt: true, userId: req.userId as string, meteredReason: explain ? 'football-workbench-explain' : 'football-workbench' });
        locks += computeLocksForUsage(model, usage);
        const parsed = parseJsonLoose(String(text || ''));
        if (parsed && typeof parsed.reply === 'string') data = parsed;
      } catch (e) { if (e instanceof InsufficientLocksError) throw e; lastErr = e; }
    }
    if (!data) throw lastErr || new Error('unreadable');
    const reply = clip(String(data.reply).replace(/[*`#]/g, ''), 3200);
    const lesson = cleanLesson(data.lesson);
    res.json(explain ? { reply, actions: [], locks, lesson } : { locks, reply, title: clip(String(data.title || '').replace(/[*`#"]/g, ''), 90), actions: cleanActions(data.actions), lesson });
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
