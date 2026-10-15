import { supabaseAdmin } from './supabaseAdmin';

// Per-account sync for the frontend's folder tree (subject folders ->
// subfolders -> pages, one denormalized JSON blob per top-level folder —
// see learn/index.html's IndexedDB layer, which this mirrors 1:1). Each row
// is one folder; `data` is that folder's exact JSON blob as the client
// would write it to IndexedDB, `folder_id` is the client-generated UUID
// (folder.id), and `updated_at` is the client's own last-write timestamp
// (not a server-assigned one) so last-write-wins comparisons on the client
// are comparing against the same clock basis it wrote with.
//
// Deletion is a soft delete (deleted_at set, data cleared) rather than a
// row DELETE — a hard delete would leave no trace for another device's
// reconcile pass to learn "this was removed" from, so a stale device would
// just resurrect it on its next sync. The tombstone IS the signal; clearing
// `data` on delete also means the actual content doesn't linger server-side
// once the student has deleted it, only the fact that it once existed here.

export interface SyncedFolder {
  folderId: string;
  data: unknown;
  updatedAt: string;
  deletedAt: string | null;
}

export async function listUserFolders(userId: string): Promise<SyncedFolder[]> {
  const { data, error } = await supabaseAdmin
    .from('user_folders')
    .select('folder_id, data, updated_at, deleted_at')
    .eq('user_id', userId);
  if (error) throw error;
  return (data || []).map((row) => ({ folderId: row.folder_id, data: row.data, updatedAt: row.updated_at, deletedAt: row.deleted_at }));
}

// Clears deleted_at on every upsert — the only way that could matter is a
// folder being recreated under an id that was previously tombstoned, which
// shouldn't normally happen (new folders always get a fresh UUID) but
// costs nothing to handle defensively rather than leave a live folder
// stuck looking deleted.
export async function upsertUserFolder(userId: string, folderId: string, data: unknown, updatedAt: string): Promise<void> {
  await keepVersion(userId, folderId, data);
  const { error } = await supabaseAdmin
    .from('user_folders')
    .upsert({ user_id: userId, folder_id: folderId, data, updated_at: updatedAt, deleted_at: null });
  if (error) throw error;
}

// Version history: before a folder's blob is replaced (by an edit, or by a stale device syncing over it) or tombstoned, the blob being
// replaced is kept in user_folder_versions - at most one per 10 minutes per folder, newest 40 kept - so a page that vanishes can be
// brought back. Best-effort: if the table is missing or the write fails, syncing carries on exactly as before.
const VERSION_GAP_MS = 10 * 60 * 1000;
const VERSIONS_KEPT = 40;
async function keepVersion(userId: string, folderId: string, incoming: unknown | null): Promise<void> {
  try {
    const { data: cur } = await supabaseAdmin.from('user_folders').select('data, updated_at').eq('user_id', userId).eq('folder_id', folderId).maybeSingle();
    if (!cur || !cur.data) return;
    if (incoming !== null && JSON.stringify(incoming) === JSON.stringify(cur.data)) return;
    const { data: last } = await supabaseAdmin.from('user_folder_versions').select('saved_at').eq('user_id', userId).eq('folder_id', folderId).order('saved_at', { ascending: false }).limit(1);
    if (incoming !== null && last && last[0] && Date.now() - new Date(last[0].saved_at).getTime() < VERSION_GAP_MS) return;
    await supabaseAdmin.from('user_folder_versions').insert({ user_id: userId, folder_id: folderId, data: cur.data, folder_updated_at: cur.updated_at });
    const { data: old } = await supabaseAdmin.from('user_folder_versions').select('id').eq('user_id', userId).eq('folder_id', folderId).order('saved_at', { ascending: false }).range(VERSIONS_KEPT, VERSIONS_KEPT + 200);
    if (old && old.length) await supabaseAdmin.from('user_folder_versions').delete().in('id', old.map((r: { id: number }) => r.id));
  } catch (err) {
    console.error('Folder version keep failed (sync continues):', err);
  }
}

export async function deleteUserFolder(userId: string, folderId: string): Promise<void> {
  await keepVersion(userId, folderId, null);
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from('user_folders')
    .upsert({ user_id: userId, folder_id: folderId, data: null, updated_at: now, deleted_at: now });
  if (error) throw error;
}
