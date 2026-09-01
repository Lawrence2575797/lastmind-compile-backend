import { Router, Request, Response } from 'express';
import { requireAuth, requirePaidTier } from '../services/authMiddleware';
import { costlyEndpointLimiter } from '../services/rateLimiters';
import { supabaseAdmin } from '../services/supabaseAdmin';
import { callClaudeJSON, MODELS } from '../services/claudeClient';
import { MATH_HELP_ADVICE_PROMPT, MATH_HELP_ANSWER_PROMPT, MATH_HELP_ANSWER_INTRO_MESSAGE } from '../constants/mathHelpPrompts';

// The Maths Tool's chat backend. Deliberately isolated from every FSRS
// mechanism in this codebase — no gradeCorrectness, no gradeAndRecordReview,
// no concept_reviews read or write anywhere below. This is a self-serve
// "help me with this question" tool, off the record by design (see
// mathHelpPrompts.ts), not a graded lesson surface.

const router = Router();

// Premium-only, enforced here (not just hidden client-side) — same
// pattern as peerTutoring.ts's router.use, so a free account can't reach
// any of this by calling the API directly even though the nav button is
// already hidden for them.
router.use('/math-help', requireAuth, requirePaidTier);

function truncateTitle(text: string): string {
  const oneLine = text.trim().replace(/\s+/g, ' ');
  return oneLine.length > 60 ? `${oneLine.slice(0, 57)}...` : oneLine;
}

// Re-plays a thread's message history into the flat single-string format
// callClaudeJSON expects (there's no multi-turn messages array on that
// helper — see claudeClient.ts) — the original question always leads, so
// a follow-up several messages in still resolves against the actual
// question, not just the most recent exchange.
function buildTranscript(originalQuestion: string, history: { role: string; content: string }[]): string {
  const lines = history.map((m) => `${m.role === 'user' ? 'Student' : 'You'}: ${m.content}`).join('\n\n');
  return `Original question: ${originalQuestion}\n\n${lines}`;
}

// GET /math-help/threads -> [{id, title, mode, updatedAt}] for the sidebar list.
router.get('/math-help/threads', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('math_help_threads')
      .select('id, title, mode, updated_at')
      .eq('user_id', req.userId as string)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    res.json((data || []).map((t) => ({ id: t.id, title: t.title, mode: t.mode, updatedAt: t.updated_at })));
  } catch (err) {
    console.error('Failed to list math help threads:', err);
    res.status(500).json({ error: 'could not load your questions' });
  }
});

// GET /math-help/threads/:id -> { id, title, mode, messages: [{role, content}] }
router.get('/math-help/threads/:id', async (req: Request, res: Response) => {
  try {
    const { data: thread } = await supabaseAdmin
      .from('math_help_threads')
      .select('id, title, mode, user_id')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!thread || thread.user_id !== req.userId) return res.status(404).json({ error: 'not found' });

    const { data: messages, error } = await supabaseAdmin
      .from('math_help_messages')
      .select('role, content')
      .eq('thread_id', thread.id)
      .order('created_at', { ascending: true });
    if (error) throw error;

    res.json({ id: thread.id, title: thread.title, mode: thread.mode, messages: messages || [] });
  } catch (err) {
    console.error('Failed to load math help thread:', err);
    res.status(500).json({ error: 'could not load this question' });
  }
});

// POST /math-help/threads  { questionText, mode: 'advice'|'answer' }
// Creates a new thread with the student's question as its first message.
// 'advice' gets an immediate Claude walkthrough; 'answer' gets a hardcoded
// (not API-generated) prompt to write their own working below.
router.post('/math-help/threads', costlyEndpointLimiter, async (req: Request, res: Response) => {
  const { questionText, mode } = (req.body ?? {}) as { questionText?: string; mode?: 'advice' | 'answer' };
  if (typeof questionText !== 'string' || !questionText.trim()) return res.status(400).json({ error: 'questionText is required' });
  if (mode !== 'advice' && mode !== 'answer') return res.status(400).json({ error: "mode must be 'advice' or 'answer'" });

  try {
    const userId = req.userId as string;
    const { data: thread, error: threadErr } = await supabaseAdmin
      .from('math_help_threads')
      .insert({ user_id: userId, title: truncateTitle(questionText), mode })
      .select('id, title, mode')
      .single();
    if (threadErr || !thread) throw threadErr || new Error('thread insert returned nothing');

    const assistantContent = mode === 'advice'
      ? await callClaudeJSON({ model: MODELS.compile, systemPrompt: MATH_HELP_ADVICE_PROMPT, userContent: `Original question: ${questionText}` })
      : MATH_HELP_ANSWER_INTRO_MESSAGE;

    const { error: msgErr } = await supabaseAdmin.from('math_help_messages').insert([
      { thread_id: thread.id, role: 'user', content: questionText },
      { thread_id: thread.id, role: 'assistant', content: assistantContent },
    ]);
    if (msgErr) throw msgErr;

    res.json({
      id: thread.id,
      title: thread.title,
      mode: thread.mode,
      messages: [
        { role: 'user', content: questionText },
        { role: 'assistant', content: assistantContent },
      ],
    });
  } catch (err) {
    console.error('Failed to create math help thread:', err);
    res.status(500).json({ error: 'could not start this question' });
  }
});

// POST /math-help/threads/:id/messages  { content } -> { role: 'assistant', content }
router.post('/math-help/threads/:id/messages', costlyEndpointLimiter, async (req: Request, res: Response) => {
  const { content } = (req.body ?? {}) as { content?: string };
  if (typeof content !== 'string' || !content.trim()) return res.status(400).json({ error: 'content is required' });

  try {
    const { data: thread } = await supabaseAdmin
      .from('math_help_threads')
      .select('id, mode, user_id')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!thread || thread.user_id !== req.userId) return res.status(404).json({ error: 'not found' });

    const { data: history, error: historyErr } = await supabaseAdmin
      .from('math_help_messages')
      .select('role, content')
      .eq('thread_id', thread.id)
      .order('created_at', { ascending: true });
    if (historyErr) throw historyErr;

    const originalQuestion = (history || []).find((m) => m.role === 'user')?.content || content;
    const transcript = buildTranscript(originalQuestion, [...(history || []), { role: 'user', content }]);
    const systemPrompt = thread.mode === 'answer' ? MATH_HELP_ANSWER_PROMPT : MATH_HELP_ADVICE_PROMPT;
    const assistantContent = await callClaudeJSON({ model: MODELS.compile, systemPrompt, userContent: transcript });

    const { error: insertErr } = await supabaseAdmin.from('math_help_messages').insert([
      { thread_id: thread.id, role: 'user', content },
      { thread_id: thread.id, role: 'assistant', content: assistantContent },
    ]);
    if (insertErr) throw insertErr;
    await supabaseAdmin.from('math_help_threads').update({ updated_at: new Date().toISOString() }).eq('id', thread.id);

    res.json({ role: 'assistant', content: assistantContent });
  } catch (err) {
    console.error('Failed to continue math help thread:', err);
    res.status(500).json({ error: 'could not send this message' });
  }
});

export default router;
