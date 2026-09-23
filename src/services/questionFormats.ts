import crypto from 'crypto';

// Interactive question formats for the main LastMind feed, beside plain free recall:
//   spot_mistake  a short passage in which exactly one sentence is wrong; the student taps the wrong one
//   match         pair 3-5 terms/cases/rules with their definitions/examples/consequences
//   order         put 3-6 steps of a process, sequence or chain of reasoning into the right order
// All three have exactly one right answer, so they are graded here with no AI call. The answer key never leaves the server:
// the page is sent a "client view" (segments as written, pairs split and shuffled, items shuffled).
// A small AES-GCM seal so answer keys can ride inside client-held state (the prerequisite check) without the page being able to read
// or change them. The secret comes from server configuration; if it changes, an old check simply has to be restarted.
const sealSecret = () => crypto.createHash('sha256').update(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.CLAUDE_API_KEY || 'lastmind-dev-seal').digest();
export function sealJson(value: unknown): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', sealSecret(), iv);
  const enc = Buffer.concat([c.update(JSON.stringify(value), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
}
export function openJson<T>(sealed: unknown): T | null {
  try {
    const b = Buffer.from(String(sealed), 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', sealSecret(), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8')) as T;
  } catch (err) { return null; }
}

// cloze   type the missing terms into a passage (graded exactly, with small typo tolerance)
//   steps   type the steps of a process in order, one per line (each line must contain one of that step's key words)
//   diagram type every blank box of a derivation lesson's own diagram from memory (see derivationService.ts's
//           derivationSectionQuestion) - the same boxes/arrows/layout the lesson's own final "derive" step draws, so a whole-lesson
//           Day-1 check can test every branch of the graph instead of one flattened chain that would have to skip some of them.
// All of these make the student PRODUCE the answer, which is what the delayed checks are for; match and order can also carry decoys.
export type StructuredFormat = 'spot_mistake' | 'match' | 'order' | 'cloze' | 'steps' | 'diagram';
export const STRUCTURED_FORMATS: StructuredFormat[] = ['spot_mistake', 'match', 'order', 'cloze', 'steps', 'diagram'];

export interface StructuredQuestion {
  format: StructuredFormat;
  questionText: string;
  markScheme?: string;
  segments?: string[]; errorIndex?: number; correction?: string;          // spot_mistake
  pairs?: { left: string; right: string }[];                              // match
  items?: string[];                                                       // order (already in the CORRECT order)
  decoys?: string[];                                                      // match / order: extra wrong pieces mixed into the pool
  text?: string; blanks?: { id?: string; answer: string; alt?: string[]; equivalentGroup?: string }[]; // cloze: passage with ___ per blank; diagram: one per blank box; parallel advantages/disadvantages may swap places
  steps?: { text: string; keys: string[] }[];                             // steps: the correct steps and the key words that identify each
  h?: number; nodes?: { id: string; x: number; y: number; w: number; hh: number; given: boolean; color?: string; label?: string }[]; edges?: [number, number][][]; // diagram: box geometry and arrows (see layout.js)
  [k: string]: unknown;
}

const txt = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
export const isStructured = (q: unknown): q is StructuredQuestion => !!q && typeof q === 'object' && STRUCTURED_FORMATS.includes((q as any).format);

// Returns a clean structured question, or null when the model's output is not usable (the caller then falls back to free recall).
export function sanitiseStructured(q: any): StructuredQuestion | null {
  if (!isStructured(q)) return null;
  const questionText = txt(q.questionText, 500);
  if (!questionText) return null;
  const out: StructuredQuestion = { format: q.format, questionText, markScheme: txt(q.markScheme, 800) || undefined };
  if (q.format === 'spot_mistake') {
    const segments = (Array.isArray(q.segments) ? q.segments : []).map((s: unknown) => txt(s, 320)).filter(Boolean);
    const errorIndex = Number(q.errorIndex);
    if (segments.length < 3 || segments.length > 7 || !Number.isInteger(errorIndex) || errorIndex < 0 || errorIndex >= segments.length) return null;
    const correction = txt(q.correction, 500);
    if (!correction) return null;
    return { ...out, segments, errorIndex, correction };
  }
  if (q.format === 'match') {
    const pairs = (Array.isArray(q.pairs) ? q.pairs : []).map((p: any) => ({ left: txt(p?.left, 160), right: txt(p?.right, 220) })).filter((p: any) => p.left && p.right);
    const lefts = new Set(pairs.map((p: any) => p.left)), rights = new Set(pairs.map((p: any) => p.right));
    if (pairs.length < 3 || pairs.length > 5 || lefts.size !== pairs.length || rights.size !== pairs.length) return null;
    return { ...out, pairs, decoys: cleanDecoys(q.decoys, pairs.map((p: any) => p.right)) };
  }
  if (q.format === 'cloze') {
    const text = txt(q.text, 900);
    const blanks = (Array.isArray(q.blanks) ? q.blanks : []).map((b: any) => ({ answer: txt(b?.answer, 80), alt: (Array.isArray(b?.alt) ? b.alt : []).map((a: unknown) => txt(a, 80)).filter(Boolean).slice(0, 4) })).filter((b: any) => b.answer);
    const marks = (text.match(/_{2,}/g) || []).length;
    if (blanks.length < 2 || blanks.length > 6 || marks !== blanks.length) return null;
    return { ...out, text, blanks };
  }
  if (q.format === 'steps') {
    const steps = (Array.isArray(q.steps) ? q.steps : []).map((st: any) => ({ text: txt(st?.text, 200), keys: (Array.isArray(st?.keys) ? st.keys : []).map((k: unknown) => txt(k, 60)).filter((k: string) => k.length >= 3).slice(0, 5) })).filter((st: any) => st.text && st.keys.length);
    if (steps.length < 3 || steps.length > 6) return null;
    return { ...out, steps };
  }
  const items = (Array.isArray(q.items) ? q.items : []).map((s: unknown) => txt(s, 200)).filter(Boolean);
  if (items.length < 3 || items.length > 6 || new Set(items).size !== items.length) return null;
  return { ...out, items, decoys: cleanDecoys(q.decoys, items) };
}

// Extra wrong pieces for a harder puzzle: at most three, never a duplicate of a real piece.
function cleanDecoys(raw: unknown, real: string[]): string[] {
  const have = new Set(real);
  return (Array.isArray(raw) ? raw : []).map((d: unknown) => txt(d, 200)).filter((d: string) => d && !have.has(d)).slice(0, 3);
}

function shuffled<T>(list: T[], notEqualTo?: T[]): T[] {
  const a = list.slice();
  for (let attempt = 0; attempt < 6; attempt++) {
    for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
    if (!notEqualTo || a.some((x, i) => x !== notEqualTo[i])) break;   // never hand out an already-solved puzzle
  }
  return a;
}

// What the page is allowed to see: the puzzle, never the key.
export function clientView(q: any): Record<string, unknown> {
  if (!isStructured(q)) return q;
  const base = { format: q.format, questionText: q.questionText };
  if (q.format === 'spot_mistake') return { ...base, segments: q.segments };
  if (q.format === 'match') { const rights = (q.pairs || []).map((p) => p.right); return { ...base, lefts: (q.pairs || []).map((p) => p.left), rights: shuffled([...rights, ...(q.decoys || [])], rights) }; }
  if (q.format === 'cloze') return { ...base, text: q.text, blanks: (q.blanks || []).length };
  if (q.format === 'steps') return { ...base, count: (q.steps || []).length };
  // diagram: every box's geometry and colour, and a given box's real label - a blank box's id but never its answer/alt.
  if (q.format === 'diagram') return { ...base, h: q.h, nodes: q.nodes, edges: q.edges, blanks: (q.blanks || []).map((b) => ({ id: b.id })) };
  return { ...base, items: shuffled([...(q.items || []), ...(q.decoys || [])], q.items), slots: (q.items || []).length };
}

export interface StructuredGrade { correct: boolean; feedback: string; detail?: boolean[]; reveal?: string }

// Lower-case, accents and punctuation stripped, leading articles and a few meaning-preserving connector words dropped: what a
// typed answer is compared on. "&" -> "and" BEFORE punctuation is stripped (real reported case: a term labelled "X & Y" typed
// back as "X and Y" was marked wrong, since stripping "&" as punctuation alone throws the word away entirely rather than
// treating it as what it actually is - the same word spelled differently). "between" is dropped for the same reason a typed
// answer can genuinely, correctly insert it ("time saved BETWEEN switching tasks" for "time saved switching tasks") without
// changing what's being said - unlike "of"/"to", which usually do carry the term's own meaning and stay.
const WORD_EQUIVALENTS: Record<string, string> = {
  specialised: 'specialist', specialized: 'specialist', expert: 'specialist',
  equipment: 'machinery', equipments: 'machinery', machines: 'machinery', machine: 'machinery',
  labourers: 'workers', labourer: 'worker', employees: 'workers', employee: 'worker',
  increased: 'higher', greater: 'higher', improved: 'higher',
  saving: 'saved', saves: 'saved',
};

// Keep this deliberately conservative: it smooths wording that carries the
// same idea, but does not attempt to turn arbitrary near-neighbours into the
// same economics term. In particular, "expert machinery" is ordinary student
// language for specialist/specialised machinery, and equipment/machinery are
// interchangeable in this context. Word order is handled separately below.
const norm = (v: unknown) => String(v ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/&/g, ' and ')
  .replace(/[^a-z0-9 ]+/g, ' ')
  .replace(/\b(the|a|an|between)\b/g, ' ')
  .replace(/\s+/g, ' ').trim()
  .split(' ').map((word) => WORD_EQUIVALENTS[word] || word).join(' ');

const sameWords = (a: string, b: string) => {
  const words = (value: string) => value.split(' ').filter(Boolean).sort();
  const aw = words(a); const bw = words(b);
  return aw.length === bw.length && aw.every((word, i) => word === bw[i]);
};
function within(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length] <= max;
}
export const closeEnough = (given: string, target: string) => {
  const g = norm(given), t = norm(target);
  return !!g && (g === t || sameWords(g, t) || within(g, t, t.length >= 10 ? 3 : t.length >= 5 ? 2 : t.length >= 3 ? 1 : 0));
};

