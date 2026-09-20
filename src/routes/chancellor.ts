import { Router, Request, Response } from 'express';
import { requireAuth } from '../services/authMiddleware';
import { actionEndpointLimiter } from '../services/rateLimiters';
import { createAiCall } from '../services/createAi';
import { generatePortraitCutout, downloadAsDataUrl } from '../services/createImages';
import { assertLocksAvailable, chargeLocksForUsage } from '../services/lockService';
import { USD_PER_LOCK } from '../constants/modelPricing';
import { CreateCapError, spendSummary } from '../services/createSpend';
import { parseModelJson } from '../services/jsonParsing';
import { InsufficientLocksError } from '../services/lockService';
import { cleanUserText, BLOCK_MESSAGE } from '../services/contentFilter';
import { CHANCELLOR_INTERVIEW_QUESTION_PROMPT, CHANCELLOR_INTERVIEW_ASSESS_PROMPT, CHANCELLOR_NEWS_PROMPT } from '../constants/chancellorPrompts';

const router = Router();
router.use('/chancellor', requireAuth);

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v: unknown, lo: number, hi: number, fallback = 0): number => { const n = Number(v); return isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback; };
const arr = <T>(v: unknown, cap: number): T[] => (Array.isArray(v) ? (v.slice(0, cap) as T[]) : []);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);

function capResponse(res: Response, userId: string, err: unknown) {
  if (err instanceof CreateCapError) return res.status(402).json({ error: err.message, code: 'CREATE_SPEND_CAP', spend: spendSummary(userId) });
  if (err instanceof InsufficientLocksError) return res.status(402).json({ error: "You're out of Locks for now.", code: 'LOCK_LIMIT_REACHED' });
  return null;
}

// The page sends the figures it is running; the server only shapes them into a prompt (it never trusts them for anything but wording).
function briefing(b: Record<string, any>) {
  const c = (b.context ?? {}) as Record<string, any>;
  const m = (c.metrics ?? {}) as Record<string, any>;
  const metric = (k: string, lo: number, hi: number) => (m[k] == null ? undefined : Math.round(num(m[k], lo, hi) * 10) / 10);
  return {
    country: str(c.country, 60), currency: str(c.currency, 60), stageOfDevelopment: oneOf(c.stage, ['low', 'emerging', 'advanced'] as const, 'emerging'),
    date: str(c.date, 30), startingSituation: str(c.situation, 60),
    figures: {
      gdpGrowthPct: metric('growth', -60, 60), inflationPct: metric('inflation', -20, 5000), unemploymentPct: metric('unemployment', 0, 80), policyRatePct: metric('policyRate', -2, 500),
      debtToGdpPct: metric('debtGDP', 0, 500), deficitPctGdp: metric('deficit', -30, 60), currencyChangeVsStartPct: metric('currency', -90, 300), realWageGrowthPct: metric('realWages', -80, 80),
    },
    recentPolicyDecisions: arr<string>(c.recentPolicies, 12).map((x) => str(x, 140)).filter(Boolean),
    inTheNews: arr<string>(c.news, 6).map((x) => str(x, 160)).filter(Boolean),
    chancellorsStatedGoals: str(c.goals, 600) || undefined,
    chancellorsPopularity: { public: Math.round(num(c.popularityPublic, 0, 100, 50)), cabinet: Math.round(num(c.popularityCabinet, 0, 100, 50)) },
    interviewer: { name: str(c.journalist, 60), outlet: str(c.outlet, 60) },
  };
}

// POST /chancellor/interview/question { context } -> { question, angle }
router.post('/chancellor/interview/question', actionEndpointLimiter, async (req: Request, res: Response) => {
  const b = (req.body ?? {}) as Record<string, any>;
  const userId = req.userId as string;
  const transcript = arr<any>(b.transcript, 4).map((x) => ({ question: str(x?.question, 500), answer: cleanUserText(x?.answer, 1500).text })).filter((x) => x.question);
  try {
    const { text, locks } = await createAiCall({
      userId, systemPrompt: CHANCELLOR_INTERVIEW_QUESTION_PROMPT, userContent: JSON.stringify({ ...briefing(b), previousAngles: arr<string>(b.previousAngles, 8).map((x) => str(x, 40)), interviewSoFar: transcript.length ? transcript : undefined }),
      maxTokens: 300, temperature: 0.8, reason: 'chancellor-interview-question', cacheSystemPrompt: false, capless: true,
    });
    const p = parseModelJson<any>(text);
    const question = str(p?.question, 500);
    if (!question) { if (transcript.length) return res.json({ question: '', done: true, locks }); return res.status(502).json({ error: 'The interviewer had no question just now.' }); }
    res.json({ question, angle: str(p?.angle, 40), locks });
  } catch (err) {
    const handled = capResponse(res, userId, err);
    if (handled) return handled;
    console.error('Chancellor interview question failed:', err);
    res.status(500).json({ error: 'The interviewer could not be reached - please try again.' });
  }
});

