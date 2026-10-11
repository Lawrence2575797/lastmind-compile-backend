import { Router, Request, Response } from 'express';
import { requireAuth, requirePaidTier } from '../services/authMiddleware';
import { costlyEndpointLimiter } from '../services/rateLimiters';
import { callClaudeJSON, callClaudeJSONWithFiles, MODELS } from '../services/claudeClient';
import { assertLocksAvailable, InsufficientLocksError } from '../services/lockService';
import { applyStructuredPIIFilter } from '../safety/piiFilterStructured';
import { applyContextualPIIFilter } from '../safety/piiFilterContextual';
import { PROBLEM_SET_PARSE_PROMPT } from '../constants/problemSetPrompt';
import { PROBLEM_SET_MARK_PROMPT, PROBLEM_SET_SOLVE_PROMPT } from '../constants/problemSetMarkPrompt';

// POST /problem-set/parse { files: [{ name, mime, data (base64) }], texts: [string] } -> { title, header, questions: [{ number, text, options?, table?, figure?, marks? }] }
// The Notes page's problem sets: whatever the student added (screenshots, a PDF, pasted text) is read once and returned as separate
// questions, so the page can lay out each one with an answer box beside it. Nothing is stored here.
const router = Router();
router.use('/problem-set', requireAuth, requirePaidTier, costlyEndpointLimiter);

const MAX_FILES = 8;
const MAX_FILE_BASE64 = 7 * 1024 * 1024;      // about 5 MB of picture or PDF each
const MAX_TOTAL_BASE64 = 18 * 1024 * 1024;
const MAX_TEXT = 40000;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

const clip = (s: unknown, n: number) => (typeof s === 'string' ? s.trim().slice(0, n) : '');
function parseJsonLoose(text: string): any {
  const t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = t.indexOf('{'), end = t.lastIndexOf('}');
  return JSON.parse(start >= 0 && end > start ? t.slice(start, end + 1) : t);
}
const cleanText = (s: unknown, n: number) => clip(s, n).replace(/\$\$?/g, '');
// What was read out of an uploaded picture or PDF goes through the same personal-information filters that typed text does, so an email
// address, phone number or address on a scanned page never reaches the question boxes, the marker or the assistant.
const scrub = (s: string) => applyContextualPIIFilter(applyStructuredPIIFilter(s));
const cleanRead = (s: unknown, n: number) => scrub(cleanText(s, n));

router.post('/problem-set/parse', async (req: Request, res: Response) => {
  const rawFiles = Array.isArray(req.body?.files) ? req.body.files.slice(0, MAX_FILES) : [];
  const files: Array<{ name: string; mime: string; data: string }> = [];
  let total = 0;
  for (const f of rawFiles) {
    const mime = clip(f && f.mime, 60).toLowerCase();
    const data = typeof (f && f.data) === 'string' ? f.data.replace(/^data:[^,]*,/, '').replace(/\s+/g, '') : '';
    if (!data || (!IMAGE_TYPES.includes(mime) && mime !== 'application/pdf')) continue;
    if (data.length > MAX_FILE_BASE64) return res.status(413).json({ error: 'One of the files is too large. Try a smaller picture or a shorter PDF.' });
    total += data.length;
    files.push({ name: clip(f && f.name, 80) || 'file', mime, data });
  }
  if (total > MAX_TOTAL_BASE64) return res.status(413).json({ error: 'Those files are too large to read together. Add them in two goes.' });
  const texts: string[] = (Array.isArray(req.body?.texts) ? req.body.texts : []).map((t: unknown) => clip(t, MAX_TEXT)).filter(Boolean);
  if (!files.length && !texts.length) return res.status(400).json({ error: 'Add a picture, a file or some text first.' });
  try {
    await assertLocksAvailable(req.userId as string);
    const userText = `This problem set was added as ${files.length} file${files.length === 1 ? '' : 's'} and ${texts.length} piece${texts.length === 1 ? '' : 's'} of pasted text, in this order.` +
      texts.map((t, i) => `\n\nPasted text ${i + 1}:\n"""\n${t}\n"""`).join('');
    let data: any = null, lastErr: unknown = null;
    for (let attempt = 0; attempt < 2 && !data; attempt++) {
      try {
        const raw = await callClaudeJSONWithFiles({
          model: MODELS.chat, systemPrompt: PROBLEM_SET_PARSE_PROMPT, userText,
          files: files.map((f, i) => ({ kind: (f.mime === 'application/pdf' ? 'document' : 'image') as 'document' | 'image', mediaType: f.mime, base64Data: f.data, label: `File ${i + 1}: ${f.name}` })),
          maxTokens: 8000, temperature: 0, userId: req.userId as string, meteredReason: 'problem-set-parse',
        });
        data = parseJsonLoose(raw);
      } catch (e) { lastErr = e; }
    }
    if (!data) throw lastErr || new Error('unreadable');
    const qs = (Array.isArray(data.questions) ? data.questions : []).slice(0, 60).map((q: any, i: number) => {
      const out: any = { number: cleanText(q && q.number, 12) || String(i + 1), text: cleanRead(q && q.text, 4000) };
      const options = (Array.isArray(q && q.options) ? q.options : []).slice(0, 10).map((o: any) => ({ label: cleanText(o && o.label, 6), text: cleanRead(o && o.text, 600) })).filter((o: any) => o.text);
      if (options.length) out.options = options;
      const rows = Array.isArray(q && q.table && q.table.rows) ? q.table.rows.slice(0, 12).map((r: any) => (Array.isArray(r) ? r.slice(0, 12).map((c: any) => cleanRead(c, 80)) : [])).filter((r: any[]) => r.length) : [];
      if (rows.length) out.table = { rows };
      const figure = cleanRead(q && q.figure, 500); if (figure) out.figure = figure;
      const marks = Number(q && q.marks); if (isFinite(marks) && marks > 0 && marks < 200) out.marks = Math.round(marks);
      return out;
    }).filter((q: any) => q.text || q.options || q.table);
    if (!qs.length) return res.status(422).json({ error: 'LastMind could not find any questions in that. Try a clearer picture, or paste the text.' });
    res.json({ title: cleanRead(data.title, 120), header: cleanRead(data.header, 300), questions: qs });
  } catch (err) {
    if (err instanceof InsufficientLocksError) return res.status(402).json({ error: 'Lock limit reached', code: 'LOCK_LIMIT_REACHED', detail: "You're out of Locks for now." });
    console.error('Problem set parse failed:', err);
    res.status(500).json({ error: 'LastMind could not read that just now. Try again.' });
  }
});

