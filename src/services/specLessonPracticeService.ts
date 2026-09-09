import { supabaseAdmin } from './supabaseAdmin';
import { MODELS } from './claudeClient';
import { getSpecMicrotopics } from './chainService';
import { PRACTICE_QUESTION_GENERATION_PROMPT } from '../constants/practiceQuestionPrompts';
import { getMarkingStructureNotes, callJSON, PracticeQuestionSummary } from './practiceQuestionService';

const MAX_PICKS_PER_SPEC_LESSON = 3;

export class SpecLessonNotFoundError extends Error {
  constructor() {
    super('spec lesson not found');
    this.name = 'SpecLessonNotFoundError';
  }
}
export class QuestionTypeNotFoundError extends Error {
  constructor() {
    super('question type not found');
    this.name = 'QuestionTypeNotFoundError';
  }
}
export class PicksExhaustedError extends Error {
  constructor() {
    super('all 3 picks for this spec-lesson have been used');
    this.name = 'PicksExhaustedError';
  }
}
export class TypeAlreadyPickedError extends Error {
  constructor() {
    super('this question type has already been picked for this spec-lesson');
    this.name = 'TypeAlreadyPickedError';
  }
}

interface SpecLessonRow {
  subject: string;
  qualification: string;
  exam_board: string | null;
  theme: string;
  subtopic: string;
  concept: string;
  concept_id: string;
}

async function getSpecLessonRow(conceptId: string): Promise<SpecLessonRow | null> {
  const { data, error } = await supabaseAdmin
    .from('spec_lesson_plans')
    .select('subject, qualification, exam_board, theme, subtopic, concept, concept_id')
    .eq('concept_id', conceptId)
    .maybeSingle();
  if (error) throw error;
  return (data as SpecLessonRow) ?? null;
}

interface QuestionTypeRow {
  type_key: string;
  display_label: string;
  command_word: string | null;
  mark_tariff: number;
  mark_scheme_type: string;
  requires_diagram: boolean;
  requires_maths_keyboard: boolean;
  component_split: unknown;
  confirmed: boolean;
  sort_order: number;
}

async function getQuestionTypes(subject: string, qualification: string, examBoard: string): Promise<QuestionTypeRow[]> {
  const { data, error } = await supabaseAdmin
    .from('exam_question_types')
    .select('type_key, display_label, command_word, mark_tariff, mark_scheme_type, requires_diagram, requires_maths_keyboard, component_split, confirmed, sort_order')
    .eq('subject', subject)
    .eq('qualification', qualification)
    .eq('exam_board', examBoard)
    .eq('active', true)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data as QuestionTypeRow[]) || [];
}

interface MarkSchemeStyleRow {
  mark_scheme_style: string;
  component_definitions: unknown;
}

async function getMarkSchemeStyle(subject: string, qualification: string, examBoard: string): Promise<MarkSchemeStyleRow | null> {
  const { data, error } = await supabaseAdmin
    .from('exam_mark_scheme_styles')
    .select('mark_scheme_style, component_definitions')
    .eq('subject', subject)
    .eq('qualification', qualification)
    .eq('exam_board', examBoard)
    .maybeSingle();
  if (error) throw error;
  return (data as MarkSchemeStyleRow) ?? null;
}

export interface AvailableTypesResult {
  markSchemeStyle: string | null;
  componentDefinitions: unknown;
  availableTypes: Array<{
    typeKey: string;
    displayLabel: string;
    commandWord: string | null;
    markTariff: number;
    requiresDiagram: boolean;
    requiresMathsKeyboard: boolean;
  }>;
  // Already-picked questions for THIS student+spec-lesson, in the order
  // they were picked (index 0 = "Question 1 of 3") - persisted, not
  // transient, so navigating away mid-question and back still shows it
  // instead of it looking like a used-up, now-inaccessible pick.
  pickedQuestions: PracticeQuestionSummary[];
  picksUsed: number;
  picksRemaining: number;
}

