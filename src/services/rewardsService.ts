import { supabaseAdmin } from './supabaseAdmin';

// Data-driven on purpose — adding, editing, or retiring a reward is a
// content change, not a code change: it's a plain INSERT/UPDATE/toggling
// `active` on this table directly (Supabase's own table editor is enough
// for this today, no custom admin UI needed yet). The frontend's
// renderKeyMarketGrid just renders whatever this returns.
export interface Reward {
  id: string;
  icon: string;
  title: string;
  description: string;
  costKeys: number;
  category: string | null;
}

function rowToReward(row: any): Reward {
  return {
    id: row.id,
    icon: row.icon,
    title: row.title,
    description: row.description,
    costKeys: row.cost_keys,
    category: row.category,
  };
}

export async function listActiveRewards(): Promise<Reward[]> {
  const { data, error } = await supabaseAdmin
    .from('rewards')
    .select('id, icon, title, description, cost_keys, category')
    .eq('active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(rowToReward);
}
