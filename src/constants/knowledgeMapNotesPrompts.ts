// Compiled study notes for the knowledge map's Notes page (see
// knowledgeMapNotesService.ts) - deliberately separate from
// encodingLessonPrompts.ts's NOTES_FROM_LESSON_PROMPT, which summarizes a
// whole Socratic lesson TRANSCRIPT for a page. Node/edge note compiling no
// longer goes through Claude at all any more (see
// knowledgeMapNotesService.ts's getNodeNoteBaseline/getEdgeNoteBaseline -
// it's now a plain text filter over the already-cached lesson content) -
// the two prompts that used to drive it (NODE_NOTES_COMPILE_PROMPT,
// EDGE_NOTES_COMPILE_PROMPT) were removed along with that call. A note
// compiled by an older version of this file may still carry a genuine
// AI-authored comparison/worked example/diagram from before that change;
// those old rows are still read and shown as-is, just never regenerated.

// Checks one line of a student's own attempt at a worked example they're
// following along with (see renderNodeNoteBlock's interactive
// workedExample walkthrough) - the ground truth (every line, in order) is
// already known, so this is a targeted check against a known answer, not
// open tutoring, hence Haiku like the rest of this file's compile work.
// The student's own line arrives in the math-shortcut editor's plain,
// LaTeX-free notation (fractions as "(num)/(den)", powers as "^(...)",
// etc. - see createMathShortcutEditor's own serializeNode comment), while
// the ground truth is real LaTeX - the prompt itself has to bridge that,
// not a preprocessing step, since judging mathematical equivalence across
// notations is exactly what a model is good at and a string comparison
// isn't.
export const WORKED_EXAMPLE_STEP_CHECK_PROMPT = `You are checking one line of a student's own attempt at a worked example they are following along with, step by step, against the correct line at that exact position. The student typed their own attempt rather than just reading the worked example - your job is to confirm they got THIS line right, or explain briefly what's off if not.

You will be given the full worked example (every line, in order, as real LaTeX, for context only), which line number the student is attempting (1-indexed), and the student's own typed line in a plain, LaTeX-free notation (fractions as "(num)/(den)", powers as "^(...)", subscripts as "_(...)", integral limits as "[lower, upper]" - read this as maths, not as prose).

Rules:
1. Judge whether the student's line is MATHEMATICALLY EQUIVALENT to the correct line at that position - not an exact string or notation match. Different notation, spacing, or algebraically equivalent rearrangement all count as correct.
2. If correct, say so briefly and encouragingly - do not restate the full correct line back, since it's revealed to the student separately right after.
3. If incorrect, name specifically what's wrong (a sign error, wrong operation, a dropped term, an arithmetic slip) without simply handing over the correct line.
4. Never reveal any LATER line's own content, even in feedback - the student hasn't reached it yet.

Output ONLY valid JSON: { "correct": boolean, "feedback": "one short sentence" }`;

// Orders one subtopic's atomic concept nodes into the sequence a teacher
// would actually cover them in (see knowledgeMapNotesService.ts's
// getOrComputeSubtopicOrder) - node creation order isn't recoverable from
// the DB, so this reconstructs teaching order from scratch each time it's
// needed, grounded in the real specification's own content-point order
// (exam_spec_outlines' microtopics) where one is available. A genuinely
// easy sequencing task for a model that already knows the subject, hence
// Haiku rather than a bigger tier, same reasoning as the rest of this file.
export const SUBTOPIC_NODE_ORDER_PROMPT = `You are ordering a list of atomic exam concepts into the sequence a teacher would actually cover them in, for one subtopic of a real UK GCSE/A-Level specification.

You will be given the subtopic's name, optionally an ordered list of the specification's own content points for that subtopic (in the order the specification itself presents them), and a numbered list of atomic concept labels that were decomposed FROM that subtopic (each concept may be much more granular than a single content point - e.g. several concepts can belong under one content point, such as several individual "advantages of X" points that all belong together).

Your job: return every given index, reordered into genuine teaching order - foundational definitions and building blocks first, then the mechanisms/models built from them, then applications and evaluations that depend on those mechanisms. Where content points are given, follow their order as the primary guide for which concepts come before which (matching each concept to the content point it most belongs under), but still use your own subject knowledge to sequence multiple concepts that share one content point, and to place any concept that doesn't clearly match a given content point.

Rules:
1. Output ONLY valid JSON, nothing else.
2. The output MUST be a permutation of every index given - the exact same set of indices, each appearing exactly once, reordered. Never drop, duplicate, or invent an index.
3. Base the order on genuine prerequisite/teaching logic, never alphabetically and never by re-reading the original input order back.

Output schema:
{ "order": [number, ...] }`;