// POST /problem-set/mark { question, answer } -> { verdict, score, paragraphs }
// One answer on a problem set, marked and explained in a few short paragraphs. Nothing is stored here.
router.post('/problem-set/mark', async (req: Request, res: Response) => {
  const question = clip(req.body?.question, 4000), answer = clip(req.body?.answer, 4000);
  if (!question) return res.status(400).json({ error: 'There is no question to mark against.' });
  if (!answer) return res.status(400).json({ error: 'Write an answer first.' });
  try {
    await assertLocksAvailable(req.userId as string);
    // 1. the question is solved on its own, with room to think, before the student's answer is looked at
    let reference = '';
    for (let attempt = 0; attempt < 2 && !reference; attempt++) {
      try {
        const rawSolve = await callClaudeJSON({ model: MODELS.chat, systemPrompt: PROBLEM_SET_SOLVE_PROMPT, userContent: `The question:\n\"\"\"\n${question}\n\"\"\"`, maxTokens: 1800, temperature: 0, userId: req.userId as string, meteredReason: 'problem-set-solve' });
        const solved = parseJsonLoose(rawSolve);
        reference = clip(solved && solved.answer, 600);
      } catch (e) { /* tried again once */ }
    }
    if (!reference) return res.status(500).json({ error: 'LastMind could not mark that just now. Try again.' });
    // 2. the answer is marked against that solution
    const userContent = `The question:\n\"\"\"\n${question}\n\"\"\"\n\nThe reference answer (worked out and checked):\n${reference}\n\nThe student's answer:\n\"\"\"\n${answer}\n\"\"\"`;
    // feedback that thinks aloud or corrects itself is never shown
    const SECOND_THOUGHTS = /\b(wait|let me (re)?(consider|check|think|calculate|recalculate)|reconsider|on reflection|hold on|actually,|i made (a|an) (mistake|error)|scratch that|correction:|re-?examin)/i;
    let data: any = null, lastErr: unknown = null;
    for (let attempt = 0; attempt < 3 && !data; attempt++) {
      try {
        const raw = await callClaudeJSON({ model: MODELS.chat, systemPrompt: PROBLEM_SET_MARK_PROMPT, userContent, maxTokens: 900, temperature: 0, userId: req.userId as string, meteredReason: 'problem-set-mark' });
        const parsed = parseJsonLoose(raw);
        const text = (Array.isArray(parsed && parsed.paragraphs) ? parsed.paragraphs : []).join(' ');
        if (!text || SECOND_THOUGHTS.test(text)) { lastErr = new Error('second thoughts'); continue; }
        data = parsed;
      } catch (e) { lastErr = e; }
    }
    if (!data) throw lastErr || new Error('unreadable');
    const verdict = ['correct', 'partly', 'incorrect'].includes(data.verdict) ? data.verdict : 'partly';
    const paragraphs = (Array.isArray(data.paragraphs) ? data.paragraphs : []).map((p: unknown) => cleanText(p, 700)).filter(Boolean).slice(0, 4);
    if (!paragraphs.length) return res.status(500).json({ error: 'LastMind could not mark that just now. Try again.' });
    const score = /^\d{1,3}\s*\/\s*\d{1,3}$/.test(String(data.score || '').trim()) ? String(data.score).replace(/\s+/g, '') : '';
    res.json({ verdict, score, paragraphs });
  } catch (err) {
    if (err instanceof InsufficientLocksError) return res.status(402).json({ error: 'Lock limit reached', code: 'LOCK_LIMIT_REACHED', detail: "You're out of Locks for now." });
    console.error('Problem set mark failed:', err);
    res.status(500).json({ error: 'LastMind could not mark that just now. Try again.' });
  }
});

export default router;
