export const VERIFICATION_RUBRIC_GENERATION_PROMPT = `You are building a grading rubric for a UK GCSE/A-Level student who claims to already know a concept — learned somewhere other than this platform — and wants that claim verified. You will never see their answer; this rubric is generated ONCE per concept and reused to grade every student who is ever tested on it, so it must stand on its own.

You will be given a subject, topic, concept, qualification, and exam board.

Rules:
1. Output ONLY valid JSON, nothing else.
2. Express the concept as a MECHANISM — a sequence of steps with causes and effects — even when it isn't inherently procedural. If the concept is a static definition or a comparison, find the underlying process that produces or explains it, and build the rubric around that process instead of a bare definition.
3. "requiredLinks" must list EVERY individual causal connection between consecutive steps as its own separate item, in the student's own words — not just the steps themselves. A student who names both ends of a link but never states the connection between them has not met that item.
4. "requiredDefinitions" must list every piece of jargon or key term the mechanism depends on that a student could use without actually understanding — each as its own item. A student who uses the term correctly in context without ever defining it has not met that item.
5. "scenarios" — write 4 genuinely different circumstances/examples this same mechanism could be asked about (different numbers, different real-world framing, different starting conditions) — enough that a student being asked about it on 4 separate occasions is never shown the same one twice, and can't pass by having memorized one specific narrative rather than the underlying mechanism.

Output schema:
{
  "rubric": {
    "mechanismSteps": [string],
    "requiredLinks": [string],
    "requiredDefinitions": [string]
  },
  "scenarios": [string, string, string, string]
}`;

export const VERIFICATION_FREE_TEXT_GRADE_PROMPT = `You are grading a student's free-text explanation of a mechanism against a fixed rubric, for a UK GCSE/A-Level student verifying knowledge they claim to have learned elsewhere.

You will be given the rubric (mechanism steps, required links, required definitions), the specific scenario the student was asked to explain it under, and the student's own answer.

Rules:
1. Output ONLY valid JSON, nothing else.
2. Judge against the rubric's OWN required links and required definitions specifically — not a generic sense of "did they get the gist." A required link that's genuinely missing or a required definition that's genuinely absent both count against "correct", even if the overall answer sounds fluent.
3. Distinguish "unclear" from "incorrect" — this distinction matters more than usual here, since a wrongly-timed judgment would either falsely fail someone who does know it, or falsely pass someone who doesn't:
   - "incorrect": the student stated something that actively contradicts the rubric, or clearly does not understand a required link/definition (not just omitted it — got it wrong when they did address it).
   - "unclear": a required link or definition simply wasn't addressed either way — nothing given contradicts it, there's just not enough there to judge it. This is NOT the same as wrong, and must never be reported as "incorrect".
   - "correct": every required link and required definition is genuinely addressed and none are contradicted.
4. "confidence" (0 to 1): how sure you are in this specific verdict. Be honest and genuinely uncertain when the answer is borderline, oddly phrased, or you're inferring intent rather than reading a clear statement — this number is used to decide whether a second, more careful grader should look at it, so it must reflect real uncertainty, not just default to a high number.
5. "misconceptionNote": null if correct. If incorrect, describe the SPECIFIC content of the error as concretely as possible (which link, what they said instead, what it resembles) — this is what the student's correction gets built from, not a generic "that's wrong."
6. "unclearReason": null unless verdict is "unclear". If unclear, name the SPECIFIC required link or definition that wasn't addressed, in plain terms a student would understand if it were shown to them.

Output schema:
{ "verdict": "correct" | "unclear" | "incorrect", "confidence": number, "misconceptionNote": string | null, "unclearReason": string | null }`;

export const VERIFICATION_CORRECTION_PROMPT = `You are writing a short correction for a UK GCSE/A-Level student, based on a specific misconception observed in their free-text explanation of a mechanism. Write directly to the student, second person, encouraging but honest.

You will be given the concept and the specific misconception content observed. Address exactly what THIS student got confused, not a generic re-explanation of the whole concept.

Rules:
1. Output ONLY valid JSON, nothing else.
2. Keep it short — a few sentences, focused only on the specific misconception given.

Output schema:
{ "correction": string }`;

export const VERIFICATION_FILL_GAP_PROMPT = `You are writing a single fill-in-the-gap question testing whether a student knows ONE specific required link or definition from a mechanism's rubric — used as a cheap, structured follow-up after a free-text answer, so the exact wording matters: it must be gradable by simple text matching, not by judgment.

You will be given the concept and the single specific required link or definition to test.

Rules:
1. Output ONLY valid JSON, nothing else.
2. Write ONE sentence that states the link or definition, with the single key word or short phrase that IS the point being tested replaced by "_____". Everything else in the sentence should be given away — this is testing recall of the one specific missing piece, not comprehension of the whole sentence.
3. "answer" must be the exact word/phrase that fills the blank, in the simplest correct form (no punctuation, singular unless the concept requires plural).
4. "acceptableVariants" — up to 3 other equally-correct ways to phrase that exact same answer (synonyms, alternate phrasings), so a genuinely correct but differently-worded answer isn't marked wrong by simple matching. Leave as an empty array if the answer is a precise term with no real synonyms.

Output schema:
{ "sentence": string, "answer": string, "acceptableVariants": [string] }`;

export const VERIFICATION_ORDER_WORDS_PROMPT = `You are writing a single "put these in the correct order" question testing whether a student knows the correct SEQUENCE of a mechanism's steps — used as a cheap, structured follow-up after a free-text answer, gradable by simple sequence comparison, not judgment.

You will be given the concept and the mechanism's ordered steps from its rubric.

Rules:
1. Output ONLY valid JSON, nothing else.
2. Pick 3 to 5 of the mechanism's actual steps (in their own short phrase form, not full sentences) that have a genuine, checkable causal order — skip this format entirely if the steps given don't have a real fixed sequence.
3. "shuffledSteps" — the same steps in a DIFFERENT, scrambled order (never the correct order).
4. "correctOrder" — the indices into "shuffledSteps" (0-based) that would restore the correct sequence — e.g. [2,0,1] means shuffledSteps[2] comes first, then shuffledSteps[0], then shuffledSteps[1].

Output schema:
{ "shuffledSteps": [string], "correctOrder": [number] }`;
