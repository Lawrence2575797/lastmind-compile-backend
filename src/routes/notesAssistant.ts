import { Router, Request, Response } from 'express';
import { requireAuth, requirePaidTier } from '../services/authMiddleware';
import { costlyEndpointLimiter } from '../services/rateLimiters';
import { callClaudeJSON, callClaudeChatCached, MODELS } from '../services/claudeClient';
import { assertLocksAvailable, InsufficientLocksError } from '../services/lockService';
import { NOTES_ASSISTANT_CHAT_PROMPT, NOTES_ASSISTANT_REVIEW_PROMPT } from '../constants/notesAssistantPrompts';
import { NOTES_QUIZ_PROMPT, NOTES_FREE_CHECK_PROMPT } from '../constants/notesQuizPrompts';
import { newCard, gradeReview, Rating } from '../services/fsrsService';

// The Notes page's side panel: ask LastMind about a concept (chat), or have it review the page (issues, improvements, next steps).
// Stateless: the page sends the notes text, and for chat the recent messages, on every call. Nothing here is graded or written to FSRS.

const router = Router();
router.use('/notes-assistant', requireAuth, requirePaidTier, costlyEndpointLimiter);

const MAX_NOTES_CHARS = 14000;
const clip = (s: unknown, n: number) => (typeof s === 'string' ? s.trim().slice(0, n) : '');

function parseJsonLoose(text: string): any {
  const t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = t.indexOf('{'), end = t.lastIndexOf('}');
  return JSON.parse(start >= 0 && end > start ? t.slice(start, end + 1) : t);
}

