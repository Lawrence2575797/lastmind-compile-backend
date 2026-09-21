'use strict';
// The generation prompt for one derivation stage. Rewritten after the first six generated stages were judged not good enough:
// too much telling, not enough questioning, mixed topics, and no building blocks taught before the concept that needs them.
// Worked example 1 is the approved Scarcity lesson (same wording the student liked); example 2 is a checked demand stage.
const fs = require('fs');
const path = require('path');

const readSpec = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, 'specs', f), 'utf8'));
const scarcity = readSpec('economics_scarcity.json');
const markets = readSpec('economics_markets_sample.json');

// Example 1: approved Scarcity stage, re-keyed to map node ids. Land, labour, capital and enterprise are "support" terms: not map nodes,
// taught first because "finite resources" is a category made of them.
function example1() {
  const st = scarcity.stages[0], T = scarcity.terms;
  const rename = { finres: 'FINITE_RESOURCES', wants: 'UNLIMITED_WANTS', scarcity: 'SCARCITY' };
  const k = (t) => rename[t] || t;
  const steps = [];
  st.steps.forEach((s) => {
    if (s.term === 'fings') return;
    if (s.type === 'chains') {
      steps.push({ type: 'chains', lanes: [{ label: 'Chain 1', terms: ['FINITE_RESOURCES'] }, { label: 'Chain 2', terms: ['UNLIMITED_WANTS'] }], prompt: 'Drag and drop the 2 key terms into the two chains that lead to one concept. Chain 1 is what the factory can make. Chain 2 is what people want.', then: 'what do they lead to?' });
    } else if (s.type === 'derive') steps.push({ type: 'derive' });
    else if (s.type === 'order') steps.push({ ...s, terms: s.terms.map(k) });
    else steps.push({ ...s, term: k(s.term) });
  });
  const support = Object.fromEntries(['land', 'labour', 'capital', 'enterprise'].map((t) => [t, { label: T[t].label }]));
  return JSON.stringify({
    terms: { ...support, FINITE_RESOURCES: { label: 'Finite resources' }, UNLIMITED_WANTS: { label: 'Unlimited wants' }, SCARCITY: { label: 'Scarcity' } },
    extraEdges: [['land', 'labour'], ['labour', 'capital'], ['capital', 'enterprise'], ['enterprise', 'FINITE_RESOURCES']],
    stage: { name: 'Scarcity', title: 'Scarcity', sub: 'Why every economy has to choose: limited resources against unlimited wants.', steps },
  });
}

function example2() {
  const { name, title, sub, steps } = markets.stages[0];
  const ids = new Set(steps.filter((x) => x.term).map((x) => x.term));
  return JSON.stringify({ terms: Object.fromEntries([...ids].map((t) => [t, markets.terms[t]])), extraEdges: [], stage: { name, title, sub, steps } });
}

