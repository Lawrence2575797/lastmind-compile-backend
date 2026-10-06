import { Router, Request, Response } from 'express';
import { requireAuth } from '../services/authMiddleware';
import { costlyEndpointLimiter } from '../services/rateLimiters';
import { callClaudeJSON, MODELS } from '../services/claudeClient';
import { assertLocksAvailable, InsufficientLocksError } from '../services/lockService';
import { NOTES_ASSISTANT_CHAT_PROMPT, NOTES_ASSISTANT_REVIEW_PROMPT } from '../constants/notesAssistantPrompts';

// The Notes page's side panel: ask LastMind about a concept (chat), or have it review the page (issues, improvements, next steps).
// Stateless: the page sends the notes text, and for chat the recent messages, on every call. Nothing here is graded or written to FSRS.

const router = Router();
router.use('/notes-assistant', requireAuth, costlyEndpointLimiter);

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
  const history = (Array.isArray(req.body?.history) ? req.body.history : []).slice(-10)
    .map((m: any) => ({ role: m && m.role === 'assistant' ? 'LastMind' : 'Student', content: clip(m && m.content, 2000) })).filter((m: any) => m.content);
  try {
    await assertLocksAvailable(req.userId as string);
    const userContent = `The student's notes${title ? ` (page: ${title})` : ''}:\n"""\n${notes || '(nothing written yet)'}\n"""\n\nConversation so far:\n${history.map((m: any) => `${m.role}: ${m.content}`).join('\n\n') || '(none)'}\n\nStudent's latest message:\n${message}`;
    const reply = await callClaudeJSON({ model: MODELS.chat, systemPrompt: NOTES_ASSISTANT_CHAT_PROMPT, userContent, maxTokens: 1000, temperature: 0.2, userId: req.userId as string, meteredReason: 'notes-assistant-chat' });
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

export default router;
