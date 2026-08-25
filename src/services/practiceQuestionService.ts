import { supabaseAdmin } from './supabaseAdmin';
import { callClaudeJSON, MODELS } from './claudeClient';
import { PRACTICE_QUESTION_MARKING_PROMPT } from '../constants/practiceQuestionPrompts';

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
}

export interface PracticeQuestionMarkingResult {
  markAwarded: number;
  markTariff: number;
  feedback: string;
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
    const userContent = [
      `Question (worth ${markTariff} marks): ${question.question_text}`,
      `Mark scheme type: ${question.mark_scheme_type}`,
      `Mark scheme: ${JSON.stringify(question.mark_scheme_json)}`,
      `Student's answer: ${answerText}`,
    ].join('\n\n');
    const result = await callJSON<MarkingResult>(PRACTICE_QUESTION_MARKING_PROMPT, userContent, MODELS.simpleQuestion, 0);
    markAwarded = Math.max(0, Math.min(markTariff, Math.round(result.mark)));
    feedback = result.feedback;
  }

  const { error: insertError } = await supabaseAdmin.from('practice_question_attempts').insert({
    user_id: userId,
    question_id: questionId,
    answer_text: answerText,
    mark_awarded: markAwarded,
    mark_tariff: markTariff,
    feedback,
  });
  if (insertError) throw insertError;

  return { markAwarded, markTariff, feedback };
}