function gradeBlankAnswers(blanks: NonNullable<StructuredQuestion['blanks']>, given: string[]): boolean[] {
  const matches = (answerIndex: number, blankIndex: number) =>
    [blanks[blankIndex].answer, ...(blanks[blankIndex].alt || [])].some((target) => closeEnough(given[answerIndex], target));
  const detail = blanks.map((_blank, i) => matches(i, i));
  const groups = new Map<string, number[]>();
  blanks.forEach((blank, i) => {
    if (blank.equivalentGroup) groups.set(blank.equivalentGroup, [...(groups.get(blank.equivalentGroup) || []), i]);
  });

  // Parallel advantages/disadvantages can be entered in any of their
  // parallel boxes, but remain one-to-one: typing the same valid advantage
  // twice cannot satisfy two different boxes. A tiny bipartite matcher keeps
  // the per-box live feedback useful even before every box is complete.
  groups.forEach((indices) => {
    const targetToAnswer = new Map<number, number>();
    const claim = (answerIndex: number, seen: Set<number>): boolean => {
      for (const targetIndex of indices) {
        if (seen.has(targetIndex) || !matches(answerIndex, targetIndex)) continue;
        seen.add(targetIndex);
        const previous = targetToAnswer.get(targetIndex);
        if (previous === undefined || claim(previous, seen)) {
          targetToAnswer.set(targetIndex, answerIndex);
          return true;
        }
      }
      return false;
    };
    indices.forEach((answerIndex) => claim(answerIndex, new Set<number>()));
    const matchedAnswers = new Set(targetToAnswer.values());
    indices.forEach((answerIndex) => { detail[answerIndex] = matchedAnswers.has(answerIndex); });
  });
  return detail;
}

