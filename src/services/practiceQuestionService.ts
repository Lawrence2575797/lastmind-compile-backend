import { supabaseAdmin } from './supabaseAdmin';
import { callClaudeJSON, MODELS } from './claudeClient';
import { PRACTICE_QUESTION_MARKING_PROMPT } from '../constants/practiceQuestionPrompts';
import { normalizeForPlanMatch } from './chainService';

// The same general "how marks are awarded" explanation shown to the
// student on the practice-questions page (see MARK_BREAKDOWN_EXPLAINERS
// in learn/index.html) — given to the marking AI too, as background
// framing for how the specific mark_scheme_json for one question fits
// into the exam board's overall assessment structure. Keyed on a
// normalized subject/qualification/examBoard, same reasoning as
// getStoredLessonPlan: free-typed folder fields shouldn't be able to
// silently miss this by whitespace/hyphen/case alone.
const MARKING_STRUCTURE_NOTES: Record<string, string> = {
  'economics|alevel|edexcel': `Edexcel A-Level Economics marks questions in two different ways depending on the mark tariff. Lower-tariff questions (2, 4, and 8 marks) are points-based: separate marks are set aside for accurate knowledge, applying it to the specific context given, building a logical chain of reasoning, and (for 8-markers) weighing it up — each scored on its own and added together. Higher-tariff questions (10, 12, 15, and 25 marks) are levels-based instead: the whole answer is placed into one of several bands based on how well it demonstrates knowledge, application, analysis, and evaluation TOGETHER, not as separately-scored parts — a genuinely strong point on one side does not lift the answer into a higher band if the rest doesn't match it. Multiple choice (1 mark) questions are simply right or wrong.`,
  'psychology|alevel|edexcel': `Edexcel A-Level Psychology marks every question against three assessment objectives: AO1 (knowledge and understanding of theories, studies and concepts), AO2 (application of that knowledge to a specific scenario or piece of evidence), and AO3 (analysis, evaluation, and judgement, including strengths and limitations). Short questions (1-6 marks) are points-based: each named AO is scored on its own, often as an "identify one mark, then justify/explain for a second mark" pattern. Extended-writing questions (8, 12, 16, and 20 marks) are levels-based instead: the whole answer is placed into one of several bands based on how well it blends the required AOs together, not scored as separately-added parts — and on the biggest essays (16 and 20 marks), the mark scheme explicitly caps how many marks pure knowledge (AO1) can contribute, since evaluation (AO3) carries the larger share and must dominate a top-band answer. Multiple choice (1 mark) questions are simply right or wrong.`,
};

function getMarkingStructureNotes(subject: string, qualification: string, examBoard: string): string | null {
  const key = `${normalizeForPlanMatch(subject)}|${normalizeForPlanMatch(qualification)}|${normalizeForPlanMatch(examBoard)}`;
  return MARKING_STRUCTURE_NOTES[key] ?? null;
}

function stripCodeFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}

function extractJsonObject(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return text;
  return text.slice(start, end + 1);
}

async function callJSON<T>(systemPrompt: string, userContent: string, model: string, temperature = 0): Promise<T> {
  const raw = await callClaudeJSON({ model, systemPrompt, userContent, temperature });
  const cleaned = stripCodeFences(raw);
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    try {
      return JSON.parse(extractJsonObject(cleaned)) as T;
    } catch (err) {
      console.error('LastMind: practice question marking call returned invalid JSON.', { raw });
      throw err;
    }
  }
}

export interface PracticeQuestionSummary {
  id: string;
  questionText: string;
  markTariff: number;
  requiresDiagram: boolean;
  answerStructureAdvice: string | null;
  isMultipleChoice: boolean;
  // Only ever populated for a multiple-choice question — the correct
  // option's index is deliberately never included here, only in the
  // full row submitPracticeAnswer reads server-side.
  options: string[] | null;
}

