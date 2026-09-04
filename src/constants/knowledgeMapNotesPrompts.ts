// Compiled study notes for the knowledge map's Notes page (see
// knowledgeMapNotesService.ts) - deliberately separate from
// encodingLessonPrompts.ts's NOTES_FROM_LESSON_PROMPT, which summarizes a
// whole Socratic lesson TRANSCRIPT for a page. These two compile straight
// from a node's/edge's own already-authored ground truth (encoding_content's
// explanation, link_teaching_content) into a short note, one concept or one
// link at a time - a genuinely "not too difficult" transform, hence Haiku
// (see MODELS.simpleQuestion in claudeClient.ts) rather than the Sonnet/Opus
// tiers the rest of this file's generation work uses.

// Same markup contract as NOTES_FROM_LESSON_PROMPT (plain text + "**bold**"
// only) so the frontend's existing notesTextToHtml/boldMarkdownToHtml
// renderer works unchanged for both.
export const NODE_NOTES_COMPILE_PROMPT = `You are compiling a short revision note for a UK GCSE/A-Level student, from one concept's own already-written explanation. You will be given the concept's name and its explanation text.

Rules:
1. Output PLAIN TEXT with exactly ONE piece of markup allowed: "**bold**" around key facts, terms, and definitions - no other markdown syntax at all (no #, no backticks, no lists), no JSON, no code fences.
2. Bold every KEY FACT, TERM, or DEFINITION the moment it appears, so a student skimming later can find the load-bearing points at a glance - do not bold ordinary connecting prose, and do not over-bold.
3. Be faithful ONLY to the given explanation - do not introduce new facts, examples, or claims beyond what it already states.
4. Keep it genuinely usable as revision material: concise (shorter than the source explanation, note-like rather than essay-like), in the student's eventual own-review voice, no filler like "this concept covers" or "in summary".

Output: the note text only (plain text plus "**bold**" markup as described), nothing else.`;

// The transferSummary bar matches LINK_IDENTIFY_GRADE_PROMPT's own grading
// bar exactly (one sentence, a real causal claim, not a bare keyword) - this
// note IS what a student who passed that check should end up with written
// down. integrationSummary is the fuller mechanism, same markup contract as
// NODE_NOTES_COMPILE_PROMPT/NOTES_FROM_LESSON_PROMPT.
export const EDGE_NOTES_COMPILE_PROMPT = `You are compiling revision notes for a UK GCSE/A-Level student on the link between two concepts they've both already learned, from that link's own already-written reference material. You will be given both concepts' names and the reference material describing the real connection between them.

Produce two pieces of text:
1. "transferSummary" - ONE SENTENCE stating the causal link between the two concepts' own explanations (roughly: "[A's key idea] means/causes/leads to [B's key idea]") - a bare term or keyword alone does not count, and neither does the full mechanism (that's transferSummary's job below). Plain text, no markup.
2. "integrationSummary" - a fuller explanation of the mechanism connecting them, written the same way as a compiled concept note: plain text with "**bold**" around key facts/terms/definitions only, no other markdown, faithful only to the given reference material, concise and usable as revision material (no filler like "in summary").

Rules:
1. Output ONLY valid JSON, nothing else.
2. Be faithful ONLY to the given reference material - do not introduce new facts, examples, or claims beyond what it already states.
3. **Never restate what either concept IS on its own - only the connection between them.** The student already has both concepts' own separate definitions from their own encoding lessons; this note exists specifically to teach and record the BRIDGE, not to re-teach either endpoint. If the reference material drifts into re-explaining one concept standalone, extract and keep only the parts that state or imply the causal/dependency relationship between the two, and leave the rest out entirely - even if that makes the output shorter. A student reading this should come away knowing why/how A connects to B, never a refresher on what A or B individually mean.

Output schema:
{ "transferSummary": string, "integrationSummary": string }`;

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
