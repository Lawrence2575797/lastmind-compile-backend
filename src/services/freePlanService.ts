import { supabaseAdmin } from './supabaseAdmin';
import { isUserPaid } from './authMiddleware';

export class FreePlanLimitError extends Error {
  constructor(public code: 'FREE_MAP_LIMIT' | 'FREE_LESSON_LIMIT', message: string) { super(message); this.name = 'FreePlanLimitError'; }
}

function monthStart(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

export async function assertFreeLessonAvailable(userId: string, nodeId: string): Promise<void> {
  if (await isUserPaid(userId)) return;
  const { data: node, error: nodeError } = await supabaseAdmin.from('knowledge_map_nodes').select('concept_id').eq('id', nodeId).maybeSingle();
  if (nodeError) throw nodeError;
  if (!node) return;
  const { data: already, error: alreadyError } = await supabaseAdmin.from('concept_reviews').select('concept_id').eq('user_id', userId).eq('concept_id', node.concept_id).maybeSingle();
  if (alreadyError) throw alreadyError;
  if (already) return;
  const { data, error } = await supabaseAdmin.from('concept_reviews').select('concept_id').eq('user_id', userId).gte('last_review', monthStart());
  if (error) throw error;
  const learned = new Set((data || []).map((r: any) => r.concept_id));
  if (learned.size >= 3) throw new FreePlanLimitError('FREE_LESSON_LIMIT', 'The Free plan includes three new lessons each month. Upgrade to LastMind+ for unlimited lessons.');
}
