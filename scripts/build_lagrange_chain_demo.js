// Builds a REAL standalone derivation lesson (the same build() pipeline and engine.js/shell.html the live site
// uses, not a re-implementation) for exactly the Lagrangian prerequisite chain, so it can be previewed as an
// artifact identical to the live player - just with the deepened content and this specific chain. Two stages in
// one spec so build()'s own cross-stage "given" resolution handles stage 2 needing stage 1's terms, no API calls.
const fs = require('fs');
const path = require('path');
const { build } = require('./derivation/build');

const PREV = 'ec140_calc:';
const SUB = 'ec140_opt:';
const TOTDIFF = PREV + 'total_differential';
const PD = PREV + 'partial_derivatives_first_order_';
const SV = PREV + 'recap_single_variable_differentiation_rules';
const F2 = PREV + 'functions_of_two_or_more_variables';
const XP = PREV + 'second_order_and_cross_partial_derivatives';

const OPT1 = SUB + 'unconstrained_optimisation_first_and_second_order_conditions_one_variable_';
const OPTM = SUB + 'unconstrained_optimisation_of_multivariable_functions_foc_';
const LAG = SUB + 'lagrange_multiplier_method_for_equality_constrained_optimisation';
const SHAD = SUB + 'interpretation_of_the_lagrange_multiplier_shadow_price_';
const KT = SUB + 'optimisation_with_inequality_constraints_kuhn_tucker_conditions_';

