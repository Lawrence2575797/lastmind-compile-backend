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

// Example 4: a language-vocabulary stage - independent facts (a greeting, a
// pronoun, a politeness marker), no real causal chain between them, closed
// with "translate" instead of a fabricated concept-chain "derive".
function example4() {
  return JSON.stringify({
    terms: {
      time_of_day: { label: 'Time of day' },
      greet: { label: 'Buongiorno', syn: ['Good morning'] },
      pronoun_io: { label: 'Io', syn: ['I'] },
      politeness: { label: 'Per favore', syn: ['Please'] },
    },
    extraEdges: [],
    stage: {
      name: 'Greetings and requests',
      title: 'Greetings and requests',
      sub: 'Greet someone and make a polite request in Italian.',
      steps: [
        { type: 'read', term: 'time_of_day', text: "It's 9am in Rome - the sun is up, the cafes are filling with people starting their day." },
        { type: 'ask', term: 'greet', q: 'You pass a neighbour on the street at 9am. What do you say to greet them?', right: 'Buongiorno', wrong: 'Buonasera', hint: "It's morning, not evening.", pre: 'You say', why: ['Buongiorno is the standard morning greeting, used until early afternoon.', 'Buonasera would be for the evening instead.'] },
        { type: 'ask', term: 'pronoun_io', q: "You're about to talk about yourself - what you want, what you think. Which word do you start with?", right: 'Io', wrong: 'Tu', hint: 'Yourself, not the person you are talking to.', pre: 'You use', why: ['Io means "I" and refers to the speaker.', 'Tu would refer to the other person instead.'] },
        { type: 'ask', term: 'politeness', q: "You're asking a waiter for something. What do you add to sound polite, not demanding?", right: 'Per favore', wrong: 'Grazie', hint: "A request word, not a thank-you word.", pre: 'You add', why: ['Per favore means "please" and softens a request.', 'Grazie means "thank you", used after you receive something, not while asking.'] },
        { type: 'recap', terms: ['time_of_day', 'greet', 'pronoun_io', 'politeness'], q: 'Which of these four actually names a person, rather than a greeting, a time, or a politeness marker?', right: 'Io', wrong: 'Buongiorno', hint: 'One of these refers to who is speaking.' },
        { type: 'translate', prompt: 'Drag the words into order to say this in Italian: "I would like a coffee, please."', answer: ['Vorrei', 'un', 'caffè', 'per favore'] },
      ],
    },
  });
}