// Scoped through spec_lesson_practice_picks (user_id + concept_id), NOT a
// plain concept_id lookup on practice_questions - a generated_live row's
// concept_id is shared with every other student practicing the same
// spec-lesson, so filtering by concept_id alone (the way the existing
// authored-bank listPracticeQuestions does) would leak other students'
// own generated questions into this list. picked_at ordering is what
// "Question N of 3" numbering is based on.
async function getPickedQuestions(userId: string, conceptId: string): Promise<PracticeQuestionSummary[]> {
  const { data: picks, error: picksError } = await supabaseAdmin
    .from('spec_lesson_practice_picks')
    .select('question_id')
    .eq('user_id', userId)
    .eq('concept_id', conceptId)
    .order('picked_at', { ascending: true });
  if (picksError) throw picksError;
  const questionIds = (picks || []).map((p) => p.question_id as string).filter(Boolean);
  if (!questionIds.length) return [];

  const { data: questions, error: questionsError } = await supabaseAdmin
    .from('practice_questions')
    .select('id, question_text, mark_tariff, requires_diagram, requires_maths_keyboard, answer_structure_advice, mark_scheme_type, mark_scheme_json, ao_component_split')
    .in('id', questionIds);
  if (questionsError) throw questionsError;
  const questionById = new Map((questions || []).map((q) => [q.id as string, q]));

  const { data: attempts, error: attemptsError } = await supabaseAdmin
    .from('practice_question_attempts')
    .select('question_id, answer_text, mark_awarded, mark_tariff, feedback, conceptual_mistakes, exam_technique_tips, ao_component_marks')
    .eq('user_id', userId)
    .in('question_id', questionIds);
  if (attemptsError) throw attemptsError;
  const attemptByQuestionId = new Map((attempts || []).map((a) => [a.question_id as string, a]));

  // Preserves pick order (questionIds is already picked_at-ordered) - a
  // .select().in() response is not guaranteed to come back in that order.
  return questionIds
    .map((id) => questionById.get(id))
    .filter((row): row is NonNullable<typeof row> => !!row)
    .map((row) => {
      const attempt = attemptByQuestionId.get(row.id as string);
      return {
        id: row.id as string,
        questionText: row.question_text as string,
        markTariff: row.mark_tariff as number,
        requiresDiagram: row.requires_diagram as boolean,
        requiresMathsKeyboard: (row.requires_maths_keyboard as boolean) ?? false,
        answerStructureAdvice: (row.answer_structure_advice as string | null) ?? null,
        isMultipleChoice: row.mark_scheme_type === 'multiple_choice',
        options: row.mark_scheme_type === 'multiple_choice' ? ((row.mark_scheme_json as { options: string[] }).options ?? null) : null,
        aoComponentSplit: (row.ao_component_split as unknown) ?? null,
        priorAttempt: attempt ? {
          answerText: attempt.answer_text as string,
          markAwarded: attempt.mark_awarded as number,
          markTariff: attempt.mark_tariff as number,
          feedback: attempt.feedback as string,
          conceptualMistakes: (attempt.conceptual_mistakes as string | null) ?? null,
          examTechniqueTips: (attempt.exam_technique_tips as string | null) ?? null,
          componentMarks: (attempt.ao_component_marks as Record<string, number> | null) ?? null,
        } : null,
      };
    });
}

export async function getAvailableTypes(userId: string, conceptId: string): Promise<AvailableTypesResult> {
  const specLesson = await getSpecLessonRow(conceptId);
  if (!specLesson) throw new SpecLessonNotFoundError();

  const examBoard = specLesson.exam_board || '';
  const [allTypes, styleRow, picksResult, pickedQuestions] = await Promise.all([
    getQuestionTypes(specLesson.subject, specLesson.qualification, examBoard),
    getMarkSchemeStyle(specLesson.subject, specLesson.qualification, examBoard),
    supabaseAdmin.from('spec_lesson_practice_picks').select('type_key').eq('user_id', userId).eq('concept_id', conceptId),
    getPickedQuestions(userId, conceptId),
  ]);
  if (picksResult.error) throw picksResult.error;

  const pickedTypeKeys = new Set((picksResult.data || []).map((p) => p.type_key as string));
  const picksUsed = pickedTypeKeys.size;
  const picksRemaining = Math.max(0, MAX_PICKS_PER_SPEC_LESSON - picksUsed);

  const availableTypes = picksRemaining === 0
    ? []
    : allTypes
        .filter((t) => !pickedTypeKeys.has(t.type_key))
        .map((t) => ({
          typeKey: t.type_key,
          displayLabel: t.display_label,
          commandWord: t.command_word,
          markTariff: t.mark_tariff,
          requiresDiagram: t.requires_diagram,
          requiresMathsKeyboard: t.requires_maths_keyboard,
        }));

  return {
    markSchemeStyle: styleRow?.mark_scheme_style ?? null,
    componentDefinitions: styleRow?.component_definitions ?? null,
    availableTypes,
    pickedQuestions,
    picksUsed,
    picksRemaining,
  };
}

interface GenerationResult {
  questionText: string;
  markSchemeType: 'points' | 'levels' | 'multiple_choice';
  markSchemeJson: Record<string, unknown>;
  answerStructureAdvice: string | null;
  componentSplit: unknown;
}

function findMicrotopicPoints(microtopics: Awaited<ReturnType<typeof getSpecMicrotopics>>, subtopic: string): string[] | null {
  if (!microtopics) return null;
  const wanted = subtopic.trim().toLowerCase();
  for (const theme of microtopics.themes || []) {
    const match = theme.subtopics.find((s) => s.subtopic.trim().toLowerCase() === wanted);
    if (match) return match.microtopics;
  }
  return null;
}

