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
        type: 'ask', term: OPT1,
        q: "A firm's profit is π(Q) = 100Q - 2Q^2. Setting dπ/dQ = 100 - 4Q equal to zero gives Q = 25. Checking the second derivative, d^2π/dQ^2 = -4, which is negative. Does a negative second derivative at a stationary point confirm it is a maximum rather than a minimum?",
        right: "Yes - a negative second derivative means profit curves downward there, so the stationary point is a maximum",
        wrong: "No - the sign of the second derivative never distinguishes a maximum from a minimum",
        hint: "A curve bending downward around a flat point is a peak; bending upward around one is a trough.",
        pre: "Finding where the first derivative is zero, then checking the second derivative's sign, is exactly",
      },
      {
        type: 'ask', term: OPTM,
        q: "For π(x, y) = 10x - x^2 + 8y - y^2, the partial derivative rules you already used on K^0.5*L^0.5 give dπ/dx = 10 - 2x and dπ/dy = 8 - 2y. Setting BOTH equal to zero gives x = 5 and y = 4 together. Is it necessary that every partial derivative equals zero at once, not just one of them?",
        right: "Yes - a true maximum needs the slope to be flat in every direction at once, so every partial derivative must be zero simultaneously",
        wrong: "No - as long as one partial derivative is zero, the point is already a maximum regardless of the others",
        hint: "If the slope in the y-direction were still positive, moving along y would raise profit further - it isn't a peak yet.",
        pre: "Solving every partial derivative equal to zero at the same time is",
      },
      {
        type: 'ask', term: LAG,
        q: "A consumer maximises utility U(x, y) = x^0.5*y^0.5 subject to spending exactly a fixed budget M on the two goods at prices px and py. Joseph-Louis Lagrange's 1788 approach adds the constraint into one new function, L, built from U plus lambda times (M minus total spending), then sets every partial derivative of L - with respect to x, y AND lambda - to zero together. Does folding the constraint into L this way let you reuse the same 'every partial derivative equals zero' approach on a problem that has a constraint?",
        right: "Yes - once the constraint is built into L, maximising L with ordinary first-order conditions automatically respects the original constraint",
        wrong: "No - adding the extra lambda term to the function changes what is actually being maximised, so it no longer solves the original problem",
        hint: "The extra lambda term is exactly zero whenever the constraint holds exactly, so it doesn't change the value of L on the constraint itself - only its slope there.",
        pre: "Joseph-Louis Lagrange's 1788 approach of folding a constraint into one function this way is the",
      },
      {
        type: 'ask', term: SHAD,
        q: "Solving those first-order conditions gives an optimal value, lambda*. If the budget M then rises by one extra pound, lambda* turns out to equal (to a first-order approximation) the resulting rise in the consumer's maximised utility. Does that make lambda* a measure of how valuable one more pound of budget is at the optimum, rather than just an algebra placeholder?",
        right: "Yes - lambda* measures the extra utility one more pound of budget would buy, exactly what an economist means by a shadow price",
        wrong: "No - lambda* is only ever a bookkeeping device with no economic meaning of its own at all",
        hint: "Something that tells you exactly how much better off you'd be from one more unit of a scarce resource is precisely a price on that resource.",
        pre: "Reading lambda* this way, as the value of relaxing the budget by one more pound, is the",
      },
      { type: 'order', terms: [OPT1, OPTM, LAG, SHAD], prompt: 'Drag and drop the 4 key terms in the order they build on each other.' },
      {
        type: 'ask', term: KT,
        q: "Harold Kuhn and Albert Tucker's 1951 paper extends the Lagrange method to an INEQUALITY constraint - spending AT MOST a budget, rather than exactly all of it. Their extra 'complementary slackness' condition sets lambda times the leftover budget to zero, so lambda must be zero whenever some budget goes unspent. Given that the ordinary shadow price reading only makes sense while the constraint binds exactly, does allowing it to sometimes not bind require this extra condition beyond the plain Lagrange first-order conditions?",
        right: "Yes - complementary slackness is exactly the extra condition needed once the constraint might have slack in it rather than always binding exactly",
        wrong: "No - an inequality constraint is solved by exactly the same equations as an equality constraint, with no extra condition needed",
        hint: "If money is left over, an extra pound of budget is worth nothing more at the optimum, so its shadow price lambda must be zero - that is exactly what the extra condition enforces.",
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