export async function listPracticeQuestions(conceptId: string): Promise<PracticeQuestionSummary[]> {
  const { data, error } = await supabaseAdmin
    .from('practice_questions')
    .select('id, question_text, mark_tariff, requires_diagram, answer_structure_advice, mark_scheme_type, mark_scheme_json')
    .eq('concept_id', conceptId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map((row) => ({
    id: row.id as string,
    questionText: row.question_text as string,
    markTariff: row.mark_tariff as number,
    isMultipleChoice: row.mark_scheme_type === 'multiple_choice',
    options: row.mark_scheme_type === 'multiple_choice' ? ((row.mark_scheme_json as { options: string[] }).options ?? null) : null,
    requiresDiagram: row.requires_diagram as boolean,
    answerStructureAdvice: (row.answer_structure_advice as string | null) ?? null,
  }));
}

export class PracticeQuestionNotFoundError extends Error {
  constructor() {
    super('practice question not found');
    this.name = 'PracticeQuestionNotFoundError';
  }
}

interface MarkingResult {
  mark: number;
  feedback: string;
  conceptualMistakes: string | null;
  examTechniqueTips: string | null;
}

export interface PracticeQuestionMarkingResult {
  markAwarded: number;
  markTariff: number;
  feedback: string;
  conceptualMistakes: string | null;
  examTechniqueTips: string | null;
}

// Marks against whatever mark_scheme_json this specific question was
// batch-generated with (see create_practice_questions.sql) - the AI call
// here only ever applies an already-correct rubric to one answer, never
// invents marking criteria of its own. That's what keeps this cheap
// (Haiku-tier) and reliable compared to generating a rubric from scratch
// on every attempt.
export async function submitPracticeAnswer(userId: string, questionId: string, answerText: string): Promise<PracticeQuestionMarkingResult> {
  const { data: question, error } = await supabaseAdmin
    .from('practice_questions')
    .select('*')
    .eq('id', questionId)
    .maybeSingle();
  if (error) throw error;
  if (!question) throw new PracticeQuestionNotFoundError();

  const markTariff = question.mark_tariff as number;
  let markAwarded: number;
  let feedback: string;
  let conceptualMistakes: string | null = null;
  let examTechniqueTips: string | null = null;

  // A multiple-choice question has one definitively correct option — no
  // AI call needed (or wanted) to grade a lookup. mark_scheme_json for
  // this type is { options: string[], correctIndex: number,
  // explanation: string }; answerText is the option's index as a string.
  if (question.mark_scheme_type === 'multiple_choice') {
    const scheme = question.mark_scheme_json as { correctIndex: number; explanation: string };
    const chosen = Number(answerText);
    const correct = chosen === scheme.correctIndex;
    markAwarded = correct ? markTariff : 0;
    feedback = correct ? `Correct. ${scheme.explanation}` : `Not quite. ${scheme.explanation}`;
  } else {
    const structureNotes = getMarkingStructureNotes(question.subject as string, question.qualification as string, (question.exam_board as string) || '');
    const userContent = [
      `Question (worth ${markTariff} marks): ${question.question_text}`,
      `Mark scheme type: ${question.mark_scheme_type}`,
      `Mark scheme: ${JSON.stringify(question.mark_scheme_json)}`,
      structureNotes ? `General marking structure for this subject/qualification/exam board (background context — apply it, don't recite it back): ${structureNotes}` : '',
      `Student's answer: ${answerText}`,
    ].filter(Boolean).join('\n\n');
    const result = await callJSON<MarkingResult>(PRACTICE_QUESTION_MARKING_PROMPT, userContent, MODELS.simpleQuestion, 0);
    markAwarded = Math.max(0, Math.min(markTariff, Math.round(result.mark)));
    feedback = result.feedback;
    conceptualMistakes = result.conceptualMistakes || null;
    examTechniqueTips = result.examTechniqueTips || null;
  }

  const { error: insertError } = await supabaseAdmin.from('practice_question_attempts').insert({
    user_id: userId,
    question_id: questionId,
    answer_text: answerText,
    mark_awarded: markAwarded,
    mark_tariff: markTariff,
    feedback,
    conceptual_mistakes: conceptualMistakes,
    exam_technique_tips: examTechniqueTips,
  });
  if (insertError) throw insertError;

  return { markAwarded, markTariff, feedback, conceptualMistakes, examTechniqueTips };
}
