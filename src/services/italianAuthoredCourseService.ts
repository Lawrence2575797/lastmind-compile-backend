import fs from 'fs';
import path from 'path';
import { supabaseAdmin } from './supabaseAdmin';
import { Stage, derivationContentForStage } from './derivationService';

interface CourseBundle {
  subject: string;
  qualification: string;
  examBoard: string;
  stages: Stage[];
  byConcept: Record<string, number>;
}

// Keep the 561-lesson artifact outside TypeScript's type graph. Importing the
// JSON directly makes tsc materialise every nested literal and needlessly use
// hundreds of MB; reading the already-validated static file once at process
// start has the same runtime result without turning course prose into types.
const coursePath = path.resolve(__dirname, '../../src/data/italianAuthoredCourse.json');
const course = JSON.parse(fs.readFileSync(coursePath, 'utf8')) as CourseBundle;

export interface ItalianAuthoredLookup {
  nodeId: string;
  // The map node's own concept id (what the client and the student's progress are keyed by) ...
  conceptId: string;
  // ... and the authored course's key for it, which is what the stage's terms and script are keyed by. They are the same in some maps and
  // different in others (older custom Italian maps), so the lesson content must be built from this one, never from conceptId.
  nodeKey: string;
  stageIndex: number;
  stage: Stage;
}

export function italianAuthoredStageKey(stageIndex: number): string {
  return `italian-authored:${stageIndex}`;
}

export function parseItalianAuthoredStageKey(key: string): number | null {
  const match = /^italian-authored:(\d+)$/.exec(key);
  return match ? Number(match[1]) : null;
}

export async function italianAuthoredLookup(nodeId: string): Promise<ItalianAuthoredLookup | null> {
  const { data: node, error } = await supabaseAdmin
    .from('knowledge_map_nodes')
    .select('id, node_key, concept_id, subject, qualification, exam_board')
    .eq('id', nodeId)
    .maybeSingle();
  if (error) throw error;
  // The same authored Italian curriculum can appear in an older custom map,
  // an imported CEFR map, or the current `Other` map. The node key is the
  // stable curriculum identity; qualification/exam-board labels are folder
  // metadata and must not decide whether a student receives the checked
  // lesson or an older generated one.
  if (!node || String(node.subject).trim().toLowerCase() !== course.subject.toLowerCase()) return null;
  const stageIndex = course.byConcept[node.node_key as string];
  const stage = course.stages[stageIndex];
  return Number.isInteger(stageIndex) && stage ? { nodeId, conceptId: node.concept_id as string, nodeKey: node.node_key as string, stageIndex, stage } : null;
}

export function italianAuthoredContent(info: ItalianAuthoredLookup): any | null {
  const content = derivationContentForStage(info.stage, info.nodeKey, italianAuthoredStageKey(info.stageIndex));
  if (!content) return null;
  // A written lesson carries its own plain questions ("How do you say “Monday” in Italian?") and its own teaching card. Use those for the
  // stored lesson text and for the questions kept for later review, instead of the generic ones built from the card.
  const stage = info.stage.stage as any;
  const read = (stage.script || []).find((x: any) => x.type === 'read');
  const recall = Array.isArray(stage.recall) ? stage.recall.filter((r: any) => r && typeof r.q === 'string' && typeof r.a === 'string') : [];
  if (!recall.length) return content;
  const checks = recall.map((r: any) => ({ format: 'free_text', questionText: r.q, markScheme: r.a }));
  return {
    ...content,
    explanation: read && typeof read.text === 'string' ? read.text : content.explanation,
    practiceQuestion: checks[0],
    recallChecks: checks,
  };
}

export function italianAuthoredPayload(key: string): { terms: Stage['terms']; stage: any; languageInputV2: true; languageInputV3: true; languageInputV4: true; languageInputV5: true } | null {
  const index = parseItalianAuthoredStageKey(key);
  const lesson = index === null ? null : course.stages[index];
  return lesson ? { terms: lesson.terms, stage: lesson.stage, languageInputV2: true, languageInputV3: true, languageInputV4: true, languageInputV5: true } : null;
}

export async function italianAuthoredConcepts(key: string): Promise<string[]> {
  const index = parseItalianAuthoredStageKey(key);
  const nodeKeys = index === null ? [] : course.stages[index]?.concepts || [];
  if (!nodeKeys.length) return [];
  const { data, error } = await supabaseAdmin
    .from('knowledge_map_nodes')
    .select('node_key, concept_id')
    .ilike('subject', course.subject)
    .in('node_key', nodeKeys);
  if (error) throw error;
  const byNodeKey = new Map((data || []).map((row) => [row.node_key as string, row.concept_id as string]));
  return nodeKeys.map((nodeKey) => byNodeKey.get(nodeKey)).filter((id): id is string => !!id);
}

export function italianAuthoredOrder(nodeKeys: string[]): string[] | null {
  if (!nodeKeys.length || !nodeKeys.some((id) => course.byConcept[id] !== undefined)) return null;
  return nodeKeys.slice().sort((a, b) => (course.byConcept[a] ?? Number.MAX_SAFE_INTEGER) - (course.byConcept[b] ?? Number.MAX_SAFE_INTEGER));
}

