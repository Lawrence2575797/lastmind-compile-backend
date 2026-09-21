'use strict';
// The generation prompt for one derivation stage (v3). Feedback folded in so far: teach by questions, not statements; one idea per lesson;
// building blocks first; parallel building blocks all link straight into the concept (never chained); a concept is never introduced cold
// (opportunity cost = choice, trade-off, alternative uses, next best alternative, then the concept); diagrams shown when a term is a picture.
// The three worked examples are the approved lessons, so the prompt and the checker always agree (see selftest.js).
const fs = require('fs');
const path = require('path');

const readSpec = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, 'specs', f), 'utf8'));
const scarcity = readSpec('economics_scarcity.json');
const markets = readSpec('economics_markets_sample.json');

// Example 1: approved Scarcity stage re-keyed to map node ids. The four factors each link straight into finite resources, which leads to
// finite goods and services, which meets unlimited wants at scarcity (so the map's direct FINITE_RESOURCES -> SCARCITY link is replaced).
function example1() {
  const st = scarcity.stages[0], T = scarcity.terms;
  const rename = { finres: 'FINITE_RESOURCES', wants: 'UNLIMITED_WANTS', scarcity: 'SCARCITY' };
  const k = (t) => rename[t] || t;
  const steps = st.steps.map((s) => {
    if (s.type === 'derive') return { type: 'derive' };
    if (s.type === 'order') return { ...s, terms: s.terms.map(k) };
    if (s.type === 'chains') return { ...s, lanes: s.lanes.map((l) => ({ ...l, terms: l.terms.map(k) })) };
    return { ...s, term: k(s.term) };
  });
  const support = Object.fromEntries(['land', 'labour', 'capital', 'enterprise', 'fings'].map((t) => [t, { label: T[t].label }]));
  return JSON.stringify({
    terms: { ...support, FINITE_RESOURCES: { label: 'Finite resources' }, UNLIMITED_WANTS: { label: 'Unlimited wants' }, SCARCITY: { label: 'Scarcity' } },
    extraEdges: [['land', 'FINITE_RESOURCES'], ['labour', 'FINITE_RESOURCES'], ['capital', 'FINITE_RESOURCES'], ['enterprise', 'FINITE_RESOURCES'], ['FINITE_RESOURCES', 'fings'], ['fings', 'SCARCITY']],
    dropEdges: [['FINITE_RESOURCES', 'SCARCITY']],
    stage: { name: 'Scarcity', title: 'Scarcity', sub: 'Why every economy has to choose: limited resources against unlimited wants.', steps },
  });
}

// Example 2: the approved Opportunity cost stage. One map node (opportunity cost); the four ideas leading up to it are support terms,
// and the first of them links from the given term (scarcity).
function example2() {
  const st = scarcity.stages[1], T = scarcity.terms;
  const k = (t) => (t === 'oppcost' ? 'OPPORTUNITY_COST' : t === 'scarcity' ? 'SCARCITY' : t);
  const steps = st.steps.map((s) => {
    if (s.type === 'derive') return { type: 'derive' };
    if (s.type === 'chains') return { ...s, lanes: s.lanes.map((l) => ({ ...l, terms: l.terms.map(k) })) };
    return { ...s, term: k(s.term) };
  });
  const support = Object.fromEntries(['choice', 'tradeoff', 'altuses', 'nextbest'].map((t) => [t, { label: T[t].label }]));
  return JSON.stringify({
    terms: { ...support, OPPORTUNITY_COST: { label: 'Opportunity cost' } },
    extraEdges: [['SCARCITY', 'choice'], ['choice', 'tradeoff'], ['tradeoff', 'nextbest'], ['altuses', 'nextbest'], ['nextbest', 'OPPORTUNITY_COST']],
    stage: { name: 'Opportunity cost', title: 'Opportunity cost', sub: 'The real cost of any choice, measured by what you give up.', steps },
  });
}

