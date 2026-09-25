// Hand-authored (no API call) generation of stage 14 (unconstrained optimisation -> Lagrange method -> shadow
// price -> Kuhn-Tucker), the stage immediately after the two already-deepened stages (13: partial derivatives,
// total differential) on the path to the Lagrangian. Built through the real build()/validate() pipeline (same
// checker Economics content is held to) rather than a raw compiled overwrite, so the graph layout and milestone
// wiring are computed exactly as the live generator would produce them - only the content itself is hand-written,
// grounded in real named results (Lagrange 1788, Kuhn & Tucker 1951) with an actual worked utility-maximisation
// example, instead of a generic hypothetical.
require('dotenv/config');
const { createClient } = require('@supabase/supabase-js');
const { build } = require('./derivation/build');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SUBJECT = 'Economics', QUALIFICATION = 'Undergraduate Year 1', EXAM_BOARD = 'Warwick';
const SUB = 'economics:ec140_unconstrained_and_constrained_optimisation:';
const PREV = 'economics:ec140_calculus_of_functions_of_two_or_more_variables:';

const OPT1 = SUB + 'unconstrained_optimisation_first_and_second_order_conditions_one_variable_';
const OPTM = SUB + 'unconstrained_optimisation_of_multivariable_functions_foc_';
const LAG = SUB + 'lagrange_multiplier_method_for_equality_constrained_optimisation';
const SHAD = SUB + 'interpretation_of_the_lagrange_multiplier_shadow_price_';
const KT = SUB + 'optimisation_with_inequality_constraints_kuhn_tucker_conditions_';
const TOTDIFF = PREV + 'total_differential';
const PD = PREV + 'partial_derivatives_first_order_';

const spec = {
  id: 'gen', subject: 'Economics',
  title: 'Constrained optimisation and the Lagrange method',
  noLengthCap: true,
  known: [TOTDIFF, PD],
  terms: {
    [TOTDIFF]: { label: 'Total differential' },
    [PD]: { label: 'Partial derivatives (first order)' },
    [OPT1]: { label: 'Unconstrained optimisation (one variable)', syn: ['first and second order conditions', 'FOC and SOC'] },
    [OPTM]: { label: 'Unconstrained optimisation (multivariable FOC)', syn: ['every partial derivative set to zero'] },
    [LAG]: { label: 'Lagrange multiplier method', syn: ['Lagrangian', 'constrained optimisation by Lagrange multiplier'] },
    [SHAD]: { label: 'Lagrange multiplier as shadow price', syn: ['shadow price of the constraint', 'marginal value of relaxing the constraint'] },
    [KT]: { label: 'Kuhn-Tucker conditions', syn: ['inequality-constrained optimisation', 'complementary slackness'] },
  },
  stages: [{
    name: 'Constrained optimisation', title: 'Constrained optimisation and the Lagrange method',
    sub: 'After this you can set up and solve a constrained optimisation problem with the Lagrange method, and read the multiplier as a shadow price.',
    nodes: [OPT1, OPTM, LAG, SHAD, KT],
    given: [TOTDIFF, PD], needs: [TOTDIFF, PD], builds: [TOTDIFF, PD],
    edges: [[OPT1, OPTM], [OPTM, LAG], [LAG, SHAD], [SHAD, KT], [PD, OPTM], [TOTDIFF, LAG]],
    steps: [
      {
        type: 'calc', term: OPT1,
        eq: ["Stationary point: dπ/dQ = 0, then check d^2π/dQ^2 < 0 for a max", "π(Q) = 100Q - 2Q^2  ->  dπ/dQ = 100 - 4Q"],
        q: "Solve dπ/dQ = 0 for Q.",
        answer: 25,
        hint: "100 - 4Q = 0.",
        pre: "Finding where the first derivative is zero, then checking a negative second derivative, is exactly",
      },
      {
        type: 'calc', term: OPTM,
        eq: ["Every partial derivative = 0 at once: ∂π/∂x = 0 and ∂π/∂y = 0", "π(x,y) = 10x - x^2 + 8y - y^2  ->  ∂π/∂x = 10 - 2x  (y works out to 4)"],
        q: "Solve ∂π/∂x = 0 for x.",
        answer: 5,
        hint: "10 - 2x = 0.",
        pre: "Solving every partial derivative equal to zero at the same time is",
      },
      {
        type: 'ask', term: LAG,
        eq: ["L = U + λ(M - pₓx - p_yy)", "U(x,y) = x^0.5 y^0.5, subject to pₓx + p_yy = M"],
        q: "Does maximising L with ordinary first-order conditions respect the original constraint?",
        right: "Yes - the λ term is zero whenever the constraint holds exactly, so plain FOCs on L still respect it",
        wrong: "No - adding the λ term changes what is actually being maximised by the whole function",
        hint: "The extra term vanishes exactly on the constraint - it only affects the slope there, not the value.",
        pre: "Joseph-Louis Lagrange's 1788 approach of folding a constraint into one function this way is the",
      },
      {
        type: 'ask', term: SHAD,
        eq: ["λ* ≈ (rise in maximised utility) / (£1 more budget)"],
        q: "Does λ* measure the value of one more pound of budget at the optimum?",
        right: "Yes - that is exactly what a shadow price means",
        wrong: "No - λ* is only an algebra placeholder with no economic meaning",
        hint: "A number that tells you exactly how much better off one more unit makes you is a price on that unit.",
        pre: "Reading λ* this way, as the value of relaxing the budget by one more pound, is the",
      },
      { type: 'order', terms: [OPT1, OPTM, LAG, SHAD], prompt: 'Drag and drop the 4 key terms in the order they build on each other.' },
      {
        type: 'ask', term: KT,
        eq: ["Complementary slackness: λ(M - pₓx - p_yy) = 0"],
        q: "Does an inequality constraint (spending AT MOST M) need this extra condition beyond the plain Lagrange FOCs?",
        right: "Yes - it forces λ to zero whenever some budget is left unspent",
        wrong: "No - an inequality constraint is solved by exactly the same equations as an equality one",
        hint: "Unspent budget is worth nothing more at the optimum, so its shadow price must be zero.",
        pre: "Kuhn and Tucker's 1951 extension to a constraint that may or may not bind is the",
      },
      { type: 'derive' },
    ],
  }],
};

async function main() {
  const built = build(spec);
  const st = built.stages[0];
  const compiled = { i: 14, name: spec.stages[0].nodes.join(','), edges: spec.stages[0].edges, nodes: spec.stages[0].nodes, concepts: spec.stages[0].nodes, terms: built.TERMS, stage: st };
  const { error } = await db.from('derivation_generated_stages').upsert({
    subject: SUBJECT, qualification: QUALIFICATION, exam_board: EXAM_BOARD, stage_index: 14,
    concept_ids: spec.stages[0].nodes, compiled,
  }, { onConflict: 'subject,qualification,exam_board,stage_index' });
  if (error) throw error;
  console.log('Stage 14 (constrained optimisation / Lagrange) generated and saved,', st.script.length, 'steps.');
}
main().catch((e) => { console.error(e); process.exit(1); });
