import { callClaudeJSON, MODELS } from './claudeClient';
import { CORTEX_INTENT_PROMPT, CORTEX_NOTE_GENERATION_PROMPT } from '../constants/cortexPrompts';

function stripCodeFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}

export interface CortexPageSummary {
  title: string;
  // Whether this page's first-exposure encoding lesson has been
  // completed — lets Cortex reason about prerequisite order using what
  // the student has actually done, without needing to be told separately
  // (see CORTEX_INTENT_PROMPT's ordering capability).
  done: boolean;
}

export interface CortexFolderSummary {
  name: string;
  qualification: string;
  // Exactly one of these three identifies the folder beyond subject+level,
  // matching learn/index.html's own school/university/custom split
  // (isUniversityLevel/isCustomLevel) — examBoard for GCSE/A-Level/etc.,
  // institution+moduleCode for Undergraduate Year 1-4/Masters/PhD, or
  // customDescription for qualification "Other" (a self-directed goal
  // outside any formal qualification, e.g. "running a small business" —
  // `name` already holds its title). A university folder's moduleCode
  // (e.g. "EC104") is very often the ONLY thing that disambiguates it from
  // an unrelated folder sharing the same subject name — never assume
  // examBoard is present.
  examBoard?: string;
  institution?: string;
  moduleCode?: string;
  // The student's own free-text description of what they want to learn —
  // only present for qualification "Other". The nearest thing this kind
  // of folder has to a syllabus, since there's no exam board/course spec
  // to draw on for it.
  customDescription?: string;
  subfolders: { name: string; pages: CortexPageSummary[]; plannedConcepts?: string[] }[];
  pages: CortexPageSummary[];
  // The full concept order previously saved for this folder (no subfolder
  // — see set_subfolder_plan), if any. Lets Cortex say "you've already
  // saved a plan with N concepts" instead of re-deriving from scratch
  // every time, and reuse the exact same order rather than drifting.
  plannedConcepts?: string[];
}

export interface CortexDueReview {
  conceptId: string;
  label: string;
}

export interface CortexHistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

export type CortexAction =
  | { type: 'move_page'; pageTitle: string; targetFolderName: string; targetSubfolderName: string | null }
  // Moves a whole subfolder — every page and its saved plan, if any — into
  // a different folder, keeping its own name and contents intact.
  // `subfolderName` is looked up across ALL folders (not scoped to one),
  // same as move_page's own pageTitle lookup — the student names the
  // subfolder they mean, not where it currently lives.
  | { type: 'move_subfolder'; subfolderName: string; targetFolderName: string }
  // Exactly one of examBoard, institution+moduleCode, or
  // customTitle+customDescription (qualification "Other"), matching
  // CortexFolderSummary's own three-way split — never more than one.
  | { type: 'create_folder'; subject: string; qualification: string; examBoard?: string; institution?: string; moduleCode?: string; customTitle?: string; customDescription?: string }
  | { type: 'create_subfolder'; folderName: string; subfolderName: string }
  | { type: 'generate_notes'; subject: string; topic: string; lesson: string; noteContent?: string }
  | { type: 'list_due_reviews' }
  | { type: 'start_review'; conceptId: string }
  // A single new page covering several concepts back-to-back (e.g. from an
  // order Cortex just suggested) rather than one page per concept —
  // `concepts` is the ordered list to teach on it; the frontend creates
  // the page with per-concept progress tracking (see learn/index.html's
  // pageIsMultiLesson). Never invented — only concepts the student
  // actually named or that came from an order already discussed this
  // conversation.
  | { type: 'create_multi_lesson_page'; folderName: string; subfolderName: string | null; pageTitle: string; concepts: string[] }
  // Saves a topic's FULL concept order (not just existing pages) as the
  // student's tracked plan for a folder/subfolder, so the app can show
  // progress against the whole topic instead of only what has pages
  // already — see learn/index.html's subfolder progress bar. Distinct
  // from create_multi_lesson_page: this doesn't create anything, it just
  // remembers the intended scope.
  | { type: 'set_subfolder_plan'; folderName: string; subfolderName: string | null; concepts: string[] }
  // One ordinary, separate page per concept from an order (not bundled
  // onto one page — that's create_multi_lesson_page). `concepts` is the
  // full order; the frontend is responsible for skipping any concept
  // that already matches an existing page, so only the missing ones
  // actually get created — Cortex doesn't need to pre-filter.
  | { type: 'create_pages_from_order'; folderName: string; subfolderName: string | null; concepts: string[] }
  // Deletes an entire folder and everything inside it. Only ever emitted
  // for an explicit, unambiguous deletion request — see
  // CORTEX_INTENT_PROMPT rule 12.
  | { type: 'delete_folder'; folderName: string }
  // Deletes a subfolder and everything inside it, searched across every
  // folder the same way move_subfolder finds one.
  | { type: 'delete_subfolder'; subfolderName: string }
  // Deletes a single page, searched across every folder/subfolder the
  // same way move_page finds one.
  | { type: 'delete_page'; pageTitle: string };

