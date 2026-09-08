// One-time content generation for a knowledge-map node/edge (see
// knowledgeMapPrompts.ts for the map itself). Generated once per node/edge,
// stored, served identically to every student - never regenerated per
// click. Both prompts are written for LEAN output on purpose: the actual
// $ cost of this pipeline is almost entirely output tokens (Sonnet output
// is billed several times higher than input), so trimming padding here is
// a real cost lever, not just a style preference - it does not trade away
// teaching quality, since the atomicity rules already guarantee each node
// is a single, small, well-scoped idea that doesn't need a long
// explanation to cover properly.

export const KNOWLEDGE_MAP_ENCODING_LESSON_PROMPT = `You are writing the ENCODING lesson for one atomic node in a subject's knowledge-map graph - the first time a student meets this specific concept. You will be given the subject, qualification, exam board, subtopic, this node's own label, the labels of every node that lists this one as a direct prerequisite ("leads to"), and the labels of this node's own direct prerequisites (concepts the student has ALREADY been taught, immediately before this one).

Your job: teach this concept, and ONLY this concept, to real exam-board depth.

## Rules

1. **Explain the concept itself, completely, in as few words as that genuinely takes.** Target 90-130 words. If the concept is small enough to explain correctly in 60, use 60 - do not pad to hit a target. Real exam-relevant depth means: the actual definition/mechanism, not a restatement of the label, and not a simplified version that would mislead at exam standard.

1a. **Nod to a prerequisite for orientation - never derive this concept FROM one, or from several together.** A single short opening reference to this node's own most immediately relevant prerequisite, by name, is fine purely to orient the student ("Building on X, ..."). But do not construct this concept's actual justification by chaining or synthesizing prerequisites together ("because X, and because Y, therefore Z") - that is integration-level reasoning across concepts, and belongs in the edge lesson between this node and each of those prerequisites, not here. This node's explanation must still stand entirely on its own as the atomic definition/mechanism its own label names (rule 2) - a student who never saw the prerequisite at all should still come away with a complete, correct understanding of THIS concept from this text alone. Grounding is one sentence of orientation, not the argument itself.

1b. **Format for scanning, not solid prose.** Break the explanation into short paragraphs (roughly 1-3 sentences each) at natural conceptual boundaries - a new paragraph for each distinct step in the reasoning, not one dense block. Bold the specific key terms and definitions a student actually needs to retain, using **term** markup, sparingly - individual words or short phrases only, never a whole sentence.

2. **Stay inside exactly what this node's own label asserts - do not reach for the "complete" textbook framing if part of that framing is really a separate idea.** A concept is often conventionally taught alongside neighbouring ideas (e.g. "economics as a social science" alongside "scarcity and the economic problem") - that doesn't mean this one node should explain or test both. If the label doesn't name it, leave it out, even if the explanation then reads as narrower than a textbook paragraph would. The graph's atomicity is only real if each node's own content actually stays atomic - a node that quietly re-teaches a neighbouring node's territory makes that neighbour's own lesson feel redundant, and makes this node's practice question test more than it was ever taught to test. The mark scheme especially must never require a point that belongs to a different concept's own definition.

3. **Never explain, hint at, or foreshadow the "leads to" concepts you were given.** Those connections are taught and TESTED separately, later, as a dedicated link-teaching step followed by a genuine transfer question that checks whether the student can make the connection themselves. If your explanation here already draws that connection, the transfer question becomes trivial - the student would be pattern-matching your own words back to you instead of demonstrating real understanding. Teach this node as if the concepts it leads to don't exist yet, because pedagogically, for this student, they don't.

4. **One practice question, testing this concept alone.** It must be answerable from this node's own explanation plus its own prerequisites - never from a "leads to" concept, and never requiring the student to already know a link this lesson hasn't taught. Write a real mark scheme: what specifically must the answer say to be marked correct (this app grades free-text answers as correct/incorrect only - no partial credit - so the mark scheme must draw an unambiguous line). The mark scheme must only require what the question you just wrote actually asks - never a point that's true and related but outside the question's own specific wording.

4a. **Decide how the practice question is genuinely answered.** Set "modality" to "reading" if answering requires comprehending written text, "writing" if it requires producing written text, "listening" if it requires comprehending SPOKEN language, or "speaking" if it requires producing spoken language. For a subject with no genuine spoken/heard component (true of most academic subjects), this is always "writing" - answering in text is the only way the concept is ever actually tested there, and there is no reason to reach for "reading"/"listening"/"speaking" just because the student happens to read the question or could imagine saying the answer aloud. Only a language-learning subject should ever produce "listening" or "speaking" - and only when the concept itself is fundamentally about comprehending or producing spoken language, not merely because the subject involves a spoken language in general. If "modality" is "listening", also set "audioText" to the exact phrase or sentence (in the language being learned) that should be played to the student and that the question is actually about - omit this field entirely for every other modality.

4b. **If this node's own label names a GROUP of closely related discrete items taught together (e.g. a set of vocabulary words, a family of forms/conjugations, a list of terms) rather than one single unified idea, the practice question must test EVERY item in the group, not just one.** A single item within a taught group (one pronoun out of "io/tu/lui/lei/noi/voi/loro", one verb form out of a conjugation set) is too small a thing to test alone - a student who only got asked about "noi" could be missing "loro" entirely and still pass. Phrase it as one fill-in-the-gaps question with a blank for every item in the group (e.g. "Fill in the missing subject pronoun for each: ___ mangio, ___ mangia, ___ mangiamo..." adapted to whatever the group actually is), never a word bank or multiple-choice list of options to fill the blanks from - the point is genuine recall of each item, and a word bank lets a student find the last blank or two by elimination rather than actually knowing them. The mark scheme must state the exact correct answer for every blank. This almost never applies outside a language-learning subject's vocabulary/grammar-form groups; a node that already names one single concept (true of most nodes, in every subject) has nothing to group and this rule simply doesn't apply to it.

5. **No restated scaffolding, no throat-clearing, no "in this lesson you will learn."** Start with the actual content.

## Output format

Return ONLY valid JSON:
{
  "explanation": "the teaching text",
  "practiceQuestion": { "questionText": "...", "markScheme": "what makes an answer correct, stated precisely enough to grade as correct/incorrect", "modality": "reading" | "writing" | "listening" | "speaking", "audioText": "the phrase to play, ONLY when modality is \"listening\" - omit otherwise" }
}`;

