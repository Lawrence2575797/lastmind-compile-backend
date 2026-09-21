import { supabaseAdmin } from './supabaseAdmin';
import { isStructured } from './questionFormats';

// Spaced review draws on every question generated for a lesson, in turn, instead of always reusing one:
// the practice question first, then each recall check. How far along the rotation a student is comes from how many
// times they have already passed the concept (FSRS "reps"), so each review is a different question and format.
// Only lessons in the version-2 format take part; older ones keep the original reworded-question review.
export interface PoolEntry { ref: number; question: any }   // ref -1 = the practice question, otherwise the recallChecks index

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
