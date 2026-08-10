export const MULTI_QUESTION_GENERATION_PROMPT = `You are decomposing a lesson into a set of diagnostic retrieval questions, for a UK GCSE/A-Level student.

You will be given a subject, topic, lesson name, and (optionally) the student's actual notes for this lesson.

Rules:
1. Output ONLY valid JSON, nothing else.
2. Decide the NUMBER of questions yourself, based on how many genuinely distinct concepts the lesson actually covers — a dense lesson with several distinct ideas needs more questions than a lesson covering one narrow idea. Do not pad the count artificially, and do not under-cover a genuinely dense lesson.
3. Each question must require genuinely applying or explaining its concept — not just restating a definition.
4. Use the student's own notes (if provided) to ground the questions in what was actually taught, rather than a generic textbook version of the topic.
5. Give each question a short, precise concept label (snake_case-friendly), since this is used to track the student's progress on that specific concept over time.

Output schema:
{
  "questions": [
    { "conceptLabel": string, "question": string }
  ]
}`;

export const CHECK_ANSWER_AND_SLIP_PROMPT = `You are marking a student's free-text answer to a diagnostic question. If it's wrong, judge whether the error looks like a careless slip, AND describe — in your own open-ended judgment — what the wrong answer specifically reveals about the student's thinking.

A careless slip means: the underlying understanding is clearly intact, but there's an isolated, mechanical error (a small arithmetic mistake, a sign error, a clear one-off lapse) — NOT a genuine gap in understanding the concept itself.

The misconception description matters — this is what a later correction will be built from, so be specific about the actual content of the error, not just "they got it wrong." For example: not "student doesn't understand deficits," but "student believes government spending is financed by creating money directly, rather than by issuing bonds — this looks like confusion with Modern Monetary Theory rather than the standard bond-financing model being taught."

Rules:
1. Output ONLY valid JSON, nothing else.
2. Be reasonably generous with phrasing, but genuinely strict about whether real understanding is present.
3. Only set "looksLikeSlip" to true if you'd be genuinely surprised if the student got it wrong again on a re-attempt.
4. Set "misconceptionNote" to null if the answer is correct. If wrong, describe the SPECIFIC misunderstanding as concretely as you can — including naming what alternative framework or confusion it resembles, if one is apparent, not just restating that it's incorrect.

Output schema:
{ "correct": boolean, "looksLikeSlip": boolean, "misconceptionNote": string | null }`;

// Drop-in replacement for CHECK_ANSWER_AND_SLIP_PROMPT wherever the
// question just answered was itself a calculation (see requiresCalculation
// on WM_RELAXATION_PROMPT/CONTRASTIVE_CUE_PROMPT/LOCALIZATION_CHECK_PROMPT
// below, or the original question at diagnostic-tree entry — see
// startMathDiagnosis) — same output shape, so every existing call site
// that consumes { correct, looksLikeSlip, misconceptionNote } works
// unchanged, just grounded in a verified answer instead of open judgment.
export const MATH_ANSWER_CHECK_AND_SLIP_PROMPT = `You are marking a student's worked answer to a calculation question within a diagnostic sequence, written using a maths input tool (so it may be LaTeX-flavoured — read it as the mathematical expressions it represents). Unlike open-ended judgment, you have genuine ground truth here: the question's author already verified this calculation has a clean, correct solution — check the student's own working and final answer against it directly.

You will be given the question, the VERIFIED correct solution (never shown to the student — reference only), and the student's own working.

Rules:
1. Output ONLY valid JSON, nothing else.
2. Mark "correct" true only if the student's final answer matches the verified solution (allowing equivalent forms — 0.5 and 1/2 and 50% are the same answer; a sign that's analytically meaningful, like the sign of an elasticity, is NOT interchangeable).
3. Only set "looksLikeSlip" to true if the METHOD and approach shown are genuinely correct and the error is an isolated, mechanical one (an arithmetic mistake, a sign flip, a transcription slip) — you'd expect this student to get it right on a re-attempt with no re-teaching needed. If the wrong formula or method was used, or a step reveals real misunderstanding, set it false.
4. Set "misconceptionNote" to null if the answer is correct. If wrong, describe the SPECIFIC error concretely and where it occurred (e.g. "divided %ΔP by %ΔQd instead of the reverse" or "used the cross elasticity formula instead of price elasticity") — this is what a later correction gets built from, not a generic "made an error."

Output schema:
{ "correct": boolean, "looksLikeSlip": boolean, "misconceptionNote": string | null }`;

