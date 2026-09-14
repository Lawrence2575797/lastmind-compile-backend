import { supabaseAdmin } from './supabaseAdmin';

export interface EconomicsDiagramSummary {
  id: string;
  title: string;
  updatedAt: string;
}

export interface EconomicsDiagram extends EconomicsDiagramSummary {
  diagramState: unknown;
}

export class EconomicsDiagramNotFoundError extends Error {
  constructor() {
    super('diagram not found');
    this.name = 'EconomicsDiagramNotFoundError';
  }
}

// Gallery list - title + when it was last touched, newest first. The
// actual diagram_state is left out here deliberately (it can be a real
// amount of JSON per diagram) - only fetched per-diagram via
// getDiagram, once the student actually opens one.
export async function listDiagrams(userId: string): Promise<EconomicsDiagramSummary[]> {
  const { data, error } = await supabaseAdmin
    .from('economics_diagrams')
    .select('id, title, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => ({ id: row.id as string, title: row.title as string, updatedAt: row.updated_at as string }));
}

export async function getDiagram(userId: string, id: string): Promise<EconomicsDiagram> {
  const { data, error } = await supabaseAdmin
    .from('economics_diagrams')
    .select('id, title, updated_at, diagram_state')
    .eq('user_id', userId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new EconomicsDiagramNotFoundError();
  return { id: data.id as string, title: data.title as string, updatedAt: data.updated_at as string, diagramState: data.diagram_state };
}

export async function createDiagram(userId: string, title: string, diagramState: unknown): Promise<EconomicsDiagram> {
  const { data, error } = await supabaseAdmin
    .from('economics_diagrams')
    .insert({ user_id: userId, title, diagram_state: diagramState })
    .select('id, title, updated_at, diagram_state')
    .single();
  if (error) throw error;
  return { id: data.id as string, title: data.title as string, updatedAt: data.updated_at as string, diagramState: data.diagram_state };
}

// title/diagramState both optional - re-saving just the drawing (the
// common case, from the widget's own "Submit diagram" button) shouldn't
// require resending the title too, and vice versa for a pure rename.
export async function updateDiagram(userId: string, id: string, fields: { title?: string; diagramState?: unknown }): Promise<EconomicsDiagram> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (fields.title !== undefined) patch.title = fields.title;
  if (fields.diagramState !== undefined) patch.diagram_state = fields.diagramState;

  const { data, error } = await supabaseAdmin
    .from('economics_diagrams')
    .update(patch)
    .eq('user_id', userId)
    .eq('id', id)
    .select('id, title, updated_at, diagram_state')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new EconomicsDiagramNotFoundError();
  return { id: data.id as string, title: data.title as string, updatedAt: data.updated_at as string, diagramState: data.diagram_state };
}

export async function deleteDiagram(userId: string, id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('economics_diagrams')
    .delete()
    .eq('user_id', userId)
    .eq('id', id);
  if (error) throw error;
}
