// Three-stage pipeline for generating a subject's knowledge-map graph via
// the API: a GENERATION pass (decompose real spec content into atomic
// micro-concepts + dependency edges), a per-subtopic COVERAGE check
// (does every named theory/model/mechanism in the RAW SPEC TEXT have a
// corresponding node?), then a batch-wide VERIFICATION pass
// (blind-comprehension test every node, check cross-subtopic links,
// check normative-node ordering). See scripts/generate_knowledge_map.js
// for how these are wired together end-to-end.
//
// The coverage check is a genuinely different kind of check from
// verification, not a duplicate of it - verification only ever looks at
// the nodes/edges that already exist and asks whether THEY are correct;
// it has no way to notice a whole named concept that was never generated
// at all, because it never sees the raw specification text to check
// against. This gap is exactly how entire named models (e.g. the
// Harrod-Domar growth model, the Lewis two-sector model, Rostow's stages
// of growth - all explicitly named in the real spec) went missing from a
// hand-built version of this graph for multiple full audit rounds before
// anyone caught it by manual inspection - the graph LOOKED internally
// consistent the whole time, because internal consistency was the only
// thing being checked. Coverage checking against the actual source text,
// per subtopic, immediately after that subtopic is generated, is the
// only check in this pipeline that can catch that failure mode.

export const KNOWLEDGE_MAP_GENERATION_PROMPT = `You are an expert curriculum architect building a prerequisite knowledge graph for one subtopic of a real exam specification. You will be given the subject, qualification, exam board, subtopic name, and the REAL specification content for that subtopic (the actual named theories/concepts a student must learn) - never invent content beyond what's given or your own verified subject knowledge of it.

Your job: decompose this subtopic into atomic micro-concepts and the directed prerequisite edges between them (a DAG - "A -> B" means A must be understood before B makes sense).

## Atomicity rules

1. **One node = one testable idea.** A node should be small enough that a single exam question could target it specifically.

2. **Named theories get their real components, not a label.** If a concept is a THEORY or MODEL with distinct, individually-named sub-components (e.g. game theory has a payoff matrix, dominant strategy, and Nash equilibrium as separate ideas), each named component is its own node, connected in the order one requires the last. Do not create a single node that just names the theory ("Game theory: the prisoner's dilemma") without its actual internal structure - that is a label, not a decomposition.

3. **Mechanisms get their real causal steps, not a single jump.** If getting from a cause to an effect requires an intermediate mechanism a mark scheme or textbook would explain separately (e.g. "government borrows -> issues bonds -> competes for loanable funds -> interest rates rise -> private investment falls" is FIVE steps, not one), each step is its own node. Never compress a multi-step mechanism into a single edge from the trigger straight to the named outcome.

4. **Lists of genuinely named sub-types get split; so do plain prose lists once they have more than one real point.** If a category has specific, independently-examinable named sub-types (e.g. "purchasing economies", "technical economies", "managerial economies" within economies of scale), give each its own node. A loose, undifferentiated list without technical vocabulary (e.g. "advantages of division of labour") still splits into one node per distinct point - see rule 7 for why this applies with particular force to advantages/disadvantages lists specifically.

5. **Normative/evaluative nodes need their grounds kept separate from their evaluation.** Any node of the shape "the case for X" / "should we do X" / "is X justified" must split into: (a) the underlying REASONS/motivations for X, rooted in whatever they actually conceptually require (which is often much earlier or entirely independent of the mechanics of implementing X - do not make reasons depend on implementation mechanics they don't need), and (b) the EVALUATION node, which properly depends on BOTH the reasons AND the costs/mechanics of doing X. Never let a motivation sit downstream of mechanics it isn't actually grounded in.

6. **Root nodes must be genuinely axiomatic.** A node with no prerequisites should be a self-contained definitional or observational fact, not something that quietly assumes prior knowledge you haven't stated.

7. **"Advantages of X" / "Disadvantages of X" are themselves umbrella nodes, not atomic ones - split each into one node per individual justification.** A node like "advantages of division of labour" bundling three or four genuinely separate points (higher productivity, time saved switching tasks, enables specialised machinery) fails rule 1 exactly the way an unsplit named theory fails rule 2 - each individual justification is itself a testable idea, and different justifications routinely rest on different prerequisites (one advantage might need economies of scale defined elsewhere, another might need nothing beyond the concept itself). This matters beyond pure atomicity now that transfer/integration are tested with generated questions requiring EVERY listed prerequisite at once - a bundled node with unrelated prerequisites across its sub-points has no honest single question that tests all of them together, forcing a generation pass to either fake a connection or silently drop one. Only leave a list merged into one node when it is genuinely a single undifferentiated prose point with no separately-groundable justification, not merely because it was written as a single spec bullet.

Once split, check the RESULTING LIST for breadth, not just structure. Two or three obvious points is rarely the real ceiling - a genuine A-Level/GCSE mark scheme for an evaluate-style question typically credits four to six distinct justifications per side. Before finalizing an advantages/disadvantages list, actively brainstorm beyond the first ones that come to mind: are there points grounded in efficiency, cost, risk, stakeholders other than the obvious one, timescale (short vs long run), or a distinguishing feature versus the nearest alternative that haven't been included? A list that's structurally correct (properly split, correctly grounded) but too shallow is still an incomplete decomposition of the specification content - the spec content includes what a real exam would credit, not just what's easiest to think of first.

8. **Named alternatives get split even when the spec lists them together, and EVERY option gets its own advantages/disadvantages - including the default/baseline one.** A specification bullet that names several distinct options in one line (e.g. "profit, revenue, sales maximisation, satisficing") is naming several SEPARATE technical concepts, not one topic with variants - split every option that has its own defining condition or mechanism into its own node, the same way rule 4 splits named sub-types. Then give EACH option its own "Advantages of X" and "Disadvantages of X" nodes per rule 7 (not one shared evaluation node for the whole group, and not one bundled node per option either). This explicitly includes whichever option in the set is the conventional default or textbook baseline (e.g. profit maximisation, a floating exchange rate, the "normal" case in whatever the set is) - it is not exempt just because the others are the ones explicitly framed as "alternatives to" it; being the default is not the same as being beyond evaluation, and a set where every deviation from the baseline gets weighed but the baseline itself doesn't is exactly as incomplete as skipping one of the named alternatives. These evaluation nodes are also exactly the ones most likely to need a real prerequisite from a completely different, non-adjacent subtopic. Actively search the rest of the specification for a concept that genuinely justifies each advantage/disadvantage before falling back to one that's merely nearby in the spec's own ordering - proximity in the specification is not a reason to prefer one prerequisite over a better one elsewhere, and is not a reason to skip adding the edge.

9. **Specific tools/techniques for pursuing a general goal depend on the reasons for wanting that goal, not just its costs.** When the specification has a general "reasons for wanting to do X" node (e.g. reasons for protecting an industry) and separate named tools/techniques for actually doing X (e.g. tariffs, quotas), each technique node depends on the reasons node, in addition to whatever technical mechanism prerequisites it has of its own. Do not leave the technique nodes floating independently of the motivation, wired to it only through a final shared evaluation node - a student who learns exactly how a tariff diagram works before ever being given a reason anyone would want one has been taught the mechanism ungrounded. This does not contradict rule 5: rule 5 says the reasons don't need to depend on any technique's mechanics (that independence runs one way), it does not say the techniques are independent of the reasons.

10. **A concept that explains WHY an option is chosen is that option's prerequisite, not its consequence.** When node C is the reason a student/firm/policymaker would adopt option O in the first place (e.g. an agency or information problem that motivates choosing a non-standard objective, a market failure that motivates an intervention), the edge is C -> O. Do not point it the other way just because C happens to get taught, or gets its own separate treatment, later in the specification's own ordering - teaching order and specification ordering are not the same thing as genuine prerequisite direction, and this rule takes priority over any assumption based on where each concept sits in the source text.

## Output format

Return ONLY valid JSON:
{
  "nodes": [ { "id": "SHORT_ID", "label": "Concept name" }, ... ],
  "edges": [ ["FROM_ID", "TO_ID"], ... ]
}

IDs should be short, unique within this subtopic, and stable (avoid renaming across regenerations where possible). Do not include any node or edge not implied by the actual specification content given.`;

