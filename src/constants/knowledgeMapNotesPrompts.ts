// Compiled study notes for the knowledge map's Notes page (see
// knowledgeMapNotesService.ts) - deliberately separate from
// encodingLessonPrompts.ts's NOTES_FROM_LESSON_PROMPT, which summarizes a
// whole Socratic lesson TRANSCRIPT for a page. These two compile straight
// from a node's/edge's own already-authored ground truth (encoding_content's
// explanation, link_teaching_content) into a short note, one concept or one
// link at a time - a genuinely "not too difficult" transform, hence Haiku
// (see MODELS.simpleQuestion in claudeClient.ts) rather than the Sonnet/Opus
// tiers the rest of this file's generation work uses.

// Structured output (heading + short paragraphs + an optional visual),
// replacing the old single-blob-of-text shape - see the Notes page
// redesign this backs (learn/index.html's renderNodeNoteBlock): a
// question-framed heading, bolded key terms throughout, paragraphs short
// enough that a student doesn't lose the thread partway through one, and
// a right-hand visual (diagram/comparison/example) chosen per concept
// rather than forced onto every one. Same markup contract as
// NOTES_FROM_LESSON_PROMPT (plain text + "**bold**" only) inside each
// paragraph, so the frontend's existing boldMarkdownToHtml renderer works
// unchanged.
export const NODE_NOTES_COMPILE_PROMPT = `You are compiling a short revision note for a UK GCSE/A-Level student, from one concept's own already-written explanation. You will be given the concept's name, its explanation text, and optionally a short list of SIBLING concepts from the same lesson (each with their own explanation) that could be used as a comparison.

Rules:
1. "heading": phrase it as a genuine QUESTION the note answers (e.g. "Why can't economists run controlled experiments?", not "Controlled experiments in economics") - the question should have real content, not just the concept's name with a question mark tacked on, wherever the concept allows for that. A pure definition can fall back to "What is X?".
2. "paragraphs": an array of SHORT paragraphs (plain text, "**bold**" around key facts/terms/definitions only, no other markdown) that together cover the explanation faithfully - do not introduce new facts, examples, or claims beyond what it already states. One main idea per paragraph, short enough that a student's attention doesn't drift before the point lands - never one dense block. Bold only load-bearing terms, not ordinary connecting prose, and do not over-bold.
3. "visualType": choose exactly one -
   - "comparison" ONLY if a genuinely contrastive/parallel sibling concept was given (e.g. two definitions that are easy to confuse, or a concept that only really makes sense set against its counterpart) - this should be RARE; most concepts don't have one, and forcing a comparison onto an unrelated sibling is worse than skipping it.
   - "example" if a short, concrete real-world illustration would genuinely help and isn't already redundant with the explanation itself.
   - "none" if neither adds real value.
4. If "visualType" is "comparison", also return "comparison": { "otherLabel": the EXACT label of the sibling concept you're contrasting with (must be copied character-for-character from one of the siblings given), "thisPoints": 2-4 short strings distinguishing THIS concept, "otherPoints": 2-4 short strings distinguishing the OTHER concept }.
5. If "visualType" is "example", also return "example": a short, concrete real-world illustration (plain text, "**bold**" allowed), faithful to the concept as explained - grounding it in a recognisable scenario, never inventing a new fact about the concept itself.
6. Be faithful ONLY to the given explanation (and, for a comparison, the given sibling's own explanation) - never introduce claims beyond what's given.

Output ONLY valid JSON, nothing else, matching this schema:
{ "heading": string, "paragraphs": string[], "visualType": "comparison" | "example" | "none", "comparison"?: { "otherLabel": string, "thisPoints": string[], "otherPoints": string[] }, "example"?: string }`;

// transferSummary matches LINK_IDENTIFY_GRADE_PROMPT's own grading bar
// exactly (one sentence, a real causal claim, not a bare keyword) - this
// IS what a student who passed that check should end up with written
// down. heading+paragraphs replace the old single integrationSummary
// blob with the same structured, question-framed, short-paragraph shape
// NODE_NOTES_COMPILE_PROMPT uses, minus a visual - dual coding's spatial-
// contiguity payoff is about a concept's OWN explanation, not a link
// between two already-learned ones, so a link's notes stay text-only.
export const EDGE_NOTES_COMPILE_PROMPT = `You are compiling revision notes for a UK GCSE/A-Level student on the link between two concepts they've both already learned, from that link's own already-written reference material. You will be given both concepts' names and the reference material describing the real connection between them.

Produce:
1. "transferSummary" - ONE SENTENCE stating the causal link between the two concepts' own explanations (roughly: "[A's key idea] means/causes/leads to [B's key idea]") - a bare term or keyword alone does not count, and neither does the full mechanism (that's paragraphs' job below). Plain text, no markup.
2. "heading" - phrase as a genuine QUESTION about the CONNECTION itself (e.g. "Why does scarcity mean economics can't run controlled experiments?"), never about either concept alone.
3. "paragraphs" - an array of SHORT paragraphs (plain text with "**bold**" around key facts/terms/definitions only, no other markdown) explaining the mechanism connecting them - one idea per paragraph, short enough to hold attention, faithful only to the given reference material.

Rules:
1. Output ONLY valid JSON, nothing else.
2. Be faithful ONLY to the given reference material - do not introduce new facts, examples, or claims beyond what it already states.
3. **Never restate what either concept IS on its own - only the connection between them.** The student already has both concepts' own separate definitions from their own encoding lessons; this note exists specifically to teach and record the BRIDGE, not to re-teach either endpoint. If the reference material drifts into re-explaining one concept standalone, extract and keep only the parts that state or imply the causal/dependency relationship between the two, and leave the rest out entirely - even if that makes the output shorter. A student reading this should come away knowing why/how A connects to B, never a refresher on what A or B individually mean.

Output schema:
{ "transferSummary": string, "heading": string, "paragraphs": string[] }`;

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
