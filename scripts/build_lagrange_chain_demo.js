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
    },
    {
      name: 'Constrained optimisation', title: 'Constrained optimisation and the Lagrange method',
      sub: 'After this you can set up and solve a constrained optimisation problem with the Lagrange method, and read the multiplier as a shadow price.',
      nodes: [OPT1, OPTM, LAG, SHAD, KT], given: [TOTDIFF, PD], needs: [TOTDIFF, PD], builds: [TOTDIFF, PD],
      edges: [[OPT1, OPTM], [OPTM, LAG], [LAG, SHAD], [SHAD, KT], [PD, OPTM], [TOTDIFF, LAG]],
      steps: [
        {
          type: 'calc', term: OPT1,
          eq: ["Stationary point: dπ/dQ = 0, then check d^2π/dQ^2 < 0 for a max", "π(Q) = 100Q - 2Q^2  ->  dπ/dQ = 100 - 4Q"],
          q: "Solve dπ/dQ = 0 for Q.",
          answer: 25, hint: "100 - 4Q = 0.",
          pre: "Finding where the first derivative is zero, then checking a negative second derivative, is exactly",
        },
        {
          type: 'calc', term: OPTM,
          eq: ["Every partial derivative = 0 at once: ∂π/∂x = 0 and ∂π/∂y = 0", "π(x,y) = 10x - x^2 + 8y - y^2  ->  ∂π/∂x = 10 - 2x  (y works out to 4)"],
          q: "Solve ∂π/∂x = 0 for x.",
          answer: 5, hint: "10 - 2x = 0.",
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
    },
  ],
};

const built = build(spec);
const outPath = path.join(__dirname, 'lagrange_chain_demo.html');
fs.writeFileSync(outPath, built.html);
new Function(built.js); // syntax check, same as build.js's own CLI does
console.log('built', outPath, `${(built.html.length / 1024).toFixed(0)} KB`);
