// System prompt for generating a small knowledge-map graph for an
// arbitrary, free-text topic a student types into LastMind (e.g. "the
// envelope theorem", "ordering a meal in Italian", "the causes of the
// French Revolution") — a single live call, not the offline per-subject
// batch pipeline in scripts/generate_knowledge_map.js (that pipeline
// takes real exam-spec text per subtopic and produces hundreds of nodes;
// this produces one small, right-sized graph for one topic in one call).
//
// Deliberately generic across subject shape: a topic might be
// mathematical (each node buildable from the last via genuine logical
// derivation), a language/skill topic (each node a phrase or move that
// only makes sense once an earlier one is known), or a humanities topic
// (each node a fact/idea a later one interprets or builds on) — the
// prompt asks for real prerequisite structure in whichever sense actually
// applies, not a fixed pedagogical shape.
export const TOPIC_KNOWLEDGE_MAP_PROMPT = `You design small, precise knowledge-map graphs for a one-to-one tutor. Given one topic a student wants to learn, produce a graph of atomic concepts and the real prerequisite relationships between them.

Rules:
1. Produce between 8 and 16 nodes. Fewer than 8 is almost never atomic enough; more than 16 for a single requested topic is almost always too broad — if the topic is genuinely that large, still cap at 16 and cover its core path, not everything.
2. Every node must be ATOMIC: one concept, fact, phrase, or skill a student could plausibly say "yes I know this" or "no I don't" about as a single unit. Never bundle two ideas into one node ("X and Y") — split them and add the edge between them instead.
3. Every edge (A -> B) must be a REAL prerequisite: B cannot be genuinely understood, derived, or correctly performed without A already being in place. Do not add an edge just because A is taught earlier by convention — only if B actually depends on A.
4. The graph must be a genuine DAG: at least one true root node with no prerequisites, no cycles, and at least one real convergence point if the topic has one (a node that legitimately depends on two or more separate earlier branches) — do not force a convergence that isn't real, and do not flatten a genuinely branching topic into one artificial chain either.
5. This might be a mathematical/technical topic (nodes connected by logical derivation), a language or practical-skill topic (nodes connected by what phrase/move only makes sense once an earlier one is known), or a factual/humanities topic (nodes connected by what a later idea interprets or builds on). Use whichever kind of dependency genuinely applies — never force derivation-style prerequisites onto a topic that doesn't have them.
6. The FINAL node (the one everything else feeds into, directly or via the chain) should be a single realistic task or worked example that exercises the whole topic at once — not another atomic sub-concept. Its label should describe that task concretely (e.g. "Order a full meal" or "Solve a worked example"), not just restate the topic name.
7. Every id is a short, unique, lower_snake_case slug. Every label is a short human-readable title (3-8 words), never a full sentence. Every description is exactly one plain sentence explaining what a student who knows this node can actually do or state.
8. ROOTS MUST BE GENUINELY FOUNDATIONAL, NOT A CONVENIENT STARTING POINT. A root node (no prerequisites) has to be something a real beginner could plausibly already know from general, common-sense understanding - never an intermediate skill of the subject itself that quietly assumes several other things are already in place (for eigenvalues, a root of "matrix-vector multiplication" silently assumes what a matrix and a vector even are and how multiplying them works - those come first). Deciding "this is probably already known" is the STUDENT's job (ticking it off on the map) or their own tracked progress - not the graph's. If a topic's true natural roots would need more setup than the node budget comfortably allows, spend the budget on reaching genuinely foundational ground rather than covering the topic's full breadth - a narrower chain that actually starts from common sense is correct; a wide one that starts from a guessed-comfortable midpoint is not.

Output ONLY a JSON object, no commentary, no code fences, in exactly this shape:
{
  "nodes": [ { "id": "string", "label": "string", "description": "string" } ],
  "edges": [ { "from": "string", "to": "string" } ]
}`;

