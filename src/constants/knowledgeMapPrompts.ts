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

11. **A definitional node stays a pure definition - what the thing IS, not what it DOES.** A node naming a policy, tool, or mechanism (e.g. "maximum price") should state only its definition (what it is, who does it, where it's typically used) - not fold in its effects, advantages, or disadvantages. Those are separate downstream nodes (rules 4/7/8) that DEPEND ON the definition; a definition node bundling in "...which reduces price and therefore protects consumer surplus" has smuggled a whole downstream evaluation chain into what should be a single axiomatic fact (rule 6). This is rule 1 applied specifically to definitions, which are the node type most likely to silently absorb their own consequences.

12. **An evaluation of a multi-step mechanism/process depends on the SPECIFIC step it evaluates, not the process's opening/definition node - and never assume every flaw only shows up after the first step.** When a named model/process is decomposed into a real causal chain (rule 3: step 1 -> step 2 -> step 3 -> ...), do not let every advantage/disadvantage default to depending on step 1 just because that's the node that names the model. Ask what the evaluation is actually about: if it critiques a specific step's own assumption (e.g. "assumes the reinvestment in step 3 is done productively"), it depends on THAT step, not the opening definition; if it evaluates the process as a whole (e.g. "this explains real-world industrialisation"), it depends on the LAST step (the completed chain), not the first - evaluating a finished process on its opening premise alone skips over everything the process actually claims to do. A single umbrella disadvantage combining flaws that target different steps must be split into one node per step-specific flaw (rule 4/7), each wired to its own step.

13. **When a disadvantage is actually a rebuttal of a specific advantage, it depends on that advantage directly, not just the shared definition.** Real evaluation in economics (and any evaluative subject) works by weighing a benefit against a specific challenge to it, not just listing unrelated pros and cons side by side. If disadvantage D specifically undercuts, complicates, or casts doubt on advantage A rather than being an independent cost of its own (e.g. "firms cut quality to protect margins" directly undermines "the price cut protects consumer surplus" and "the discipline effect improves efficiency" - the saving or the efficiency gain may not be real if quality is quietly cut instead), the edge is A -> D, in addition to whichever other genuine grounding D has. A disadvantage that only ever depends on the bare definition, when it's actually a direct response to one specific advantage, is throwing away the real evaluative relationship a mark scheme would credit for connecting the two.

14. **Distinct stakeholder-group impacts of one policy/event must be split by group, not bundled into one "effects" node.** When a policy or event (a tariff, a tax, a minimum wage, a merger) affects several distinct parties differently (e.g. domestic producers gain, consumers lose, the government gains revenue, foreign producers lose), each group's impact is its own node. A mark scheme credits "identifies the effect on producers" and "identifies the effect on consumers" as separate points, so a single bundled "winners and losers" node fails rule 1 the same way an unsplit advantages/disadvantages list does (rule 7) - the two failure modes are the same defect (independently-markable points bundled together), just triggered by stakeholder identity rather than by argument type.

15. **Distinct properties/dimensions of one concept that a mark scheme would credit separately must be split, even when they are always taught side by side.** Some concepts are conventionally defined by two or more named properties that are each independently examinable (e.g. a public good's non-excludability and non-rivalry; a policy objective's being both "low" and "stable"). If a student could know one property without the other, and a mark scheme would award a mark for stating either one alone, they are separate nodes - do not merge them just because the specification always mentions them in the same breath.

16. **A concept with a standard exam diagram splits into three layers - reusable diagram-construction skills, the concept itself, and diagram-application/reading nodes - never one bundled node claiming both understanding and diagrammatic fluency.** A student can genuinely understand what a concept IS without being able to draw or read it correctly on a diagram, and vice versa - these are separately forgettable, separately markable skills (a real mark scheme awards construction marks and interpretation marks separately). Concretely:
    - (a) If the diagram is built from generic components used elsewhere in the specification (a demand curve, a supply curve, an AD curve, a PPF), each component gets its own "draw/construct X" node, reused by every topic whose diagram needs it - do not duplicate a drawing-skill node per topic. A new diagram-application node wires to the EXISTING construction node(s) it depends on, not a fresh copy.
    - (b) The underlying concept (what consumer surplus IS, what an indirect tax does to an equilibrium) stays its own node, separate from locating or reading it correctly on an already-constructed diagram.
    - (c) A node whose real content is "identify/shade/read X on the diagram" (e.g. "identify the area of consumer surplus on a supply-and-demand diagram") depends on BOTH the underlying concept node from (b) AND every diagram-construction node from (a) that the specific diagram actually requires (e.g. both demand and supply for a consumer-surplus diagram) - never just one, and never skip straight from the bare concept to the application without the construction nodes in between.

18. **A node's own definition/label must never silently lean on a concept it doesn't list as a prerequisite - trace every technical term IN the label/definition back to where it's taught, even when that term feels like obvious background.** Before finalizing a node, reread its own definition and ask: does stating this properly require a term, distinction, or assumption that is itself a real concept taught somewhere in this subject? If so, that concept is a genuine prerequisite, not assumed background - wire the edge even when the prerequisite feels foundational enough to "go without saying." Two concrete failure patterns this targets specifically:
    - A node that states a general rule/measure alongside a hidden precondition it silently assumes (e.g. a node defining "utility" that also asserts or relies on people behaving rationally to maximise it) must split the precondition out into its own node (e.g. "the rationality assumption in economics") and depend on it - do not fold an assumption into the same node as the definition it's needed to justify.
    - A node whose definition is only fully intelligible given ANOTHER named concept in the same subject (e.g. price elasticity of demand presupposes what "demand" itself is, and demand's own prerequisites) must depend on that concept, not sit as a root node - a root node (rule 6) is one where NOTHING is silently assumed, not one where the assumption merely wasn't written down. When in doubt about whether a term is "genuinely foundational" versus "a taught concept being assumed", check whether the specification or a mark scheme teaches/defines that term anywhere else in the subject - if it does, it is a prerequisite, full stop.

19. **Enforce a hard chunk ceiling on any node whose content is itself a list (vocabulary sets, enumerated rules, named items) - never let a single node's content exceed roughly 4 distinct items a student must hold in mind at once, even when the specification presents them as one bullet.** This is the working-memory constraint (~4 chunks, ideally fewer) that governs every lesson generated from a node later, not just this generation pass - a single node whose content is, say, 20-30 discrete vocabulary items (e.g. "numbers 0-100") guarantees a downstream lesson that violates working-memory limits no matter how carefully that lesson is written, because the node itself already bundled too much. When a specification bullet names a set larger than ~4-6 clearly-grouped items, split it into multiple sequential nodes of ~4 items each (e.g. numbers 0-10, numbers 11-20, tens 20-100, the irregular teens, as separate nodes in sequence, each depending on the previous), rather than one node carrying the whole set. Exemptions from rule 16/17's own layering (the joint price-and-quantity reading, the two sides of one transaction, inseparable "causing" steps) still apply unchanged - this rule targets genuinely large, enumerable lists, not the small paired facts those exemptions already cover.
{{PRACTICAL_RULE}}
## Exemptions - do not over-split these

Splitting has a cost too: a node that is broken into pieces which are never independently forgettable just adds graph noise without adding diagnostic value. Do not split:
- **A formula that IS the definition** (e.g. "price elasticity of demand: definition and calculation" for PED/YED/XED/PES) - the formula is not a separate fact bundled with the definition, it just IS the definition restated symbolically.
- **A joint price-and-quantity reading off ONE shifted diagram** (e.g. "the tariff raises the domestic price and reduces the quantity demanded") - both readings come from the same single diagram manipulation, so a student who can do one can trivially do the other; they are not independently forgettable.
- **The two sides of one transaction** (e.g. borrowing and lending, buying and selling) - each side is the mechanical mirror of the other, not a separate fact.
- **Near-synonym pairs that only make sense read together in their specific context** (e.g. "consumer choice and variety" as a single benefit of competition) - split only when the two halves are genuinely separately markable, not whenever a label happens to contain "and".
- **A single causal-chain step phrased with "causing"/"leading to"** (rule 3 already covers this as one step, not two) - a step and its immediate, inseparable consequence within the same mechanism link are one node, not two.

## Difficulty estimate (every node and every edge)

Give every node a "difficulty" number from 0 to 1, and every edge a "difficulty" number from 0 to 1 - both estimated RELATIVE TO THE OVERALL DIFFICULTY OF THIS COURSE, not against some absolute or cross-subject scale (0.5 means "typical difficulty for a concept in this specific course", not "medium difficulty in general"). For a node, this is how hard the concept itself is to grasp and recall once its prerequisites are in place. For an edge, this is how hard the INTEGRATION is - how non-obvious or effortful it is to combine the two connected concepts together, independent of how hard either one is alone (two easy concepts can have a hard integration if combining them is a genuine conceptual leap; two hard concepts can have an easy, obvious link). This estimate feeds a downstream spaced-repetition scheduling model - be a genuine, differentiated judgment call across the batch (do not default everything to the same value), grounded in what would actually make a student more likely to get this wrong or need more repetition: unusual/counterintuitive content, heavy abstraction, easily-confused near-neighbors, or (for edges) a link that requires real synthesis rather than a small obvious step.

## Output format

Return ONLY valid JSON:
{
  "nodes": [ { "id": "SHORT_ID", "label": "Concept name", "difficulty": 0.0 }, ... ],
  "edges": [ { "from": "FROM_ID", "to": "TO_ID", "difficulty": 0.0 }, ... ]
}

IDs should be short, unique within this subtopic, and stable (avoid renaming across regenerations where possible). Do not include any node or edge not implied by the actual specification content given.`;

// Substituted into KNOWLEDGE_MAP_GENERATION_PROMPT's {{PRACTICAL_RULE}}
// placeholder ONLY for subjects with real lab/fieldwork content (see
// scripts/generate_knowledge_map.js's HAS_PRACTICAL_CONTENT flag) - for
// everything else (economics, maths, most humanities) it's replaced with
// an empty string. Rule 17 never fires outside a practical subject, so
// there is no reason to spend input tokens on it, or risk it nudging the
// model toward inventing lab content that was never asked for, on every
// single subtopic generation call for a subject it can never apply to.
export const KNOWLEDGE_MAP_GENERATION_PROMPT_PRACTICAL_RULE = `
17. **An experimental/practical technique splits into the same three layers as rule 16's diagram split - reusable procedural sub-skills, the concept the experiment investigates, and application/interpretation nodes that use the experiment's own output - never one bundled node claiming both "how to do it" and "why it works".** This applies across every science, not one subject specifically: a student can correctly carry out a technique (follow the steps, use the apparatus correctly) without understanding why it works, and vice versa - these are separately forgettable, separately markable skills, exactly like construction vs. concept vs. application for a diagram, just for lab/fieldwork instead of drawing. Concretely:
    - (a) If the technique is built from generic procedural sub-skills used across multiple investigations (e.g. reading a burette to the nearest graduation, using a top-pan balance, preparing a serial dilution, taking a timed reading at fixed intervals, calibrating an instrument before use), each sub-skill gets its own node, reused wherever it's actually used - do not duplicate a "how to use a burette" node under every experiment that happens to need one. A new experiment's procedure node wires to the EXISTING sub-skill node(s) it depends on, not a fresh copy.
    - (b) The underlying concept the experiment is designed to investigate or demonstrate (why an indicator changes colour at the endpoint, what absorbance measures, why potential difference varies with current) stays its own node, separate from being able to actually carry out the procedure that investigates it.
    - (c) A node whose real content is calculating or interpreting a result FROM the experiment's own data (e.g. "calculate the concentration of the acid from the titre volume", "calculate resistance from the gradient of a V-I graph") depends on BOTH the procedure node(s) that produced the data AND the concept node that explains what the data means - never just one, and never skip straight from the bare concept to the calculation without the procedure node that actually generates the numbers.
    - (d) "Evaluate this method" / "identify sources of error or improvements" nodes depend on the SPECIFIC procedure step they're critiquing (same logic as rule 12), not a generic "practical work" umbrella - a systematic error in reading a meniscus and a random error from an unstable water bath are critiques of different steps, not the same node, and each needs its own edge back to the step it actually targets.
`;

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

// Substituted into KNOWLEDGE_MAP_VERIFICATION_PROMPT's {{PRACTICAL_CHECK}}
// placeholder ONLY for subjects with real lab/fieldwork content - see
// KNOWLEDGE_MAP_GENERATION_PROMPT_PRACTICAL_RULE's comment for why this
// is kept out of the base prompt for every other subject.
export const KNOWLEDGE_MAP_VERIFICATION_PROMPT_PRACTICAL_CHECK = `Separately again, for any subject with practical/experimental content, check every node that names or clearly implies a lab or field technique against rule 17: does it bundle carrying out the procedure together with the concept it investigates, or together with calculating a result from its data? Flag it as missing_intermediate_node (proposing the procedure/concept/application split from rule 17) whenever a single node requires BOTH performing the technique AND understanding or interpreting it. Also check that any "evaluate the method" or "sources of error" node is wired to the SPECIFIC procedure step it critiques rather than a generic practical-work node - a critique aimed at the wrong step, or at an umbrella node no step-specific critique should exist under, is a wrong_edge.
`;

export const KNOWLEDGE_MAP_VERIFICATION_PROMPT = `You are a rigorous curriculum QA reviewer checking a knowledge-map graph for a real exam specification. You will be given a batch of nodes and edges (possibly spanning several subtopics) already produced by a generation pass. Your job is NOT to regenerate it - it is to find what's wrong with it, using three specific checks.

## Check 1: The blind-comprehension test (run this on EVERY node)

For each node, ask: "If I knew ONLY what this node's direct prerequisites tell me (or, for a root node, only general foundational literacy), could I actually understand or derive this node's concept?" If the answer is no, something is missing - either:
- a missing intermediate node (a real step was compressed away), or
- a missing prerequisite edge to an existing node, or
- a wrong edge (the stated prerequisite doesn't actually ground this concept, and something else does).

Do not skip this for nodes that only have one prerequisite - single-step compression of a real multi-step mechanism is the most common failure, not just wrong combinations at convergent nodes.

Separately, check every "Advantages of X" / "Disadvantages of X" node against rule 7: does its label or implied content bundle more than one genuinely separate justification? If so, that is itself an issue to report (type missing_intermediate_node) even when every prerequisite edge it currently has is individually correct - the bundling itself is the defect, and the fix should split it into one node per justification with each one's own prerequisites.

Separately, check every node against rules 14/15: does its label bundle the impacts on more than one distinct stakeholder group (rule 14), or more than one independently-markable property/dimension of a single concept (rule 15)? Flag it as missing_intermediate_node with the split proposed, unless it falls under one of the stated exemptions (a shared formula/definition, a joint reading off one diagram, two sides of one transaction, an inseparable causal step) - do not flag an exempted bundling just because it technically contains "and".

Separately again, check every node that names or clearly implies a standard exam diagram against rule 16: does it bundle understanding the concept together with constructing or reading it on a diagram? Flag it as missing_intermediate_node (proposing the construction/application split from rule 16) whenever a single node's content requires BOTH knowing what the concept is AND being able to draw or interpret its diagram - and separately check that a proposed diagram-application node actually depends on every diagram-construction node its diagram needs (a consumer-surplus application node depending on demand but not supply, for instance, is a missing_edge even if the node split itself is otherwise correct).

Separately again, check every node's own label/definition against rule 18: does it use or lean on a technical term, distinction, or assumption that is itself a taught concept elsewhere in the subject, without that concept appearing among its prerequisites? This is the single most common way a root node (rule 6) is actually a disguised non-root node - flag it as missing_edge (or missing_intermediate_node if the assumption needs its own new node first, e.g. a bundled definition+assumption per rule 18's first example) pointing at whatever node actually teaches the leaned-on term.

Separately again, check every node whose content is a list/set (vocabulary, enumerated items, named sub-points) against rule 19's ~4-item chunk ceiling. A node bundling substantially more than that into one lesson's worth of content is missing_intermediate_node - propose splitting it into sequential nodes of ~4 items each, wired in order.

Separately, sanity-check the "difficulty" values present on nodes and edges: flag as an issue (type ordering_bug) any batch where difficulty looks unset (missing, or every value identical/default) rather than a genuine differentiated judgment call across the batch.

{{PRACTICAL_CHECK}}
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