export function gradeStructured(q: StructuredQuestion, answer: any): StructuredGrade {
  if (q.format === 'cloze') {
    const given: string[] = Array.isArray(answer?.answers) ? answer.answers : [];
    const detail = gradeBlankAnswers(q.blanks || [], given);
    const ok = detail.length > 0 && detail.every(Boolean);
    return ok ? { correct: true, feedback: 'Every term is right.' } : { correct: false, detail, feedback: `${detail.filter(Boolean).length} of ${detail.length} terms are right. Fix the ones marked and check again.` };
  }
  if (q.format === 'diagram') {
    const given: string[] = Array.isArray(answer?.values) ? answer.values : [];
    const detail = gradeBlankAnswers(q.blanks || [], given);
    const ok = detail.length > 0 && detail.every(Boolean);
    return ok ? { correct: true, feedback: 'Every box is right.' } : { correct: false, detail, feedback: `${detail.filter(Boolean).length} of ${detail.length} boxes are right. Fix the ones marked and check again.` };
  }
  if (q.format === 'steps') {
    const lines: string[] = Array.isArray(answer?.lines) ? answer.lines.map((l: unknown) => String(l ?? '')) : [];
    const detail = (q.steps || []).map((st, i) => { const line = norm(lines[i]); return !!line && st.keys.some((k) => { const key = norm(k); return !!key && (line.includes(key) || (key.length >= 5 && line.includes(key.slice(0, -1)))); }); });   // a key also matches its stem: reply / replies
    const ok = detail.length > 0 && detail.every(Boolean);
    return ok ? { correct: true, feedback: 'Every step is there, in order.', reveal: (q.steps || []).map((st, i) => `${i + 1}. ${st.text}`).join(' ') } : { correct: false, detail, feedback: `${detail.filter(Boolean).length} of ${detail.length} steps are right and in the right place. Rework the ones marked.` };
  }
  if (q.format === 'spot_mistake') {
    const picked = Number(answer?.picked);
    const ok = Number.isInteger(picked) && picked === q.errorIndex;
    return ok ? { correct: true, feedback: 'Found it.', reveal: q.correction } : { correct: false, feedback: 'That sentence is actually fine. Read the others again.' };
  }
  if (q.format === 'match') {
    const given: { left: string; right: string }[] = Array.isArray(answer?.matches) ? answer.matches : [];
    const detail = (q.pairs || []).map((p) => given.some((g) => txt(g?.left, 160) === p.left && txt(g?.right, 220) === p.right));
    const ok = detail.every(Boolean);
    return ok ? { correct: true, feedback: 'Every piece fits.' } : { correct: false, detail, feedback: `${detail.filter(Boolean).length} of ${detail.length} pieces fit. The ones that do not have popped back out.` };
  }
  const order: string[] = Array.isArray(answer?.order) ? answer.order.map((s: unknown) => txt(s, 200)) : [];
  const detail = (q.items || []).map((item, i) => order[i] === item);
  const ok = detail.length === order.length && detail.every(Boolean) && order.length === (q.items || []).length;
  return ok ? { correct: true, feedback: 'That is the right order.' } : { correct: false, detail, feedback: `${detail.filter(Boolean).length} of ${detail.length} are in the right place. The rest have dropped back out.` };
}

// A whole stored lesson as the page may see it: every structured question is swapped for its client view.
export function lessonForClient(content: any): any {
  if (!content || typeof content !== 'object') return content;
  const out = { ...content };
  if (isStructured(out.practiceQuestion)) out.practiceQuestion = clientView(out.practiceQuestion);
  if (Array.isArray(out.recallChecks)) out.recallChecks = out.recallChecks.map((c: any) => (isStructured(c) ? clientView(c) : c));
  return out;
}