export const RECOGNITION_QUESTION_PROMPT = `You are writing a multiple-choice RECOGNITION question testing whether a student can identify the correct answer when shown options — used specifically to distinguish "the knowledge isn't there at all" (fails this too) from "it's there but not freely retrievable" (passes this).

Rules:
1. Output ONLY valid JSON, nothing else.
2. Exactly 4 options, only one correct.
3. Make the 3 incorrect options genuinely plausible — common misconceptions or near-misses, not obvious filler.
4. Do not make the correct answer noticeably longer or more detailed than the distractors.
5. CRITICAL — the "question" stem itself must NOT state, define, or describe the concept's content — only the four options may contain that substantive content. It's fine for the stem to name the concept (that's the whole point of a recognition test), but if the stem explains what the concept means before asking the student to pick from the options, the test is broken — the student would just be being told the answer, not asked to recognize it.

Output schema:
{ "question": string, "options": [string, string, string, string], "correctOptionIndex": number }`;

export const WM_RELAXATION_PROMPT = `You are simplifying a diagnostic question that a student just got wrong, to test whether the failure was caused by working-memory overload rather than a genuine gap in the underlying concept.

You will be given the subject and the concept, alongside the original question.

Simplify by doing ONE OR MORE of: reducing how many things must be held in mind at once, simplifying the wording, breaking a multi-part question into a smaller single part.

Do NOT simplify away the actual concept being tested — the simplified version must still genuinely test the same concept, just with less simultaneous load. A correct answer to your simplified version is about to be treated as real evidence the student's problem was working-memory load, not a knowledge gap — so it only counts if the simplified question still requires genuinely retrieving/applying the concept.

You must self-audit your own simplification before returning it. Set "staysGenuineRetrieval" to true only if getting the simplified version right would still be real evidence of that. Set it to false if, on reflection, the simplification became so trivial, or so telegraphs the answer (e.g. the answer is now embedded in the question's own wording, or only one step of reasoning-free recall remains), that a correct answer wouldn't actually prove anything about working memory specifically.

If the original question was (or the concept genuinely warrants) an actual calculation — a numeric/algebraic problem with a definite answer, in ANY subject where that fits the concept, not just "Maths" — the simplified version can be one too (e.g. the same relationship with smaller, easier numbers, which is itself a valid way to reduce working-memory load). When it is, set "requiresCalculation" true and self-check it exactly like a fresh calculation question: actually work it through with the numbers you wrote, confirm it produces a clean, well-defined result, and record your own correct worked answer in "expectedSolution" (never shown to the student). Set "requiresCalculation" false and "expectedSolution" to an empty string for a purely verbal simplification.

Output ONLY valid JSON, nothing else:
{ "simplifiedQuestion": string, "staysGenuineRetrieval": boolean, "requiresCalculation": boolean, "expectedSolution": string }`;

export const HINT_CUE_PROMPT = `You are writing a single, gentle hint for a student who has already shown (via a recognition test) that they know this concept, but couldn't recall it unprompted. This is testing whether a small generic nudge is enough to bring it back — if it is, that points to ordinary forgetting (decay) rather than confusion with something else.

The hint should NOT give away the answer — just a small nudge (a category, a first letter, a related but distinct fact) that would help genuine recall without doing the work for them.

Output ONLY valid JSON, nothing else:
{ "hint": string }`;

export const CONTRASTIVE_CUE_PROMPT = `You are writing ONE question that explicitly distinguishes a target concept from the concept it is most commonly confused with, for a UK GCSE/A-Level student. This is testing whether confusion with a similar concept (interference) is the actual cause of a retrieval failure, rather than plain forgetting.

You will be given the subject and the target concept. Identify the single concept it is most commonly confused with in real student errors, and write a question that requires correctly distinguishing between the two.

CRITICAL — name both concepts if useful, but do NOT explain, define, or draw the distinction yourself anywhere in the question. The student must be the one to supply the actual distinguishing content; the question only sets up which two things to distinguish.

Where the two concepts are most cleanly distinguished by actually computing something with each (e.g. two related but different formulas that give different results for the same numbers, in ANY subject where that fits — not just "Maths") — a genuine calculation is a valid, often the clearest, way to force the distinction. When you write one, set "requiresCalculation" true and self-check it: work it through yourself with the numbers you gave, confirm it produces a clean, well-defined result, and record your own correct worked answer in "expectedSolution" (never shown to the student). Set "requiresCalculation" false and "expectedSolution" to an empty string for a purely verbal distinction.

Output ONLY valid JSON, nothing else:
{ "confusedWith": string, "question": string, "requiresCalculation": boolean, "expectedSolution": string }`;

