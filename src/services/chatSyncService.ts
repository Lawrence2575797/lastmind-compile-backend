import { supabaseAdmin } from './supabaseAdmin';

// Per-account sync for Cortex's chat sessions - mirrors folderSyncService.ts
// exactly (same table shape, same last-write-wins/tombstone design), for the
// same reason: chat sessions used to live ONLY in IndexedDB (see cortex/
// index.html's loadSessions/saveSessions and learn/index.html's
// renameChatSession/deleteChatSession, all against the same local
// 'cortexChatSessions' key), so a chat started on one device simply didn't
// exist on another - a real, reported bug, not a design choice. `data` is
// the session's exact { id, title, createdAt, updatedAt, messages } blob as
// the client would write it locally; `chat_id` is the client-generated
// session id; `updated_at` is the client's own last-write timestamp, so
// last-write-wins comparisons on the client compare against the same clock
// basis it wrote with.
//
// Deletion is a soft delete (deleted_at set, data cleared) rather than a row
// DELETE, for the same reason as folders: a hard delete would leave no trace
// for another device's reconcile pass to learn "this was removed" from, so a
// stale device would just resurrect it on its next sync.

export interface SyncedChatSession {
  chatId: string;
  data: unknown;
  updatedAt: string;
  deletedAt: string | null;
}

export async function listUserChatSessions(userId: string): Promise<SyncedChatSession[]> {
  const { data, error } = await supabaseAdmin
    .from('user_chat_sessions')
    .select('chat_id, data, updated_at, deleted_at')
    .eq('user_id', userId);
  if (error) throw error;
  return (data || []).map((row) => ({ chatId: row.chat_id, data: row.data, updatedAt: row.updated_at, deletedAt: row.deleted_at }));
}

export async function upsertUserChatSession(userId: string, chatId: string, data: unknown, updatedAt: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('user_chat_sessions')
    .upsert({ user_id: userId, chat_id: chatId, data, updated_at: updatedAt, deleted_at: null });
  if (error) throw error;
}

export async function deleteUserChatSession(userId: string, chatId: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from('user_chat_sessions')
    .upsert({ user_id: userId, chat_id: chatId, data: null, updated_at: now, deleted_at: now });
  if (error) throw error;
}
