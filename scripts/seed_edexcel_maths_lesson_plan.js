require('dotenv/config');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Subject string and every subtopic string below are the EXACT canonical
// values already hardcoded in chainService.ts's SUBTOPIC_THEME_OVERRIDES
// (subjectResolution.ts maps "Maths" -> "Mathematics") - matched exactly
// so this table's theme lookup (getSubtopicThemeMap) and the fallback
// override map agree, whenever real knowledge_map_nodes data for this
// subject exists again (see project memory: currently absent from this
// Supabase project despite the code already expecting it).
const SUBJECT = 'Mathematics';
const QUALIFICATION = 'A Level';
const EXAM_BOARD = 'Edexcel';

function clean(s) {
  return (s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
}
function conceptId(subtopic, concept) {
  return `${clean(SUBJECT)}:${clean(subtopic)}:${clean(concept)}`;
}

// Standard Edexcel A-Level Maths (9MA0) content, same dependency-ordered
// standard as the Economics seed - core technique first, then how it
// combines/extends, matching genuine subject teaching order (e.g.
// differentiation before its applications, sequences before the general
// binomial expansion that relies on them).
const THEMES = [
  {
    theme: 'Pure Mathematics',
    branch: 'Pure',
    subtopics: [
      { subtopic: '1 Proof', concepts: ['Proof by deduction', 'Proof by exhaustion', 'Disproof by counter-example'] },
      { subtopic: '2 Algebra and functions', concepts: [
        'Laws of indices', 'Simplifying and rationalising surds', 'Solving quadratic equations', 'Completing the square', 'The discriminant', 'Sketching quadratic graphs',
        'Simultaneous equations (linear and quadratic)', 'Solving linear and quadratic inequalities', 'Regions satisfying inequalities',
        'Expanding brackets and the binomial expansion of (1+x)^n', 'Factorising and dividing polynomials', 'The factor theorem', 'Algebraic fractions and simplification',
        'Functions, domain and range', 'Composite and inverse functions', 'Transformations of graphs', 'The modulus function',
      ] },
      { subtopic: '3 Coordinate geometry in the (x, y) plane', concepts: ['Equation of a straight line', 'Gradients — parallel and perpendicular lines', 'Modelling with straight lines', 'Equation of a circle', 'Properties of circles (tangents, chords, perpendicular bisectors)'] },
      { subtopic: '4 Sequences and series', concepts: ['Arithmetic sequences and series', 'Geometric sequences and series', 'Sum to infinity of a geometric series', 'Sigma notation', 'Recurrence relations', 'Binomial expansion for general n'] },
      { subtopic: '5 Trigonometry', concepts: [
        'Sine and cosine rules and area of a triangle', 'Radian measure and arc length/sector area', 'Small angle approximations', 'Trigonometric identities (Pythagorean, double angle)', 'Solving trigonometric equations',
        'Graphs of sin/cos/tan and their reciprocals', 'Inverse trigonometric functions', 'R sin(x+a) form', 'Trigonometric modelling',
      ] },
      { subtopic: '6 Exponentials and logarithms', concepts: ['Exponential functions and graphs', 'Laws of logarithms', 'Solving equations using logarithms', 'The exponential function e^x and its graph', 'Exponential growth and decay models', 'Fitting models to data using logarithms'] },
      { subtopic: '7 Differentiation', concepts: [
        'Differentiation from first principles', 'Differentiating polynomials and standard functions', 'Chain rule, product rule and quotient rule',
        'Implicit differentiation', 'Parametric differentiation', 'Rates of change and connected rates of change', 'Stationary points and curve sketching', 'Optimisation problems',
      ] },
      { subtopic: '8 Integration', concepts: [
        'Integrating standard functions', 'Integration by substitution', 'Integration by parts', 'Integrating using partial fractions',
        'Finding areas under and between curves', 'Solving differential equations by separation of variables', 'Numerical integration (trapezium rule)',
      ] },
      { subtopic: '9 Numerical methods', concepts: ['Locating roots by sign change', 'Iterative methods (Newton-Raphson, rearrangement)', 'Numerical solution of equations'] },
      { subtopic: '10 Vectors', concepts: ['Vectors in 2D and 3D', 'Magnitude and direction of a vector', 'Position vectors', 'Vector arithmetic and geometric problems'] },
    ],
  },
  {
    theme: 'Statistics',
    branch: 'Statistics',
    subtopics: [
      { subtopic: '1 Statistical sampling', concepts: ['Populations and samples', 'Sampling techniques (simple random, stratified, systematic, opportunity, quota)'] },
      { subtopic: '2 Data presentation and interpretation', concepts: ['Measures of location and spread', 'Representing data (box plots, histograms, cumulative frequency)', 'Correlation and regression', 'Outliers and cleaning data', 'Large data set skills'] },
      { subtopic: '3 Probability', concepts: ['Basic probability rules', 'Venn diagrams', 'Mutually exclusive and independent events', 'Tree diagrams and conditional probability'] },
      { subtopic: '4 Statistical distributions', concepts: ['The binomial distribution', 'The normal distribution', 'Using distributions to model real-world situations'] },
      { subtopic: '5 Statistical hypothesis testing', concepts: ['Hypothesis testing for a binomial proportion', 'Hypothesis testing for the mean of a normal distribution', 'Correlation hypothesis testing', 'Critical regions and interpreting results'] },
    ],
  },
  {
    theme: 'Mechanics',
    branch: 'Mechanics',
    subtopics: [
      { subtopic: '6 Quantities and units in mechanics', concepts: ['SI units', 'Modelling assumptions in mechanics'] },
      { subtopic: '7 Kinematics', concepts: ['Displacement, velocity and acceleration', 'Constant acceleration (suvat) equations', 'Motion graphs', 'Variable acceleration using calculus'] },
      { subtopic: "8 Forces and Newton's laws", concepts: ["Newton's laws of motion", 'Types of force (weight, normal reaction, friction, tension)', 'Connected particles and pulleys', 'Resolving forces', 'Statics and equilibrium'] },
      { subtopic: '9 Moments', concepts: ['Moment of a force', 'Equilibrium of rigid bodies', 'Modelling rods and beams'] },
    ],
  },
];

async function main() {
  const rows = [];
  for (const { theme, branch, subtopics } of THEMES) {
    for (const { subtopic, concepts } of subtopics) {
      concepts.forEach((concept, i) => {
        rows.push({
          subject: SUBJECT,
          qualification: QUALIFICATION,
          exam_board: EXAM_BOARD,
          theme,
          subtopic,
          lesson_order: i + 1,
          concept,
          branch,
          concept_id: conceptId(subtopic, concept),
        });
      });
    }
  }

  console.log(`Inserting ${rows.length} lesson plan rows for ${SUBJECT}...`);
  const { error } = await supabase.from('spec_lesson_plans').insert(rows);
  if (error) {
    console.error('Insert failed:', JSON.stringify(error));
    process.exit(1);
  }
  console.log('Done.');
}

main();
