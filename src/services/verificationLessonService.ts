import { supabaseAdmin } from './supabaseAdmin';
import { callClaudeJSON, MODELS } from './claudeClient';
import { normalizeConceptKey, customContextDigest } from './chainService';
import { gradeAndRecordReview, getMasteryStatus, DURABLE_RELEARNING_CRITERION, FsrsRatingKey } from './reviewService';
import {
  VERIFICATION_RUBRIC_GENERATION_PROMPT,
  VERIFICATION_FREE_TEXT_GRADE_PROMPT,
  VERIFICATION_CORRECTION_PROMPT,
  VERIFICATION_FILL_GAP_PROMPT,
  VERIFICATION_ORDER_WORDS_PROMPT,
} from '../constants/verificationPrompts';

function stripCodeFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}

function extractJsonObject(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return text;
  return text.slice(start, end + 1);
}

async function callJSON<T>(systemPrompt: string, userContent: string, model: string, temperature = 0, maxTokens?: number, cacheSystemPrompt = false): Promise<T> {
  const raw = await callClaudeJSON({ model, systemPrompt, userContent, temperature, maxTokens, cacheSystemPrompt });
  const cleaned = stripCodeFences(raw);
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    try {
      return JSON.parse(extractJsonObject(cleaned)) as T;
    } catch (err) {
      console.error('LastMind: verification call returned invalid JSON.', { raw });
      throw err;
    }
  }
}

