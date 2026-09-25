// Regenerates stage 13 (calculus of functions of two or more variables) through the real build()/validate()
// pipeline. Second pass on this stage: the first pass buried the maths inside long sentences and jumped straight
// to applying the power rule and the partial-derivative rule without ever stating either rule in general form -
// fixed here by moving every equation into its own "eq" display (rendered as a boxed, plain maths block) with the
// general rule as its own line before the specific worked substitution, and cutting "q" down to a short instruction.
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
      {
        type: 'calc', term: SV,
        eq: ["For y = x^n:  dy/dx = n*x^(n-1)", "y = 3x^2  ->  dy/dx = 6x"],
        q: "At x = 4, what is dy/dx?",
        answer: 24, hint: "6x at x = 4 is 6 times 4.",
        pre: "Applying the power rule term by term is exactly",
      },
      {
        type: 'ask', term: F2,
        eq: "Q(K, L) = K^0.5 * L^0.5",
        q: "Does 'the derivative' of Q mean anything until you say which variable is moving?",
        right: "No - you must say whether K or L is changing before 'the derivative' has one value",
        wrong: "Yes - it always has one value, whichever variable moves",
        hint: "Two inputs, two possible slopes - which one do you mean?",
        pre: "Q(K, L) is an example of a",
      },
      {
        type: 'calc', term: PD,
        eq: ["Hold every other variable constant: for Q = K^a,  dQ/dK = a*K^(a-1)", "Q = K^0.5*L^0.5, L = 4  ->  dQ/dK = K^-0.5"],
        q: "At K = 4, what is dQ/dK?",
        answer: 0.5, hint: "K^-0.5 at K = 4 is 1 / sqrt(4).",
        pre: "Differentiating with every other variable held constant is a",
      },
      {
        type: 'ask', term: XP,
        eq: ["d^2Q/dK^2   vs   d^2Q/(dK dL)"],
        q: "Is differentiating dQ/dK with respect to L a different calculation from differentiating it by K again?",
        right: "Yes - one differentiates by K again, the other by a different variable entirely",
        wrong: "No - the second differentiation gives the same result whichever variable you use",
        hint: "Same starting point, two different next steps - do they ask the same question?",
        pre: "The second route describes exactly a",
      },
      { type: 'order', terms: [SV, F2, PD, XP], prompt: 'Drag and drop the 4 key terms in the order they build on each other.' },
      {
        type: 'calc', term: TOTDIFF,
        eq: ["dQ ≈ (dQ/dK)*ΔK + (dQ/dL)*ΔL", "at K = L = 4: dQ/dK = dQ/dL = 0.5", "ΔK = 0.2, ΔL = 0.1"],
        q: "What is the approximate change in Q?",
        answer: 0.15, hint: "0.5*0.2 = 0.1, plus 0.5*0.1 = 0.05 - add the two.",
        pre: "Adding up every input's own effect this way is the",
      },
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
  console.log('Stage 13 regenerated with eq displays,', st.script.length, 'steps.');
}
main().catch((e) => { console.error(e); process.exit(1); });