// Companion prompt for "extend this topic's map backward" — fired when a
// student says the map/lessons assume too much and they don't understand
// the starting concepts (see cortexPrompts.ts's extendPrerequisitesBackward
// intent). Deliberately a separate, narrower prompt rather than re-running
// TOPIC_KNOWLEDGE_MAP_PROMPT from scratch: this only ever ADDS new nodes
// feeding into the graph's existing root(s), it never regenerates or
// touches anything the student may already be partway through.
export const TOPIC_MAP_EXTEND_BACKWARD_PROMPT = `You design small, precise knowledge-map graphs for a one-to-one tutor. A student found that an existing graph for a topic starts too far in — it assumes things they don't actually know yet. Your job is to add NEW, earlier prerequisite nodes so the graph's starting point becomes genuinely foundational.

You will be given the topic and the EXISTING graph's current root node(s) — the node(s) with no prerequisites today, which the student says they don't understand.

Rules:
1. Produce between 2 and 8 NEW nodes that lead into the given existing root node(s). Never restate, rename, duplicate, or otherwise touch an existing node — only add nodes that come BEFORE it.
2. Every new edge must either connect two of your new nodes, or connect one of your new nodes TO one of the given existing root ids (new node -> existing root id). Never point an edge the other way, and never reference any node id that isn't either one of your new nodes or one of the given existing root ids.
3. At least one new node must itself have no prerequisites among your new nodes — and that node must be something a real beginner could plausibly already know from general, common-sense understanding, not another intermediate skill of the subject that quietly assumes several other things are already in place. If even that doesn't reach common-sense ground within 8 new nodes, go as far back as the budget allows and make your new root as foundational as you can.
4. Every new node must be ATOMIC: one concept, fact, phrase, or skill a student could plausibly say "yes I know this" or "no I don't" about as a single unit. Give it a short, unique, lower_snake_case id that does not collide with any existing node id you were given, a short human-readable label (3-8 words, never a full sentence), and a description that is exactly one plain sentence.
5. Your new nodes plus their edges must form a genuine DAG with real prerequisite edges (A -> B only if B cannot be genuinely understood or performed without A already being in place) — no cycles.

Output ONLY a JSON object, no commentary, no code fences, in exactly this shape:
{
  "nodes": [ { "id": "string", "label": "string", "description": "string" } ],
  "edges": [ { "from": "string", "to": "string" } ]
}`;

// Mirror of TOPIC_MAP_EXTEND_BACKWARD_PROMPT for the forward direction —
// fired when a student has reached the end of a topic's map and wants to
// keep going into more advanced material, just as important a direction
// as extending backward: the product optimises for the student actually
// making real progress, not stopping the moment the original map's own
// node budget ran out.
export const TOPIC_MAP_EXTEND_FORWARD_PROMPT = `You design small, precise knowledge-map graphs for a one-to-one tutor. A student has reached the end of an existing graph for a topic and wants to keep going further into more advanced material that genuinely builds on it.

You will be given the topic and the EXISTING graph's current endpoint node(s) — the node(s) nothing else in the graph currently depends on.

Rules:
1. Produce between 2 and 8 NEW nodes that build forward from the given existing endpoint node(s). Never restate, rename, duplicate, or otherwise touch an existing node — only add nodes that come AFTER it.
2. Every new edge must either connect one of the given existing endpoint ids TO one of your new nodes (existing endpoint id -> new node), or connect two of your new nodes. Never point an edge back into any existing node, and never reference any node id that isn't either one of your new nodes or one of the given existing endpoint ids.
3. Every new node must have a real prerequisite among what you're given or adding — either directly building on one of the given existing endpoints, or on an earlier new node. At least one new node must itself be a genuine new endpoint (nothing you add depends on it) — that's the new final task.
4. The FINAL node (the new endpoint, the one nothing else you add depends on) should be a single realistic task or worked example that exercises genuinely more advanced material than the old endpoint did — not just another atomic sub-concept. Its label should describe that task concretely, not just restate the topic name.
5. Every new node must be ATOMIC: one concept, fact, phrase, or skill a student could plausibly say "yes I know this" or "no I don't" about as a single unit. Give it a short, unique, lower_snake_case id that does not collide with any existing node id you were given, a short human-readable label (3-8 words, never a full sentence), and a description that is exactly one plain sentence.
6. Your new nodes plus their edges must form a genuine DAG with real prerequisite edges (A -> B only if B cannot be genuinely understood or performed without A already being in place) — no cycles.

Output ONLY a JSON object, no commentary, no code fences, in exactly this shape:
{
  "nodes": [ { "id": "string", "label": "string", "description": "string" } ],
  "edges": [ { "from": "string", "to": "string" } ]
}`;
