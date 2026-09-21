import { supabaseAdmin } from './supabaseAdmin';
import { isStructured } from './questionFormats';

// Spaced review draws on every question generated for a lesson, in turn, instead of always reusing one:
// the practice question first, then each recall check. How far along the rotation a student is comes from how many
// times they have already passed the concept (FSRS "reps"), so each review is a different question and format.
// Only lessons in the version-2 format take part; older ones keep the original reworded-question review.
export interface PoolEntry { ref: number; question: any }   // ref -1 = the practice question, otherwise the recallChecks index

// The whole set of questions written for a lesson, in the order they are met: the practice question, then each recall check.
// Encoding uses the first; each later step (the 2-minute recall, further recalls, the Day-1 check, then spaced reviews) takes the
// next one along, wrapping round, so which question a student meets is decided by where they are in the schedule, never at random.
// A practice question that is a draw-the-diagram question cannot be re-asked as a recall, so it stays out.
export function poolOf(content: any): PoolEntry[] {
  const out: PoolEntry[] = [];
  const pq = content?.practiceQuestion;
  if (pq?.questionText && !pq.diagramSpec) out.push({ ref: -1, question: isStructured(pq) ? pq : { ...pq, format: 'free_text' } });
  (Array.isArray(content?.recallChecks) ? content.recallChecks : []).forEach((q: any, i: number) => { if (q?.questionText) out.push({ ref: i, question: q }); });
  return out;
}
// Which question a given step of the schedule asks. Step 0 is encoding; each later step takes the next question along, but never
// one in the same format as the step before it when another format is available, so a student is not handed the same kind of
// puzzle twice running (three spot-the-mistake questions in a row, say).
export function rotationPick(pool: PoolEntry[], step: number): PoolEntry {
  const fmt = (e: PoolEntry) => String(e.question?.format || 'free_text');
  let at = 0;
  for (let s = 1; s <= step; s++) {
    let next = s % pool.length;
    for (let tries = 0; tries < pool.length && fmt(pool[next]) === fmt(pool[at]); tries++) next = (next + 1) % pool.length;
    at = next;
  }
  return pool[at];
}

// The questions used for the IMMEDIATE checks (the one straight after the lesson, then the 2-minute recalls): never open recall, which is
// kept for later (Day-1 and spaced review). For a lesson written before the interactive formats this means the multiple-choice and
// fill-in checks it already has. The first entry is what the check straight after the lesson uses (the page mirrors this when the
// lesson's own practice question is free text), and each recall takes the next one along.
export function immediatePool(content: any): PoolEntry[] {
  const all = poolOf(content);
  const cued = all.filter((e) => String(e.question?.format || 'free_text') !== 'free_text');
  return cued.length ? cued : all;
}

// Questions that can be answered in a feed slide and graded without the multiple-choice or fill-blank widgets.
export const textOrInteractive = (q: any) => isStructured(q) || (q?.format === 'free_text' && !!q.markScheme && !!q.questionText);

export async function reviewPool(nodeId: string): Promise<PoolEntry[] | null> {
  const { data: lesson } = await supabaseAdmin.from('knowledge_map_node_lessons').select('encoding_content').eq('node_id', nodeId).maybeSingle();
  const c = lesson?.encoding_content as any;
  if (!c || c.formatVersion !== 2) return null;
  const pool: PoolEntry[] = [];
  const pq = c.practiceQuestion;
  if (pq?.questionText && !pq.diagramSpec) pool.push({ ref: -1, question: pq });
  (Array.isArray(c.recallChecks) ? c.recallChecks : []).forEach((q: any, i: number) => {
    if (isStructured(q) || (q?.format === 'free_text' && q.questionText && q.markScheme)) pool.push({ ref: i, question: q });
  });
  if (pool.length) {
    // Spaced review may ask for open recall (immediate checks and Day-1 do not): once per cycle the student explains the concept in
    // their own words, graded against the lesson's explanation.
    const { data: node } = await supabaseAdmin.from('knowledge_map_nodes').select('label').eq('id', nodeId).maybeSingle();
    if (node?.label) pool.push({ ref: -2, question: { format: 'free_text', questionText: `In your own words, explain: ${node.label}`, markScheme: c.explanation || '' } });
  }
  return pool.length ? pool : null;
}

export async function pickRotatingQuestion(userId: string, nodeId: string, conceptId: string): Promise<PoolEntry | null> {
  const pool = await reviewPool(nodeId);
  if (!pool) return null;
  const { data: row } = await supabaseAdmin.from('concept_reviews').select('reps').eq('user_id', userId).eq('concept_id', conceptId).maybeSingle();
  const reps = Math.max(0, Number((row as any)?.reps) || 0);
  return pool[reps % pool.length];
}

export async function poolEntry(nodeId: string, ref: number): Promise<PoolEntry | null> {
  const pool = await reviewPool(nodeId);
  return pool?.find((p) => p.ref === ref) || null;
}
