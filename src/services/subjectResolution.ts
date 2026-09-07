// Folder subject/exam-board fields are free text with no dropdown or
// canonicalization on the client (see learn/index.html's subjectInput/
// boardInput) - qualification alone is a fixed dropdown (LEVEL_OPTIONS),
// so it's matched exactly (case-insensitively) below, never fuzzily. A
// student typing "Maths" or "Edexcell" against data ingested as
// "Mathematics"/"Edexcel" would otherwise read back as "no knowledge map
// generated yet" for a subject that genuinely exists - this resolves a
// typed triple to whichever REAL (subject, qualification, exam_board)
// triple already present in knowledge_map_nodes it's closest to.
// Deterministic string matching only, no model call - free to run on
// every lookup.
import { supabaseAdmin } from './supabaseAdmin';

export interface SubjectTriple {
  subject: string;
  qualification: string;
  examBoard: string;
}

// Common abbreviations plain edit-distance can't catch - "Maths" (5
// chars) vs "Mathematics" (11 chars) differ by 6 characters, well below
// any sane typo threshold, but is obviously the same subject to a
// person. Keyed by normalized (lowercased, non-alphanumeric stripped)
// input. Extend as new subjects get generated.
const SUBJECT_ALIASES: Record<string, string> = {
  maths: 'Mathematics',
  math: 'Mathematics',
  mathematic: 'Mathematics',
  econ: 'Economics',
  economic: 'Economics',
};

function normalize(s: string): string {
  return (s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

// Same normalized-Levenshtein shape as the frontend's own similarity()
// (see learn/index.html's findSimilarFolder), used there to warn about a
// near-duplicate folder - reimplemented here rather than shared since
// one runs in the browser and one on the server.
function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  const maxLen = Math.max(na.length, nb.length, 1);
  return 1 - levenshtein(na, nb) / maxLen;
}

// Deliberately conservative - a genuine misspelling ("Mathmatics",
// "Edexcell") scores well above this; a real different subject
// ("Chemistry" vs "Mathematics") scores well below it. Never guess when
// unsure: falling through to the typed value just means the caller's own
// exact ilike lookup returns empty, same "no map generated yet" result
// as today - never a wrong subject's data shown instead.
const SIMILARITY_THRESHOLD = 0.6;

const CACHE_MS = 5 * 60 * 1000;
let cachedTriples: { data: SubjectTriple[]; fetchedAt: number } | null = null;

async function getRealSubjectTriples(): Promise<SubjectTriple[]> {
  if (cachedTriples && Date.now() - cachedTriples.fetchedAt < CACHE_MS) return cachedTriples.data;
  const { data, error } = await supabaseAdmin.from('knowledge_map_nodes').select('subject, qualification, exam_board');
  if (error) throw error;
  const seen = new Map<string, SubjectTriple>();
  (data || []).forEach((r) => {
    const key = `${normalize(r.subject as string)}|${normalize(r.qualification as string)}|${normalize(r.exam_board as string)}`;
    if (!seen.has(key)) {
      seen.set(key, { subject: r.subject as string, qualification: r.qualification as string, examBoard: r.exam_board as string });
    }
  });
  cachedTriples = { data: Array.from(seen.values()), fetchedAt: Date.now() };
  return cachedTriples.data;
}

// Resolves a possibly-misspelled/abbreviated typed triple to the closest
// real one. Qualification is matched exactly (case-insensitive) since
// it's dropdown-driven, never fuzzily - only subject and exam board are
// free text and eligible for the fuzzy fallback. Returns the triple
// unchanged (aliasing aside) when nothing is close enough, so a genuinely
// ungenerated subject still falls through to the normal empty-map result
// rather than ever being guessed into someone else's data.
export async function resolveSubjectTriple(subject: string, qualification: string, examBoard: string): Promise<SubjectTriple> {
  const aliasedSubject = SUBJECT_ALIASES[normalize(subject)] || subject;
  const typed: SubjectTriple = { subject: aliasedSubject, qualification, examBoard };

  let real: SubjectTriple[];
  try {
    real = await getRealSubjectTriples();
  } catch (err) {
    console.error('LastMind: subject triple resolution failed, using the typed values as-is.', err);
    return typed;
  }

  const exact = real.find((r) =>
    normalize(r.subject) === normalize(typed.subject) &&
    normalize(r.qualification) === normalize(typed.qualification) &&
    normalize(r.examBoard) === normalize(typed.examBoard)
  );
  if (exact) return exact;

  let best: SubjectTriple | null = null;
  let bestScore = 0;
  for (const r of real) {
    if (normalize(r.qualification) !== normalize(typed.qualification)) continue;
    const score = typed.examBoard
      ? (similarity(typed.subject, r.subject) + similarity(typed.examBoard, r.examBoard)) / 2
      : similarity(typed.subject, r.subject);
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return bestScore >= SIMILARITY_THRESHOLD && best ? best : typed;
}