// Generates ONE live question for this (student, spec-lesson, typeKey),
// enforces the 3-picks-total quota and the one-pick-per-type rule, and
// records both the new practice_questions row and the pick itself.
// callJSON's userId param (see practiceQuestionService.ts) is what meters
// this call against the student's real Locks balance at its actual API
// cost — same mechanism every other metered call in this app already uses,
// nothing new here.
export async function generateSpecLessonPracticeQuestion(userId: string, conceptId: string, typeKey: string): Promise<PracticeQuestionSummary> {
  const specLesson = await getSpecLessonRow(conceptId);
  if (!specLesson) throw new SpecLessonNotFoundError();
  const examBoard = specLesson.exam_board || '';

  const [types, styleRow, picksResult] = await Promise.all([
    getQuestionTypes(specLesson.subject, specLesson.qualification, examBoard),
    getMarkSchemeStyle(specLesson.subject, specLesson.qualification, examBoard),
    supabaseAdmin.from('spec_lesson_practice_picks').select('type_key').eq('user_id', userId).eq('concept_id', conceptId),
  ]);
  if (picksResult.error) throw picksResult.error;

  const questionType = types.find((t) => t.type_key === typeKey);
  if (!questionType) throw new QuestionTypeNotFoundError();

  const pickedTypeKeys = new Set((picksResult.data || []).map((p) => p.type_key as string));
  if (pickedTypeKeys.size >= MAX_PICKS_PER_SPEC_LESSON) throw new PicksExhaustedError();
  if (pickedTypeKeys.has(typeKey)) throw new TypeAlreadyPickedError();

  const microtopics = await getSpecMicrotopics(specLesson.subject, specLesson.qualification, examBoard);
  const microtopicPoints = findMicrotopicPoints(microtopics, specLesson.subtopic);
  const structureNotes = getMarkingStructureNotes(specLesson.subject, specLesson.qualification, examBoard);

  const userContent = [
    `Subject: ${specLesson.subject} | Qualification: ${specLesson.qualification} | Exam board: ${examBoard || 'n/a'}`,
    `Theme: ${specLesson.theme}`,
    `Subtopic: ${specLesson.subtopic}`,
    `Spec-lesson (the exact concept this question must be about): ${specLesson.concept}`,
    microtopicPoints ? `Real syllabus content points for this subtopic: ${JSON.stringify(microtopicPoints)}` : '',
    `Question type: ${questionType.display_label} (command word: ${questionType.command_word || 'n/a'}, mark tariff: ${questionType.mark_tariff}, markSchemeType: ${questionType.mark_scheme_type})`,
    `markSchemeStyle: ${styleRow?.mark_scheme_style || 'unknown'}`,
    questionType.component_split ? `componentSplit for this tariff (use these exact group totals if markSchemeStyle is ao_additive): ${JSON.stringify(questionType.component_split)}` : '',
    structureNotes ? `General marking-structure notes for this subject/board (background context — apply it, don't recite it back): ${structureNotes}` : '',
  ].filter(Boolean).join('\n\n');

  const result = await callJSON<GenerationResult>(PRACTICE_QUESTION_GENERATION_PROMPT, userContent, MODELS.chainGenerationSimple, 0.4, userId);

  const componentSplit = questionType.component_split ?? result.componentSplit ?? null;

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('practice_questions')
    .insert({
      concept_id: conceptId,
      subject: specLesson.subject,
      topic: specLesson.subtopic,
      concept: specLesson.concept,
      qualification: specLesson.qualification,
      exam_board: examBoard || null,
      question_text: result.questionText,
      mark_tariff: questionType.mark_tariff,
      requires_diagram: questionType.requires_diagram,
      mark_scheme_type: result.markSchemeType,
      mark_scheme_json: result.markSchemeJson,
      answer_structure_advice: result.answerStructureAdvice,
      requires_maths_keyboard: questionType.requires_maths_keyboard,
      source: 'generated_live',
      generated_for_user_id: userId,
      type_key: typeKey,
      ao_component_split: componentSplit,
    })
    .select('id')
    .single();
  if (insertError) throw insertError;

  const { error: pickError } = await supabaseAdmin.from('spec_lesson_practice_picks').insert({
    user_id: userId,
    concept_id: conceptId,
    subject: specLesson.subject,
    qualification: specLesson.qualification,
    exam_board: examBoard || null,
    type_key: typeKey,
    question_id: inserted.id,
  });
  if (pickError) {
    // 23505 = unique_violation - a race against another near-simultaneous
    // pick of the SAME type for this spec-lesson. The question row above
    // is already committed and harmless to leave orphaned (same shape as
    // any other generated row) - simplest correct response is to tell the
    // loser of the race it's already been picked, same as
    // submitPracticeAnswer's own race handling.
    if ((pickError as { code?: string }).code === '23505') throw new TypeAlreadyPickedError();
    throw pickError;
  }

  return {
    id: inserted.id as string,
    questionText: result.questionText,
    markTariff: questionType.mark_tariff,
    requiresDiagram: questionType.requires_diagram,
    requiresMathsKeyboard: questionType.requires_maths_keyboard,
    answerStructureAdvice: result.answerStructureAdvice,
    isMultipleChoice: result.markSchemeType === 'multiple_choice',
    options: result.markSchemeType === 'multiple_choice' ? ((result.markSchemeJson as { options: string[] }).options ?? null) : null,
    aoComponentSplit: componentSplit,
    priorAttempt: null,
  };
}