const SYSTEM = `You write one short lesson stage for a "derivation" learning feed. The student never reads definitions. They are shown a small concrete situation and asked what follows, and answering that question is how they learn the term. You are given the knowledge-map nodes for the stage (each node is one key term) and the prerequisite links between them. You return JSON only.

THE PRINCIPLE: MORE QUESTIONING, LESS TELLING
The student should be reasoning, not being informed. Never state a definition or a fact in a question and then ask them to pick it back out. Put them in a situation, ask what would happen or what they would conclude, and let the term name arrive only AFTER they answer ("pre" text, then the term). If a step could be answered without thinking, or if the question already contains the answer, rewrite it.
Good (the approved Scarcity lesson): "You finally get the new phone you wanted. Will it be the last thing you ever want?" -> "No, I will soon want something else" -> "So people have ... Unlimited wants."
Bad: "People always seem to want more goods, services and experiences, no matter how much they already have. What does this describe?" -> this tells the student the answer and asks them to repeat it.

STRUCTURE
1. Every term is introduced by a question about a situation. Never tell the student a definition as a statement. The one exception is a run of PARALLEL members of one category (for example land, labour, capital, enterprise), which may be taught as consecutive "read" steps at the very start of the stage, each a one-line concrete scene ending right before the term name. A read is never allowed after the first ask, and never for a concept that has to be reasoned out.
1a. A SINGLE NODE THAT IS ITSELF A CLOSED SET. Some nodes are genuinely one concept but cover several parallel items a student has to learn together - a set of pronouns (io, tu, lui/lei, noi, voi, loro), a set of verb-ending forms, a short fixed list of vocabulary presented as one idea. Never put more than one of those items on the same step - split the node into that many consecutive steps (read for a simple form, ask where there's something to reason out per item, e.g. matching the right pronoun to a subject), each introducing exactly one item, in the same "why"/"whyMatters" style as any other step. This does NOT relax rule 6's own 4-new-terms-per-milestone limit: a set of more than 4 items still gets a recap or order milestone after every 4th item, exactly like any other run of new terms, then a further milestone for the remainder - a 6-item set is 4 items + milestone, then 2 more items + a second milestone, never one single milestone spanning all 6. The student must advance through one item at a time, never see the whole set on one screen. This node still counts as ONE unit toward atomicity (rule 2); each item within it counts as its own "new term" for that same 4-per-milestone limit.
   CRITICAL: the map node's own id (exactly as given to you) MUST be the "term" on one of these steps - it is one of the items, not a separate wrapper concept sitting above them. Pick whichever item most naturally carries that id (often the first one taught) and use the given node id for it directly; every OTHER item in the set gets its own new lower-case support-term id alongside it, the same as any other support term. Never invent a brand-new id for every single item while leaving the given map node id itself un-introduced - checked by code, and it WILL be rejected: "map node X is never introduced" means exactly this mistake happened.
2. ATOMICITY. A concept is never introduced cold. A lesson must have at least 4 new terms (map nodes plus support terms) and a chain of at least 2 links leading up to its final concept. Work out the small steps a student has to think through to reach a concept and make each one its own term with its own question. Opportunity cost is not one question: scarcity forces a CHOICE, every choice is a TRADE-OFF, resources have ALTERNATIVE USES, the best of the things given up is the NEXT BEST ALTERNATIVE, and only then is that the OPPORTUNITY COST (worked example 2). Do not compress a chain into one question.
3. The stage is about ONE idea. Teach only the nodes you are given and do not wander into neighbouring topics.
4. BUILDING BLOCKS FIRST. If a node names a category or something built from parts a student may not know (finite resources are made of land, labour, capital and enterprise; costs are made of fixed and variable costs), teach those parts first as "support" terms, before the node. Support terms are not map nodes: give them ids in lower case, add them to "terms", and link them with "extraEdges". Use at most 6 support terms per stage (rule 1a's own closed-set case can genuinely need all 6, e.g. a 6-person pronoun paradigm) and only where the concept genuinely rests on them.
   PARALLEL BLOCKS CONVERGE. When several building blocks are members of one category (land, labour, capital and enterprise are all resources), each one links DIRECTLY into the concept they build (all four link to Finite resources). They are never chained one after another. If the idea runs on through a further support term (Finite resources -> Finite goods and services -> Scarcity, alongside Unlimited wants), add it, and list any map link it replaces (Finite resources -> Scarcity) in dropEdges.
5. Order: every prerequisite is taught before the term that depends on it. Independent branches are taught one branch at a time.
6. Milestones. An "order" or "chains" milestone claims a real relationship exists between the terms it lists (a build-on-each-other sequence, or two branches converging on one idea) - only use one where that relationship is actually true. If a chunk holds two branches that each lead into one later concept, use "chains" (lanes = the branches). If the four terms genuinely build on each other in one sequence, use "order", listing exactly those four, immediately after the 4th new term (steps 1-4 introduce them, step 5 is the milestone). Support terms count as new terms too: with 3 support terms and 3 map nodes, the milestone comes after the 4th of those six, and the remaining two follow it.
   NO FORCED LINK. When a chunk's terms do NOT genuinely build on each other or converge on anything (e.g. several independent named facts about one topic, with no real dependency between them), do not force an "order" or "chains" milestone onto them - that misrepresents the relationship. Use a {"type":"recap"} milestone instead: {"type":"recap","terms":[exactly the terms introduced since the last milestone],"q":"...","right":"...","wrong":"...","hint":"..."} - same fields as an "ask" step (q/right/wrong/hint), but the question distinguishes or compares two of the terms just introduced rather than introducing a new one (e.g. "X changed prices across the Atlantic; Y changed how fast ships crossed it - which one is Y?"). This closes the chunk exactly like order/chains do (the next 4-term counter resets after it) - it just doesn't claim a sequence or convergence that isn't real. There are never more than 4 new terms between milestones.
6a. THE FINAL STEP: "derive" vs "translate". The last step is {"type":"derive"} for content that's genuinely a concept built up through a reasoning chain (economics, science, most named theories - the kind of content worked examples 1-2 show) - it drags the stage's own map-node/support terms into the graph that was actually taught. Use {"type":"translate","prompt":"...","answer":["word 1","word 2",...]} INSTEAD, as the last step, when this stage is fundamentally vocabulary or phrases with no real causal chain between them - most commonly a foreign language, but also any set of terms that are just independent facts to recall rather than ideas that build on each other (worked example 4 shows this). "answer" is the correct, in-order sequence of words/short fixed phrases (a fixed multi-word phrase like "per favore" may be one entry) forming one natural sentence in the target language that uses several of THIS stage's own taught vocabulary - "prompt" states what to translate, exactly in the form "Drag the words into order to say this in <language>: \"<the English meaning>\"". Never force a "derive" concept-chain onto vocabulary that doesn't have one - that was a real, reported failure (a set of independent pronouns/greetings dragged into a fabricated converging chain makes no sense as an exercise). Pick whichever of the two actually matches what this stage's content really is.

QUESTION RULES (checked by code; a failing stage is rejected)
- Every ask has q, right, wrong, hint, pre, term. Exactly two options.
- Neither the question, the options nor the hint may contain the term being introduced, or any term that comes later in the lesson. The name only appears after the answer. An option must never simply name a term ("A positive statement", "An aggregate supply curve"): the answer is something the student works out from the situation ("the facts decide it"), and the name is revealed afterwards. Never ask "what is this called?".
- Independent chains stay separate. If two ideas each lead into a later one but do not depend on each other (what can be checked leads to positive statements, what is believed leads to normative ones, and both lead to the distinction between them), give each its own chain and use a chains milestone with one lane each, never one long sequence.
- Right and wrong are the same length and the same shape. The wrong option is one a real student might pick, never silly, and the right one is never the more detailed one.
- Answerable from the situation plus common sense, or from terms already taught in this stage or given. Never from outside knowledge the student is expected to already have.
- REAL DEPTH, NOT GENERIC SCENARIOS. When the stage is university-level (undergraduate, masters, PhD) content in economics, history, science or any subject with real named theories, do not invent a generic hypothetical when a real one exists. Ground the situation in the actual scholar, date, figure or dataset the idea comes from (e.g. "Robert Allen's data show London wages were roughly triple Continental wages by the 1750s" rather than "wages were high in one country"). State the real fact plainly as part of the situation - the student is not expected to derive the fact itself, only to reason about what follows from it. Name the economist/historian/scientist associated with an idea in the "pre" reveal text (matching how a lecturer would attribute it), not as trivia to memorise but as the anchor for where the idea comes from.
- EVALUATION NODES MEAN IT. If a node's own label or title contains "evaluat-", "critique", "assess" or "limitations", that node's question must test a genuine objection, counter-evidence or rival view to what came before it - never a restatement of the mechanism already taught. A real, specific critique exists for almost every major theory (a data problem, a counter-example the theory doesn't predict, a rival explanation) - use it. Do not let an "evaluating X" node just ask the student to recall X again.
- Never "which of these is true". An "ask" is never a step where typing a number is the natural answer - use {"type":"calc"} for that instead (see below). The hint nudges the reasoning without giving the answer.
- MATHS NOTATION. Write exponents with a caret (K^0.5, x^2, d^2Q/dK^2), a first-order derivative as one variable over another with a slash (dQ/dK, dy/dx), the Greek letters as the words "lambda"/"Delta"/"pi" (never the unicode glyphs - the player retypesets these), a square root as sqrt(x), and a subscripted price/quantity as "px"/"py"/"qx". A vector is a plain bracketed, comma-separated list ([2,0]) and a matrix is bracketed rows of those ([[2,0],[0,3]] for a 2x2) - write these directly in "q"/"eq"/"pre"/etc, never spelled out in words and never as a hand-drawn table. The player renders these as real superscripts, a stacked fraction, the actual Greek symbols and subscripts, and a real bracketed grid for a vector/matrix - do not hand-write unicode superscripts or symbols yourself, always use this plain-text convention so it typesets correctly.
- CALCULATION STEPS. When a node is a genuine arithmetic result - a derivative evaluated at a point, an elasticity, a solved first-order condition, a total-differential approximation - use {"type":"calc","q":"...","eq":"...","answer":<number>,"tol":<optional tolerance, default 0.01>,"hint":"...","pre":"...","term":id} instead of "ask". The student types the number into a real maths answer box; there is no "right"/"wrong" option pair. Reserve "calc" for a single unambiguous numeric answer reached by a calculation shown in the question - a conceptual judgement (does this confirm a maximum, is this a shadow price, does this need an extra condition) stays an "ask", since there's no number to type. A "calc" step still counts toward the 4-new-terms-per-milestone limit and the leak/word-count rules exactly like "ask".
- MATHS DISPLAY: "eq" vs "q". Any maths notation (a function, a derivative, a substitution, a worked line of algebra) goes in "eq" - a string, or an array of strings for several lines - never inline in "q". "q" is then just the short instruction ("At x = 4, what is dy/dx?" / "What is Q?"), 12 words or fewer. The player renders "eq" as its own large, plain, boxed display and "q" as a short line underneath - the maths must be the thing the student reads, not a clause buried in a sentence. Both "ask" and "calc" accept "eq".
- TEACH THE RULE BEFORE USING IT. If a node's own content is a general computational rule or technique (the power rule, the product rule, "hold other variables constant", the chain rule, an elasticity formula) rather than one specific fact, its "eq" must state the GENERAL rule as its own line before the specific worked substitution, e.g. "eq":["d/dx(x^n) = n*x^(n-1)","y = 3x^2  ->  dy/dx = 6x"]. Never jump straight to a worked example of a technique the student was never shown - a node that USES a rule (a specific derivative, a specific partial derivative) must first display what that rule actually is, in general form, even in one line, before asking the student to apply it to the given numbers.
- DEEP EXPLANATION AFTER THE ANSWER. Every "ask" and "calc" step needs a "why": an array of 2-5 short sentences (one sentence per array entry - the player renders each on its own line, never a dense paragraph) shown right after the student answers correctly, once the term name is already revealed. This is where you actually teach the mechanism: restate the situation's numbers/facts, walk through why the right answer follows from them, and say why the wrong option fails to. "pre" + the term name is still the very first thing shown (unchanged); "why" is the fuller explanation underneath it, read at the student's own pace behind a Continue button - not a 1.5-second auto-advance. Example: "pre":"So people have", term reveals "Unlimited wants", then "why":["You wanted the new phone, and got it.","But you'll soon want something else - a different phone, a holiday, a bigger flat.","That's not a flaw in you: it's true of virtually everyone, which is exactly why economics starts from it."]
- WHY THIS MATTERS, OFTEN. Where a term connects to something real outside the immediate example - a real policy, a real historical event, a real institution, a number that shows up in the news - add "whyMatters": an array of 1-3 short sentences (same one-sentence-per-line rule) making that connection explicit. Not every step needs one, but reach for it often, especially at a milestone or a stage's final concept: "Interest rate decisions by the Bank of England lean on exactly this trade-off." is worth a sentence a student will remember. Omit the field entirely rather than force a weak connection.
- "pre" is a fragment that ends right before the term name, and reads on into it ("So people have" + Unlimited wants).
- Keep each question short: a situation and one thing to decide, about 20 words and never more than 28. Cut every detail the answer does not need (two or three concrete facts are enough).
- Plain UK English, small realistic numbers, one idea per step, no filler.
- The order milestone prompt is exactly: "Drag and drop the N key terms in the order they build on each other." A chains prompt starts "Drag and drop the N key terms into the two chains that lead to one concept." and then says in one sentence what each chain is.
- DIAGRAMS. Whenever a term is something you see on a graph (a curve, a point, an area, a shift, a frontier), the question that introduces it carries a "diagram" so the student sees it: {"x":"<x axis label>","y":"<y axis label>","curves":[{"label":"D","pts":[[x,y],...]}],"points":[{"label":"E","x":0.5,"y":0.5,"guides":true}]} with every coordinate between 0 and 1, 2 to 8 points per curve (the curve is smoothed through them), at most 3 curves and 5 points, short labels. A downward demand curve is pts [[0.08,0.88],[0.4,0.58],[0.9,0.14]]; a production possibility frontier bows outwards: [[0,0.9],[0.3,0.85],[0.6,0.68],[0.85,0.4],[0.95,0]]. Do not draw a diagram that gives the answer away. Calculation skills are introduced by a question about what the calculation shows.
- "given" terms are already known: use them in situations, never introduce them again. Introduce every node id exactly once.

COMMON REJECTIONS TO AVOID
- Links that form a loop, or a term taught before something it depends on. Check every link a -> b: a is introduced before b.
- More than 4 new terms (support terms included) before a milestone, or an order/chains milestone that lists a different number of terms from the ones introduced since the last milestone. Before you output, count the actual steps since the last milestone (or the start) and check that number against the milestone's own term list - a mismatch here is one of the most common rejections.
- A chain of ideas only 1 link long, or fewer than 4 new terms: add the intermediate ideas.
- A node id introduced twice, or a given term introduced again.
- A "read" step placed anywhere after the first ask/calc step. Reads are ONLY a leading run at the very start of the stage, before any question - never later, even to introduce a different node's own parallel members partway through.
- A "dropEdges" entry for a map link that your own extraEdges don't actually replace with a real path. If you list [A, B] in dropEdges, there must be a genuine chain of extraEdges you added that connects A to B through the support terms you introduced - never drop a link just because a support term now sits near it.

OUTPUT (JSON only, no prose)
{"terms": {"<id>": {"label": "<1 to 4 words>", "syn": ["<other genuinely correct phrasing>", ...]}, ...},   every node id, plus support terms.
 "syn" is optional (omit it when the label is already the only sensible wording): 1 to 3 OTHER ways a student who understands
 the idea might correctly write it, not spelling variants of the same words - "specialist equipment" or "capital equipment"
 for "Specialised machinery", "more output per worker" for "Higher productivity". A Day-1 check later marks the box right when
 the student types the label OR any of these, so only include a phrasing that is genuinely, unambiguously the same idea.
 "extraEdges": [["<id>", "<id>"], ...],                        every link that involves a support term (either direction, including from a given term); node-to-node links come from the map
 "dropEdges": [["<id>", "<id>"], ...],                        optional: map links replaced by a longer path through support terms
 "stage": {"name": "...", "title": "<same>", "sub": "<one sentence: what the student can do after>", "steps": [ ... ]}}
Steps: {"type":"read","term":id,"text":"..."} | {"type":"ask","q":"...","eq":"... or [line1,line2]","right":"...","wrong":"...","hint":"...","pre":"...","term":id,"why":["sentence 1","sentence 2",...],"whyMatters":["sentence",...] (optional),"diagram":{...optional}} | {"type":"calc","q":"...","eq":"... or [line1,line2]","answer":<number>,"tol":<optional>,"hint":"...","pre":"...","term":id,"why":["sentence 1","sentence 2",...],"whyMatters":["sentence",...] (optional)} (a typed numeric answer - see CALCULATION STEPS and MATHS DISPLAY above) | {"type":"order","terms":[ids],"prompt":"..."} | {"type":"chains","lanes":[{"label":"Chain 1","terms":[ids]},{"label":"Chain 2","terms":[ids]}],"prompt":"...","then":"what do they lead to?"} | {"type":"recap","terms":[ids],"q":"...","right":"...","wrong":"...","hint":"..."} (use instead of order/chains when the terms genuinely do not build on each other or converge - see rule 6) | {"type":"derive"} (concept-chain content - see rule 6a) | {"type":"translate","prompt":"Drag the words into order to say this in <language>: \\"<English meaning>\\"","answer":["word 1","word 2",...]} (vocabulary/phrase content with no real causal chain - see rule 6a; exactly one of derive/translate ends the stage, never both)
"why" is REQUIRED on every ask/calc step (see DEEP EXPLANATION AFTER THE ANSWER above) - never omit it.

WORKED EXAMPLE 1 (Scarcity: the four factors each link into finite resources, which leads on to scarcity alongside unlimited wants)
${example1()}

WORKED EXAMPLE 2 (Opportunity cost: one map node, four support terms that build up to it one question at a time)
${example2()}

WORKED EXAMPLE 3 (Utility and demand: the first term is a question too, and the law of demand is shown on a diagram)
${example3()}

WORKED EXAMPLE 4 (Language/vocabulary content: a greeting, a pronoun and a politeness marker are independent facts, not a causal chain - closed with "translate" instead of "derive")
${example4()}`;

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
