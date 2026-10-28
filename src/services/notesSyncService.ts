import { supabaseAdmin } from './supabaseAdmin';

// Per-account storage for the Notes page. The page used to keep its whole tree in the browser's localStorage, so
// notes written on one device were not on another. Each folder, page and problem set is one row (`data` is the
// node exactly as the client holds it, including its position among its siblings); a deleted one is kept as a
// tombstone so another device that still has it learns it was removed instead of putting it back. updated_at is
// stamped here, by the server, so two devices' clocks never decide which edit is newer.
// Pictures live in their own table because a page only holds a key for each one.

export interface SyncedNoteNode { id: string; data: unknown; updatedAt: string; deletedAt: string | null }

export async function listNoteNodes(userId: string): Promise<SyncedNoteNode[]> {
  const out: SyncedNoteNode[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin
      .from('user_notes').select('node_id, data, updated_at, deleted_at').eq('user_id', userId).order('node_id').range(from, from + 999);
    if (error) throw error;
    (data || []).forEach((r) => out.push({ id: r.node_id, data: r.data, updatedAt: r.updated_at, deletedAt: r.deleted_at }));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function pushNoteNodes(userId: string, nodes: { id: string; data: unknown }[], deleted: string[]): Promise<Record<string, string>> {
  const now = new Date().toISOString();
  const stamps: Record<string, string> = {};
  if (nodes.length) {
    const { error } = await supabaseAdmin.from('user_notes').upsert(nodes.map((n) => ({ user_id: userId, node_id: n.id, data: n.data, updated_at: now, deleted_at: null })));
    if (error) throw error;
    nodes.forEach((n) => { stamps[n.id] = now; });
  }
  if (deleted.length) {
    // A deletion is soft: the row is marked deleted and keeps its contents, so a note removed by mistake (or by a device whose copy had been lost) can still be brought back.
    const { data: have, error: e1 } = await supabaseAdmin.from('user_notes').select('node_id').eq('user_id', userId).in('node_id', deleted);
    if (e1) throw e1;
    const exists = new Set((have || []).map((r) => r.node_id));
    const keep = deleted.filter((id) => exists.has(id)), fresh = deleted.filter((id) => !exists.has(id));
    if (keep.length) {
      const { error } = await supabaseAdmin.from('user_notes').update({ updated_at: now, deleted_at: now }).eq('user_id', userId).in('node_id', keep);
      if (error) throw error;
    }
    if (fresh.length) {
      const { error } = await supabaseAdmin.from('user_notes').upsert(fresh.map((id) => ({ user_id: userId, node_id: id, data: null, updated_at: now, deleted_at: now })));
      if (error) throw error;
    }
    deleted.forEach((id) => { stamps[id] = now; });
  }
  return stamps;
}

export async function listNoteImageIds(userId: string): Promise<string[]> {
  const out: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin.from('user_note_images').select('image_id').eq('user_id', userId).order('image_id').range(from, from + 999);
    if (error) throw error;
    (data || []).forEach((r) => out.push(r.image_id));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function saveNoteImage(userId: string, imageId: string, dataUrl: string): Promise<void> {
  const { error } = await supabaseAdmin.from('user_note_images').upsert({ user_id: userId, image_id: imageId, data_url: dataUrl });
  if (error) throw error;
}

export async function getNoteImage(userId: string, imageId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.from('user_note_images').select('data_url').eq('user_id', userId).eq('image_id', imageId).maybeSingle();
  if (error) throw error;
  return data ? data.data_url : null;
}
