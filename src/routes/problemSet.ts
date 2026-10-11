import { Router, Request, Response } from 'express';
import { requireAuth, requirePaidTier } from '../services/authMiddleware';
import { costlyEndpointLimiter } from '../services/rateLimiters';
import { callClaudeJSONWithFiles, MODELS } from '../services/claudeClient';
import { assertLocksAvailable, InsufficientLocksError } from '../services/lockService';
import { PROBLEM_SET_PARSE_PROMPT } from '../constants/problemSetPrompt';

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
          model: MODELS.compile, systemPrompt: PROBLEM_SET_PARSE_PROMPT, userText,
          files: files.map((f, i) => ({ kind: (f.mime === 'application/pdf' ? 'document' : 'image') as 'document' | 'image', mediaType: f.mime, base64Data: f.data, label: `File ${i + 1}: ${f.name}` })),
          maxTokens: 8000, temperature: 0, userId: req.userId as string, meteredReason: 'problem-set-parse',
        });
        data = parseJsonLoose(raw);
      } catch (e) { lastErr = e; }
    }
    if (!data) throw lastErr || new Error('unreadable');
    const qs = (Array.isArray(data.questions) ? data.questions : []).slice(0, 60).map((q: any, i: number) => {
      const out: any = { number: cleanText(q && q.number, 12) || String(i + 1), text: cleanText(q && q.text, 4000) };
      const options = (Array.isArray(q && q.options) ? q.options : []).slice(0, 10).map((o: any) => ({ label: cleanText(o && o.label, 6), text: cleanText(o && o.text, 600) })).filter((o: any) => o.text);
      if (options.length) out.options = options;
      const rows = Array.isArray(q && q.table && q.table.rows) ? q.table.rows.slice(0, 12).map((r: any) => (Array.isArray(r) ? r.slice(0, 12).map((c: any) => cleanText(c, 80)) : [])).filter((r: any[]) => r.length) : [];
      if (rows.length) out.table = { rows };
      const figure = cleanText(q && q.figure, 500); if (figure) out.figure = figure;
      const marks = Number(q && q.marks); if (isFinite(marks) && marks > 0 && marks < 200) out.marks = Math.round(marks);
      return out;
    }).filter((q: any) => q.text || q.options || q.table);
    if (!qs.length) return res.status(422).json({ error: 'LastMind could not find any questions in that. Try a clearer picture, or paste the text.' });
    res.json({ title: cleanText(data.title, 120), header: cleanText(data.header, 300), questions: qs });
  } catch (err) {
    if (err instanceof InsufficientLocksError) return res.status(402).json({ error: 'Lock limit reached', code: 'LOCK_LIMIT_REACHED', detail: "You're out of Locks for now." });
    console.error('Problem set parse failed:', err);
    res.status(500).json({ error: 'LastMind could not read that just now. Try again.' });
  }
});

export default router;