// Runs once per subtopic, immediately after KNOWLEDGE_MAP_GENERATION_PROMPT
// produces that subtopic's nodes - the only check in this pipeline that
// compares the output against the actual RAW SPEC TEXT rather than just
// checking the nodes/edges are internally consistent with each other.
// This is a completeness check on EXTRACTION, not a correctness check on
// structure - it exists specifically to catch a generation pass that
// quietly dropped a named theory, model, sub-type, or mechanism the
// specification text actually names, which no amount of checking the
// nodes that DO exist can ever surface.
export const KNOWLEDGE_MAP_COVERAGE_PROMPT = `You are checking whether a knowledge-graph generation pass actually extracted every named concept from a real specification excerpt, or silently dropped some.

You will be given the raw specification text for one subtopic, and the list of node labels a generation pass produced from it.

Your ONLY job: read the specification text closely and list every named theory, model, mechanism, named sub-type, or technical term it mentions that has NO corresponding node in the given list (even loosely/indirectly corresponding - only flag genuine, clean omissions).

Rules:
1. Output ONLY valid JSON, nothing else.
2. Be specific: for each missing concept, quote or closely paraphrase the exact term/name as it appears in the specification text, not a vague category.
3. Named theories and models (anything with a proper name - a person's name attached to a model, a named framework, a named curve/law/effect) are the highest-priority thing to check for specifically. These are the easiest kind of gap to miss because they're often mentioned in one dense sentence rather than given their own heading, and the most costly to miss because each one implies substantial internal structure that will also be missing.
4. Do not flag something as missing just because it could theoretically be split further (that is a job for a different check) - only flag it if there is genuinely no node covering it in any form at all.
5. If the specification text is fully covered, return an empty list - do not invent a gap to have something to report.

Output ONLY valid JSON, nothing else:
{ "missingConcepts": [ { "term": "the exact/paraphrased name from the spec text", "whyItMatters": "one sentence on what a student would miss without it" } ] }`;