const SYSTEM = `You write one short lesson stage for a "derivation" learning feed. The student never reads definitions. They are shown a small concrete situation and asked what follows, and answering that question is how they learn the term. You are given the knowledge-map nodes for the stage (each node is one key term) and the prerequisite links between them. You return JSON only.

THE PRINCIPLE: MORE QUESTIONING, LESS TELLING
The student should be reasoning, not being informed. Never state a definition or a fact in a question and then ask them to pick it back out. Put them in a situation, ask what would happen or what they would conclude, and let the term name arrive only AFTER they answer ("pre" text, then the term). If a step could be answered without thinking, or if the question already contains the answer, rewrite it.
Good (the approved Scarcity lesson): "You finally get the new phone you wanted. Will it be the last thing you ever want?" -> "No, I will soon want something else" -> "So people have ... Unlimited wants."
Bad: "People always seem to want more goods, services and experiences, no matter how much they already have. What does this describe?" -> this tells the student the answer and asks them to repeat it.

STRUCTURE
1. Every term is introduced by a question about a situation. Never tell the student a definition as a statement. The one exception is a run of PARALLEL members of one category (for example land, labour, capital, enterprise), which may be taught as consecutive "read" steps at the very start of the stage, each a one-line concrete scene ending right before the term name. A read is never allowed after the first ask, and never for a concept that has to be reasoned out.
2. The stage is about ONE idea. If the nodes you are given do not belong to a single line of reasoning, teach only the part you are given and do not wander into neighbouring topics.
3. BUILDING BLOCKS FIRST. If a node names a category or something built from parts a student may not know (finite resources are made of land, labour, capital and enterprise; costs are made of fixed and variable costs), teach those parts first as "support" terms, before the node. Support terms are not map nodes: give them ids in lower case, add them to "terms", and link them to the node they lead into with "extraEdges". Use at most 4 support terms per stage and only where the node genuinely rests on them. Then the node is reached by a question that builds on them (as in worked example 1: "Can a business have an infinite quantity of all four?").
4. Order: every prerequisite is taught before the term that depends on it. Independent branches are taught one branch at a time.
5. Milestones. The "order" milestone comes IMMEDIATELY after the 4th new term, never after the 5th: steps 1 to 4 introduce four terms, step 5 is the order milestone listing exactly those four. If a chunk holds two branches that each lead into one later concept, use a "chains" milestone (lanes = the branches) instead of "order". There are never more than 4 new terms between milestones. A stage with 4 or fewer terms has no milestone. The last step is {"type":"derive"}.

QUESTION RULES (checked by code; a failing stage is rejected)
- Every ask has q, right, wrong, hint, pre, term. Exactly two options.
- Neither the question, the options nor the hint may contain the term being introduced. The name only appears after the answer.
- Right and wrong are the same length and the same shape. The wrong option is one a real student might pick, never silly, and the right one is never the more detailed one.
- Answerable from the situation plus common sense, or from terms already taught in this stage or given. Never from outside knowledge.
- Never "which of these is true" and never ask the student to type. The hint nudges the reasoning without giving the answer.
- "pre" is a fragment that ends right before the term name, and reads on into it ("So people have" + Unlimited wants).
- Plain UK English, small realistic numbers, one idea per step, no filler.
- The order milestone prompt is exactly: "Drag and drop the N key terms in the order they build on each other." A chains prompt starts "Drag and drop the N key terms into the two chains that lead to one concept." and then says in one sentence what each chain is.
- Diagram or calculation skills (draw a curve, work out a value) are introduced by a question about what the diagram or calculation shows, not by asking the student to draw.
- "given" terms are already known: use them in situations, never introduce them again. Introduce every node id exactly once.

OUTPUT (JSON only, no prose)
{"terms": {"<id>": {"label": "<1 to 4 words>"}, ...},          every node id, plus support terms
 "extraEdges": [["<support id>", "<id>"], ...],                 links involving support terms only; node-to-node links come from the map
 "stage": {"name": "...", "title": "<same>", "sub": "<one sentence: what the student can do after>", "steps": [ ... ]}}
Steps: {"type":"read","term":id,"text":"..."} | {"type":"ask","q":"...","right":"...","wrong":"...","hint":"...","pre":"...","term":id} | {"type":"order","terms":[ids],"prompt":"..."} | {"type":"chains","lanes":[{"label":"Chain 1","terms":[ids]},{"label":"Chain 2","terms":[ids]}],"prompt":"...","then":"what do they lead to?"} | {"type":"derive"}

WORKED EXAMPLE 1 (the approved Scarcity lesson: building blocks first, every other term reasoned out from a situation)
${example1()}

WORKED EXAMPLE 2 (Utility and demand: the very first term is a question too, not a statement)
${example2()}`;

function user(stage, byId, givenLabels) {
  const nodes = stage.nodes.map((id) => `- ${id}: ${byId[id].label}`).join('\n');
  const edges = stage.edges.map(([a, b]) => `${a} -> ${b}`).join('\n') || '(none inside this stage)';
  const given = (stage.given || []).slice(0, 4).map((id) => `- ${id}: ${givenLabels[id] || byId[id].label}`).join('\n') || '(none)';
  return `Subject: ${stage.subject || 'Economics'} (${stage.subtopic})
Nodes to teach (one term each):
${nodes}

Links between them (a -> b means a must be taught before b):
${edges}

Given terms (already known, may be used in questions):
${given}`;
}

module.exports = { SYSTEM, user };
