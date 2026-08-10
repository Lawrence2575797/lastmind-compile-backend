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
  examBoard: string;
  subfolders: { name: string; pages: CortexPageSummary[] }[];
  pages: CortexPageSummary[];
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
  | { type: 'create_folder'; subject: string; qualification: string; examBoard: string }
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
  | { type: 'create_multi_lesson_page'; folderName: string; subfolderName: string | null; pageTitle: string; concepts: string[] };

export interface CortexResult {
  reply: string;
  action: CortexAction | null;
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

  const raw = await callClaudeJSON({
    model: MODELS.diagnosticTree,
    systemPrompt: CORTEX_INTENT_PROMPT,
    userContent,
    temperature: 0.3,
  });

  const parsed = JSON.parse(stripCodeFences(raw)) as CortexResult;

  if (parsed.action && parsed.action.type === 'generate_notes') {
    const notesRaw = await callClaudeJSON({
      model: MODELS.diagnosticTree,
      systemPrompt: CORTEX_NOTE_GENERATION_PROMPT,
      userContent: `Subject: ${parsed.action.subject}\nTopic: ${parsed.action.topic}\nLesson: ${parsed.action.lesson}`,
      temperature: 0.4,
    });
    const notesParsed = JSON.parse(stripCodeFences(notesRaw)) as { notes: string };
    parsed.action.noteContent = notesParsed.notes;
  }

  return parsed;
}