export interface CortexResult {
  reply: string;
  // True only when the student's own message explicitly asked for the
  // response to be read aloud — the frontend defaults to text-only and
  // speaks automatically only when this is set (see
  // CORTEX_INTENT_PROMPT's speakAloud rule). Every reply still gets its
  // own manual "read aloud" button regardless of this flag.
  speakAloud: boolean;
  // A LIST, not a single action (see CORTEX_INTENT_PROMPT rule 2b) — a
  // request that genuinely implies several steps (e.g. "make me a folder
  // with a subfolder in it") comes back as multiple entries, applied by
  // the frontend strictly in order, so a later entry can safely refer to
  // something an earlier entry in the SAME list is creating. Empty array
  // (not null) when nothing should happen — kept as an array throughout,
  // never coerced to/from null, so callers don't need two representations
  // of "no action" to check.
  actions: CortexAction[];
}

/**
 * Decides what (if anything) the student is asking Cortex to do, from a
 * single JSON-schema Claude call — same convention every other prompt in
 * this backend uses, deliberately not the SDK's native tool-use, so this
 * doesn't introduce a second pattern for the same job. Chat history is
 * passed in fresh each call rather than stored server-side, matching how
 * the diagnostic engine's `state` is round-tripped opaquely elsewhere.
 *
 * If the decided action is "generate_notes", immediately makes a second
 * call to actually write the notes, so the frontend gets ready-to-insert
 * content in one round trip instead of a second one.
 */
export async function decideCortexAction(
  message: string,
  history: CortexHistoryTurn[],
  folders: CortexFolderSummary[],
  dueReviews: CortexDueReview[]
): Promise<CortexResult> {
  const userContent = [
    `Folder structure:\n${JSON.stringify(folders)}`,
    `Due reviews:\n${JSON.stringify(dueReviews)}`,
    history.length
      ? `Recent conversation:\n${history.map((h) => `${h.role}: ${h.content}`).join('\n')}`
      : 'No prior conversation this session.',
    `Student's latest message: ${message}`,
  ].join('\n\n');

  // maxTokens raised well above the 2048 default — same fix as
  // chainService.ts's own comment describes: rule 8's full-topic-layout
  // reply (a numbered list covering every concept a topic should have,
  // named/statused one by one) can run long on its own, and this call
  // ALSO carries the full folder tree + due reviews + history in its
  // input, on top of a twelve-rule system prompt — plenty of room to run
  // out of output budget before a single text block is even started,
  // which callClaudeJSON's caller sees as "no text content", not a
  // helpful truncation message.
  //
  // CORTEX_INTENT_PROMPT is fixed and identical for every Cortex message —
  // well clear of Sonnet 5's cache minimum, and re-sent in full on every
  // single message (this call has no other caching in front of it), so
  // this is the single biggest cost lever available for Cortex specifically.
  const raw = await callClaudeJSON({
    model: MODELS.diagnosticTree,
    systemPrompt: CORTEX_INTENT_PROMPT,
    userContent,
    temperature: 0.3,
    maxTokens: 4096,
    cacheSystemPrompt: true,
  });

  const parsed = JSON.parse(stripCodeFences(raw)) as CortexResult;
  if (!Array.isArray(parsed.actions)) parsed.actions = [];

  // Every generate_notes action in the batch needs its own second call to
  // actually write the note body (the intent call above only decides THAT
  // notes should be generated, not their content) — run them concurrently
  // rather than one after another, since they're independent of each
  // other. Most Cortex turns have zero or one of these; a batch asking for
  // notes on several lessons at once is the one case this fans out for,
  // which is exactly the point of the array redesign — one Cortex message
  // can now genuinely ask for several of these in one go instead of
  // repeating the request per lesson.
  await Promise.all(
    parsed.actions
      .filter((action): action is Extract<CortexAction, { type: 'generate_notes' }> => action.type === 'generate_notes')
      .map(async (action) => {
        // Same truncation risk as the intent call above — a genuine
        // first-draft set of revision notes for a whole lesson is easily
        // long enough to outrun the 2048 default.
        const notesRaw = await callClaudeJSON({
          model: MODELS.diagnosticTree,
          systemPrompt: CORTEX_NOTE_GENERATION_PROMPT,
          userContent: `Subject: ${action.subject}\nTopic: ${action.topic}\nLesson: ${action.lesson}`,
          temperature: 0.4,
          maxTokens: 4096,
        });
        const notesParsed = JSON.parse(stripCodeFences(notesRaw)) as { notes: string };
        action.noteContent = notesParsed.notes;
      })
  );

  return parsed;
}
