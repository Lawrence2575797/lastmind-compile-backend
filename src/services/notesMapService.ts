import { createHash } from 'crypto';
import { supabaseAdmin } from './supabaseAdmin';
import { callClaudeJSON, MODELS } from './claudeClient';
import { parseModelJson } from './jsonParsing';
import { gradeAndRecordReview } from './reviewService';
import { scheduleDay1Check } from './day1CheckService';
import { normaliseLessonQuestions } from './lessonGenerationService';
import { NOTES_MAP_PROMPT } from '../constants/notesMapPrompt';

// The student's own notes, mapped onto the same knowledge map as every subject. Each concept found in a page becomes a node (so it shows
// up in Your Mind, clickable, with its own lesson and spaced reviews); concepts that a page builds in order are joined by edges.
//
// Nodes live under a qualification of their own ('Notes') with the student's own token as the exam board, so nothing here can be seen by
// another student and nothing else treats them as a curriculum subject. A node is created "learned" with a first FSRS grade and a Day-1
// check, which is exactly the point a concept reaches once a lesson has been finished: the spaced reviews that follow are the ordinary ones.
// No same-day immediate recall is scheduled, so the first check is a day later.

export const NOTES_QUALIFICATION = 'Notes';

const clean = (s: string) => (s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const boardFor = (userId: string) => 'n' + createHash('sha256').update(userId).digest('hex').slice(0, 12);
const safeSubject = (folder: string) => {
  const f = (folder || '').replace(/[^A-Za-z0-9 .,'&()+-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
  return f ? `Notes · ${f}` : 'Notes';
};

export interface NotesPageIn { id: string; title: string; folder: string; text: string }
export interface NotesSyncResult { pages: number; created: number; updated: number; skipped: number }

interface RawConcept { key?: string; label?: string; cards?: any[]; question?: any; checks?: any[]; requires?: string[] }

async function extractConcepts(page: NotesPageIn, userId: string): Promise<RawConcept[]> {
  const userContent = `Page title: ${page.title || 'Untitled'}\n\nThe student's notes:\n"""\n${page.text}\n"""`;
  const raw = await callClaudeJSON({ model: MODELS.chat, systemPrompt: NOTES_MAP_PROMPT, userContent, maxTokens: 3200, temperature: 0.2, userId, meteredReason: 'notes-map-extract' });
  const parsed = parseModelJson<{ concepts?: RawConcept[] }>(raw);
  const list: RawConcept[] = (parsed && Array.isArray(parsed.concepts) ? parsed.concepts : []) as RawConcept[];
  const seen = new Set<string>();
  return list.slice(0, 6).filter((c) => {
    const k = clean(String((c && c.key) || (c && c.label) || ''));
    if (!k || seen.has(k) || !c.label || !Array.isArray(c.cards) || !c.cards.length || !c.question || !c.question.questionText) return false;
    seen.add(k); c.key = k; return true;
  });
}

const lessonContent = (c: RawConcept) => normaliseLessonQuestions({
  teachingCards: c.cards,
  practiceQuestion: { format: 'free_text', questionText: String(c.question.questionText), markScheme: String(c.question.markScheme || '') },
  recallChecks: Array.isArray(c.checks) ? c.checks : [],
}, String(c.label));

export async function syncNotesToMap(userId: string, pages: NotesPageIn[]): Promise<NotesSyncResult> {
  const board = boardFor(userId);
  const out: NotesSyncResult = { pages: 0, created: 0, updated: 0, skipped: 0 };
  for (const page of pages) {
    let concepts: RawConcept[];
    try { concepts = await extractConcepts(page, userId); } catch (err) { console.error('Notes map extraction failed:', err); out.skipped++; continue; }
    if (!concepts.length) { out.skipped++; continue; }
    out.pages++;
    const subject = safeSubject(page.folder);
    const pageKey = clean(page.id).slice(0, 14);
    const rows = concepts.map((c) => {
      const nodeKey = `${pageKey}_${clean(String(c.key))}`.slice(0, 60);
      return { c, row: { concept_id: `notes:${board}:${nodeKey}`, subject, qualification: NOTES_QUALIFICATION, exam_board: board, owner_user_id: userId, node_key: nodeKey, label: String(c.label).trim().slice(0, 80), subtopic: (page.title || 'Notes').slice(0, 80), theme: null, difficulty: null } };
    });
    const { data: existing, error: exErr } = await supabaseAdmin.from('knowledge_map_nodes').select('id, concept_id').in('concept_id', rows.map((r) => r.row.concept_id));
    if (exErr) { console.error('Notes map lookup failed:', exErr); out.skipped++; continue; }
    const idByConcept = new Map<string, string>((existing || []).map((r: any) => [r.concept_id as string, r.id as string] as [string, string]));
    const fresh = rows.filter((r) => !idByConcept.has(r.row.concept_id));
    if (fresh.length) {
      const { data: inserted, error: insErr } = await supabaseAdmin.from('knowledge_map_nodes').insert(fresh.map((r) => r.row)).select('id, concept_id');
      if (insErr) { console.error('Notes map insert failed:', insErr); out.skipped++; continue; }
      (inserted || []).forEach((r: any) => idByConcept.set(r.concept_id as string, r.id as string));
    }
    // The lesson for every concept (new or already there) follows the latest notes; grading only happens for a new one.
    for (const r of rows) {
      const nodeId = idByConcept.get(r.row.concept_id); if (!nodeId) continue;
      const { error } = await supabaseAdmin.from('knowledge_map_node_lessons').upsert({ node_id: nodeId, encoding_content: lessonContent(r.c) }, { onConflict: 'node_id' });
      if (error) console.error('Notes map lesson write failed:', error);
    }
    // Edges: the concepts of one page that build on each other, in the order the model gave.
    const nodeIds = rows.map((r) => idByConcept.get(r.row.concept_id)).filter(Boolean) as string[];
    const { data: haveEdges } = await supabaseAdmin.from('knowledge_map_edges').select('from_node_id, to_node_id').in('from_node_id', nodeIds);
    const haveKey = new Set((haveEdges || []).map((e: any) => `${e.from_node_id}>${e.to_node_id}`));
    const edgeRows: { from_node_id: string; to_node_id: string }[] = [];
    rows.forEach((r) => {
      const to = idByConcept.get(r.row.concept_id);
      (Array.isArray(r.c.requires) ? r.c.requires : []).forEach((k) => {
        const fromRow = rows.find((x) => x.c.key === clean(String(k)));
        const from = fromRow && idByConcept.get(fromRow.row.concept_id);
        if (from && to && from !== to && !haveKey.has(`${from}>${to}`)) { haveKey.add(`${from}>${to}`); edgeRows.push({ from_node_id: from, to_node_id: to }); }
      });
    });
    if (edgeRows.length) { const { error } = await supabaseAdmin.from('knowledge_map_edges').insert(edgeRows); if (error) console.error('Notes map edge write failed:', error); }
    // A new concept is "learned" from the moment it is on the map: first grade, then the Day-1 check.
    for (const r of fresh) {
      try { await gradeAndRecordReview(userId, r.row.concept_id, 'good'); await scheduleDay1Check(userId, r.row.concept_id); out.created++; }
      catch (err) { console.error('Notes map first grade failed:', err); }
    }
    out.updated += rows.length - fresh.length;
  }
  return out;
}

// A node on the student's own notes: served from what was written for it, never generated again as a curriculum lesson.
export async function notesNodeLesson(nodeId: string): Promise<any | null> {
  const { data: node } = await supabaseAdmin.from('knowledge_map_nodes').select('qualification').eq('id', nodeId).maybeSingle();
  if (!node || node.qualification !== NOTES_QUALIFICATION) return null;
  const { data } = await supabaseAdmin.from('knowledge_map_node_lessons').select('encoding_content').eq('node_id', nodeId).maybeSingle();
  return data ? data.encoding_content : null;
}
