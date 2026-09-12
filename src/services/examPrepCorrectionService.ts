import { supabaseAdmin } from './supabaseAdmin';
import { callClaudeJSON, MODELS } from './claudeClient';
import { EXAM_PREP_CORRECTION_PROMPT } from '../constants/practiceQuestionPrompts';
import { gradeAndRecordReview, ratingFromMarkRatio } from './reviewService';

interface CorrectionGeneration {
  explanation: string;
  followupQuestion: string;
  followupMarkScheme: string;
}

// Deliberately not imported from practiceQuestionService.ts's own callJSON
// - that file now imports generateCorrectionForAttempt FROM this one, and
// importing back would create a circular module dependency between the
// two. This is the same few lines duplicated, not worth restructuring
// either file's module boundary just to share one small JSON-parsing
// wrapper.
async function callJSON<T>(systemPrompt: string, userContent: string, model: string, temperature: number, userId: string): Promise<T> {
  const raw = await callClaudeJSON({ model, systemPrompt, userContent, temperature, userId });
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  return JSON.parse(cleaned) as T;
}

// Fire-and-forget from submitPracticeAnswer, right after a graded attempt
// that lost marks to a genuine conceptual mistake is safely stored - never
// awaited by the grading request itself (the student's own immediate
// feedback shouldn't wait on a second AI call), so a failure here is
// logged and simply means no correction shows up for this attempt, not a
// failed submission.
export async function generateCorrectionForAttempt(
  userId: string,
  attemptId: string,
  subject: string,
  questionText: string,
  answerText: string,
  mistakeText: string
): Promise<void> {
  const userContent = [
    `Original question: ${questionText}`,
    `Student's answer: ${answerText}`,
    `The marker's identified conceptual mistake: ${mistakeText}`,
  ].join('\n\n');

  const result = await callJSON<CorrectionGeneration>(EXAM_PREP_CORRECTION_PROMPT, userContent, MODELS.simpleQuestion, 0.2, userId);

  const { error } = await supabaseAdmin.from('exam_prep_corrections').insert({
    user_id: userId,
    attempt_id: attemptId,
    subject,
    original_question_text: questionText,
    mistake_text: mistakeText,
    correction_explanation: result.explanation,
    followup_question_text: result.followupQuestion,
    followup_mark_scheme: result.followupMarkScheme,
  });
  if (error) throw error;
}

export interface ExamPrepCorrection {
  id: string;
  subject: string;
  originalQuestionText: string;
  mistakeText: string;
  correctionExplanation: string;
  followupQuestionText: string;
  createdAt: string;
}

// Oldest-first, unresolved only - "presented in the order corrected" per
// the overnight spec. followupMarkScheme is deliberately never returned
// here (it's grading-only, looked up fresh server-side in
// submitCorrectionAnswer) - same never-trust-the-client discipline as
// every other mark scheme in this app.
export async function listUnresolvedCorrections(userId: string): Promise<ExamPrepCorrection[]> {
  const { data, error } = await supabaseAdmin
    .from('exam_prep_corrections')
    .select('id, subject, original_question_text, mistake_text, correction_explanation, followup_question_text, created_at')
    .eq('user_id', userId)
    .eq('resolved', false)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map((row) => ({
    id: row.id as string,
    subject: row.subject as string,
    originalQuestionText: row.original_question_text as string,
    mistakeText: row.mistake_text as string,
    correctionExplanation: row.correction_explanation as string,
    followupQuestionText: row.followup_question_text as string,
    createdAt: row.created_at as string,
  }));
}

export class ExamPrepCorrectionNotFoundError extends Error {}

// Same simple correct/incorrect grading pattern the rest of this app's
// practice questions use - no partial credit, retry until right. A
// correction can never be "failed", only retried, matching the overnight
// spec's "lessons/spaced repetition can never be failed" rule applied
// here too.
export async function submitCorrectionAnswer(userId: string, correctionId: string, answerText: string): Promise<{ correct: boolean; feedback: string }> {
  const { data: correction, error } = await supabaseAdmin
    .from('exam_prep_corrections')
    .select('id, user_id, followup_question_text, followup_mark_scheme, resolved, attempt_id')
    .eq('id', correctionId)
    .maybeSingle();
  if (error) throw error;
  if (!correction || correction.user_id !== userId) throw new ExamPrepCorrectionNotFoundError();
  if (correction.resolved) return { correct: true, feedback: 'Already resolved.' };

  const raw = await callClaudeJSON({
    model: MODELS.simpleQuestion,
    systemPrompt: 'You are checking a UK GCSE/A-Level student\'s free-text answer against a mark scheme. Output ONLY valid JSON: { "correct": boolean, "feedback": "one or two sentences" }. Mark correct only if the answer genuinely satisfies the mark scheme as stated - be precise, not lenient.',
    userContent: `Question: ${correction.followup_question_text}\nMark scheme: ${correction.followup_mark_scheme}\nStudent's answer: ${answerText}`,
    temperature: 0.1,
    userId,
  });
  const parsed = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')) as { correct: boolean; feedback: string };

  if (parsed.correct) {
    const { error: updateError } = await supabaseAdmin
      .from('exam_prep_corrections')
      .update({ resolved: true })
      .eq('id', correctionId);
    if (updateError) throw updateError;

    // Best-effort - a correction resolving successfully is a genuine
    // recall win worth reflecting in FSRS if this attempt's own concept_id
    // is resolvable, but this is additive polish, not something a
    // correction's own success should ever be blocked on.
    try {
      const { data: attempt } = await supabaseAdmin
        .from('practice_question_attempts')
        .select('question_id')
        .eq('id', correction.attempt_id)
        .maybeSingle();
      if (attempt) {
        const { data: question } = await supabaseAdmin
          .from('practice_questions')
          .select('concept_id')
          .eq('id', attempt.question_id)
          .maybeSingle();
        if (question) await gradeAndRecordReview(userId, question.concept_id as string, ratingFromMarkRatio(1, 1));
      }
    } catch (err) {
      console.error('Exam Prep correction: best-effort FSRS update failed.', err);
    }
  }

  return { correct: parsed.correct, feedback: parsed.feedback };
}