// POST /chancellor/interview/assess { context, question, answer } -> the audience reaction
router.post('/chancellor/interview/assess', actionEndpointLimiter, async (req: Request, res: Response) => {
  const b = (req.body ?? {}) as Record<string, any>;
  const userId = req.userId as string;
  const rawExchanges = arr<any>(b.exchanges, 4).map((x) => ({ question: str(x?.question, 500), answer: cleanUserText(x?.answer, 2500) })).filter((x) => x.question);
  const single = { question: str(b.question, 500), answer: cleanUserText(b.answer, 2500) };
  const exchanges = rawExchanges.length ? rawExchanges : (single.question ? [single] : []);
  if (!exchanges.length) return res.status(400).json({ error: 'question is required' });
  if (exchanges.some((x) => x.answer.blocked)) return res.status(422).json({ error: BLOCK_MESSAGE, code: 'CONTENT_BLOCKED' });
  try {
    const { text, locks } = await createAiCall({
      userId, systemPrompt: CHANCELLOR_INTERVIEW_ASSESS_PROMPT, userContent: JSON.stringify({ ...briefing(b), interviewType: b.mode === 'goals' ? 'first-day interview: the Chancellor was asked to outline their goals for the term' : 'regular interview', interview: exchanges.map((x) => ({ question: x.question, chancellorsAnswer: x.answer.text || '(no answer)' })) }),
      maxTokens: 700, temperature: 0.3, reason: 'chancellor-interview-assess', cacheSystemPrompt: false, capless: true,
    });
    const p = parseModelJson<any>(text);
    const sc = (p?.scores ?? {}) as Record<string, unknown>;
    const scores: Record<string, number> = {};
    for (const k of ['public', 'workers', 'business', 'pensioners', 'young', 'markets', 'cabinet', 'party']) scores[k] = Math.round(num(sc[k], -6, 6));
    res.json({
      accuracy: oneOf(p?.accuracy, ['accurate', 'mixed', 'misleading'] as const, 'mixed'),
      directness: oneOf(p?.directness, ['yes', 'partly', 'dodged'] as const, 'partly'),
      empathy: oneOf(p?.empathy, ['yes', 'some', 'none'] as const, 'some'),
      credibility: str(p?.credibility, 300),
      gaffe: p?.gaffe === true,
      scores, pressure: Math.round(num(p?.pressure, -5, 10)),
      headline: str(p?.headline, 140), reaction: str(p?.reaction, 300), coaching: str(p?.coaching, 500), locks,
    });
  } catch (err) {
    const handled = capResponse(res, userId, err);
    if (handled) return handled;
    console.error('Chancellor interview assess failed:', err);
    res.status(500).json({ error: 'The interview could not be judged just now - please try again.' });
  }
});

// POST /chancellor/news { context, events, outlets } -> { articles } : the quarter's papers, written from what really happened.
router.post('/chancellor/news', actionEndpointLimiter, async (req: Request, res: Response) => {
  const b = (req.body ?? {}) as Record<string, any>;
  const userId = req.userId as string;
  const outlets = arr<any>(b.outlets, 3).map((o) => ({ name: str(o?.name, 50), slant: oneOf(o?.slant, ['left', 'right', 'business'] as const, 'business') })).filter((o) => o.name);
  if (!outlets.length) return res.status(400).json({ error: 'outlets are required' });
  try {
    const { text, locks } = await createAiCall({
      userId, systemPrompt: CHANCELLOR_NEWS_PROMPT, userContent: JSON.stringify({ ...briefing(b), outlets, whatHappenedThisQuarter: arr<string>(b.events, 10).map((x) => str(x, 200)).filter(Boolean), pollingGovernmentPct: Math.round(num((b.context ?? {}).pollGovernment, 0, 100, 40)), pollingOppositionPct: Math.round(num((b.context ?? {}).pollOpposition, 0, 100, 35)) }),
      maxTokens: 900, temperature: 0.7, reason: 'chancellor-news', cacheSystemPrompt: false, capless: true,
    });
    const p = parseModelJson<any>(text);
    const articles = arr<any>(p?.articles, 3).map((a, i) => ({
      outlet: str(a?.outlet, 50) || outlets[i]?.name || 'The Paper', slant: oneOf(a?.slant, ['left', 'right', 'business'] as const, outlets[i]?.slant || 'business'),
      headline: str(a?.headline, 140), standfirst: str(a?.standfirst, 220), body: str(a?.body, 700),
    })).filter((a) => a.headline && a.body);
    if (!articles.length) return res.status(502).json({ error: 'No articles came back.' });
    res.json({ articles, locks });
  } catch (err) {
    const handled = capResponse(res, userId, err);
    if (handled) return handled;
    console.error('Chancellor news failed:', err);
    res.status(500).json({ error: 'The papers could not be written just now.' });
  }
});

// POST /chancellor/portrait { description } -> { image, transparent, locks }
// A portrait for one person in the simulation. The image cost is charged to the student's Locks like every other cost.
router.post('/chancellor/portrait', actionEndpointLimiter, async (req: Request, res: Response) => {
  const key = process.env.FAL_KEY;
  if (!key) return res.status(501).json({ error: 'portraits not configured' });
  const userId = req.userId as string;
  const description = str((req.body ?? {}).description, 500);
  if (!description) return res.status(400).json({ error: 'description is required' });
  try {
    await assertLocksAvailable(userId);
    const fig = await generatePortraitCutout(key, description, userId);
    const locks = Math.max(1, Math.ceil(fig.costUsd / USD_PER_LOCK));
    await chargeLocksForUsage(userId, locks, 'chancellor-portrait');
    res.json({ image: await downloadAsDataUrl(fig.url, fig.transparent), transparent: fig.transparent, locks });
  } catch (err) {
    const handled = capResponse(res, userId, err);
    if (handled) return handled;
    console.error('Chancellor portrait failed:', err);
    res.status(502).json({ error: 'portrait unavailable' });
  }
});

export default router;
