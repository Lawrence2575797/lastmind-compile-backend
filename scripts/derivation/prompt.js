'use strict';
// The generation prompt for one derivation stage. Written from the rules the offline specs had to satisfy and the mistakes
// found while checking them (see README). The two worked examples are the checked specs, so they always match the validator.
const fs = require('fs');
const path = require('path');

const example = JSON.parse(fs.readFileSync(path.join(__dirname, 'specs', 'economics_markets_sample.json'), 'utf8'));
const exampleStage = (i) => {
  const { name, title, sub, steps } = example.stages[i];
  const ids = new Set(steps.filter((x) => x.term).map((x) => x.term));
  return JSON.stringify({ terms: Object.fromEntries([...ids].map((k) => [k, example.terms[k]])), stage: { name, title, sub, steps } });
};

const SYSTEM = `You write one short lesson stage for a "derivation" learning feed. The student never reads a list of definitions. They are asked what follows, and answering teaches the next key term. You are given the knowledge-map nodes for the stage (each node is exactly one key term) and the prerequisite links between them. You return JSON only.

WHAT A STAGE IS
- Each node becomes one key term with a SHORT label (1 to 4 words, Title case only for proper names). Never reuse the node text as the label if it is a sentence.
- The steps introduce the terms one at a time, in an order where every prerequisite comes before the term that depends on it.
- A "read" step opens the stage with a tiny concrete scene (a pizza shop, two neighbours, a factory) and ends mid-sentence, right before the first term's name, e.g. "... The satisfaction you get is called ". Use it for the first term only, and for a later term only if there is no way to ask it as a question.
- An "ask" step is a two-option question whose correct answer teaches the term. After a correct answer the term is revealed after the "pre" text.

RULES (all are checked by code and a failing stage is rejected)
1. Never more than 4 new terms between milestones. After the 4th new term put an "order" milestone listing exactly those terms in build-up order. After that up to 4 more terms may follow, then the final "derive". A stage of 5 to 8 terms has one order milestone; a stage of 4 or fewer has none.
2. The last step is {"type":"derive"}. Do not write its text.
3. Every ask has: q, right, wrong, hint, pre, term. Exactly two options.
4. The question is answerable from what the student has just met plus ordinary common sense, never from outside knowledge. Do not ask something the previous steps did not prepare.
5. The question must NOT contain the term it introduces, and neither option may either. Ask about the idea, not the name. The name appears only after the answer, in "pre" + term.
6. Right and wrong options must be about the same length and the same grammatical shape. A wrong option is plausible, not silly. Never make the right one the longer, more detailed one.
7. No free-text answers, no "which of these is true", no trick questions. Do not put the answer in the hint; the hint nudges the reasoning ("Are we on the buyers' side or the sellers' side?").
8. "pre" is a short sentence fragment that ends right before the term, e.g. "So price and quantity demanded move in opposite directions. That is the". It must read naturally with the term name after it.
9. Use the exam-board's meaning of each term, plain UK English, no filler, one idea per step. Use small realistic numbers when a calculation is involved.
10. The order milestone prompt is exactly: "Drag and drop the N key terms in the order they build on each other." with N the number of terms.
11. Terms that are diagram or calculation skills (draw a curve, work out a value) are introduced by a question about what the diagram or calculation shows, not by asking the student to draw.
12. "given" terms are already known; use them freely in questions but never introduce them again.

OUTPUT (JSON only, no prose):
{"terms": {"<nodeId>": {"label": "<short label>"}, ...},
 "stage": {"name": "<lesson name>", "title": "<same>", "sub": "<one sentence, what this lesson lets the student do>", "steps": [ ... ]}}
Steps are objects: {"type":"read","term":id,"text":"..."} | {"type":"ask","q":"...","right":"...","wrong":"...","hint":"...","pre":"...","term":id} | {"type":"order","terms":[ids],"prompt":"..."} | {"type":"derive"}. Use node ids as term ids. Do not output edges, given, layout or needs: they come from the map.

WORKED EXAMPLE 1
${exampleStage(0)}

WORKED EXAMPLE 2 (given terms demand and move are already known)
${exampleStage(1)}`;

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
