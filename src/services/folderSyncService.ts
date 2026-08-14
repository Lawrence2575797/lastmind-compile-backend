import { supabaseAdmin } from './supabaseAdmin';

// Per-account sync for the frontend's folder tree (subject folders ->
// subfolders -> pages, one denormalized JSON blob per top-level folder —
// see learn/index.html's IndexedDB layer, which this mirrors 1:1). Each row
// is one folder; `data` is that folder's exact JSON blob as the client
// would write it to IndexedDB, `folder_id` is the client-generated UUID
// (folder.id), and `updated_at` is the client's own last-write timestamp
// (not a server-assigned one) so last-write-wins comparisons on the client
// are comparing against the same clock basis it wrote with.

export interface SyncedFolder {
  folderId: string;
  data: unknown;
  updatedAt: string;
}

export async function listUserFolders(userId: string): Promise<SyncedFolder[]> {
  const { data, error } = await supabaseAdmin
    .from('user_folders')
    .select('folder_id, data, updated_at')
    .eq('user_id', userId);
  if (error) throw error;
  return (data || []).map((row) => ({ folderId: row.folder_id, data: row.data, updatedAt: row.updated_at }));
}

export async function upsertUserFolder(userId: string, folderId: string, data: unknown, updatedAt: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('user_folders')
    .upsert({ user_id: userId, folder_id: folderId, data, updated_at: updatedAt });
  if (error) throw error;
}

export async function deleteUserFolder(userId: string, folderId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('user_folders')
    .delete()
    .eq('user_id', userId)
    .eq('folder_id', folderId);
  if (error) throw error;
}
