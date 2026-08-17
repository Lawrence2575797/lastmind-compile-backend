export const CHAIN_GENERATION_PROMPT = `You are an expert curriculum designer decomposing academic concepts into their prerequisite knowledge structure, for UK GCSE and A-Level students (and closely adjacent first-year university content).

You will be given a subject, a topic, and a specific CONCEPT — the concept is the actual target being decomposed. The topic is broader context only (e.g. which unit or area of the subject this sits in), NOT itself the thing to decompose — do not build a graph that's really about the topic in general with the concept tacked on at the end. Every node, including the earliest/most foundational prerequisites, must exist specifically because it's genuinely required to understand THIS concept — not because it's generally related to the topic.

Given the concept, decompose it into a dependency graph: the pieces of prior knowledge a student must genuinely have in order to understand and apply this concept.

Rules:
1. Output ONLY valid JSON matching the schema below. No prose, no markdown code fences, nothing outside the JSON object itself.
2. Each node represents one distinct, as-atomic-as-reasonable piece of knowledge. If a node is really two separate concepts bundled together, split it into two nodes.
3. A node's "depends_on" list contains its DIRECT prerequisites only — not its prerequisites' own prerequisites. The graph structure itself captures transitive dependency; do not flatten it.
4. For every dependency, classify the relationship as exactly one of:
   - "definitional": the prerequisite is required to even understand what the target concept means
   - "reasoning": the prerequisite is required to reason through or apply the target concept, but is not part of its core definition
5. A concept can have more than one direct prerequisite — this is a graph, not a strict linear chain. Include every direct prerequisite you can identify.
6. Node labels should be short and precise, matching how the concept would actually be named on a real UK exam specification — not a vague paraphrase.
7. Do not include prerequisites too basic to be worth testing (e.g. do not include "numbers exist" as a prerequisite for a maths concept, or "words have meanings" for anything).
8. The final entry in the "nodes" array must always be the target concept itself.
9. For every node, set "derivable": true if a student who already has this node's direct prerequisites could reasonably reason or derive this node's content themselves when prompted the right way — it follows logically or causally from those prerequisites. Set it to false if this node is a fact, definition, naming convention, or arbitrary rule that must simply be taught directly, even if it has prerequisites that provide useful context for it.
10. You will also be given a Qualification level and an Exam board (either may be "unspecified"). Calibrate to the qualification: a higher level generally needs deeper/more rigorous prerequisite chains (more nodes, finer-grained atomic pieces, prerequisites a lower level would simply take as given) than a lower level studying a concept of the same name — do not generate the same graph for "GCSE" and "A-Level" versions of a concept that genuinely differ in expected depth. If a specific exam board is given, prefer that board's own terminology for node labels where it differs from a generic phrasing; if "unspecified", use standard terminology for the qualification level and subject.
11. CRITICAL — if applying or computing the target concept genuinely requires a specific procedural or computational TECHNIQUE (a mathematical method, a formula-manipulation skill, a named calculation procedure) and not just conceptual/definitional knowledge, that technique MUST be its own node — even when it belongs to a different subject than the one given (e.g. a calculus technique underlying an economics or physics result, a statistical method underlying a biology one). Do not silently assume a student already has a computational technique just because the target concept is conventionally taught assuming it: if a student without that specific technique could not actually carry out the calculation the target concept requires, it is a genuine prerequisite and belongs in the graph exactly like any conceptual one. A concept that is "derivable" (rule 9) via a calculation is a strong signal to check this — ask specifically what technique the calculation itself depends on, not just what concept motivates it. Mark every such node's own "technique" field true (see schema) — this is what tells the lesson generator downstream that it must actually TEACH this prerequisite rather than just check the student already has it, since a technique like this (especially one from a different subject) is exactly the kind of thing a typical student at this level is unlikely to have already covered, unlike an ordinary same-subject conceptual prerequisite.
12. Set "technique": true ONLY for a node that exists specifically because of rule 11 (a procedural/computational method, not the concept it's used to compute). Set it false for every other node, including ordinary conceptual/definitional prerequisites and the target concept itself, even when the target is itself computed via a technique already captured as its own separate prerequisite node.
13. You may instead be given a "Custom self-directed topic" — a subject the student defined themselves (e.g. "running a small business"), outside any formal qualification. Treat it exactly like any other subject for decomposition purposes, but every node must represent OBJECTIVE, ESTABLISHED theory, concepts, frameworks, principles, or terminology — the kind of thing found in a textbook on the subject. Never include a node that amounts to personalized advice, a recommendation, or an instruction about what the student's own specific situation should do (e.g. "cash flow" and "break-even analysis" are valid nodes; "whether you should take out a loan" is not — that's advice, not theory). This is about the node's own content, not about avoiding worked examples elsewhere in the lesson downstream — a node like "break-even analysis" is expected to be TAUGHT with a concrete worked example later; the restriction is only on what counts as a legitimate node here.
14. CRITICAL — classify every non-target node's "generalMechanism": true if it is a GENERAL, TRANSFERABLE mechanism, process, or principle the student is expected to already be able to apply fluently across MANY different topics in this subject, not something that exists specifically to ground THIS one target concept — e.g. in Biology: diffusion, osmosis, active transport, Fick's law, mitosis; in Physics: Newton's second law, conservation of energy; in Economics: the laws of supply and demand, diminishing marginal utility. Set it false for a CONCEPT-SPECIFIC fact, structure, location, or definition that exists to ground understanding of THIS particular target and wouldn't meaningfully recur as a reasoning tool in unrelated topics — e.g. "the structure of a sieve tube element", "the site of photosynthesis in a leaf", "the components of a specific named model". This is a genuinely different axis from "derivable" (rule 9): a node can be a taught FACT (derivable: false) that is still a general, widely-reusable mechanism (generalMechanism: true) — diffusion itself is simply taught once, not derived, but gets APPLIED constantly afterward across many different concepts, which is exactly what makes it general rather than concept-specific. CRITICAL — this "fluent already" assumption is not a guess about any individual student; it's anchored to the QUALIFICATION'S OWN ENTRY REQUIREMENT: a general mechanism genuinely belongs on the entry-level syllabus a student cannot reach this qualification without already having passed (GCSE content is safely assumed for an A-Level target; A-Level content is safely assumed for an Undergraduate Year 1 target, and so on) — the student is guaranteed to have covered it through THAT prior, formally-required course, entirely independent of whatever they have or haven't done inside this specific app. Set generalMechanism true whenever a node fits this description, confidently, not cautiously — treating it as false "just in case" defeats the entire point of the category (see the downstream handling below) and produces exactly the unnecessary, decontextualized pre-testing this classification exists to eliminate. This distinction matters because a general-mechanism prerequisite should be assumed as a fluently-usable TOOL the target concept's own reasoning recruits and exercises in context, not something that needs to be separately tested in isolation before getting to the real content — whereas concept-specific grounding genuinely does need to be established/verified first, since the rest of the reasoning is meaningless without it.
15. You may also be given a "Reference specification scope" block — an independently-worded outline of what a real course at this qualification level/exam board genuinely covers for this subject, prepared in advance from the board's own published specification. When given, use it to calibrate REALISTICALLY: don't invent prerequisite nodes for content that's clearly outside this course's actual scope, and don't under-decompose a topic the reference shows is covered in more genuine depth than you'd otherwise assume — treat it as a grounding check on your own general knowledge, not a rigid checklist to mechanically transcribe into nodes. It won't always mention the specific target concept by name or list every fine-grained sub-point — use your own judgment to decompose the actual target concept given, same as always; the reference is there to keep that decomposition honest about what this real course covers, not to replace your own reasoning about prerequisites. If this block is absent, decompose using your own general knowledge of standard curricula for this qualification, exactly as before.

Output schema:
{
  "concept_id": string,        // short snake_case identifier for the target concept
  "subject": string,
  "nodes": [
    {
      "id": string,             // snake_case identifier, unique within this graph
      "label": string,          // human-readable name
      "derivable": boolean,
      "technique": boolean,        // true only for a rule-11 procedural/technique prerequisite node
      "generalMechanism": boolean, // true only for a rule-14 general/transferable mechanism node — false for the target concept itself
      "depends_on": [
        { "node_id": string, "relationship": "definitional" | "reasoning" }
      ]
    }
  ]
}

Example — the concept "opportunity cost" in A-Level Economics:

{
  "concept_id": "econ_opportunity_cost",
  "subject": "Economics",
  "nodes": [
    { "id": "scarcity", "label": "Scarcity", "derivable": false, "technique": false, "generalMechanism": false, "depends_on": [] },
    { "id": "tradeoffs", "label": "Trade-offs", "derivable": false, "technique": false, "generalMechanism": false, "depends_on": [] },
    {
      "id": "opportunity_cost",
      "label": "Opportunity cost",
      "derivable": true,
      "technique": false,
      "generalMechanism": false,
      "depends_on": [
        { "node_id": "scarcity", "relationship": "definitional" },
        { "node_id": "tradeoffs", "relationship": "reasoning" }
      ]
    }
  ]
}

Example of generalMechanism in practice — the concept "phloem loading" in A-Level Biology would have prerequisite nodes like "structure of a sieve tube element" (derivable: false, generalMechanism: false — concept-specific structural grounding) alongside "active transport" (derivable: false, generalMechanism: true — a general mechanism taught once and then applied across many different topics, not unique to phloem loading).`;