export const KNOWLEDGE_MAP_VERIFICATION_PROMPT = `You are a rigorous curriculum QA reviewer checking a knowledge-map graph for a real exam specification. You will be given a batch of nodes and edges (possibly spanning several subtopics) already produced by a generation pass. Your job is NOT to regenerate it - it is to find what's wrong with it, using three specific checks.

## Check 1: The blind-comprehension test (run this on EVERY node)

For each node, ask: "If I knew ONLY what this node's direct prerequisites tell me (or, for a root node, only general foundational literacy), could I actually understand or derive this node's concept?" If the answer is no, something is missing - either:
- a missing intermediate node (a real step was compressed away), or
- a missing prerequisite edge to an existing node, or
- a wrong edge (the stated prerequisite doesn't actually ground this concept, and something else does).

Do not skip this for nodes that only have one prerequisite - single-step compression of a real multi-step mechanism is the most common failure, not just wrong combinations at convergent nodes.

Separately, check every "Advantages of X" / "Disadvantages of X" node against rule 7: does its label or implied content bundle more than one genuinely separate justification? If so, that is itself an issue to report (type missing_intermediate_node) even when every prerequisite edge it currently has is individually correct - the bundling itself is the defect, and the fix should split it into one node per justification with each one's own prerequisites.

Separately again, check each already-split advantages/disadvantages SET (not each node individually) for breadth: count how many distinct nodes exist for that one option's advantages, and the same for its disadvantages. Two or fewer on either side is a strong signal the decomposition stopped too early - a real mark scheme for this kind of content typically credits four to six distinct points per side. If a set looks thin, report it as missing_intermediate_node with new_nodes proposing the additional genuine justifications a mark scheme would credit (grounded in efficiency, cost, risk, stakeholders, timescale, or a distinguishing feature versus the nearest alternative) - not invented padding, but real points that were simply never generated the first time.

## Check 2: Cross-subtopic / cross-theme linking

Two concepts that are actually the same underlying mechanism, or where one is a real prerequisite of the other, can end up sitting in different subtopics with no edge between them simply because they were generated in different batches. Scan for:
- Two nodes describing the same phenomenon under different names/framings (these should be merged or explicitly linked, not left as disconnected duplicates).
- A node that clearly requires a concept from a different subtopic/theme that hasn't been wired in (e.g. a "growth" concept that never references the GDP measurement concept it's actually built on).
- Every "Advantages of X" / "Disadvantages of X" node specifically: these are the single most common place a real prerequisite from a distant, non-adjacent subtopic goes missing, because the generation pass for X's own subtopic has no reason to know about a concept several subtopics away. For each one, actively check the rest of the specification (every theme, not just neighbouring subtopics) for a concept that genuinely grounds that specific advantage or disadvantage, and add the edge even though it will look "out of place" next to nodes that were generated together.
- Every set of named alternatives that got adv/dis nodes for SOME members: check whether the set's default/baseline option was left out. This is a specific, easy-to-miss failure mode - the generation pass evaluates the options explicitly framed as "alternatives to X" but silently treats X itself as needing no evaluation because it's the normal case, not "an alternative." If two or three options in a set have advantages/disadvantages and one doesn't, that is a missing_intermediate_node issue even when the missing one is the baseline.

## Check 3: Ordering of normative/evaluative nodes and explanatory concepts

For every node shaped like "the case for X", "reasons for X", "should X happen": confirm its REASONS component is not gated behind implementation mechanics it doesn't actually need, and its EVALUATION component (if separate) properly requires both the reasons and the costs/mechanics.

Separately, wherever a general "reasons for wanting to do X" node exists alongside specific named tools/techniques for doing X: confirm each technique depends on the reasons node, not just on its own technical prerequisites. A technique wired to the reasons only through a shared downstream evaluation node (rather than directly) is exactly this bug - it means a student would learn the mechanism before ever being given a reason to want it.

Separately again, for every node C that exists to explain WHY some option O is chosen/adopted (an agency problem, an information failure, a market failure that motivates an intervention, etc.): confirm the edge runs C -> O, not O -> C. A common error is pointing this backwards because C got its own dedicated treatment later in the specification's own ordering - specification ordering is not evidence of genuine prerequisite direction, and an edge that only makes sense as "O explains C" when C is clearly the motivating concept for O is a wrong_edge, not a stylistic choice.

## Output format

Return ONLY valid JSON, one entry per issue found:
{
  "issues": [
    {
      "type": "missing_intermediate_node" | "missing_edge" | "wrong_edge" | "duplicate_concept" | "ordering_bug",
      "affected_node": "NODE_ID",
      "explanation": "one or two sentences, specific enough to act on",
      "fix": {
        "new_nodes": [ { "id": "...", "label": "..." } ],
        "new_edges": [ ["FROM_ID", "TO_ID"] ],
        "remove_edges": [ ["FROM_ID", "TO_ID"] ]
      }
    }
  ]
}

If a check finds nothing wrong, do not invent an issue to report - an empty or shorter list is a valid, honest result. Do not re-approve or re-describe nodes that are already correct.`;
