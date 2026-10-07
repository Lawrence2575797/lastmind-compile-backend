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
  conceptId: string;
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
    .select('id, concept_id, subject, qualification, exam_board')
    .eq('id', nodeId)
    .maybeSingle();
  if (error) throw error;
  if (!node || node.subject !== course.subject || node.qualification !== course.qualification || (node.exam_board || '') !== course.examBoard) return null;
  const stageIndex = course.byConcept[node.concept_id as string];
  const stage = course.stages[stageIndex];
  return Number.isInteger(stageIndex) && stage ? { nodeId, conceptId: node.concept_id as string, stageIndex, stage } : null;
}

export function italianAuthoredContent(info: ItalianAuthoredLookup): any | null {
  return derivationContentForStage(info.stage, info.conceptId, italianAuthoredStageKey(info.stageIndex));
}

export function italianAuthoredPayload(key: string): { terms: Stage['terms']; stage: any; languageInputV2: true; languageInputV3: true; languageInputV4: true; languageInputV5: true } | null {
  const index = parseItalianAuthoredStageKey(key);
  const lesson = index === null ? null : course.stages[index];
  return lesson ? { terms: lesson.terms, stage: lesson.stage, languageInputV2: true, languageInputV3: true, languageInputV4: true, languageInputV5: true } : null;
}

export function italianAuthoredConcepts(key: string): string[] {
  const index = parseItalianAuthoredStageKey(key);
  return index === null ? [] : course.stages[index]?.concepts || [];
}

export function italianAuthoredOrder(conceptIds: string[]): string[] | null {
  if (!conceptIds.length || !conceptIds.some((id) => course.byConcept[id] !== undefined)) return null;
  return conceptIds.slice().sort((a, b) => (course.byConcept[a] ?? Number.MAX_SAFE_INTEGER) - (course.byConcept[b] ?? Number.MAX_SAFE_INTEGER));
}

