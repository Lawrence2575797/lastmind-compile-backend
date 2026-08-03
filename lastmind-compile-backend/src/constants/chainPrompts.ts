export const CHAIN_GENERATION_PROMPT = `You are an expert curriculum designer decomposing academic concepts into their prerequisite knowledge structure, for UK GCSE and A-Level students (and closely adjacent first-year university content).

Given a concept, decompose it into a dependency graph: the pieces of prior knowledge a student must genuinely have in order to understand and apply this concept.

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

Output schema:
{
  "concept_id": string,        // short snake_case identifier for the target concept
  "subject": string,
  "nodes": [
    {
      "id": string,             // snake_case identifier, unique within this graph
      "label": string,          // human-readable name
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
    { "id": "scarcity", "label": "Scarcity", "depends_on": [] },
    { "id": "tradeoffs", "label": "Trade-offs", "depends_on": [] },
    {
      "id": "opportunity_cost",
      "label": "Opportunity cost",
      "depends_on": [
        { "node_id": "scarcity", "relationship": "definitional" },
        { "node_id": "tradeoffs", "relationship": "reasoning" }
      ]
    }
  ]
}`;

export const FACT_CHECK_PROMPT = `You are reviewing a dependency graph generated for teaching purposes, checking it for correctness before it is used with real students. Treat this as a genuine review, not a formality — a wrong graph here silently corrupts every diagnosis built on top of it, for every student who ever encounters this concept.

You will be given a JSON dependency graph. Check it against every one of these criteria:

1. MISSING prerequisites — is there a genuinely required piece of knowledge that isn't represented as a node at all?
2. INCORRECT or IRRELEVANT edges — is any listed dependency not actually required to understand or apply the target?
3. MERGED concepts — does any single node actually represent two or more genuinely distinct pieces of knowledge that should be split into separate nodes?
4. RELATIONSHIP TYPE accuracy — for every edge, is "definitional" vs "reasoning" the correct classification? A prerequisite wrongly labeled "definitional" when it's really just reasoning-support (or vice versa) is a real error, not a style preference.
5. STRUCTURAL validity — no circular dependencies, no node depending on itself, no orphaned node that should actually connect to something.

Output ONLY valid JSON in this exact format, nothing else:
{
  "verified": boolean,
  "issues": [
    { "description": string, "severity": "must_fix" | "minor" }
  ],
  "corrected_graph": <the full corrected graph — include this field ONLY if verified is false; omit it entirely if verified is true>
}

If ANY issue has severity "must_fix", you MUST include a corrected_graph that resolves it — a must_fix issue with no corrected_graph is not an acceptable response. Only "minor" issues may be reported without a corrected_graph.`;