// Example 3: a demand stage whose law-of-demand question carries a diagram.
function example3() {
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
2. ATOMICITY. A concept is never introduced cold. A lesson must have at least 4 new terms (map nodes plus support terms) and a chain of at least 2 links leading up to its final concept. Work out the small steps a student has to think through to reach a concept and make each one its own term with its own question. Opportunity cost is not one question: scarcity forces a CHOICE, every choice is a TRADE-OFF, resources have ALTERNATIVE USES, the best of the things given up is the NEXT BEST ALTERNATIVE, and only then is that the OPPORTUNITY COST (worked example 2). Do not compress a chain into one question.
3. The stage is about ONE idea. Teach only the nodes you are given and do not wander into neighbouring topics.
4. BUILDING BLOCKS FIRST. If a node names a category or something built from parts a student may not know (finite resources are made of land, labour, capital and enterprise; costs are made of fixed and variable costs), teach those parts first as "support" terms, before the node. Support terms are not map nodes: give them ids in lower case, add them to "terms", and link them with "extraEdges". Use at most 5 support terms per stage and only where the concept genuinely rests on them.
   PARALLEL BLOCKS CONVERGE. When several building blocks are members of one category (land, labour, capital and enterprise are all resources), each one links DIRECTLY into the concept they build (all four link to Finite resources). They are never chained one after another. If the idea runs on through a further support term (Finite resources -> Finite goods and services -> Scarcity, alongside Unlimited wants), add it, and list any map link it replaces (Finite resources -> Scarcity) in dropEdges.
5. Order: every prerequisite is taught before the term that depends on it. Independent branches are taught one branch at a time.
6. Milestones. The "order" milestone comes IMMEDIATELY after the 4th new term, never after the 5th: steps 1 to 4 introduce four terms, step 5 is the order milestone listing exactly those four. If a chunk holds two branches that each lead into one later concept, use a "chains" milestone (lanes = the branches) instead of "order". Support terms count as new terms too: with 3 support terms and 3 map nodes, the order milestone comes after the 4th of those six, and the remaining two follow it. There are never more than 4 new terms between milestones. The last step is {"type":"derive"}.

QUESTION RULES (checked by code; a failing stage is rejected)
- Every ask has q, right, wrong, hint, pre, term. Exactly two options.
- Neither the question, the options nor the hint may contain the term being introduced, or any term that comes later in the lesson. The name only appears after the answer. An option must never simply name a term ("A positive statement", "An aggregate supply curve"): the answer is something the student works out from the situation ("the facts decide it"), and the name is revealed afterwards. Never ask "what is this called?".
- Independent chains stay separate. If two ideas each lead into a later one but do not depend on each other (what can be checked leads to positive statements, what is believed leads to normative ones, and both lead to the distinction between them), give each its own chain and use a chains milestone with one lane each, never one long sequence.
- Right and wrong are the same length and the same shape. The wrong option is one a real student might pick, never silly, and the right one is never the more detailed one.
- Answerable from the situation plus common sense, or from terms already taught in this stage or given. Never from outside knowledge.
- Never "which of these is true" and never ask the student to type. The hint nudges the reasoning without giving the answer.
- "pre" is a fragment that ends right before the term name, and reads on into it ("So people have" + Unlimited wants).
- Plain UK English, small realistic numbers, one idea per step, no filler.
- The order milestone prompt is exactly: "Drag and drop the N key terms in the order they build on each other." A chains prompt starts "Drag and drop the N key terms into the two chains that lead to one concept." and then says in one sentence what each chain is.
- DIAGRAMS. Whenever a term is something you see on a graph (a curve, a point, an area, a shift, a frontier), the question that introduces it carries a "diagram" so the student sees it: {"x":"<x axis label>","y":"<y axis label>","curves":[{"label":"D","pts":[[x,y],...]}],"points":[{"label":"E","x":0.5,"y":0.5,"guides":true}]} with every coordinate between 0 and 1, 2 to 8 points per curve (the curve is smoothed through them), at most 3 curves and 5 points, short labels. A downward demand curve is pts [[0.08,0.88],[0.4,0.58],[0.9,0.14]]; a production possibility frontier bows outwards: [[0,0.9],[0.3,0.85],[0.6,0.68],[0.85,0.4],[0.95,0]]. Do not draw a diagram that gives the answer away. Calculation skills are introduced by a question about what the calculation shows.
- "given" terms are already known: use them in situations, never introduce them again. Introduce every node id exactly once.

COMMON REJECTIONS TO AVOID
- Links that form a loop, or a term taught before something it depends on. Check every link a -> b: a is introduced before b.
- More than 4 new terms (support terms included) before a milestone, or an order/chains milestone that lists a different number of terms from the ones introduced since the last milestone.
- A chain of ideas only 1 link long, or fewer than 4 new terms: add the intermediate ideas.
- A node id introduced twice, or a given term introduced again.

OUTPUT (JSON only, no prose)
{"terms": {"<id>": {"label": "<1 to 4 words>"}, ...},          every node id, plus support terms
 "extraEdges": [["<id>", "<id>"], ...],                        every link that involves a support term (either direction, including from a given term); node-to-node links come from the map
 "dropEdges": [["<id>", "<id>"], ...],                        optional: map links replaced by a longer path through support terms
 "stage": {"name": "...", "title": "<same>", "sub": "<one sentence: what the student can do after>", "steps": [ ... ]}}
Steps: {"type":"read","term":id,"text":"..."} | {"type":"ask","q":"...","right":"...","wrong":"...","hint":"...","pre":"...","term":id,"diagram":{...optional}} | {"type":"order","terms":[ids],"prompt":"..."} | {"type":"chains","lanes":[{"label":"Chain 1","terms":[ids]},{"label":"Chain 2","terms":[ids]}],"prompt":"...","then":"what do they lead to?"} | {"type":"derive"}

WORKED EXAMPLE 1 (Scarcity: the four factors each link into finite resources, which leads on to scarcity alongside unlimited wants)
${example1()}

WORKED EXAMPLE 2 (Opportunity cost: one map node, four support terms that build up to it one question at a time)
${example2()}

WORKED EXAMPLE 3 (Utility and demand: the first term is a question too, and the law of demand is shown on a diagram)
${example3()}`;

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