function clean(s: string): string {
  return (s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

// Confidence below this on the cheap Haiku pass triggers a re-grade on
// Sonnet rather than trusting the cheap verdict — placeholder, tunable once
// real grading behavior can be observed against actual student answers (see
// the plan's own "I want to see how well this works" framing).
const GRADE_CONFIDENCE_ESCALATION_THRESHOLD = 0.7;

export interface VerificationRubric {
  mechanismSteps: string[];
  requiredLinks: string[];
  requiredDefinitions: string[];
}

export type StructuredFollowUp =
  | { type: 'fill_gap'; sentence: string; answer: string; acceptableVariants: string[] }
  | { type: 'order_words'; shuffledSteps: string[]; correctOrder: number[] };

// startPoint is safe to state directly (the given premise). endPointVariable
// is deliberately phrased as a neutral quantity/question, never the resolved
// direction — e.g. "the effect on interest rates", never "interest rates
// rise" — see VERIFICATION_RUBRIC_GENERATION_PROMPT's own rule on this;
// stating the direction would hand over exactly what the student is
// supposed to derive for themselves.
export interface VerificationScenario {
  context: string;
  startPoint: string;
  endPointVariable: string;
}

function buildRubricKey(subject: string, topic: string, concept: string, qualification: string, examBoard: string, customTitle = '', customDescription = ''): string {
  const conceptKey = normalizeConceptKey(subject, topic, concept);
  const customDigest = customContextDigest(customTitle, customDescription);
  const customSuffix = customDigest ? `::custom_${customDigest}` : '';
  return `${conceptKey}::${clean(qualification)}::${clean(examBoard)}${customSuffix}`;
}

/**
 * Generates a verification rubric + rotating scenario set ONCE per concept
 * — mirrors encodingLessonService.ts's fetchExpectedSolution/
 * encoding_lesson_content pattern exactly (generate on cache-miss, upsert,
 * re-fetch by the same key forever after) — and reuses it for every student
 * ever verified on this concept, and every one of a single student's own
 * successive attempts. Sonnet, not Haiku: this happens rarely and gets
 * cached, and a bad rubric silently corrupts every grading decision built
 * on top of it, same reasoning as chain generation.
 */
export async function getOrGenerateRubric(
  subject: string,
  topic: string,
  concept: string,
  qualification: string,
  examBoard: string,
  customTitle = '',
  customDescription = ''
): Promise<{ rubricKey: string; rubric: VerificationRubric; scenarios: VerificationScenario[] }> {
  const rubricKey = buildRubricKey(subject, topic, concept, qualification, examBoard, customTitle, customDescription);

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from('verification_rubrics')
    .select('rubric, scenarios')
    .eq('rubric_key', rubricKey)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (existing) {
    return { rubricKey, rubric: existing.rubric as VerificationRubric, scenarios: existing.scenarios as VerificationScenario[] };
  }

  const generated = await callJSON<{ rubric: VerificationRubric; scenarios: VerificationScenario[] }>(
    VERIFICATION_RUBRIC_GENERATION_PROMPT,
    `Subject: ${subject}\nTopic: ${topic || 'unspecified'}\nConcept: ${concept}\nQualification: ${qualification || 'unspecified'}\nExam board: ${examBoard || 'unspecified'}`,
    MODELS.diagnosticTree,
    0.4,
    4096,
    true
  );

  const { error: upsertError } = await supabaseAdmin
    .from('verification_rubrics')
    .upsert({ rubric_key: rubricKey, rubric: generated.rubric, scenarios: generated.scenarios }, { onConflict: 'rubric_key' });
  if (upsertError) throw upsertError;

  return { rubricKey, rubric: generated.rubric, scenarios: generated.scenarios };
}

export interface VerificationAttemptStart {
  rubricKey: string;
  conceptId: string;
  scenario: VerificationScenario;
  // How many genuinely-spaced successful passes this student already has on
  // this concept, and how many are required for durable verification (the
  // same DURABLE_RELEARNING_CRITERION the paid side's spaced review uses) —
  // lets the frontend show real progress ("2 of 3") toward the mastery bar
  // that will eventually gate the full Key reward for this concept, once
  // the rewards system consumes isDurablyMastered.
  spacedSuccessCount: number;
  masteryTarget: number;
}

/**
 * Rotates through the cached scenario set by how many genuinely-spaced
 * successes this student already has on this concept (spaced_success_count
 * — the exact same counter that drives the paid side's durable-relearning
 * criterion, see reviewService.ts) — so a student's 2nd/3rd successive
 * attempt is never shown the same circumstance as before, without needing
 * any new per-attempt tracking of its own.
 */
export async function startVerificationAttempt(
  userId: string,
  subject: string,
  topic: string,
  concept: string,
  qualification: string,
  examBoard: string,
  customTitle = '',
  customDescription = ''
): Promise<VerificationAttemptStart> {
  const conceptId = normalizeConceptKey(subject, topic, concept);
  const { rubricKey, scenarios } = await getOrGenerateRubric(subject, topic, concept, qualification, examBoard, customTitle, customDescription);
  const { spacedSuccessCount } = await getMasteryStatus(userId, conceptId);
  const scenario = scenarios[spacedSuccessCount % scenarios.length];
  return { rubricKey, conceptId, scenario, spacedSuccessCount, masteryTarget: DURABLE_RELEARNING_CRITERION };
}

interface FreeTextGrade {
  verdict: 'correct' | 'unclear' | 'incorrect';
  confidence: number;
  misconceptionNote: string | null;
  unclearReason: string | null;
}

async function runFreeTextGrade(rubric: VerificationRubric, scenario: VerificationScenario, answer: string, model: string): Promise<FreeTextGrade> {
  return callJSON<FreeTextGrade>(
    VERIFICATION_FREE_TEXT_GRADE_PROMPT,
    `Rubric: ${JSON.stringify(rubric)}\nScenario — starting point: ${scenario.startPoint}. What the student had to explain: ${scenario.endPointVariable}. Additional context: ${scenario.context}\nStudent's answer: ${answer}`,
    model,
    0.2,
    undefined,
    // This system prompt is byte-identical across every single grading
    // call, on both the cheap and escalated pass, across every free-tier
    // student app-wide — the highest-volume call in this whole feature, so
    // caching it matters far more than caching the (much rarer) rubric
    // generation call above.
    true
  );
}

export async function generateCorrection(concept: string, misconceptionOrGap: string): Promise<string> {
  const result = await callJSON<{ correction: string }>(
    VERIFICATION_CORRECTION_PROMPT,
    `Concept: ${concept}\nMisconception: ${misconceptionOrGap}`,
    MODELS.simpleQuestion,
    0.3
  );
  return result.correction;
}

/**
 * One structured follow-up per (rubric, specific gap) pair, cached inside
 * the same verification_rubrics row (follow_ups jsonb) so a later student
 * hitting the exact same gap reuses it instead of paying to regenerate —
 * same "generate once, cache forever" principle as the rubric itself, just
 * keyed one level finer. Alternates fill-gap vs order-words by how many
 * follow-ups this rubric has already produced (simple parity, not random,
 * so behavior stays reproducible to debug) — order-words is skipped
 * whenever the mechanism doesn't have enough real steps to shuffle.
 */
export async function getOrGenerateStructuredFollowUp(rubricKey: string, concept: string, targetItem: string): Promise<StructuredFollowUp> {
  const { data: row, error } = await supabaseAdmin
    .from('verification_rubrics')
    .select('rubric, follow_ups')
    .eq('rubric_key', rubricKey)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new Error('rubric not found');
  const rubric = row.rubric as VerificationRubric;
  const followUps = ((row.follow_ups as Record<string, StructuredFollowUp>) || {});

  const cacheField = `item::${clean(targetItem)}`;
  if (followUps[cacheField]) return followUps[cacheField];

  const useOrderWords = Object.keys(followUps).length % 2 === 1 && rubric.mechanismSteps.length >= 3;
  const generated: StructuredFollowUp = useOrderWords
    ? {
        type: 'order_words',
        ...(await callJSON<{ shuffledSteps: string[]; correctOrder: number[] }>(
          VERIFICATION_ORDER_WORDS_PROMPT,
          `Concept: ${concept}\nMechanism steps: ${JSON.stringify(rubric.mechanismSteps)}`,
          MODELS.simpleQuestion,
          0.4
        )),
      }
    : {
        type: 'fill_gap',
        ...(await callJSON<{ sentence: string; answer: string; acceptableVariants: string[] }>(
          VERIFICATION_FILL_GAP_PROMPT,
          `Concept: ${concept}\nLink or definition to test: ${targetItem}`,
          MODELS.simpleQuestion,
          0.4
        )),
      };

  followUps[cacheField] = generated;
  const { error: updateError } = await supabaseAdmin.from('verification_rubrics').update({ follow_ups: followUps }).eq('rubric_key', rubricKey);
  if (updateError) throw updateError;
  return generated;
}

export interface VerificationGradeResult {
  verdict: 'correct' | 'unclear' | 'incorrect';
  escalated: boolean;
  misconceptionNote: string | null;
  unclearReason: string | null;
  correction?: string;
  followUp?: StructuredFollowUp;
}

/**
 * Grades one free-text verification answer. Haiku first; if its own
 * reported confidence is below the escalation threshold, re-grades on
 * Sonnet instead of trusting the cheap verdict — the whole reason this
 * needs BOTH a rubric to grade against AND a confidence figure at all is so
 * the expensive model only ever gets paid for on the (hopefully rare)
 * genuinely-ambiguous cases, not every submission.
 *
 * 'correct' grades immediately via gradeAndRecordReview — the SAME
 * successive-relearning machinery the paid side already uses, so 3
 * genuinely-spaced correct passes is what it takes to become durably
 * verified, not one lucky explanation. 'incorrect' does NOT grade yet —
 * getting the free-text explanation wrong isn't the end of the lesson, it's
 * the start of the correction; the actual grade is deferred to whether the
 * follow-up question afterward gets answered correctly (see
 * gradeStructuredFollowUpWithFsrs) — a wrong-then-corrected attempt still
 * counts as a genuine pass, only a wrong follow-up too grades 'again'.
 * 'unclear' deliberately grades NOTHING here either — see resolveUnclear —
 * since it isn't real evidence either way.
 */
export async function gradeVerificationAnswer(
  userId: string,
  concept: string,
  conceptId: string,
  rubricKey: string,
  scenario: VerificationScenario,
  answer: string
): Promise<VerificationGradeResult> {
  const { data: row, error } = await supabaseAdmin.from('verification_rubrics').select('rubric').eq('rubric_key', rubricKey).maybeSingle();
  if (error) throw error;
  if (!row) throw new Error('rubric not found');
  const rubric = row.rubric as VerificationRubric;

  let grade = await runFreeTextGrade(rubric, scenario, answer, MODELS.simpleQuestion);
  let escalated = false;
  if (grade.confidence < GRADE_CONFIDENCE_ESCALATION_THRESHOLD) {
    grade = await runFreeTextGrade(rubric, scenario, answer, MODELS.diagnosticTree);
    escalated = true;
  }

  if (grade.verdict === 'correct') {
    const rating: FsrsRatingKey = escalated ? 'hard' : 'good';
    await gradeAndRecordReview(userId, conceptId, rating);
    return { verdict: grade.verdict, escalated, misconceptionNote: null, unclearReason: null };
  }

  if (grade.verdict === 'incorrect') {
    const targetItem = grade.misconceptionNote || concept;
    const [correction, followUp] = await Promise.all([
      generateCorrection(concept, grade.misconceptionNote || concept),
      getOrGenerateStructuredFollowUp(rubricKey, concept, targetItem),
    ]);
    return { verdict: grade.verdict, escalated, misconceptionNote: grade.misconceptionNote, unclearReason: null, correction, followUp };
  }

  // 'unclear' — no grade yet, frontend shows the self-report checkbox next.
  return { verdict: grade.verdict, escalated, misconceptionNote: null, unclearReason: grade.unclearReason };
}

export interface UnclearResolution {
  correction: string | null;
  followUp: StructuredFollowUp;
}

/**
 * Resolves the self-report checkbox shown after an 'unclear' verdict — "do
 * you actually know this, or was the question just unclear?" Neither branch
 * grades here — both, like gradeVerificationAnswer's 'incorrect' path,
 * defer the actual grade to the structured follow-up that comes next (see
 * gradeStructuredFollowUpWithFsrs): `knowsIt: true` because the self-report
 * alone isn't real evidence either way, `knowsIt: false` because a genuine
 * gap that then gets corrected should still count as a pass, same as an
 * outright-wrong free-text answer that's then corrected.
 */
export async function resolveUnclear(
  userId: string,
  concept: string,
  conceptId: string,
  rubricKey: string,
  unclearReason: string,
  knowsIt: boolean
): Promise<UnclearResolution> {
  const correction = knowsIt ? null : await generateCorrection(concept, unclearReason);
  const followUp = await getOrGenerateStructuredFollowUp(rubricKey, concept, unclearReason);
  return { correction, followUp };
}

/**
 * Grades a structured follow-up answer — deterministic text/sequence
 * matching, no LLM call at all. This is exactly what makes the follow-up
 * step "cheap": the ONE-TIME cost is generating the item (see
 * getOrGenerateStructuredFollowUp), grading a specific submitted answer
 * against it is free.
 */
export function gradeStructuredFollowUp(followUp: StructuredFollowUp, submittedAnswer: string | number[]): boolean {
  if (followUp.type === 'fill_gap') {
    const normalize = (s: string) => s.trim().toLowerCase();
    const candidates = [followUp.answer, ...followUp.acceptableVariants].map(normalize);
    return typeof submittedAnswer === 'string' && candidates.includes(normalize(submittedAnswer));
  }
  if (!Array.isArray(submittedAnswer)) return false;
  return (
    submittedAnswer.length === followUp.correctOrder.length &&
    submittedAnswer.every((val, i) => val === followUp.correctOrder[i])
  );
}

/**
 * The grading moment for every follow-up path — none of gradeVerificationAnswer's
 * 'incorrect' branch, or either branch of resolveUnclear, grade anything of
 * their own any more; they all defer here. 'hard' rather than 'good' on a
 * correct follow-up, since a corrected-then-confirmed pass is still weaker
 * evidence than a clean first-try free-text explanation, but it's still a
 * genuine pass — you don't need to get it right first time, only after the
 * correction. A wrong follow-up too is what actually grades 'again'.
 */
export async function gradeStructuredFollowUpWithFsrs(
  userId: string,
  conceptId: string,
  followUp: StructuredFollowUp,
  submittedAnswer: string | number[]
): Promise<{ correct: boolean }> {
  const correct = gradeStructuredFollowUp(followUp, submittedAnswer);
  await gradeAndRecordReview(userId, conceptId, correct ? 'hard' : 'again');
  return { correct };
}