export const CORRECTION_PROMPT = `You are writing a short correction for a UK GCSE/A-Level student, based on a specific diagnosed cause of their error. Write directly to the student, second person, encouraging but honest.

You will be given the concept, the diagnosis category, and — where available — the SPECIFIC misconception content observed in their actual answers. Always use the specific content when it's provided, rather than writing a generic explanation of the category alone — a real correction addresses what THIS student actually got confused, not a template.

Diagnosis categories:
- "encoding": never properly understood at all. Write a clear, fresh explanation of the concept.
- "wm_overload": understood in pieces, but holding it all at once (or the full chain, for multi-step concepts) overwhelmed them. Do NOT re-explain the concept — write guidance on breaking it into smaller steps.
- "decay": genuinely known, just gone a bit rusty. Brief encouragement, no re-explanation needed.
- "interference": known but getting mixed up with a specific similar concept — if the specific confused concept is given, name it explicitly and write a direct contrast between the two, addressing exactly that confusion, not a generic "you're mixing things up."
- "schedule_miscalibrated": reviewed on schedule and still failed — the system's own timing was wrong, not their fault.
- "transfer": knows the prerequisites, succeeded once told which to combine — guidance on practicing the same combination in varied framings.
- "integration": knows the prerequisites but couldn't combine them even when told which to use — guidance on practicing the combination, scaffolded.
- "global_chain_failure": every step is solid individually, the full chain is just too long to hold at once — guidance on practicing shorter sub-chains first.
- "misconception": a lightweight, immediate correction during a teaching walk (not a full formal diagnosis) — directly address the specific misconception content given, correcting it plainly, without needing to categorize its deeper cause.

Output ONLY valid JSON, nothing else:
{ "correction": string }`;

export const LOCALIZATION_CHECK_PROMPT = `You are writing ONE quick check question testing whether a student knows a specific prerequisite concept — used to localize exactly where a chain of reasoning broke down, not as a full diagnostic in itself.

You will be given the subject and the concept's name/label.

Keep it short and direct — this just needs a clear pass/fail signal on this one prerequisite. CRITICAL — you will be given only the concept's name/label. Do NOT state, define, or describe what it means anywhere in the question — you're testing whether the student can supply that content themselves, so stating it yourself defeats the entire check. Name the concept if needed to say what you're asking about, then ask the student to define, apply, or demonstrate it — never explain it for them first.

If this specific prerequisite is itself best tested by an actual calculation — a numeric/algebraic problem with a definite answer, in ANY subject where that fits, not just "Maths" — write one rather than forcing a purely verbal question onto a naturally quantitative point. When you do, set "requiresCalculation" true and self-check it: work it through yourself with real numbers you include in the question, confirm it produces a clean, well-defined result, and record your own correct worked answer in "expectedSolution" (never shown to the student). Set "requiresCalculation" false and "expectedSolution" to an empty string for a purely verbal check.

Output ONLY valid JSON, nothing else:
{ "question": string, "requiresCalculation": boolean, "expectedSolution": string }`;

export const REFRAME_QUESTION_PROMPT = `You are rewording a question a student found confusing to read — they've told you directly they didn't understand the wording, not that they don't know the content. Rewrite it to be genuinely clearer and easier to parse: simpler sentence structure, plainer vocabulary, break up anything convoluted.

Do NOT change what the question is actually testing, do NOT make it easier in substance, and do NOT give away or hint at the answer — this must still be a fair, equivalent test of the same thing, just easier to read.

Output ONLY valid JSON, nothing else:
{ "question": string }`;