const spec = {
  id: 'lagrange-chain-demo', subject: 'Economics',
  title: 'Constrained optimisation and the Lagrange method',
  pageTitle: 'Warwick EC140: the Lagrange multiplier chain',
  noLengthCap: true,
  terms: {
    [SV]: { label: 'Single-variable differentiation', syn: ['ordinary derivative rules', 'dy/dx rules'] },
    [F2]: { label: 'Functions of two or more variables', syn: ['multivariable function'] },
    [PD]: { label: 'Partial derivatives (first order)', syn: ['partial derivative'] },
    [XP]: { label: 'Second-order and cross partial derivatives', syn: ['cross partial derivative'] },
    [TOTDIFF]: { label: 'Total differential', syn: ['total derivative approximation'] },
    [OPT1]: { label: 'Unconstrained optimisation (one variable)', syn: ['first and second order conditions', 'FOC and SOC'] },
    [OPTM]: { label: 'Unconstrained optimisation (multivariable FOC)', syn: ['every partial derivative set to zero'] },
    [LAG]: { label: 'Lagrange multiplier method', syn: ['Lagrangian', 'constrained optimisation by Lagrange multiplier'] },
    [SHAD]: { label: 'Lagrange multiplier as shadow price', syn: ['shadow price of the constraint', 'marginal value of relaxing the constraint'] },
    [KT]: { label: 'Kuhn-Tucker conditions', syn: ['inequality-constrained optimisation', 'complementary slackness'] },
  },
  stages: [
    {
      name: 'Calculus of two or more variables', title: 'Calculus of functions of two or more variables',
      sub: 'After this you can differentiate a multivariable function and build the total differential.',
      nodes: [SV, F2, PD, XP, TOTDIFF], given: [], needs: [], builds: [],
      edges: [[SV, F2], [F2, PD], [PD, XP], [PD, TOTDIFF]],
      steps: [
        {
          type: 'calc', term: SV,
          q: "For y = 3x^2, the ordinary derivative rule gives dy/dx = 6x. At x = 4, what is dy/dx?",
          answer: 24, hint: "6x with x = 4 is 6 times 4.",
          pre: "Applying the power rule term by term is exactly",
        },
        {
          type: 'ask', term: F2,
          q: "A firm's output is Q(K, L) = K^0.5 * L^0.5 (a Cobb-Douglas production function), where K is capital and L is labour. Does Q depend on more than one variable, so that 'the' derivative of Q is no longer a single well-defined number without saying which variable is changing?",
          right: "Yes - with two independent inputs, you must specify which one is changing before 'the derivative' means anything",
          wrong: "No - a function of K and L can always be differentiated exactly like a function of one variable",
          hint: "With two inputs, 'the slope of Q' is ambiguous until you say whether K or L is the one that's moving.",
          pre: "Q(K, L) is an example of a",
        },
        {
          type: 'calc', term: PD,
          q: "For Q = K^0.5 * L^0.5, hold L fixed at L = 4 and differentiate with respect to K only, treating L^0.5 = 2 as a constant multiplier: dQ/dK = 0.5*K^(-0.5)*2 = K^(-0.5). At K = 4, what is dQ/dK?",
          answer: 0.5, hint: "K^(-0.5) at K = 4 is 1 / sqrt(4).",
          pre: "Differentiating with every other variable held fixed is a",
        },
        {
          type: 'ask', term: XP,
          q: "For that same partial derivative dQ/dK = K^(-0.5)*L^0.5, differentiate AGAIN with respect to K to get d^2Q/dK^2 (the second-order partial, showing diminishing marginal product), or instead differentiate dQ/dK with respect to L to get d^2Q/(dK dL). Is that second route - starting from the K-partial and differentiating with respect to a DIFFERENT variable - a different calculation from taking the plain second-order partial in K alone?",
          right: "Yes - differentiating the K-partial with respect to L is a distinct calculation from differentiating it again with respect to K",
          wrong: "No - it makes no difference which variable you differentiate with respect to the second time",
          hint: "One route asks 'how does the K-slope change as K itself changes'; the other asks 'how does the K-slope change as L changes instead' - genuinely different questions.",
          pre: "The second route describes exactly a",
        },
        { type: 'order', terms: [SV, F2, PD, XP], prompt: 'Drag and drop the 4 key terms in the order they build on each other.' },
        {
          type: 'calc', term: TOTDIFF,
          q: "For Q = K^0.5*L^0.5 near K = 4, L = 4 (so dQ/dK = 0.5, dQ/dL = 0.5 by symmetry), suppose K rises by 0.2 and L rises by 0.1 at the same time. Adding each input's own partial-derivative effect gives DeltaQ = (dQ/dK)*DeltaK + (dQ/dL)*DeltaL = 0.5*0.2 + 0.5*0.1. What does this approximate as the change in Q?",
          answer: 0.15, hint: "0.5 times 0.2 is 0.1, plus 0.5 times 0.1 is 0.05 - add the two.",
          pre: "Adding up every input's own effect this way is the",
        },
        { type: 'derive' },
      ],
    },
    {
      name: 'Constrained optimisation', title: 'Constrained optimisation and the Lagrange method',
      sub: 'After this you can set up and solve a constrained optimisation problem with the Lagrange method, and read the multiplier as a shadow price.',
      nodes: [OPT1, OPTM, LAG, SHAD, KT], given: [TOTDIFF, PD], needs: [TOTDIFF, PD], builds: [TOTDIFF, PD],
      edges: [[OPT1, OPTM], [OPTM, LAG], [LAG, SHAD], [SHAD, KT], [PD, OPTM], [TOTDIFF, LAG]],
      steps: [
        {
          type: 'calc', term: OPT1,
          q: "A firm's profit is π(Q) = 100Q - 2Q^2. Setting dπ/dQ = 100 - 4Q equal to zero and solving for Q gives the profit-maximising output (check: d^2π/dQ^2 = -4, negative, confirming a maximum). What is Q?",
          answer: 25, hint: "Solve 100 - 4Q = 0 for Q.",
          pre: "Finding where the first derivative is zero, then checking a negative second derivative, is exactly",
        },
        {
          type: 'calc', term: OPTM,
          q: "For π(x, y) = 10x - x^2 + 8y - y^2, the partial derivative rules you already used on K^0.5*L^0.5 give dπ/dx = 10 - 2x and dπ/dy = 8 - 2y. Both must equal zero at once (y works out to 4). Solving dπ/dx = 0, what is x?",
          answer: 5, hint: "Solve 10 - 2x = 0 for x.",
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
    },
  ],
};

const built = build(spec);
const outPath = path.join(__dirname, 'lagrange_chain_demo.html');
fs.writeFileSync(outPath, built.html);
new Function(built.js); // syntax check, same as build.js's own CLI does
console.log('built', outPath, `${(built.html.length / 1024).toFixed(0)} KB`);