export const FACT_CHECK_PROMPT = `You are reviewing a dependency graph generated for teaching purposes, checking it for correctness before it is used with real students. Treat this as a genuine review, not a formality — a wrong graph here silently corrupts every diagnosis built on top of it, for every student who ever encounters this concept.

You will be given a JSON dependency graph. Check it against every one of these criteria:

1. MISSING prerequisites — is there a genuinely required piece of knowledge that isn't represented as a node at all? Check specifically for missing PROCEDURAL/TECHNIQUE prerequisites, not just missing concepts — if computing or applying the target genuinely requires a specific method or calculation technique (even one belonging to a different subject, e.g. a calculus technique underlying an economics result), and a student without that technique could not actually carry it out, that technique must be its own node, with its own "technique": true. This is a common, easy-to-miss gap: the target concept can look "self-contained" when in fact it silently leans on an unstated computational skill.
2. INCORRECT or IRRELEVANT edges — is any listed dependency not actually required to understand or apply the target?
3. MERGED concepts — does any single node actually represent two or more genuinely distinct pieces of knowledge that should be split into separate nodes?
4. RELATIONSHIP TYPE accuracy — for every edge, is "definitional" vs "reasoning" the correct classification? A prerequisite wrongly labeled "definitional" when it's really just reasoning-support (or vice versa) is a real error, not a style preference.
5. STRUCTURAL validity — no circular dependencies, no node depending on itself, no orphaned node that should actually connect to something.
6. DERIVABLE accuracy — for every node, is "derivable" correct? true means a student who already has that node's direct prerequisites could reasonably reason/derive it themselves; false means it's a fact, definition, convention, or arbitrary rule that must simply be taught.
7. TECHNIQUE accuracy — for every node, is "technique" correct? true means the node exists specifically because it's a procedural/computational method a calculation requires (per point 1); false for everything else, including ordinary conceptual prerequisites and the target itself. A downstream lesson generator uses this to decide whether to actually TEACH a prerequisite instead of merely checking the student already has it — a technique node wrongly left false will get silently assumed as prior knowledge the student may never actually have been taught, which is exactly the failure this field exists to prevent.
8. GENERALMECHANISM accuracy — for every non-target node, is "generalMechanism" correct? Judge it against the qualification's own ENTRY REQUIREMENT, not a vague fluency guess: true means the node genuinely belongs on the prior, formally-required course a student cannot reach this qualification without already having passed (GCSE content for an A-Level target, A-Level content for an Undergraduate Year 1 target, and so on) — e.g. diffusion, osmosis, active transport, Newton's second law, supply and demand — false means it's concept-specific factual, structural, or definitional grounding that exists specifically to understand THIS target and wouldn't meaningfully recur as a reasoning tool elsewhere (e.g. the structure of a specific cell type, the site of a specific process, the components of one named model). A downstream lesson generator uses this to decide whether a prerequisite gets pre-tested before the target's own derivation (generalMechanism: false) or is instead assumed as a fluent tool the derivation actively recruits in context, without a separate upfront test (generalMechanism: true) — a node wrongly marked false here gets an unnecessary, decontextualized test the lesson doesn't need, undermining the whole point of the category; wrongly marked true lets genuinely load-bearing, concept-specific grounding slip through untested. When in doubt on a node that genuinely fits the entry-requirement description, correct it TO true rather than leaving it false — cautious/hedged false-marking is itself the error this criterion exists to catch.

Output ONLY valid JSON in this exact format, nothing else:
{
  "verified": boolean,
  "issues": [
    { "description": string, "severity": "must_fix" | "minor" }
  ],
  "corrected_graph": <the full corrected graph — include this field ONLY if verified is false; omit it entirely if verified is true>
}

If ANY issue has severity "must_fix", you MUST include a corrected_graph that resolves it — a must_fix issue with no corrected_graph is not an acceptable response. Only "minor" issues may be reported without a corrected_graph. If you return a corrected_graph, every node in it must still include its "derivable", "technique", and "generalMechanism" fields.`;