// POST /notes-assistant/chat { message, history: [{role, content}], notes, title } -> { reply }
router.post('/notes-assistant/chat', async (req: Request, res: Response) => {
  const message = clip(req.body?.message, 2000);
  if (!message) return res.status(400).json({ error: 'message is required' });
  const notes = clip(req.body?.notes, MAX_NOTES_CHARS), title = clip(req.body?.title, 200);
  const history = (Array.isArray(req.body?.history) ? req.body.history : []).slice(-4)
    .map((m: any) => ({ role: (m && m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant', content: clip(m && m.content, 2000) })).filter((m: any) => m.content);
  try {
    await assertLocksAvailable(req.userId as string);
    const pageContext = `The student's notes${title ? ` (page: ${title})` : ''}:
"""
${notes || '(nothing written yet)'}
"""`;
    // The page and the conversation so far are cacheable (see callClaudeChatCached); only the new question changes between turns.
    const reply = await callClaudeChatCached({ model: MODELS.chat, systemPrompt: NOTES_ASSISTANT_CHAT_PROMPT, pageContext, messages: [...history, { role: 'user', content: message }], maxTokens: 1000, temperature: 0.2, userId: req.userId as string, meteredReason: 'notes-assistant-chat' });
    res.json({ reply: reply.trim() });
  } catch (err) {
    if (err instanceof InsufficientLocksError) return res.status(402).json({ error: 'Lock limit reached', code: 'LOCK_LIMIT_REACHED', detail: "You're out of Locks for now." });
    console.error('Notes assistant chat failed:', err);
    res.status(500).json({ error: 'LastMind could not answer just now. Try again.' });
  }
});

// POST /notes-assistant/review { notes, title } -> { summary, strengths[], issues[{where, problem, improvement}], nextSteps[{topic, why, action}] }
router.post('/notes-assistant/review', async (req: Request, res: Response) => {
  const notes = clip(req.body?.notes, MAX_NOTES_CHARS), title = clip(req.body?.title, 200);
  if (!notes) return res.status(400).json({ error: 'There is nothing to review yet. Write some notes first.' });
  try {
    await assertLocksAvailable(req.userId as string);
    const userContent = `Page title: ${title || '(untitled)'}\n\nNotes:\n"""\n${notes}\n"""`;
    let data: any = null, lastErr: unknown = null;
    for (let attempt = 0; attempt < 2 && !data; attempt++) {
      try {
        const raw = await callClaudeJSON({ model: MODELS.chat, systemPrompt: NOTES_ASSISTANT_REVIEW_PROMPT, userContent, maxTokens: 2200, temperature: 0.3, userId: req.userId as string, meteredReason: 'notes-assistant-review' });
        data = parseJsonLoose(raw);
      } catch (e) { lastErr = e; }
    }
    if (!data) throw lastErr || new Error('no usable review');
    const arr = (v: unknown) => (Array.isArray(v) ? v : []);
    res.json({
      summary: clip(data.summary, 600),
      strengths: arr(data.strengths).map((s) => clip(s, 240)).filter(Boolean).slice(0, 3),
      issues: arr(data.issues).slice(0, 6).map((i: any) => ({ where: clip(i && i.where, 240), problem: clip(i && i.problem, 700), improvement: clip(i && i.improvement, 900) })).filter((i: any) => i.problem),
      nextSteps: arr(data.nextSteps).slice(0, 4).map((n: any) => ({ topic: clip(n && n.topic, 160), why: clip(n && n.why, 400), action: clip(n && n.action, 400) })).filter((n: any) => n.topic),
    });
  } catch (err) {
    if (err instanceof InsufficientLocksError) return res.status(402).json({ error: 'Lock limit reached', code: 'LOCK_LIMIT_REACHED', detail: "You're out of Locks for now." });
    console.error('Notes assistant review failed:', err);
    res.status(500).json({ error: 'LastMind could not review these notes just now. Try again.' });
  }
});

// ---------- spaced repetition on notes ----------
// POST /notes-assistant/quiz { title, text } -> { questions: [5 questions covering the text] }
type QuizQ = { type: 'mcq' | 'cloze' | 'free'; covers: string; q: string; options?: string[]; correct?: number; answer?: string; accept?: string[]; modelAnswer?: string; explanation: string };
function cleanQuiz(data: any): QuizQ[] | null {
  const raw: any[] = Array.isArray(data && data.questions) ? data.questions : [];
  const out: QuizQ[] = [];
  raw.forEach((x) => {
    const q = clip(x && x.q, 600), explanation = clip(x && x.explanation, 600), covers = clip(x && x.covers, 200);
    if (!q) return;
    if (x.type === 'mcq') {
      const options = (Array.isArray(x.options) ? x.options : []).map((o: unknown) => clip(o, 300)).filter(Boolean);
      const correct = Number(x.correct);
      if (options.length === 4 && Number.isInteger(correct) && correct >= 0 && correct <= 3) out.push({ type: 'mcq', covers, q, options, correct, explanation });
    } else if (x.type === 'cloze') {
      const answer = clip(x.answer, 120);
      if (answer && /_{2,}/.test(q)) out.push({ type: 'cloze', covers, q, answer, accept: (Array.isArray(x.accept) ? x.accept : []).map((a: unknown) => clip(a, 120)).filter(Boolean).slice(0, 6), explanation });
    } else if (x.type === 'free') {
      const modelAnswer = clip(x.modelAnswer, 700);
      if (modelAnswer) out.push({ type: 'free', covers, q, modelAnswer, explanation });
    }
  });
  const mcq = out.filter((x) => x.type === 'mcq').length, cloze = out.filter((x) => x.type === 'cloze').length, free = out.filter((x) => x.type === 'free').length;
  return out.length === 5 && mcq >= 2 && cloze >= 1 && free >= 1 ? out : null;
}
router.post('/notes-assistant/quiz', async (req: Request, res: Response) => {
  const text = clip(req.body?.text, MAX_NOTES_CHARS), title = clip(req.body?.title, 200);
  if (text.length < 20) return res.status(400).json({ error: 'There is not enough written here to quiz on yet.' });
  try {
    await assertLocksAvailable(req.userId as string);
    const userContent = `Page title: ${title || '(untitled)'}\n\nNotes written on the day being tested:\n"""\n${text}\n"""`;
    let quiz: QuizQ[] | null = null, lastErr: unknown = null;
    for (let attempt = 0; attempt < 2 && !quiz; attempt++) {
      try {
        const raw = await callClaudeJSON({ model: MODELS.chat, systemPrompt: NOTES_QUIZ_PROMPT, userContent, maxTokens: 2200, temperature: 0.4, userId: req.userId as string, meteredReason: 'notes-quiz-generate' });
        quiz = cleanQuiz(parseJsonLoose(raw));
      } catch (e) { lastErr = e; }
    }
    if (!quiz) throw lastErr || new Error('no usable quiz');
    res.json({ questions: quiz });
  } catch (err) {
    if (err instanceof InsufficientLocksError) return res.status(402).json({ error: 'Lock limit reached', code: 'LOCK_LIMIT_REACHED', detail: "You're out of Locks for now." });
    console.error('Notes quiz generation failed:', err);
    res.status(500).json({ error: 'LastMind could not make the quiz just now. Try again.' });
  }
});

// POST /notes-assistant/check-free { question, modelAnswer, answer } -> { correct, feedback }
router.post('/notes-assistant/check-free', async (req: Request, res: Response) => {
  const question = clip(req.body?.question, 600), modelAnswer = clip(req.body?.modelAnswer, 700), answer = clip(req.body?.answer, 1500);
  if (!question || !modelAnswer) return res.status(400).json({ error: 'question and modelAnswer are required' });
  if (!answer) return res.json({ correct: false, feedback: 'No answer was given.' });
  try {
    await assertLocksAvailable(req.userId as string);
    const raw = await callClaudeJSON({ model: MODELS.chat, systemPrompt: NOTES_FREE_CHECK_PROMPT, userContent: `Question: ${question}\n\nModel answer: ${modelAnswer}\n\nStudent's answer:\n"""\n${answer}\n"""`, maxTokens: 300, temperature: 0, userId: req.userId as string, meteredReason: 'notes-quiz-check' });
    const d = parseJsonLoose(raw);
    res.json({ correct: !!d.correct, feedback: clip(d.feedback, 400) });
  } catch (err) {
    if (err instanceof InsufficientLocksError) return res.status(402).json({ error: 'Lock limit reached', code: 'LOCK_LIMIT_REACHED', detail: "You're out of Locks for now." });
    console.error('Notes quiz free-text check failed:', err);
    res.status(500).json({ error: 'LastMind could not mark that answer just now.' });
  }
});

// POST /notes-assistant/quiz-result { card, score } -> { card, due, days, rating }
// The same FSRS scheduler the rest of the app uses (92% target retention, no same-day relearning steps). The card travels with the page, so nothing
// is stored here. A quiz of 5 becomes a grade: 0-1 right is Again, 2-3 Hard, 4 Good, 5 Good the first time and Easy after that.
router.post('/notes-assistant/quiz-result', async (req: Request, res: Response) => {
  const score = Math.max(0, Math.min(5, Math.round(Number(req.body?.score))));
  if (!Number.isFinite(score)) return res.status(400).json({ error: 'score is required' });
  try {
    const now = new Date(), c = req.body?.card;
    let card = newCard(now);
    if (c && typeof c === 'object' && c.stability != null) card = { ...card, due: new Date(c.due), stability: Number(c.stability), difficulty: Number(c.difficulty), elapsed_days: Number(c.elapsed_days) || 0, scheduled_days: Number(c.scheduled_days) || 0, reps: Number(c.reps) || 0, lapses: Number(c.lapses) || 0, state: Number(c.state) as any, last_review: c.last_review ? new Date(c.last_review) : undefined } as any;
    const rating = score <= 1 ? Rating.Again : score <= 3 ? Rating.Hard : score === 4 ? Rating.Good : (card.reps > 0 ? Rating.Easy : Rating.Good);
    const next = gradeReview(card, rating as any, now).card;
    res.json({ card: JSON.parse(JSON.stringify(next)), due: next.due.toISOString(), days: next.scheduled_days, rating: Rating[rating] });
  } catch (err) {
    console.error('Notes quiz scheduling failed:', err);
    res.status(500).json({ error: 'The next review could not be scheduled.' });
  }
});

export default router;
