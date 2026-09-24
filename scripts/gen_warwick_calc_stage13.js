// Regenerates stage 13 (calculus of functions of two or more variables) through the real build()/validate()
// pipeline, switching its three genuinely arithmetic nodes (single-variable differentiation, partial derivatives,
// total differential) from a yes/no "ask" to a typed numeric "calc" step now that the player has a maths-tool
// keypad for it, and lets the question's own K^0.5 / dQ/dK notation typeset as real superscripts/fractions.
require('dotenv/config');
const { createClient } = require('@supabase/supabase-js');
const { build } = require('./derivation/build');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SUBJECT = 'Economics', QUALIFICATION = 'Undergraduate Year 1', EXAM_BOARD = 'Warwick';
const SUB = 'economics:ec140_calculus_of_functions_of_two_or_more_variables:';
const SV = SUB + 'recap_single_variable_differentiation_rules';
const F2 = SUB + 'functions_of_two_or_more_variables';
const PD = SUB + 'partial_derivatives_first_order_';
const XP = SUB + 'second_order_and_cross_partial_derivatives';
const TOTDIFF = SUB + 'total_differential';

const spec = {
  id: 'gen', subject: 'Economics', title: 'Calculus of functions of two or more variables', noLengthCap: true,
  terms: {
    [SV]: { label: 'Single-variable differentiation', syn: ['ordinary derivative rules', 'dy/dx rules'] },
    [F2]: { label: 'Functions of two or more variables', syn: ['multivariable function'] },
    [PD]: { label: 'Partial derivatives (first order)', syn: ['partial derivative'] },
    [XP]: { label: 'Second-order and cross partial derivatives', syn: ['cross partial derivative'] },
    [TOTDIFF]: { label: 'Total differential', syn: ['total derivative approximation'] },
  },
  stages: [{
    name: 'Calculus of functions of two or more variables', title: 'Calculus of functions of two or more variables',
    sub: 'After this the student can differentiate functions of several variables and build the total differential.',
    nodes: [SV, F2, PD, XP, TOTDIFF], given: [], needs: [], builds: [],
    edges: [[SV, F2], [F2, PD], [PD, XP], [PD, TOTDIFF]],
    steps: [
      { type: 'calc', term: SV, q: "For y = 3x^2, the ordinary derivative rule gives dy/dx = 6x. At x = 4, what is dy/dx?", answer: 24, hint: "6x with x = 4 is 6 times 4.", pre: "Applying the power rule term by term is exactly" },
      {
        type: 'ask', term: F2,
        q: "A firm's output is Q(K, L) = K^0.5 * L^0.5 (a Cobb-Douglas production function), where K is capital and L is labour. Does Q depend on more than one variable, so that 'the' derivative of Q is no longer a single well-defined number without saying which variable is changing?",
        right: "Yes - with two independent inputs, you must specify which one is changing before 'the derivative' means anything",
        wrong: "No - a function of K and L can always be differentiated exactly like a function of one variable",
        hint: "With two inputs, 'the slope of Q' is ambiguous until you say whether K or L is the one that's moving.",
        pre: "Q(K, L) is an example of a",
      },
      { type: 'calc', term: PD, q: "For Q = K^0.5 * L^0.5, hold L fixed at L = 4 and differentiate with respect to K only, treating L^0.5 = 2 as a constant multiplier: dQ/dK = 0.5*K^(-0.5)*2 = K^(-0.5). At K = 4, what is dQ/dK?", answer: 0.5, hint: "K^(-0.5) at K = 4 is 1 / sqrt(4).", pre: "Differentiating with every other variable held fixed is a" },
      {
        type: 'ask', term: XP,
        q: "For that same partial derivative dQ/dK = K^(-0.5)*L^0.5, differentiate AGAIN with respect to K to get d^2Q/dK^2 (the second-order partial, showing diminishing marginal product), or instead differentiate dQ/dK with respect to L to get d^2Q/(dK dL). Is that second route - starting from the K-partial and differentiating with respect to a DIFFERENT variable - a different calculation from taking the plain second-order partial in K alone?",
        right: "Yes - differentiating the K-partial with respect to L is a distinct calculation from differentiating it again with respect to K",
        wrong: "No - it makes no difference which variable you differentiate with respect to the second time",
        hint: "One route asks 'how does the K-slope change as K itself changes'; the other asks 'how does the K-slope change as L changes instead' - genuinely different questions.",
        pre: "The second route describes exactly a",
      },
      { type: 'order', terms: [SV, F2, PD, XP], prompt: 'Drag and drop the 4 key terms in the order they build on each other.' },
      { type: 'calc', term: TOTDIFF, q: "For Q = K^0.5*L^0.5 near K = 4, L = 4 (so dQ/dK = 0.5, dQ/dL = 0.5 by symmetry), suppose K rises by 0.2 and L rises by 0.1 at the same time. Adding each input's own partial-derivative effect gives DeltaQ = (dQ/dK)*DeltaK + (dQ/dL)*DeltaL = 0.5*0.2 + 0.5*0.1. What does this approximate as the change in Q?", answer: 0.15, hint: "0.5 times 0.2 is 0.1, plus 0.5 times 0.1 is 0.05 - add the two.", pre: "Adding up every input's own effect this way is the" },
      { type: 'derive' },
    ],
  }],
};

async function main() {
  const built = build(spec);
  const st = built.stages[0];
  const compiled = { i: 13, name: spec.stages[0].nodes.join(','), edges: spec.stages[0].edges, nodes: spec.stages[0].nodes, concepts: spec.stages[0].nodes, terms: built.TERMS, stage: st };
  const { error } = await db.from('derivation_generated_stages').upsert({
    subject: SUBJECT, qualification: QUALIFICATION, exam_board: EXAM_BOARD, stage_index: 13,
    concept_ids: spec.stages[0].nodes, compiled,
  }, { onConflict: 'subject,qualification,exam_board,stage_index' });
  if (error) throw error;
  console.log('Stage 13 regenerated with calc steps,', st.script.length, 'steps.');
}
main().catch((e) => { console.error(e); process.exit(1); });
