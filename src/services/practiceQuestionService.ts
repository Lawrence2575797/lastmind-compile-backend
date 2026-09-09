import { supabaseAdmin } from './supabaseAdmin';
import { callClaudeJSON, MODELS } from './claudeClient';
import { PRACTICE_QUESTION_MARKING_PROMPT } from '../constants/practiceQuestionPrompts';
import { normalizeForPlanMatch } from './chainService';
import { gradeAndRecordReview, ratingFromMarkRatio } from './reviewService';
import { resolveSubjectTriple } from './subjectResolution';

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
  'economics|alevel|aqa': `AQA A-Level Economics marks against four assessment objectives blended together — AO1 (knowledge), AO2 (application), AO3 (analysis), and AO4 (evaluation) — but, unlike some other exam boards, AQA's own mark schemes never split a question's marks into separate named AO amounts; every level descriptor is written as ONE holistic paragraph judged as a whole, with more weight given to analysis and evaluation than to knowledge and application at every tariff. Short "calculate/identify" questions (2 marks) are simple points-based marking. "Explain, using the data" questions (4 marks) use a small banded scale rather than added-up points. "Explain how/why" questions (9 and 15 marks) are levels-based but require NO evaluation at all — a good answer stops at well-developed analysis. Only the biggest essays (25 marks) require genuine evaluation and a supported judgement, and only then does it become the dominant skill being rewarded. Multiple choice (1 mark) questions are simply right or wrong.`,
};

export function getMarkingStructureNotes(subject: string, qualification: string, examBoard: string): string | null {
  const key = `${normalizeForPlanMatch(subject)}|${normalizeForPlanMatch(qualification)}|${normalizeForPlanMatch(examBoard)}`;
  return MARKING_STRUCTURE_NOTES[key] ?? null;
}

