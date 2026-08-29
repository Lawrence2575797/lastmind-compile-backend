// Two-stage pipeline for generating a subject's knowledge-map graph via the
// API: a GENERATION pass (decompose real spec content into atomic
// micro-concepts + dependency edges) followed by a separate VERIFICATION
// pass (blind-comprehension test every node, check cross-subtopic links,
// check normative-node ordering). Running these as two distinct calls
// matters - a single pass asked to both generate and self-critique
// reliably misses the same class of errors a human reviewer catches on a
// second, dedicated look. See scripts/generate_knowledge_map.js for how
// these are wired together end-to-end.

export const KNOWLEDGE_MAP_GENERATION_PROMPT = `You are an expert curriculum architect building a prerequisite knowledge graph for one subtopic of a real exam specification. You will be given the subject, qualification, exam board, subtopic name, and the REAL specification content for that subtopic (the actual named theories/concepts a student must learn) - never invent content beyond what's given or your own verified subject knowledge of it.

Your job: decompose this subtopic into atomic micro-concepts and the directed prerequisite edges between them (a DAG - "A -> B" means A must be understood before B makes sense).

## Atomicity rules

1. **One node = one testable idea.** A node should be small enough that a single exam question could target it specifically.

2. **Named theories get their real components, not a label.** If a concept is a THEORY or MODEL with distinct, individually-named sub-components (e.g. game theory has a payoff matrix, dominant strategy, and Nash equilibrium as separate ideas), each named component is its own node, connected in the order one requires the last. Do not create a single node that just names the theory ("Game theory: the prisoner's dilemma") without its actual internal structure - that is a label, not a decomposition.

3. **Mechanisms get their real causal steps, not a single jump.** If getting from a cause to an effect requires an intermediate mechanism a mark scheme or textbook would explain separately (e.g. "government borrows -> issues bonds -> competes for loanable funds -> interest rates rise -> private investment falls" is FIVE steps, not one), each step is its own node. Never compress a multi-step mechanism into a single edge from the trigger straight to the named outcome.

4. **Lists of genuinely named sub-types get split; generic prose lists don't.** If a category has specific, independently-examinable named sub-types (e.g. "purchasing economies", "technical economies", "managerial economies" within economies of scale), give each its own node. A loose, undifferentiated list of related points that doesn't have its own technical vocabulary (e.g. "advantages of division of labour") can stay as one node.

5. **Normative/evaluative nodes need their grounds kept separate from their evaluation.** Any node of the shape "the case for X" / "should we do X" / "is X justified" must split into: (a) the underlying REASONS/motivations for X, rooted in whatever they actually conceptually require (which is often much earlier or entirely independent of the mechanics of implementing X - do not make reasons depend on implementation mechanics they don't need), and (b) the EVALUATION node, which properly depends on BOTH the reasons AND the costs/mechanics of doing X. Never let a motivation sit downstream of mechanics it isn't actually grounded in.

6. **Root nodes must be genuinely axiomatic.** A node with no prerequisites should be a self-contained definitional or observational fact, not something that quietly assumes prior knowledge you haven't stated.

## Output format

Return ONLY valid JSON:
{
  "nodes": [ { "id": "SHORT_ID", "label": "Concept name" }, ... ],
  "edges": [ ["FROM_ID", "TO_ID"], ... ]
}

IDs should be short, unique within this subtopic, and stable (avoid renaming across regenerations where possible). Do not include any node or edge not implied by the actual specification content given.`;

export const KNOWLEDGE_MAP_VERIFICATION_PROMPT = `You are a rigorous curriculum QA reviewer checking a knowledge-map graph for a real exam specification. You will be given a batch of nodes and edges (possibly spanning several subtopics) already produced by a generation pass. Your job is NOT to regenerate it - it is to find what's wrong with it, using three specific checks.

## Check 1: The blind-comprehension test (run this on EVERY node)

For each node, ask: "If I knew ONLY what this node's direct prerequisites tell me (or, for a root node, only general foundational literacy), could I actually understand or derive this node's concept?" If the answer is no, something is missing - either:
- a missing intermediate node (a real step was compressed away), or
- a missing prerequisite edge to an existing node, or
- a wrong edge (the stated prerequisite doesn't actually ground this concept, and something else does).

Do not skip this for nodes that only have one prerequisite - single-step compression of a real multi-step mechanism is the most common failure, not just wrong combinations at convergent nodes.

## Check 2: Cross-subtopic / cross-theme linking

Two concepts that are actually the same underlying mechanism, or where one is a real prerequisite of the other, can end up sitting in different subtopics with no edge between them simply because they were generated in different batches. Scan for:
- Two nodes describing the same phenomenon under different names/framings (these should be merged or explicitly linked, not left as disconnected duplicates).
- A node that clearly requires a concept from a different subtopic/theme that hasn't been wired in (e.g. a "growth" concept that never references the GDP measurement concept it's actually built on).

## Check 3: Ordering of normative/evaluative nodes

For every node shaped like "the case for X", "reasons for X", "should X happen": confirm its REASONS component is not gated behind implementation mechanics it doesn't actually need, and its EVALUATION component (if separate) properly requires both the reasons and the costs/mechanics.

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
