// A student's own free-standing notes, with no lesson/subject behind them
// at all - see personal_general_notes' own comment. Entirely separate
// from knowledgeMapNotesService.ts's per-node personal notes (that one is
// always tied to a real knowledge_map_nodes row); this is what backs the
// Notes page's own "General notes" section, letting a student write
// something down without ever having added a subject. Never touches the
// Claude API, same as the per-node ones.
import { supabaseAdmin } from './supabaseAdmin';

// Same opaque shape knowledgeMapNotesService.ts's PersonalNoteContent
// uses - the frontend owns this shape, not this service, so a future
// template change never needs a migration here either.
export interface PersonalNoteContent {
  mode: 'freeText' | 'template';
  heading?: string;
  body: string;
  diagram?: unknown;
  sections?: { diagram?: boolean; contrast?: boolean; example?: boolean };
  contrastText?: string;
  exampleText?: string;
  quickNotes?: string;
}

export interface GeneralNoteSummary {
  id: string;
  title: string;
  updatedAt: string;
}

export async function listGeneralNotes(userId: string): Promise<GeneralNoteSummary[]> {
  const { data, error } = await supabaseAdmin
    .from('personal_general_notes')
    .select('id, title, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((r) => ({ id: r.id as string, title: r.title as string, updatedAt: r.updated_at as string }));
}

export async function createGeneralNote(userId: string): Promise<GeneralNoteSummary> {
  const { data, error } = await supabaseAdmin
    .from('personal_general_notes')
    .insert({ user_id: userId, title: 'Untitled note', content: { mode: 'freeText', body: '' } })
    .select('id, title, updated_at')
    .single();
  if (error) throw error;
  return { id: data.id as string, title: data.title as string, updatedAt: data.updated_at as string };
}

export async function getGeneralNote(userId: string, noteId: string): Promise<{ title: string; content: PersonalNoteContent } | null> {
  const { data } = await supabaseAdmin
    .from('personal_general_notes')
    .select('title, content')
    .eq('user_id', userId)
    .eq('id', noteId)
    .maybeSingle();
  if (!data) return null;
  return { title: data.title as string, content: data.content as PersonalNoteContent };
}

export async function saveGeneralNote(userId: string, noteId: string, title: string, content: PersonalNoteContent): Promise<boolean> {
  const { error, count } = await supabaseAdmin
    .from('personal_general_notes')
    .update({ title, content, updated_at: new Date().toISOString() }, { count: 'exact' })
    .eq('user_id', userId)
    .eq('id', noteId);
  if (error) throw error;
  return (count ?? 0) > 0;
}

export async function deleteGeneralNote(userId: string, noteId: string): Promise<boolean> {
  const { error, count } = await supabaseAdmin
    .from('personal_general_notes')
    .delete({ count: 'exact' })
    .eq('user_id', userId)
    .eq('id', noteId);
  if (error) throw error;
  return (count ?? 0) > 0;
}