// Which node labels within this subject/qualification/exam board the
// student has actually encoded on the knowledge map (any concept_reviews
// row against that node's own concept_id) - the real exam mark scheme a
// practice question is marked against is broader than LastMind's own
// lesson coverage, so the marking prompt needs this to tell "genuinely
// missing from your preparation" apart from "real syllabus content you
// haven't reached here yet" (see PRACTICE_QUESTION_MARKING_PROMPT's own
// rule on this).
async function getCoveredNodeLabels(userId: string, rawSubject: string, rawQualification: string, rawExamBoard: string): Promise<string[]> {
  const { data: reviewRows, error: reviewError } = await supabaseAdmin
    .from('concept_reviews')
    .select('concept_id')
    .eq('user_id', userId);
  if (reviewError) throw reviewError;
  const reviewedConceptIds = new Set((reviewRows || []).map((r) => r.concept_id as string));
  if (!reviewedConceptIds.size) return [];

  // Resolves a misspelled/abbreviated typed triple to the real one it's
  // closest to (see resolveSubjectTriple's own comment) - same fix as
  // getKnowledgeMapForSubject, kept consistent here.
  const { subject, qualification, examBoard } = await resolveSubjectTriple(rawSubject, rawQualification, rawExamBoard);
  const { data: nodeRows, error: nodeError } = await supabaseAdmin
    .from('knowledge_map_nodes')
    .select('label, concept_id')
    .ilike('subject', subject.trim())
    .ilike('qualification', qualification.trim())
    .ilike('exam_board', examBoard.trim());
  if (nodeError) throw nodeError;
  return (nodeRows || [])
    .filter((n) => reviewedConceptIds.has(n.concept_id as string))
    .map((n) => n.label as string);
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

export async function callJSON<T>(systemPrompt: string, userContent: string, model: string, temperature = 0, userId?: string): Promise<T> {
  const raw = await callClaudeJSON({ model, systemPrompt, userContent, temperature, userId });
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

export interface PracticeQuestionMarkingResult {
  markAwarded: number;
  markTariff: number;
  feedback: string;
  conceptualMistakes: string | null;
  examTechniqueTips: string | null;
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
  // Set once this student has already submitted an answer to this
  // question — the frontend renders it read-only (their stored answer,
  // mark, and feedback) instead of a fresh form, since a question can
  // only ever be answered once (see the unique constraint backing
  // submitPracticeAnswer's own re-submission guard below).
  priorAttempt: (PracticeQuestionMarkingResult & { answerText: string }) | null;
}

export async function listPracticeQuestions(conceptId: string, userId: string): Promise<PracticeQuestionSummary[]> {
  const { data, error } = await supabaseAdmin
    .from('practice_questions')
    .select('id, question_text, mark_tariff, requires_diagram, answer_structure_advice, mark_scheme_type, mark_scheme_json')
    .eq('concept_id', conceptId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  const questions = data || [];
  if (!questions.length) return [];

  const { data: attempts, error: attemptsError } = await supabaseAdmin
    .from('practice_question_attempts')
    .select('question_id, answer_text, mark_awarded, mark_tariff, feedback, conceptual_mistakes, exam_technique_tips')
    .eq('user_id', userId)
    .in('question_id', questions.map((q) => q.id));
  if (attemptsError) throw attemptsError;
  const attemptByQuestionId = new Map((attempts || []).map((a) => [a.question_id as string, a]));

  return questions.map((row) => {
    const attempt = attemptByQuestionId.get(row.id as string);
    return {
      id: row.id as string,
      questionText: row.question_text as string,
      markTariff: row.mark_tariff as number,
      isMultipleChoice: row.mark_scheme_type === 'multiple_choice',
      options: row.mark_scheme_type === 'multiple_choice' ? ((row.mark_scheme_json as { options: string[] }).options ?? null) : null,
      requiresDiagram: row.requires_diagram as boolean,
      answerStructureAdvice: (row.answer_structure_advice as string | null) ?? null,
      priorAttempt: attempt ? {
        answerText: attempt.answer_text as string,
        markAwarded: attempt.mark_awarded as number,
        markTariff: attempt.mark_tariff as number,
        feedback: attempt.feedback as string,
        conceptualMistakes: (attempt.conceptual_mistakes as string | null) ?? null,
        examTechniqueTips: (attempt.exam_technique_tips as string | null) ?? null,
      } : null,
    };
  });
}

export class PracticeQuestionNotFoundError extends Error {
  constructor() {
    super('practice question not found');
    this.name = 'PracticeQuestionNotFoundError';
  }
}

// Thrown when this student already has a stored attempt for this question
// — carries that attempt so the route can hand it straight back rather
// than just erroring, since the frontend can render it exactly like a
// fresh result.
export class PracticeQuestionAlreadyAnsweredError extends Error {
  constructor(public existing: PracticeQuestionMarkingResult & { answerText: string }) {
    super('this question has already been answered');
    this.name = 'PracticeQuestionAlreadyAnsweredError';
  }
}

interface MarkingResult {
  mark: number;
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

  // A question can only ever be answered once — check first so a normal
  // double-click just gets handed back what's already stored instead of
  // paying for a second marking call.
  const { data: existing, error: existingError } = await supabaseAdmin
    .from('practice_question_attempts')
    .select('answer_text, mark_awarded, mark_tariff, feedback, conceptual_mistakes, exam_technique_tips')
    .eq('user_id', userId)
    .eq('question_id', questionId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    throw new PracticeQuestionAlreadyAnsweredError({
      answerText: existing.answer_text as string,
      markAwarded: existing.mark_awarded as number,
      markTariff: existing.mark_tariff as number,
      feedback: existing.feedback as string,
      conceptualMistakes: (existing.conceptual_mistakes as string | null) ?? null,
      examTechniqueTips: (existing.exam_technique_tips as string | null) ?? null,
    });
  }

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
    const coveredLabels = await getCoveredNodeLabels(userId, question.subject as string, question.qualification as string, (question.exam_board as string) || '');
    const userContent = [
      `Question (worth ${markTariff} marks): ${question.question_text}`,
      `Mark scheme type: ${question.mark_scheme_type}`,
      `Mark scheme: ${JSON.stringify(question.mark_scheme_json)}`,
      structureNotes ? `General marking structure for this subject/qualification/exam board (background context — apply it, don't recite it back): ${structureNotes}` : '',
      coveredLabels.length
        ? `Concepts this student has already covered in their LastMind lessons for this subject (see rule on this — anything else in the mark scheme is real syllabus content they haven't reached here yet): ${JSON.stringify(coveredLabels)}`
        : `This student has not covered any concepts for this subject in LastMind's lessons yet — treat every mark scheme point they missed as not-yet-covered, not as a gap in their preparation.`,
      `Student's answer: ${answerText}`,
    ].filter(Boolean).join('\n\n');
    const result = await callJSON<MarkingResult>(PRACTICE_QUESTION_MARKING_PROMPT, userContent, MODELS.simpleQuestion, 0, userId);
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
  if (insertError) {
    // 23505 = unique_violation - two near-simultaneous submits (e.g. a
    // double-click, or two open tabs) both passed the check above; the
    // unique (user_id, question_id) constraint is what actually decides
    // the race. Whichever loses just gets handed back the winner's
    // stored result, same as a normal repeat visit.
    if ((insertError as { code?: string }).code === '23505') {
      const { data: existingAfterRace, error: raceLookupError } = await supabaseAdmin
        .from('practice_question_attempts')
        .select('answer_text, mark_awarded, mark_tariff, feedback, conceptual_mistakes, exam_technique_tips')
        .eq('user_id', userId)
        .eq('question_id', questionId)
        .maybeSingle();
      if (raceLookupError) throw raceLookupError;
      if (existingAfterRace) {
        throw new PracticeQuestionAlreadyAnsweredError({
          answerText: existingAfterRace.answer_text as string,
          markAwarded: existingAfterRace.mark_awarded as number,
          markTariff: existingAfterRace.mark_tariff as number,
          feedback: existingAfterRace.feedback as string,
          conceptualMistakes: (existingAfterRace.conceptual_mistakes as string | null) ?? null,
          examTechniqueTips: (existingAfterRace.exam_technique_tips as string | null) ?? null,
        });
      }
    }
    throw insertError;
  }

  // Every other graded surface in this app feeds FSRS; practice questions
  // never did (concept_id is already on the row via normalizeConceptKey at
  // question-creation time - see create_practice_questions.sql). Graded
  // after the attempt is safely stored, so a race that turns into
  // PracticeQuestionAlreadyAnsweredError above never double-grades this.
  await gradeAndRecordReview(userId, question.concept_id as string, ratingFromMarkRatio(markAwarded, markTariff));

  return { markAwarded, markTariff, feedback, conceptualMistakes, examTechniqueTips };
}