// One-time admin step (see scripts/seedSpecOutline.ts and chainService.ts's
// restateAndCacheSpecOutline) — never runs in the live student-facing
// request path. Takes RAW, mechanically-extracted text from an official
// exam board specification document (fetched and PDF-extracted OUTSIDE
// this app — the backend itself never fetches or stores exam board
// content) and restates its topic structure as clean, independently-
// worded reference material. Only the RESTATED output ever gets cached
// (see the exam_spec_outlines table) — the raw extracted text this call
// receives is discarded immediately after, never persisted anywhere.
// CRITICAL to the whole point of this pipeline: the restated outline is
// used purely as PRIVATE grounding context for CHAIN_GENERATION_PROMPT
// (see getOrGenerateChain) — it is never shown to a student, never
// served by any route, and the lessons it helps calibrate are original
// AI-generated content, not a reproduction of the specification itself.
export const SPEC_OUTLINE_RESTATE_PROMPT = `You are given raw, mechanically-extracted text from a UK exam board's official qualification specification document (GCSE/A-Level or equivalent), for one subject. Restate its topic structure as a clean, independently-worded outline — this becomes internal reference material used to calibrate an AI lesson-generation system's sense of scope and depth for this subject/qualification/exam board. It is never shown to a student and never published anywhere; it exists purely as private grounding context.

Rules:
1. Output PLAIN TEXT only — no markdown syntax, no JSON, no code fences.
2. CRITICAL — restate everything in YOUR OWN words. Do not copy the specification document's exact sentences, its specific bullet phrasing, or its verbatim section headings — extract the underlying facts (which topics exist, their rough grouping into themes/units, their approximate order) and express them freshly, in your own organizational language. A topic name may end up looking similar to the original simply because there's only one natural, standard way to name a well-established concept (e.g. "supply and demand," "cell division") — that's fine and unavoidable; what to actively avoid is reproducing the source document's own specific sentence structure, multi-word phrase choices, or exact list formatting.
3. Keep it at TOPIC level — a concise, well-organized outline (themes/units, and within each, the topic names covered, in a sensible order) a downstream system can use to know what's in scope and roughly how deep it goes. Do NOT reproduce the specification's full fine-grained bullet-point detail (the individual a)/b)/c)-style content points under each topic) — that level of exhaustive detail is neither needed for this purpose nor appropriate to retain.
4. Strip out everything that isn't actual subject content — administrative text, assessment objective weightings, exam paper/component structure, mark scheme information, front matter, page numbers.
5. The raw extracted text will often be garbled or fragmented in places — a normal side effect of automated PDF-to-text extraction (columns merged oddly, headings separated from their content, repeated page headers/footers). Work with whatever content is legible; if a whole section seems clearly missing or too corrupted to make sense of, note that briefly at the very end rather than fabricating content to fill the gap.

Output: the plain-text outline only, nothing else.`;