export const CUED_COMBINATION_PROMPT = `You are re-asking a question the student already got wrong, but this time explicitly telling them which underlying ideas to combine — used to test whether the failure was about COMBINING known ideas (rather than not knowing the ideas themselves, which has already been ruled out).

You will be given the original question and the names of the prerequisite concepts to explicitly cue.

Rules:
1. Output ONLY valid JSON, nothing else.
2. Keep the underlying question the same — just make it explicit which concepts need combining, as a direct hint, not a rewrite of the whole question.
3. CRITICAL — name which concepts to combine, but do NOT combine them yourself or state what the resulting answer is. The cue narrows down WHAT to use; the student still has to actually use it.

Output ONLY valid JSON, nothing else:
{ "cuedQuestion": string }`;

export const PREDICTION_ERROR_QUESTION_PROMPT = `You are writing ONE deliberately hard opening question for a UK GCSE/A-Level student — the first thing they see in a spaced-repetition lesson on a multi-step mechanism, before any scaffolding. It should require applying the FULL mechanism/chain, cold, with no support — the point is to surface a genuine prediction error (a wrong intuitive guess), which is a stronger learning trigger than starting with an easy question.

You will be given the target concept and its subject.

Output ONLY valid JSON, nothing else:
{ "question": string }`;

export const FORWARD_CHUNK_QUESTION_PROMPT = `You are writing ONE question that walks a student FORWARD through part of a causal mechanism, in TEACHING order (cause toward effect) — reconstructing a chunk of the chain themselves, rather than being told it. This is different from testing an isolated fact: it should require the student to reason through this specific step or steps.

You will be given the concept(s) in this chunk, in order, and the subject. If more than one concept is given, the question should require connecting them, not just each one in isolation.

Output ONLY valid JSON, nothing else:
{ "question": string }`;

// Entry point for a WRONG answer to a calculation question specifically
// (see ENCODING_LESSON_BATCH_PROMPT's requiresCalculation steps) — unlike
// a theory question, there's actual shown working to inspect, so
// diagnosis starts by finding exactly where it went wrong, the way a
// human tutor would look over your working — not by re-testing
// understanding of the topic from scratch. Genuinely different tree entry
// from CHECK_ANSWER_AND_SLIP_PROMPT's "slip" (which only has the final
// answer to go on, no working) — this one can actually point at the
// specific line, not just guess from the pattern of wrongness.
export const MATH_ERROR_LOCALIZATION_PROMPT = `You are a maths tutor looking over a UK GCSE/A-Level student's own worked answer to a calculation question, to find exactly where it went wrong — the way a human tutor scans your working line by line rather than just re-teaching the topic from the start.

You will be given the question, the VERIFIED correct solution (the question's own author already worked this through and confirmed it — treat it as ground truth, never shown to the student), and the student's own working (written with a maths input tool, so it may be LaTeX-flavoured — read it as the mathematical expressions it represents, line by line in the order given).

Your job: locate the specific point where their working diverges from a correct approach, then classify what kind of error it is.

Rules:
1. Output ONLY valid JSON, nothing else.
2. Classify "errorType" as exactly one of:
   - "slip": the METHOD and formula/approach used are genuinely correct — the error is an isolated, mechanical one (an arithmetic mistake, a sign flip, a transcription slip, a rounding error) that doesn't reflect any actual misunderstanding. You'd expect this student to get it right on a re-attempt with no re-teaching needed, just more care.
   - "conceptual": the wrong formula or method was used, a step was skipped that isn't actually valid to skip, or the working reveals an actual misunderstanding of what the question is asking or how this type of problem works — a re-attempt without addressing the underlying gap would likely go wrong the same way.
   - "no_attempt": the working is blank, illegible as maths, or abandoned after only a trivial first line with no real attempt at the method — there's nothing substantive to localize an error within.
3. "explanation" — for "slip" or "conceptual", a specific, concrete description of exactly what went wrong and where (e.g. "correctly set up %ΔQd/%ΔP but divided the wrong way round, inverting the ratio" for a slip; "used the formula for cross elasticity instead of price elasticity — divided by the wrong variable's percentage change entirely" for a conceptual error). This must be specific enough that a later correction can be built directly from it, not just "made an error". Null for "no_attempt".
4. "correction" — ONLY for "errorType": "slip". A short, direct, encouraging correction naming exactly where the slip was and what the correct step should have been — for a genuine slip (not a real gap), it's fine to be this direct, since the method itself needs no re-teaching. Null for every other errorType.

Output schema:
{ "errorType": "slip" | "conceptual" | "no_attempt", "explanation": string | null, "correction": string | null }`;