export const KNOWLEDGE_MAP_EDGE_LESSON_PROMPT = `You are writing the LINK-TEACHING and testing content for one prerequisite edge in a subject's knowledge-map graph - the step that explains why understanding concept A is genuinely necessary before concept B makes sense, run after both A and B have already had their own separate encoding lessons. You will be given the subject, qualification, exam board, subtopic, A's label and explanation, and B's label and explanation.

Your job: teach the CONNECTION, not either concept again, then test it twice - once as transfer, once as integration.

## Rules

1. **Teach only the bridge.** Target 70-100 words. Do not re-explain A or B's own definitions - the student already has both from their own encoding lessons. State specifically why A is required for B: what would break, or fail to make sense, about B without A.

2. **The transfer question tests whether the student can apply A in a new situation involving B - not recall your link-teaching text back.** It must require genuinely using both concepts together to answer, phrased with different specifics than the link-teaching explanation used (a new example, a new number, a new context) so a student who only memorised your wording cannot pattern-match their way to a correct answer. Write a precise mark scheme (correct/incorrect only, no partial credit).

2a. **Decide how the transfer question is genuinely answered** - same "modality"/"audioText" decision as the encoding lesson's practice question (reading/writing for most academic subjects, listening/speaking only for a language-learning subject and only when the concept itself is fundamentally about comprehending or producing spoken language).

3. **The integration question tests the same connection at slightly greater depth or in a further-transformed context** - assume it is only ever shown to a student who has already passed the transfer question, so it does not need to re-establish the basics, but it must still be answerable from A, B, and the link alone (no smuggled-in third concept). Write a precise mark scheme, and decide its own "modality"/"audioText" the same way.

3a. **Decide whether the integration question needs the maths keyboard.** Set "answerInputType" to "math" if a correct answer genuinely requires writing out a calculation, formula, or symbolic expression (the student answers using a maths-notation keyboard, not a plain textbox) - or "words" if it's answered by explaining the connection/reasoning in prose, even if that prose mentions numbers or a quantity in passing. Choose "math" only when the answer itself IS the working/expression, not merely because the topic is mathematical. This is independent of "modality" above - a "speaking" question is always answered in words, never via this maths keyboard, so only set "answerInputType" when "modality" is "reading" or "writing".

4. **No restated scaffolding, no throat-clearing.** Start with the actual content.

## Output format

Return ONLY valid JSON:
{
  "linkTeaching": "the bridge explanation",
  "transferQuestion": { "questionText": "...", "markScheme": "...", "modality": "reading" | "writing" | "listening" | "speaking", "audioText": "ONLY when modality is \"listening\"" },
  "integrationQuestion": { "questionText": "...", "markScheme": "...", "modality": "reading" | "writing" | "listening" | "speaking", "audioText": "ONLY when modality is \"listening\"", "answerInputType": "words" | "math" }
}`;
