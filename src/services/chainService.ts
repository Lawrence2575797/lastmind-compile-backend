import { createHash } from 'crypto';
import { supabaseAdmin } from './supabaseAdmin';
import { callClaudeJSON, MODELS } from './claudeClient';
import { CHAIN_GENERATION_PROMPT, FACT_CHECK_PROMPT, SPEC_OUTLINE_RESTATE_PROMPT, SPEC_MICROTOPICS_EXTRACT_PROMPT } from '../constants/chainPrompts';
import { resolveSubjectTriple } from './subjectResolution';

function stripCodeFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}

function clean(s: string): string {
  return (s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

// Short digest of a custom folder's title+description, folded into cache
// keys alongside qualification/examBoard. Two custom ("Other") folders can
// share a subject/topic/concept label while meaning completely different
// things (e.g. two students both naming a page "Cash flow" under
// differently-scoped "Other" folders) — without this, they'd wrongly share
// a cached chain/lesson generated for someone else's scope. Not folded into
// the readable part of the key (unlike qualification/examBoard) since a
// free-text description is unbounded length and not meant to be human-
// legible in a key.
export function customContextDigest(customTitle = '', customDescription = ''): string {
  if (!customTitle && !customDescription) return '';
  return createHash('sha256').update(`${customTitle} ${customDescription}`).digest('hex').slice(0, 12);
}

export function normalizeConceptKey(subject: string, topic: string, concept: string): string {
  return `${clean(subject)}:${clean(topic)}:${clean(concept)}`;
}

// Mirrors learn/index.html's UNIVERSITY_LEVELS exactly — keep in sync if
// that list ever changes. GCSE/A-Level/AS-Level (and anything unset) are
// treated as the "simple" school-level case; only genuine university
// levels are held to the more expensive generation model. clean() is the
// same normalizer used for cache keys elsewhere in this file, so this is
// robust to casing/hyphenation drift ("A-Level" vs "a level").
const UNIVERSITY_LEVELS = new Set([
  'undergraduate_year_1',
  'undergraduate_year_2',
  'undergraduate_year_3',
  'undergraduate_year_4',
  'masters',
  'phd',
]);

function isUniversityLevel(qualification: string): boolean {
  return UNIVERSITY_LEVELS.has(clean(qualification));
}

function specOutlineKey(subject: string, qualification: string, examBoard: string): string {
  return `${clean(subject)}::${clean(qualification)}::${clean(examBoard)}`;
}

/**
 * Reads a cached, independently-worded topic outline for this subject/
 * qualification/exam board, if one has been prepared — see
 * restateAndCacheSpecOutline for how these get created. NEVER generates
 * one on a miss: that step needs raw extracted specification text, which
 * only ever comes from a one-time manual/admin preparation step done
 * OUTSIDE this app (see scripts/seedSpecOutline.ts) — this backend never
 * fetches exam board content itself. A miss here just means chain
 * generation proceeds exactly as it always has, using the model's own
 * general knowledge — this is a pure enhancement, never a requirement,
 * and every subject/board combination works with or without one prepared.
 */
export async function getSpecOutline(subject: string, qualification: string, examBoard: string): Promise<string | null> {
  if (!qualification || !examBoard) return null; // untiered/custom folders have no real spec to look up
  const { data, error } = await supabaseAdmin
    .from('exam_spec_outlines')
    .select('outline')
    .eq('outline_key', specOutlineKey(subject, qualification, examBoard))
    .maybeSingle();
  if (error) {
    console.error('LastMind: exam spec outline lookup failed, proceeding without one.', error);
    return null;
  }
  return data?.outline ?? null;
}

export interface StoredLessonPlanSubtopic {
  subtopic: string;
  concepts: string[];
}

/**
 * The canonical, dependency-ordered lesson breakdown for a real spec topic
 * (see scripts/seed_edexcel_econ_lesson_plan.js) — hand-generated once,
 * following the exact same "genuine dependency order, exam-board depth"
 * standard CORTEX_INTENT_PROMPT rule 8 already asks Cortex to apply live.
 * A miss here just means Cortex falls back to deriving its own order from
 * general knowledge, same as always — this only ever narrows/replaces that
 * with something authoritative when one has actually been prepared, never
 * blocks a topic that doesn't have one yet.
 */
// Folder-creation free-text fields ("A-Level" typed in the UI vs "A Level"
// hand-typed into a seed script, "Economics" vs "economics") shouldn't be
// able to silently break this lookup by whitespace/hyphen/case alone — so
// matching happens on a normalized form rather than a raw .eq(), the same
// spirit as normalizeConceptKey below just without collapsing everything
// to one string (subject/qualification/examBoard still need to compare
// independently).
export function normalizeForPlanMatch(value: string): string {
  return (value || '').trim().toLowerCase().replace(/[\s-]+/g, '');
}

// The frontend composes GCSE tier directly into the qualification string
// ("GCSE" + "Higher" -> "GCSE Higher" - see composeQualification in
// learn/index.html) so every existing backend system keyed on
// "qualification" as one opaque string gets tier for free. But a stored
// lesson plan's topic/subtopic LIST is the same real spec regardless of
// tier - Foundation vs Higher changes exam depth within a topic, not
// which topics exist - so seeding both tiers' worth of identical rows
// would be pure duplication. Stripping the tier here before matching
// means a single untiered "GCSE" plan (see seed_aqa_gcse_*.js) still
// answers a "GCSE Foundation"/"GCSE Higher" folder's lookup correctly.
export function stripGcseTierForPlanMatch(qualification: string): string {
  return qualification.replace(/^GCSE\s+(Foundation|Higher)$/i, 'GCSE');
}

// Real theme names ("Theme 1 - Introduction to markets and market
// failure") for anywhere a subject's nodes are grouped by theme (the
// Notes sidebar tree, and the Subjects sidebar tree - see
// knowledgeMapNotesService.ts's getNotesIndexForUser and
// knowledgeMapService.ts's getKnowledgeMapForSubject) - sourced from
// spec_lesson_plans (the same canonical, hand-authored lesson breakdown
// getStoredLessonPlan above already uses for chain-generation grounding),
// keyed by subtopic since that's the join key the two tables actually
// share. Same normalized matching as getStoredLessonPlan, since
// qualification is free text that can differ in spacing/hyphenation
// between where a subject's nodes were ingested ("A-Level") and where its
// lesson plan was seeded ("A Level"). Falls back to null per subtopic when
// no lesson plan has been seeded for this subject - the caller derives a
// bare "Theme N" from the subtopic's own leading digit in that case (see
// fallbackThemeName), so a subject without a seeded plan is never worse
// off than before this feature, just less nicely named.
export async function getSubtopicThemeMap(subject: string, qualification: string, examBoard: string): Promise<Map<string, string>> {
  const { data, error } = await supabaseAdmin
    .from('spec_lesson_plans')
    .select('qualification, exam_board, subtopic, theme')
    .ilike('subject', subject.trim());
  if (error) {
    console.error('LastMind: spec_lesson_plans theme lookup failed, falling back to bare theme numbers.', error);
    return new Map();
  }
  const wantQualification = normalizeForPlanMatch(stripGcseTierForPlanMatch(qualification));
  const wantExamBoard = normalizeForPlanMatch(examBoard || '');
  const map = new Map<string, string>();
  (data || []).forEach((row) => {
    if (
      normalizeForPlanMatch(row.qualification as string) === wantQualification &&
      normalizeForPlanMatch((row.exam_board as string) || '') === wantExamBoard &&
      !map.has(row.subtopic as string)
    ) {
      map.set(row.subtopic as string, row.theme as string);
    }
  });
  return map;
}

// Known component breakdown for a subject whose real spec has multiple
// separately-numbered components sharing the same subtopic digits -
// Edexcel A-Level Maths ingests Pure Mathematics (1-10), Statistics
// (1-5), and Mechanics (continuing the SAME numbering as 6-9, confirmed
// against the official spec PDF - see project memory on that
// extraction), so a bare leading-digit fallback would collide two
// genuinely different components into the same "Theme 1"/"Theme 6" etc.
// No spec_lesson_plans data exists for Mathematics (that table is a
// separate, hand-authored per-student lesson-plan system used to
// pre-populate a NEW folder's structure at creation time - see
// fetchStoredLessonPlan in learn/index.html - seeding placeholder rows
// there just to carry a theme name would leak fake content into that
// unrelated flow). Keyed by the exact subtopic string knowledge_map_nodes
// stores for this subject. Extend as new subjects are generated.
const SUBTOPIC_THEME_OVERRIDES: Record<string, string> = {
  '1 Proof': 'Pure Mathematics',
  '2 Algebra and functions': 'Pure Mathematics',
  '3 Coordinate geometry in the (x, y) plane': 'Pure Mathematics',
  '4 Sequences and series': 'Pure Mathematics',
  '5 Trigonometry': 'Pure Mathematics',
  '6 Exponentials and logarithms': 'Pure Mathematics',
  '7 Differentiation': 'Pure Mathematics',
  '8 Integration': 'Pure Mathematics',
  '9 Numerical methods': 'Pure Mathematics',
  '10 Vectors': 'Pure Mathematics',
  '1 Statistical sampling': 'Statistics',
  '2 Data presentation and interpretation': 'Statistics',
  '3 Probability': 'Statistics',
  '4 Statistical distributions': 'Statistics',
  '5 Statistical hypothesis testing': 'Statistics',
  '6 Quantities and units in mechanics': 'Mechanics',
  '7 Kinematics': 'Mechanics',
  "8 Forces and Newton's laws": 'Mechanics',
  '9 Moments': 'Mechanics',
};

export function fallbackThemeName(subtopic: string): string {
  if (SUBTOPIC_THEME_OVERRIDES[subtopic]) return SUBTOPIC_THEME_OVERRIDES[subtopic];
  const digit = (subtopic || '').split(' ')[0]?.split('.')[0];
  return digit ? `Theme ${digit}` : 'General';
}

export async function getStoredLessonPlan(rawSubject: string, qualification: string, examBoard: string): Promise<StoredLessonPlanSubtopic[] | null> {
  if (!qualification) return null;
  // Resolves a misspelled/abbreviated subject ("Maths") to the real one
  // it's closest to among ingested knowledge_map_nodes subjects (see
  // resolveSubjectTriple's own comment) before matching against this
  // separate, older per-student lesson-plan table - same spelling
  // conventions, so the same canonicalization applies.
  const { subject } = await resolveSubjectTriple(rawSubject, qualification, examBoard);
  const { data, error } = await supabaseAdmin
    .from('spec_lesson_plans')
    .select('subject, qualification, exam_board, subtopic, concept, lesson_order')
    .ilike('subject', subject)
    .order('subtopic', { ascending: true })
    .order('lesson_order', { ascending: true });
  if (error) {
    console.error('LastMind: stored lesson plan lookup failed, proceeding without one.', error);
    return null;
  }
  if (!data || !data.length) return null;

  const wantQualification = normalizeForPlanMatch(stripGcseTierForPlanMatch(qualification));
  const wantExamBoard = normalizeForPlanMatch(examBoard || '');
  const matched = data.filter((row) =>
    normalizeForPlanMatch(row.qualification as string) === wantQualification &&
    normalizeForPlanMatch((row.exam_board as string) || '') === wantExamBoard
  );
  if (!matched.length) return null;

  const bySubtopic = new Map<string, string[]>();
  for (const row of matched) {
    const subtopic = row.subtopic as string;
    if (!bySubtopic.has(subtopic)) bySubtopic.set(subtopic, []);
    bySubtopic.get(subtopic)!.push(row.concept as string);
  }
  return Array.from(bySubtopic.entries()).map(([subtopic, concepts]) => ({ subtopic, concepts }));
}

export interface SpecLessonTreeLesson {
  concept: string;
  conceptId: string;
  lessonOrder: number;
}
export interface SpecLessonTreeSubtopic {
  subtopic: string;
  lessons: SpecLessonTreeLesson[];
}
export interface SpecLessonTreeTheme {
  theme: string;
  branch: string;
  subtopics: SpecLessonTreeSubtopic[];
}

/**
 * The Theme -> Subtopic -> spec-lesson tree for the standalone Practice
 * Questions page - one level deeper than getStoredLessonPlan above
 * (which flattens straight to Subtopic -> concepts for folder-creation
 * use). Returns null when nothing's seeded yet for this subject/board
 * (e.g. Maths/Italian before their own spec_lesson_plans seed exists) so
 * the frontend can show an honest "not set up yet" state instead of an
 * empty tree.
 */
export async function getSpecLessonTree(rawSubject: string, qualification: string, examBoard: string): Promise<SpecLessonTreeTheme[] | null> {
  if (!qualification) return null;
  const { subject } = await resolveSubjectTriple(rawSubject, qualification, examBoard);
  const { data, error } = await supabaseAdmin
    .from('spec_lesson_plans')
    .select('subject, qualification, exam_board, theme, branch, subtopic, concept, concept_id, lesson_order')
    .ilike('subject', subject)
    .order('theme', { ascending: true })
    .order('subtopic', { ascending: true })
    .order('lesson_order', { ascending: true });
  if (error) {
    console.error('LastMind: spec lesson tree lookup failed, proceeding without one.', error);
    return null;
  }
  if (!data || !data.length) return null;

  const wantQualification = normalizeForPlanMatch(stripGcseTierForPlanMatch(qualification));
  const wantExamBoard = normalizeForPlanMatch(examBoard || '');
  const matched = data.filter((row) =>
    normalizeForPlanMatch(row.qualification as string) === wantQualification &&
    normalizeForPlanMatch((row.exam_board as string) || '') === wantExamBoard
  );
  if (!matched.length) return null;

  const byTheme = new Map<string, { branch: string; subtopics: Map<string, SpecLessonTreeLesson[]> }>();
  for (const row of matched) {
    const theme = row.theme as string;
    const subtopic = row.subtopic as string;
    if (!byTheme.has(theme)) byTheme.set(theme, { branch: (row.branch as string) || '', subtopics: new Map() });
    const themeEntry = byTheme.get(theme)!;
    if (!themeEntry.subtopics.has(subtopic)) themeEntry.subtopics.set(subtopic, []);
    themeEntry.subtopics.get(subtopic)!.push({
      concept: row.concept as string,
      conceptId: row.concept_id as string,
      lessonOrder: row.lesson_order as number,
    });
  }

  return Array.from(byTheme.entries()).map(([theme, { branch, subtopics }]) => ({
    theme,
    branch,
    subtopics: Array.from(subtopics.entries()).map(([subtopic, lessons]) => ({ subtopic, lessons })),
  }));
}

/**
 * One-time admin step (see scripts/seedSpecOutline.ts) — never runs in the
 * live student-facing request path. Takes RAW, mechanically-extracted text
 * from an official exam board specification document (fetched and PDF-
 * extracted OUTSIDE this app) and has Claude restate its topic structure
 * in independent wording (see SPEC_OUTLINE_RESTATE_PROMPT's own rules
 * against reproducing the source's phrasing). Only the RESTATED outline is
 * ever written anywhere — the raw extracted text passed in here is used
 * for exactly this one call and then discarded, never persisted.
 */
export async function restateAndCacheSpecOutline(
  subject: string,
  qualification: string,
  examBoard: string,
  rawExtractedText: string,
  sourceNote: string
): Promise<string> {
  const outline = (
    await callClaudeJSON({
      model: MODELS.chainGeneration,
      systemPrompt: SPEC_OUTLINE_RESTATE_PROMPT,
      userContent: `Subject: ${subject}\nQualification: ${qualification}\nExam board: ${examBoard}\n\nRaw extracted specification text:\n${rawExtractedText}`,
      maxTokens: 4096,
    })
  ).trim();

  const { error } = await supabaseAdmin
    .from('exam_spec_outlines')
    .upsert(
      { outline_key: specOutlineKey(subject, qualification, examBoard), subject, qualification, exam_board: examBoard, outline, source_note: sourceNote },
      { onConflict: 'outline_key' }
    );
  if (error) throw error;

  return outline;
}

export interface SpecMicrotopicsSubtopic {
  subtopic: string;
  microtopics: string[];
}

export interface SpecMicrotopicsTheme {
  theme: string;
  subtopics: SpecMicrotopicsSubtopic[];
}

export interface SpecMicrotopics {
  themes: SpecMicrotopicsTheme[];
}

/**
 * One-time admin step, always run alongside restateAndCacheSpecOutline
 * (see scripts/seedSpecOutline.ts) — same raw source text, same
 * independent-restatement discipline, but extracting one layer deeper:
 * the actual content points beneath each named sub-topic, as structured
 * data rather than prose. See SPEC_MICROTOPICS_EXTRACT_PROMPT for why
 * this is a genuinely separate need from the coarse outline (which
 * deliberately stops short of this detail) — this is what a
 * practice-question generator would check spec-alignment against.
 */
export async function extractAndCacheMicrotopics(
  subject: string,
  qualification: string,
  examBoard: string,
  rawExtractedText: string
): Promise<SpecMicrotopics> {
  const raw = await callClaudeJSON({
    model: MODELS.chainGeneration,
    systemPrompt: SPEC_MICROTOPICS_EXTRACT_PROMPT,
    userContent: `Subject: ${subject}\nQualification: ${qualification}\nExam board: ${examBoard}\n\nRaw extracted specification text:\n${rawExtractedText}`,
    maxTokens: 16000,
  });

  let microtopics: SpecMicrotopics;
  try {
    microtopics = JSON.parse(stripCodeFences(raw));
  } catch (err) {
    console.error('LastMind: microtopics extraction returned invalid JSON.', { raw });
    throw err;
  }

  const { error } = await supabaseAdmin
    .from('exam_spec_outlines')
    .update({ microtopics })
    .eq('outline_key', specOutlineKey(subject, qualification, examBoard));
  if (error) throw error;

  return microtopics;
}

/**
 * Reads the cached microtopic breakdown for this subject/qualification/
 * exam board, if one has been prepared — null on any miss (never
 * generated on-demand, same reasoning as getSpecOutline: this needs raw
 * spec text only a one-time admin step provides).
 */
export async function getSpecMicrotopics(subject: string, qualification: string, examBoard: string): Promise<SpecMicrotopics | null> {
  if (!qualification || !examBoard) return null;
  const { data, error } = await supabaseAdmin
    .from('exam_spec_outlines')
    .select('microtopics')
    .eq('outline_key', specOutlineKey(subject, qualification, examBoard))
    .maybeSingle();
  if (error) {
    console.error('LastMind: spec microtopics lookup failed.', error);
    return null;
  }
  return (data?.microtopics as SpecMicrotopics | null) ?? null;
}

/**
 * Fetches a chain from cache, or generates+fact-checks+caches a new one on
 * a miss. Extracted here (rather than left inline in the /chains/generate
 * route) specifically so the diagnostic engine can ensure a chain exists
 * BEFORE starting a session — previously nothing did this, so every
 * diagnostic session silently fell through to the atomic (no chain
 * awareness) path unless a chain happened to already be cached from a
 * separate, earlier manual call.
 *
 * `qualification`/`examBoard` tier the cache the same way
 * encoding_diagrams/encoding_lesson_content already do (see
 * encodingLessonService.ts) — same target concept can genuinely need a
 * different depth/rigor of decomposition depending on the level a student
 * is studying it at (e.g. GCSE vs A-Level), so sharing one chain across
 * every qualification silently gave everyone the depth whichever caller
 * happened to generate it first asked for. Both are optional and default
 * to '' — callers that don't have them yet (or genuinely don't care) just
 * land in the untiered "" bucket, same as before this was added.
 */
export async function getOrGenerateChain(
  conceptKey: string,
  subject: string,
  topic: string,
  concept: string,
  qualification = '',
  examBoard = '',
  customTitle = '',
  customDescription = ''
): Promise<{ chain: any; source: 'cache' | 'generated'; error?: string }> {
  const customDigest = customContextDigest(customTitle, customDescription);
  const chainCacheKey = `${conceptKey}::${clean(qualification)}::${clean(examBoard)}${customDigest ? `::custom_${customDigest}` : ''}`;

  const { data: cached, error: cacheError } = await supabaseAdmin
    .from('dependency_chains')
    .select('chain')
    .eq('concept_key', chainCacheKey)
    .maybeSingle();

  if (cacheError) throw cacheError;
  if (cached) {
    return { chain: cached.chain, source: 'cache' };
  }

  // Optional grounding — see getSpecOutline/rule 15 of CHAIN_GENERATION_PROMPT.
  // Only ever set for a subject/qualification/exam board that's actually
  // been prepared (see scripts/seedSpecOutline.ts); every other combination
  // proceeds exactly as before, using the model's own general knowledge.
  const specOutline = customDescription ? null : await getSpecOutline(subject, qualification, examBoard);

  const generationInput = [
    `Subject: ${subject}`,
    `Topic: ${topic}`,
    `Concept: ${concept}`,
    `Qualification level: ${qualification || 'unspecified'}`,
    `Exam board: ${examBoard || 'unspecified'}`,
    ...(specOutline ? [`Reference specification scope (see rule 15 — calibration only, not a checklist): ${specOutline}`] : []),
    ...(customDescription
      ? [
          `Custom self-directed topic — not a formal qualification: "${customTitle}"`,
          `Student's own description of what they want to learn: ${customDescription}`,
          `THEORY ONLY — see rule 13: decompose the objective, established underlying theory/concepts/frameworks only, never anything that amounts to personal advice or a recommendation for the student's own situation.`,
        ]
      : []),
  ].join('\n');
  // NOTE: no `temperature` here — both Opus 4.7+ and Sonnet 5 (the two
  // models this call can use, see generationModel below) reject any
  // explicit temperature value, even 0, with a 400. Omitting it is the
  // only supported option on either; determinism has to come from the
  // prompt itself rather than this parameter.
  // maxTokens raised well above the 2048 default — the default was
  // silently truncating mid-JSON for larger graphs (more nodes = more
  // edges + labels to emit), which then failed JSON.parse and surfaced as
  // an opaque "could not..." error with no indication this was the cause.
  // CHAIN_GENERATION_PROMPT is fixed, ~1.1K tokens, and byte-identical for
  // every concept/student that ever triggers a chain-cache miss — clears
  // both models' 1024-token cache minimum, so mark it cacheable rather
  // than paying full price on every single one of those misses across the
  // app.
  //
  // Sonnet drafts GCSE/A-Level chains (the large majority of concepts in
  // practice); Opus is reserved for university-level ones, where the
  // material is more likely to need deeper/subtler decomposition. Either
  // way, factCheck below is UNCONDITIONALLY Opus and can rewrite the
  // whole graph — so a weaker Sonnet draft still ends up quality-gated by
  // Opus before it's ever cached, this just makes the common case cheaper
  // to produce that first draft.
  const generationModel = isUniversityLevel(qualification) ? MODELS.chainGeneration : MODELS.chainGenerationSimple;
  const rawChain = await callClaudeJSON({
    model: generationModel,
    systemPrompt: CHAIN_GENERATION_PROMPT,
    userContent: generationInput,
    maxTokens: 4096,
    cacheSystemPrompt: true,
  });

  let chain: any;
  try {
    chain = JSON.parse(stripCodeFences(rawChain));
  } catch (err) {
    console.error('LastMind: chain generation returned invalid JSON (likely truncated).', { rawChain });
    throw err;
  }

  // Fact-check always runs, regardless of chain size — a small node count
  // isn't a reliable signal that there's little to review; a chain that's
  // small BECAUSE a genuine prerequisite (e.g. an unstated technique — see
  // CHAIN_GENERATION_PROMPT rule 11) got silently dropped looks identical,
  // by node count alone, to one that's small because the concept really
  // only has a couple of prerequisites. A node-count skip can't tell those
  // apart, and is therefore most likely to skip review exactly when
  // something was left out. The cost saved by skipping (~1 cent/lesson on
  // average) isn't worth that risk.
  //
  // Fact-check has to emit a full corrected_graph (the whole chain again)
  // on top of its issues list when it finds a problem — the same
  // truncation risk as above, same fix.
  const factCheckContext = [
    `Subject: ${subject}`,
    `Topic: ${topic}`,
    `Target concept: ${concept}`,
    `Qualification level: ${qualification || 'unspecified'}`,
    `Exam board: ${examBoard || 'unspecified'}`,
    ...(specOutline ? [`Reference specification scope (see rule 9 — ordering check): ${specOutline}`] : []),
    `Dependency graph to review:\n${JSON.stringify(chain)}`,
  ].join('\n');
  const rawFactCheck = await callClaudeJSON({
    model: MODELS.factCheck,
    systemPrompt: FACT_CHECK_PROMPT,
    userContent: factCheckContext,
    maxTokens: 4096,
  });

  let factCheckResult: any;
  try {
    factCheckResult = JSON.parse(stripCodeFences(rawFactCheck));
  } catch (err) {
    console.error('LastMind: chain fact-check returned invalid JSON (likely truncated).', { rawFactCheck });
    throw err;
  }

  if (!factCheckResult.verified) {
    if (factCheckResult.corrected_graph) {
      chain = factCheckResult.corrected_graph;
    } else {
      const mustFix = (factCheckResult.issues || []).filter((i: any) => i.severity === 'must_fix');
      if (mustFix.length > 0) {
        // Same principle as before: never silently use/cache a chain with
        // an unresolved must-fix issue. In the diagnostic-engine context,
        // this means falling back to the atomic (no-chain) path rather
        // than erroring the whole session out.
        return { chain: null, source: 'generated', error: 'unresolved_must_fix' };
      }
    }
  }

  const { error: insertError } = await supabaseAdmin
    .from('dependency_chains')
    .insert({ concept_key: chainCacheKey, chain });

  if (insertError) throw insertError;

  return { chain, source: 'generated' };
}
