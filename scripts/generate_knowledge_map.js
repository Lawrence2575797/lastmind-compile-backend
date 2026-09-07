// Two-call pipeline: GENERATION (per subtopic) -> VERIFICATION (whole batch)
// -> apply fixes -> validate as a DAG. Mirrors exactly what happened by
// hand in the Claude Code session that designed these prompts: generate,
// then have a separate, dedicated pass hunt for the blind-comprehension
// gaps, missing cross-links, and ordering bugs a single pass reliably
// misses.
//
// Uses YOUR OWN Anthropic API key (never Claude Code) - this is real
// production content generation for LastMind, so it must run through the
// Commercial/API terms, not a personal session.
//
// Usage: node scripts/generate_knowledge_map.js
// Requires ANTHROPIC_API_KEY in the environment (see .env.example).
// Edit SUBJECT/QUALIFICATION/EXAM_BOARD and SUBTOPICS below before running.

// override:true - a stale CLAUDE_API_KEY/Claude_API_KEY inherited from the
// parent shell's own process environment (Windows env vars are case-
// insensitive) otherwise wins over whatever this project's own .env says,
// since dotenv's default behavior never overrides an already-set variable.
require('dotenv').config({ override: true });
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

// knowledgeMapPrompts.ts is TypeScript (consumed normally by the compiled
// backend); this script runs as plain Node like every other file in
// scripts/, so it can't require() a .ts file directly without a build
// step. Extract the exported template-literal constants as text instead,
// rather than adding a TS toolchain dependency to a one-off script.
function extractPromptConstant(source, name) {
  const marker = `export const ${name} = \``;
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`Could not find ${name} in knowledgeMapPrompts.ts`);
  const contentStart = start + marker.length;
  const end = source.indexOf('`;', contentStart);
  if (end === -1) throw new Error(`Could not find the end of ${name}`);
  return source.slice(contentStart, end);
}
const promptsSource = fs.readFileSync(path.join(__dirname, '../src/constants/knowledgeMapPrompts.ts'), 'utf8');
const KNOWLEDGE_MAP_GENERATION_PROMPT_BASE = extractPromptConstant(promptsSource, 'KNOWLEDGE_MAP_GENERATION_PROMPT');
const KNOWLEDGE_MAP_GENERATION_PROMPT_PRACTICAL_RULE = extractPromptConstant(promptsSource, 'KNOWLEDGE_MAP_GENERATION_PROMPT_PRACTICAL_RULE');
const KNOWLEDGE_MAP_COVERAGE_PROMPT = extractPromptConstant(promptsSource, 'KNOWLEDGE_MAP_COVERAGE_PROMPT');
const KNOWLEDGE_MAP_VERIFICATION_PROMPT_BASE = extractPromptConstant(promptsSource, 'KNOWLEDGE_MAP_VERIFICATION_PROMPT');
const KNOWLEDGE_MAP_VERIFICATION_PROMPT_PRACTICAL_CHECK = extractPromptConstant(promptsSource, 'KNOWLEDGE_MAP_VERIFICATION_PROMPT_PRACTICAL_CHECK');

// Rule 17 (and its matching verification check) only ever fires for a
// subject with real lab/fieldwork content - sending it on every subtopic
// call for a subject like Economics is pure dead input cost (and a
// standing invitation for the model to go looking for practical content
// that was never asked for). Set this per subject, not per call.
const HAS_PRACTICAL_CONTENT = false; // true for Chemistry/Biology/Physics-style specs
const KNOWLEDGE_MAP_GENERATION_PROMPT = KNOWLEDGE_MAP_GENERATION_PROMPT_BASE.replace(
  '{{PRACTICAL_RULE}}',
  HAS_PRACTICAL_CONTENT ? KNOWLEDGE_MAP_GENERATION_PROMPT_PRACTICAL_RULE : ''
);
const KNOWLEDGE_MAP_VERIFICATION_PROMPT = KNOWLEDGE_MAP_VERIFICATION_PROMPT_BASE.replace(
  '{{PRACTICAL_CHECK}}',
  HAS_PRACTICAL_CONTENT ? KNOWLEDGE_MAP_VERIFICATION_PROMPT_PRACTICAL_CHECK : ''
);

// Same env var claudeClient.ts already reads - not ANTHROPIC_API_KEY.
const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

// Matches the draft/gate split already established by
// chainGenerationSimple + factCheck in claudeClient.ts, not
// chainGeneration + factCheck (both-Opus) - generation here is a
// structured decomposition task against explicit rules, which Sonnet
// handles reliably; verification is the precision-critical judgment call
// (is this edge actually wrong, is this really a duplicate) applied
// across the whole batch at once, where Opus's extra reasoning capacity
// earns its cost. The cost delta between the two options is trivial
// either way at this volume (roughly $1-1.50 per subject) - this is a
// quality choice, not a cost one.
const GENERATION_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5';
const VERIFICATION_MODEL = 'claude-opus-5';
// Coverage-checking against the raw spec text is a completeness GATE,
// not a draft - same reasoning as VERIFICATION_MODEL, and the class of
// error it exists to catch (a whole named theory silently dropped) is
// exactly the kind of thing worth an unconditional Opus check regardless
// of which model drafted the subtopic.
const COVERAGE_MODEL = 'claude-opus-5';
const MAX_COVERAGE_ROUNDS = 2;

// Each of the three system prompts below is byte-identical across every
// subtopic call in a run (and across coverage-check/regenerate retries
// for the same subtopic) - wrapping it as a cached content block means
// only the FIRST call in a run pays full input price for it; every
// subsequent call within the ~5 minute cache window reads it back at a
// steep discount instead of repaying for the same ~1-2k token ruleset
// 15-20+ times per subject.
function cachedSystem(promptText) {
  return [{ type: 'text', text: promptText, cache_control: { type: 'ephemeral' } }];
}

// Hard spend ceiling for THIS run, checked before every API call and
// after every response - not just an estimate printed at the end. Set
// deliberately close to (not far above) the quoted estimate for this
// specific subject, since the whole point of asking for a cap is that it
// actually holds, not that it's generous. Standard (non-intro) per-token
// rates are used for the running total on purpose: if intro pricing
// applies, real spend comes in under what this tracker reports, which is
// the safe direction to be wrong in for a cap - never the other way.
const SPEND_CAP_USD = 2.5;
const PRICING_PER_MTOK = {
  'claude-sonnet-5': { in: 3, out: 15 },
  'claude-opus-5': { in: 5, out: 25 },
};
let totalSpendUsd = 0;
function recordUsage(model, usage) {
  const p = PRICING_PER_MTOK[model];
  if (!p || !usage) return;
  const inTok = usage.input_tokens || 0;
  const cacheWriteTok = usage.cache_creation_input_tokens || 0;
  const cacheReadTok = usage.cache_read_input_tokens || 0;
  const outTok = usage.output_tokens || 0;
  const cost = (inTok * p.in + cacheWriteTok * p.in * 1.25 + cacheReadTok * p.in * 0.1 + outTok * p.out) / 1e6;
  totalSpendUsd += cost;
  console.error(`  [spend] +$${cost.toFixed(4)} (${model}) -> running total $${totalSpendUsd.toFixed(4)} / $${SPEND_CAP_USD} cap`);
  if (totalSpendUsd >= SPEND_CAP_USD) {
    throw new Error(`SPEND CAP REACHED: running total $${totalSpendUsd.toFixed(4)} has hit the $${SPEND_CAP_USD} cap for this run. Stopping before starting further calls - re-run with a higher SPEND_CAP_USD if this was expected and you want to continue from the checkpoint.`);
  }
}
// Checked at the START of every call site too (not just after), so a
// chunk that's already at/over cap from a sibling call refuses to even
// start its own next API call rather than only noticing after paying for it.
function assertUnderCap() {
  if (totalSpendUsd >= SPEND_CAP_USD) {
    throw new Error(`SPEND CAP REACHED: running total $${totalSpendUsd.toFixed(4)} already at/over the $${SPEND_CAP_USD} cap - refusing to start another call.`);
  }
}

const SUBJECT = 'Mathematics';
const QUALIFICATION = 'A-Level';
const EXAM_BOARD = 'Edexcel';

// Fill in with the REAL specification content for each subtopic - the
// actual named theories/concepts from the syllabus. Generation quality is
// bounded by what's given here; do not leave this to the model's own
// possibly-stale recall of the spec.
const SUBTOPICS = [
  {
    subtopic: "1 Proof",
    specContent: `1 Proof

Content        What students need to learn:
1.1 Understand and use the structure of mathematical proof, proceeding from given
assumptions through a series of logical steps to a conclusion; use methods of proof,
including:
- Proof by deduction
- Proof by exhaustion
- Disproof by counter example
- Proof by contradiction (including proof of the irrationality of sqrt(2) and the infinity
  of primes, and application to unfamiliar proofs).

Guidance - Examples of proofs:
- Proof by deduction: e.g. using completion of the square, prove that n^2 - 6n + 10 is
  positive for all values of n or, for example, differentiation from first principles for
  small positive integer powers of x, or proving results for arithmetic and geometric
  series. This is the most commonly used method of proof throughout this specification.
- Proof by exhaustion: Given that p is a prime number such that 3 < p < 25, prove by
  exhaustion that (p - 1)(p + 1) is a multiple of 12.
- Disproof by counter example: e.g. show that the statement "n^2 - n + 1 is a prime
  number for all values of n" is untrue.
- Proof by contradiction, including proof of the irrationality of sqrt(2) and the infinity
  of primes, and application to unfamiliar proofs.`
  },
  {
    subtopic: "2 Algebra and functions",
    specContent: `2 Algebra and functions

Content        What students need to learn:
2.1 Understand and use the laws of indices for all rational exponents.
Guidance: a^m * a^n = a^(m+n), a^m / a^n = a^(m-n), (a^m)^n = a^(mn). The equivalence of
a^(m/n) and (n-th root of a)^m should be known.

2.2 Use and manipulate surds, including rationalising the denominator.
Guidance: Students should be able to simplify algebraic surds using the results
(sqrt(x))^2 = x, sqrt(x)*sqrt(y) = sqrt(xy), and (sqrt(x)+sqrt(y))(sqrt(x)-sqrt(y)) = x - y.

2.3 Work with quadratic functions and their graphs. The notation f(x) may be used.
- The discriminant of a quadratic function, including the conditions for real and
  repeated roots. Need to know and use b^2 - 4ac > 0, b^2 - 4ac = 0 and b^2 - 4ac < 0.
- Completing the square: ax^2 + bx + c = a(x + b/(2a))^2 + (c - b^2/(4a)).
- Solution of quadratic equations by factorisation, use of the formula, use of a
  calculator or completing the square, including solving quadratic equations in a
  function of the unknown. Guidance: these functions could include powers of x,
  trigonometric functions of x, exponential and logarithmic functions of x.

2.4 Solve simultaneous equations in two variables by elimination and by substitution,
including one linear and one quadratic equation.
Guidance: This may involve powers of 2 in one unknown or in both unknowns,
e.g. solve y = 2x + 3, y = x^2 - 4x + 8 or 2x - 3y = 6, x^2 - y^2 + 3x = 50.

2.5 Solve linear and quadratic inequalities in a single variable and interpret such
inequalities graphically, e.g. solving ax + b > cx + d, px^2 + qx + r >= 0,
px^2 + qx + r < ax + b and interpreting the third inequality as the range of x for which
the curve y = px^2 + qx + r is below the line with equation y = ax + b, including
inequalities with brackets and fractions.
Guidance: These would be reducible to linear or quadratic inequalities, e.g. a/x < b
becomes ax < bx^2. Express solutions through correct use of 'and' and 'or', or through
set notation. So, e.g. x < a or x > b is equivalent to {x : x < a} union {x : x > b},
and {x : c < x} intersect {x : x < d} is equivalent to x > c and x < d. Represent linear
and quadratic inequalities such as y > x + 1 and y > ax^2 + bx + c graphically. Shading
and use of dotted and solid line convention is required.

2.6 Manipulate polynomials algebraically, including expanding brackets and collecting
like terms, factorisation and simple algebraic division; use of the factor theorem.
Simplify rational expressions, including by factorising and cancelling, and algebraic
division (by linear expressions only).
Guidance: Only division by (ax + b) or (ax - b) will be required. Students should know
that if f(x) = 0 when x = b/a, then (ax - b) is a factor of f(x). Students may be
required to factorise cubic expressions such as x^3 + 3x^2 - 4 and 6x^3 + 11x^2 - x - 6.
Denominators of rational expressions will be linear or quadratic, e.g. 1/(ax + b),
(ax + b)/(px^2 + qx + r), (x^3 + a^3)/(x^2 - a^2).

2.7 Understand and use graphs of functions; sketch curves defined by simple equations
including polynomials.
Guidance: Graph to include simple cubic and quartic functions, e.g. sketch the graph
with equation y = x^2(2x - 1)^2.
- The modulus of a linear function. Students should be able to sketch the graph of
  y = |ax + b| and use their graph. For example, sketch the graph with equation
  y = |2x - 1| and use the graph to solve the equation |2x - 1| = x or the inequality
  |2x - 1| > x.
- y = a/x and y = a/x^2 (including their vertical and horizontal asymptotes). The
  asymptotes will be parallel to the axes, e.g. the asymptotes of the curve with
  equation y = a/(x + b) + c are the lines with equations y = c and x = -b.
- Interpret algebraic solution of equations graphically; use intersection points of
  graphs to solve equations.
- Understand and use proportional relationships and their graphs. Express relationship
  between two variables using the proportion symbol (~) or using an equation involving
  a constant, e.g. the circumference of a semicircle is directly proportional to its
  diameter so C ~ d or C = kd, and the graph of C against d is a straight line through
  the origin with gradient k.

2.8 Understand and use composite functions; inverse functions and their graphs.
Guidance: The concept of a function as a one-one or many-one mapping from R (or a
subset of R) to R. The notation f: x -> ... and f(x) will be used. Domain and range of
functions. Students should know that fg will mean 'do g first, then f' and that if
f^-1 exists, then f^-1 f(x) = f f^-1(x) = x. They should also know that the graph of
y = f^-1(x) is the image of the graph of y = f(x) after reflection in the line y = x.

2.9 Understand the effect of simple transformations on the graph of y = f(x), including
sketching associated graphs: y = a f(x), y = f(x) + a, y = f(x + a), y = f(ax) and
combinations of these transformations.
Guidance: Students should be able to find the graphs of y = f(x) and y = f(-x), given
the graph of y = f(x). Students should be able to apply a combination of these
transformations to any of the functions in the A Level specification (quadratics,
cubics, quartics, reciprocal, a/x^2, sqrt(x), sin x, cos x, tan x, e^x and a^x) and
sketch the resulting graph. Given the graph of y = f(x), students should be able to
sketch the graph of, e.g. y = 2f(3x), or y = f(-x) + 1, and should be able to sketch
(for example) y = 3 + sin 2x, y = -cos(x/4 + pi).

2.10 Decompose rational functions into partial fractions (denominators not more
complicated than squared linear terms and with no more than 3 terms, numerators
constant or linear).
Guidance: Partial fractions to include denominators such as (ax + b)(cx + d)(ex + f)
and (ax + b)(cx + d)^2. Applications to integration, differentiation and series
expansions.

2.11 Use of functions in modelling, including consideration of limitations and
refinements of the models.
Guidance: For example, use of trigonometric functions for modelling tides, hours of
sunlight, etc. Use of exponential functions for growth and decay (see Paper 1,
Section 6.7). Use of reciprocal function for inverse proportion (e.g. pressure and
volume).`
  },
  {
    subtopic: "3 Coordinate geometry in the (x, y) plane",
    specContent: `3 Coordinate geometry in the (x, y) plane

Content        What students need to learn:
3.1 Understand and use the equation of a straight line, including the forms
y - y1 = m(x - x1) and ax + by + c = 0.
Guidance: To include the equation of a line through two given points, and the equation
of a line parallel (or perpendicular) to a given line through a given point.
- Gradient conditions for two straight lines to be parallel or perpendicular:
  m1 = m2 for parallel lines and m1 = -1/m2 for perpendicular lines.
- Be able to use straight line models in a variety of contexts. For example, the line
  for converting degrees Celsius to degrees Fahrenheit, distance against time for
  constant speed, etc.

3.2 Understand and use the coordinate geometry of the circle including using the
equation of a circle in the form (x - a)^2 + (y - b)^2 = r^2.
Guidance: Students should be able to find the radius and the coordinates of the centre
of the circle given the equation of the circle, and vice versa. Students should also be
familiar with the equation x^2 + y^2 + 2fx + 2gy + c = 0.
- Completing the square to find the centre and radius of a circle; use of the following
  properties:
  - the angle in a semicircle is a right angle
  - the perpendicular from the centre to a chord bisects the chord
  - the radius of a circle at a given point on its circumference is perpendicular to
    the tangent to the circle at that point.
Guidance: Students should be able to find the equation of a circumcircle of a triangle
with given vertices using these properties. Students should be able to find the
equation of a tangent at a specified point, using the perpendicular property of tangent
and radius.

3.3 Understand and use the parametric equations of curves and conversion between
Cartesian and parametric forms.
Guidance: For example: x = 3cos t, y = 3sin t describes a circle centre O radius 3;
x = 2 + 5cos t, y = -4 + 5sin t describes a circle centre (2, -4) with radius 5;
x = 5t, y = 5/t describes the curve xy = 25 (or y = 25/x); x = 5t, y = 3t^2 describes
the quadratic curve 25y = 3x^2 and other familiar curves covered in the specification.
Students should pay particular attention to the domain of the parameter t, as a
specific section of a curve may be described.

3.4 Use parametric equations in modelling in a variety of contexts.
Guidance: A shape may be modelled using parametric equations or students may be asked
to find parametric equations for a motion. For example, an object moves with constant
velocity from (1, 8) at t = 0 to (6, 20) at t = 5. This may also be tested in Paper 3,
section 7 (kinematics).`
  },
  {
    subtopic: "4 Sequences and series",
    specContent: `4 Sequences and series

Content        What students need to learn:
4.1 Understand and use the binomial expansion of (a + bx)^n for positive integer n; the
notations n! and nCr link to binomial probabilities. Use of Pascal's triangle. Relation
between binomial coefficients.
Guidance: Also be aware of alternative notations such as C(n, r) and nCr. Considered
further in Paper 3 Section 4.1.
- Extend to any rational n, including its use for approximation; be aware that the
  expansion is valid for |bx/a| < 1 (proof not required).
Guidance: May be used with the expansion of rational functions by decomposition into
partial fractions. May be asked to comment on the range of validity.

4.2 Work with sequences including those given by a formula for the nth term and those
generated by a simple relation of the form x_(n+1) = f(x_n); increasing sequences;
decreasing sequences; periodic sequences.
Guidance: For example u_n = 1/(3n+1) describes a decreasing sequence as u_(n+1) < u_n
for all integer n; u_n = 2^n is an increasing sequence as u_(n+1) > u_n for all integer
n; u_(n+1) = 1/u_n for n > 1 and u_1 = 3 describes a periodic sequence of order 2.

4.3 Understand and use sigma notation for sums of series.
Guidance: Knowledge that sum from i=1 to n of 1 = n is expected.

4.4 Understand and work with arithmetic sequences and series, including the formulae
for nth term and the sum to n terms.
Guidance: The proof of the sum formula for an arithmetic sequence should be known,
including the formula for the sum of the first n natural numbers.

4.5 Understand and work with geometric sequences and series, including the formulae
for the nth term and the sum of a finite geometric series; the sum to infinity of a
convergent geometric series, including the use of |r| < 1; modulus notation.
Guidance: The proof of the sum formula should be known. Given the sum of a series,
students should be able to use logs to find the value of n. The sum to infinity may be
expressed as S-infinity.

4.6 Use sequences and series in modelling.
Guidance: Examples could include amounts paid into saving schemes, increasing by the
same amount (arithmetic) or by the same percentage (geometric) or could include other
series defined by a formula or a relation.`
  },
  {
    subtopic: "5 Trigonometry",
    specContent: `5 Trigonometry

Content        What students need to learn:
5.1 Understand and use the definitions of sine, cosine and tangent for all arguments;
the sine and cosine rules; the area of a triangle in the form (1/2)ab sin C.
Guidance: Use of x and y coordinates of points on the unit circle to give cosine and
sine respectively, including the ambiguous case of the sine rule.
- Work with radian measure, including use for arc length and area of sector.
Guidance: Use of the formulae s = r*theta and A = (1/2) r^2 * theta for arc lengths and
areas of sectors of a circle.

5.2 Understand and use the standard small angle approximations of sine, cosine and
tangent: sin(theta) ~ theta, cos(theta) ~ 1 - theta^2/2, tan(theta) ~ theta, where theta
is in radians.
Guidance: Students should be able to approximate, e.g. (cos 3x - 1) / (x sin 4x) when x
is small, to -9/8.

5.3 Understand and use the sine, cosine and tangent functions; their graphs, symmetries
and periodicity.
Guidance: Knowledge of graphs of curves with equations such as y = sin x,
y = cos(x + 30 degrees), y = tan 2x is expected. Know and use exact values of sin and
cos for 0, pi/6, pi/4, pi/3, pi/2, pi and multiples thereof, and exact values of tan for
0, pi/6, pi/4, pi/3 and multiples thereof.

5.4 Understand and use the definitions of secant, cosecant and cotangent and of
arcsin, arccos and arctan; their relationships to sine, cosine and tangent;
understanding of their graphs; their ranges and domains.
Guidance: Angles measured in both degrees and radians.

5.5 Understand and use tan(theta) = sin(theta)/cos(theta). Understand and use
sin^2(theta) + cos^2(theta) = 1, sec^2(theta) = 1 + tan^2(theta) and
cosec^2(theta) = 1 + cot^2(theta).
Guidance: These identities may be used to solve trigonometric equations and angles may
be in degrees or radians. They may also be used to prove further identities.

5.6 Understand and use double angle formulae; use of formulae for sin(A +/- B),
cos(A +/- B), and tan(A +/- B); understand geometrical proofs of these formulae.
Guidance: To include application to half angles. Knowledge of the tan(theta/2)
formulae will not be required.
- Understand and use expressions for a*cos(theta) + b*sin(theta) in the equivalent
  forms of r*cos(theta +/- alpha) or r*sin(theta +/- alpha).
Guidance: Students should be able to solve equations such as
a*cos(theta) + b*sin(theta) = c in a given interval.

5.7 Solve simple trigonometric equations in a given interval, including quadratic
equations in sin, cos and tan and equations involving multiples of the unknown angle.
Guidance: Students should be able to solve equations such as sin(x + 70 degrees) = 0.5
for 0 < x < 360 degrees, 3 + 5cos(2x) = 1 for -180 degrees < x < 180 degrees,
6cos^2(x) + sin(x) - 5 = 0 for 0 <= x < 360 degrees. These may be in degrees or radians
and this will be specified in the question.

5.8 Construct proofs involving trigonometric functions and identities.
Guidance: Students need to prove identities such as
cos(x)cos(2x) + sin(x)sin(2x) = cos(x).

5.9 Use trigonometric functions to solve problems in context, including problems
involving vectors, kinematics and forces.
Guidance: Problems could involve (for example) wave motion, the height of a point on a
vertical circular wheel, or the hours of sunlight throughout the year. Angles may be
measured in degrees or in radians.`
  },
  {
    subtopic: "6 Exponentials and logarithms",
    specContent: `6 Exponentials and logarithms

Content        What students need to learn:
6.1 Know and use the function a^x and its graph, where a is positive.
Guidance: Understand the difference in shape between a < 1 and a > 1.
- Know and use the function e^x and its graph.
Guidance: To include the graph of y = e^(ax+b) + c.

6.2 Know that the gradient of e^(kx) is equal to k*e^(kx) and hence understand why the
exponential model is suitable in many applications.
Guidance: Realise that when the rate of change is proportional to the y value, an
exponential model should be used.

6.3 Know and use the definition of log_a(x) as the inverse of a^x, where a is positive
and x >= 0.
- Know and use the function ln(x) and its graph (a not equal to 1).
- Know and use ln(x) as the inverse function of e^x.
Guidance: Solution of equations of the form e^(ax+b) = p and ln(ax + b) = q is expected.

6.4 Understand and use the laws of logarithms:
log_a(x) + log_a(y) = log_a(xy)
log_a(x) - log_a(y) = log_a(x/y)
k*log_a(x) = log_a(x^k) (including, for example, k = -1 and k = -1/2)
Guidance: Includes log_a(a) = 1.

6.5 Solve equations of the form a^x = b.
Guidance: Students may use the change of base formula. Questions may be of the form,
e.g. 2^(3x-1) = 3.

6.6 Use logarithmic graphs to estimate parameters in relationships of the form
y = a*x^n and y = k*b^x, given data for x and y.
Guidance: Plot log(y) against log(x) and obtain a straight line where the intercept is
log(a) and the gradient is n. Plot log(y) against x and obtain a straight line where
the intercept is log(k) and the gradient is log(b).

6.7 Understand and use exponential growth and decay; use in modelling (examples may
include the use of e in continuous compound interest, radioactive decay, drug
concentration decay, exponential growth as a model for population growth);
consideration of limitations and refinements of exponential models.
Guidance: Students may be asked to find the constants used in a model. They need to be
familiar with terms such as initial, meaning when t = 0. They may need to explore the
behaviour for large values of t or to consider whether the range of values predicted is
appropriate. Consideration of an improved model may be required.`
  },
  {
    subtopic: "7 Differentiation",
    specContent: `7 Differentiation

Content        What students need to learn:
7.1 Understand and use the derivative of f(x) as the gradient of the tangent to the
graph of y = f(x) at a general point (x, y); the gradient of the tangent as a limit;
interpretation as a rate of change.
Guidance: Know that dy/dx is the rate of change of y with respect to x. The notation
f'(x) may be used for the first derivative and f''(x) may be used for the second
derivative.
- Sketching the gradient function for a given curve; second derivatives.
Guidance: Given for example the graph of y = f(x), sketch the graph of y = f'(x) using
given axes and scale. This could relate speed and acceleration for example.
- Differentiation from first principles for small positive integer powers of x and for
  sin x and cos x.
Guidance: For example, students should be able to use, for n = 2 and n = 3, the
gradient expression lim(h->0) [((x+h)^n - x^n)/h]. Students may use delta-x or h.
- Understand and use the second derivative as the rate of change of gradient;
  connection to convex and concave sections of curves and points of inflection.
Guidance: Use the condition f''(x) > 0 implies a minimum and f''(x) < 0 implies a
maximum for points where f'(x) = 0. Know that at an inflection point f''(x) changes
sign. Consider cases where f'(x) = 0 and f''(x) = 0 where the point may be a minimum, a
maximum or a point of inflection (e.g. y = x^n, n > 2).

7.2 Differentiate x^n, for rational values of n, and related constant multiples, sums
and differences.
Guidance: For example, the ability to differentiate expressions such as
(2x + 5)(x - 1) and (3x^2 + 4x - 5)/(4*sqrt(x)), x > 0, is expected.
- Differentiate e^(kx) and a^(kx), sin(kx), cos(kx), tan(kx) and related sums,
  differences and constant multiples.
- Understand and use the derivative of ln(x).
Guidance: Knowledge and use of the result d/dx(a^(kx)) = k*a^(kx)*ln(a) is expected.

7.3 Apply differentiation to find gradients, tangents and normals.
Guidance: Use of differentiation to find equations of tangents and normals at specific
points on a curve.
- Maxima and minima and stationary points, points of inflection.
Guidance: To include applications to curve sketching. Maxima and minima problems may be
set in the context of a practical problem.
- Identify where functions are increasing or decreasing.
Guidance: To include applications to curve sketching.

7.4 Differentiate using the product rule, the quotient rule and the chain rule,
including problems involving connected rates of change and inverse functions.
Guidance: Differentiation of cosec x, cot x and sec x. Differentiation of functions of
the form x = sin y, x = 3 tan 2y and the use of dy/dx = 1 / (dx/dy). Use of connected
rates of change in models, e.g. dV/dt = dV/dr * dr/dt. Skill will be expected in the
differentiation of functions generated from standard forms using products, quotients
and composition, such as 2x^4 sin x, e^(3x)/x, cos^2(x) and tan^2(2x).

7.5 Differentiate simple functions and relations defined implicitly or
parametrically, for first derivative only.
Guidance: The finding of equations of tangents and normals to curves given
parametrically or implicitly is required.

7.6 Construct simple differential equations in pure mathematics and in context,
(contexts may include kinematics, population growth and modelling the relationship
between price and demand).
Guidance: Set up a differential equation using given information. For example: in a
simple model, the rate of decrease of the radius of the mint is inversely proportional
to the square of the radius.`
  },
  {
    subtopic: "8 Integration",
    specContent: `8 Integration

Content        What students need to learn:
8.1 Know and use the Fundamental Theorem of Calculus.
Guidance: Integration as the reverse process of differentiation. Students should know
that for indefinite integrals a constant of integration is required.

8.2 Integrate x^n (excluding n = -1) and related sums, differences and constant
multiples.
Guidance: For example, the ability to integrate expressions such as
(3x^2 - 2)/(2*sqrt(x)) and (x+2)^2/(2*sqrt(x)) is expected. Given f'(x) and a point on
the curve, students should be able to find an equation of the curve in the form
y = f(x).
- Integrate e^(kx), 1/x, sin(kx), cos(kx) and related sums, differences and constant
  multiples.
Guidance: To include integration of standard functions such as sin 3x, sec^2(2x),
tan x, e^(5x), 1/(2x). Students are expected to be able to use trigonometric
identities to integrate, for example, sin^2(x), tan^2(x), cos^2(3x).

8.3 Evaluate definite integrals; use a definite integral to find the area under a
curve and the area between two curves.
Guidance: Students will be expected to be able to evaluate the area of a region
bounded by a curve and given straight lines, or between two curves. This includes
curves defined parametrically. For example, find the finite area bounded by the curve
y = 6x - x^2 and the line y = 2x. Or find the finite area bounded by the curve
y = x^2 - 5x + 6 and the curve y = 4 - x^2.

8.4 Understand and use integration as the limit of a sum.
Guidance: Recognise that the integral from a to b of f(x) dx = lim(delta-x -> 0) of
the sum of f(x) * delta-x.

8.5 Carry out simple cases of integration by substitution and integration by parts;
understand these methods as the inverse processes of the chain and product rules
respectively (integration by substitution includes finding a suitable substitution and
is limited to cases where one substitution will lead to a function which can be
integrated; integration by parts includes more than one application of the method but
excludes reduction formulae).
Guidance: Students should recognise integrals of the form the integral of
f'(x)/f(x) dx = ln|f(x)| + c. The integral of ln(x) dx is required.

8.6 Integrate using partial fractions that are linear in the denominator.
Guidance: Integration of rational expressions such as those arising from partial
fractions, e.g. 2/(3x+5). Note that the integration of other rational expressions,
such as x/(2x+5) and 4/(2x-1)^2 is also required (see previous paragraph).

8.7 Evaluate the analytical solution of simple first order differential equations
with separable variables, including finding particular solutions (separation of
variables may require factorisation involving a common factor).
Guidance: Students may be asked to sketch members of the family of solution curves.

8.8 Interpret the solution of a differential equation in the context of solving a
problem, including identifying limitations of the solution; includes links to
kinematics.
Guidance: The validity of the solution for large values should be considered.`
  },
  {
    subtopic: "9 Numerical methods",
    specContent: `9 Numerical methods

Content        What students need to learn:
9.1 Locate roots of f(x) = 0 by considering changes of sign of f(x) in an interval of
x on which f(x) is sufficiently well behaved.
Guidance: Students should know that sign change is appropriate for continuous
functions in a small interval.
- Understand how change of sign methods can fail.
Guidance: When the interval is too large sign may not change as there may be an even
number of roots. If the function is not continuous, sign may change but there may be
an asymptote (not a root).

9.2 Solve equations approximately using simple iterative methods; be able to draw
associated cobweb and staircase diagrams.
Guidance: Understand that many mathematical problems cannot be solved analytically,
but numerical methods permit solution to a required level of accuracy. Use an
iteration of the form x_(n+1) = f(x_n) to find a root of the equation x = f(x) and show
understanding of the convergence in geometrical terms by drawing cobweb and staircase
diagrams.

9.3 Solve equations using the Newton-Raphson method and other recurrence relations of
the form x_(n+1) = g(x_n).
Guidance: Understand how such methods can fail. For the Newton-Raphson method,
students should understand its working in geometrical terms, so that they understand
its failure near to points where the gradient is small.

9.4 Understand and use numerical integration of functions, including the use of the
trapezium rule and estimating the approximate area under a curve and limits that it
must lie between.
Guidance: For example, evaluate the integral from 0 to 1 of sqrt(2x+1) dx using the
values of sqrt(2x+1) at x = 0, 0.25, 0.5, 0.75 and 1 and use a sketch on a given graph
to determine whether the trapezium rule gives an over-estimate or an under-estimate.

9.5 Use numerical methods to solve problems in context.
Guidance: Iterations may be suggested for the solution of equations not soluble by
analytic means.`
  },
  {
    subtopic: "10 Vectors",
    specContent: `10 Vectors

Content        What students need to learn:
10.1 Use vectors in two dimensions and in three dimensions.
Guidance: Students should be familiar with column vectors and with the use of i and j
unit vectors in two dimensions and i, j and k unit vectors in three dimensions.

10.2 Calculate the magnitude and direction of a vector and convert between component
form and magnitude/direction form.
Guidance: Students should be able to find a unit vector in the direction of a, and be
familiar with the notation |a|.

10.3 Add vectors diagrammatically and perform the algebraic operations of vector
addition and multiplication by scalars, and understand their geometrical
interpretations.
Guidance: The triangle and parallelogram laws of addition. Parallel vectors.

10.4 Understand and use position vectors; calculate the distance between two points
represented by position vectors.
Guidance: Vector AB = OB - OA = b - a. The distance d between two points (x1, y1) and
(x2, y2) is given by d^2 = (x1 - x2)^2 + (y1 - y2)^2. In three dimensions, the distance
d between two points (x1, y1, z1) and (x2, y2, z2) is given by
d^2 = (x1 - x2)^2 + (y1 - y2)^2 + (z1 - z2)^2.

10.5 Use vectors to solve problems in pure mathematics and in context (including
forces).
Guidance: For example, finding position vector of the fourth corner of a shape (e.g.
parallelogram) ABCD with three given position vectors for the corners A, B and C.
Contexts such as velocity, displacement, kinematics and forces will be covered in
Paper 3, Sections 6.1, 7.3 and 8.1 - 8.4.`
  },
  {
    subtopic: "1 Statistical sampling",
    specContent: `1 Statistical sampling

(Paper 3: Statistics and Mechanics. All the Pure Mathematics content is assumed
knowledge for Paper 3 and may be tested in parts of questions.)

Content        What students need to learn:
1.1 Understand and use the terms 'population' and 'sample'.
- Use samples to make informal inferences about the population.
Guidance: Students will be expected to comment on the advantages and disadvantages
associated with a census and a sample.
- Understand and use sampling techniques, including simple random sampling and
  opportunity sampling.
Guidance: Students will be expected to be familiar with: simple random sampling,
stratified sampling, systematic sampling, quota sampling and opportunity (or
convenience) sampling.
- Select or critique sampling techniques in the context of solving a statistical
  problem, including understanding that different samples can lead to different
  conclusions about the population.`
  },
  {
    subtopic: "2 Data presentation and interpretation",
    specContent: `2 Data presentation and interpretation

Content        What students need to learn:
2.1 Interpret diagrams for single-variable data, including understanding that area in
a histogram represents frequency.
Guidance: Students should be familiar with histograms, frequency polygons, box and
whisker plots (including outliers) and cumulative frequency diagrams.
- Connect to probability distributions.

2.2 Interpret scatter diagrams and regression lines for bivariate data, including
recognition of scatter diagrams which include distinct sections of the population
(calculations involving regression lines are excluded).
Guidance: Students should be familiar with the terms explanatory (independent) and
response (dependent) variables. Use of interpolation and the dangers of extrapolation.
Variables other than x and y may be used. Use to make predictions within the range of
values of the explanatory variable. Change of variable may be required, e.g. using
knowledge of logarithms to reduce a relationship of the form y = ax^n or y = kb^x into
linear form to estimate a and n or k and b.
- Understand informal interpretation of correlation.
- Understand that correlation does not imply causation.
Guidance: Use of terms such as positive, negative, zero, strong and weak are expected.

2.3 Interpret measures of central tendency and variation, extending to standard
deviation.
Guidance: Data may be discrete, continuous, grouped or ungrouped. Understanding and
use of coding. Measures of central tendency: mean, median, mode. Measures of
variation: variance, standard deviation, range and interpercentile ranges. Use of
linear interpolation to calculate percentiles from grouped data is expected.
- Be able to calculate standard deviation, including from summary statistics.
Guidance: Students should be able to use the statistic Sxx = sum of (x - x-bar)^2 =
sum of x^2 - (sum of x)^2 / n. Use of standard deviation = sqrt(Sxx / n) (or
equivalent) is expected but the use of s = sqrt(Sxx / (n-1)) (as used on spreadsheets)
will be accepted.

2.4 Recognise and interpret possible outliers in data sets and statistical diagrams.
Guidance: Any rule needed to identify outliers will be specified in the question. For
example, use of Q1 - 1.5 * IQR and Q3 + 1.5 * IQR or mean +/- 3 * standard deviation.
- Select or critique data presentation techniques in the context of a statistical
  problem.
Guidance: Students will be expected to draw simple inferences and give interpretations
to measures of central tendency and variation. Significance tests, other than those
mentioned in Section 5, will not be expected.
- Be able to clean data, including dealing with missing data, errors and outliers.
Guidance: For example, students may be asked to identify possible outliers on a box
plot or scatter diagram.`
  },
  {
    subtopic: "3 Probability",
    specContent: `3 Probability

Content        What students need to learn:
3.1 Understand and use mutually exclusive and independent events when calculating
probabilities.
Guidance: Venn diagrams or tree diagrams may be used. Set notation to describe events
may be used. Use of P(B|A) = P(B), P(A|B) = P(A), P(A intersect B) = P(A)P(B) in
connection with independent events.
- Link to discrete and continuous distributions.
Guidance: No formal knowledge of probability density functions is required but
students should understand that area under the curve represents probability in the
case of a continuous distribution.

3.2 Understand and use conditional probability, including the use of tree diagrams,
Venn diagrams, two-way tables.
- Understand and use the conditional probability formula
  P(A|B) = P(A intersect B) / P(B)
Guidance: Understanding and use of P(A') = 1 - P(A),
P(A union B) = P(A) + P(B) - P(A intersect B), P(A intersect B) = P(A)P(B|A).

3.3 Modelling with probability, including critiquing assumptions made and the likely
effect of more realistic assumptions.
Guidance: For example, questioning the assumption that a die or coin is fair.`
  },
  {
    subtopic: "4 Statistical distributions",
    specContent: `4 Statistical distributions

Content        What students need to learn:
4.1 Understand and use simple, discrete probability distributions (calculation of
mean and variance of discrete random variables is excluded), including the binomial
distribution, as a model; calculate probabilities using the binomial distribution.
Guidance: Students will be expected to use distributions to model a real-world
situation and to comment critically on the appropriateness. Students should know and
be able to identify the discrete uniform distribution. The notation X ~ B(n, p) may be
used. Use of a calculator to find individual or cumulative binomial probabilities.

4.2 Understand and use the Normal distribution as a model; find probabilities using
the Normal distribution.
Guidance: The notation X ~ N(mu, sigma^2) may be used. Knowledge of the shape and the
symmetry of the distribution is required. Knowledge of the probability density
function is not required. Derivation of the mean, variance and cumulative
distribution function is not required. Questions may involve the solution of
simultaneous equations. Students will be expected to use their calculator to find
probabilities connected with the normal distribution.
- Link to histograms, mean, standard deviation, points of inflection, and the binomial
  distribution.
Guidance: Students should know that the points of inflection on the normal curve are
at x = mu +/- sigma. The derivation of this result is not expected. Students should
know that when n is large and p is close to 0.5 the distribution B(n, p) can be
approximated by N(np, np(1-p)). The application of a continuity correction is
expected.

4.3 Select an appropriate probability distribution for a context, with appropriate
reasoning, including recognising when the binomial or Normal model may not be
appropriate.
Guidance: Students should know under what conditions a binomial distribution or a
Normal distribution might be a suitable model.`
  },
  {
    subtopic: "5 Statistical hypothesis testing",
    specContent: `5 Statistical hypothesis testing

Content        What students need to learn:
5.1 Understand and apply the language of statistical hypothesis testing, developed
through a binomial model: null hypothesis, alternative hypothesis, significance
level, test statistic, 1-tail test, 2-tail test, critical value, critical region,
acceptance region, p-value.
Guidance: An informal appreciation that the expected value of a binomial distribution
is given by np may be required for a 2-tail test.
- Extend to correlation coefficients as measures of how close data points lie to a
  straight line, and be able to interpret a given correlation coefficient using a
  given p-value or critical value (calculation of correlation coefficients is
  excluded).
Guidance: Students should know that the product moment correlation coefficient r
satisfies |r| <= 1 and that a value of r = +/-1 means the data points all lie on a
straight line. Students will be expected to calculate a value of r using their
calculator but use of the formula is not required. Hypotheses should be stated in
terms of rho, with a null hypothesis of rho = 0 where rho represents the population
correlation coefficient. Tables of critical values or a p-value will be given.

5.2 Conduct a statistical hypothesis test for the proportion in the binomial
distribution and interpret the results in context.
- Understand that a sample is being used to make an inference about the population,
  and appreciate that the significance level is the probability of incorrectly
  rejecting the null hypothesis.
Guidance: Hypotheses should be expressed in terms of the population parameter p. A
formal understanding of Type I errors is not expected.

5.3 Conduct a statistical hypothesis test for the mean of a Normal distribution with
known, given or assumed variance and interpret the results in context.
Guidance: Students should know that: if X ~ N(mu, sigma^2) then
X-bar ~ N(mu, sigma^2/n), and that a test for mu can be carried out using
(X-bar - mu) / (sigma/sqrt(n)) ~ N(0, 1^2). No proofs required. Hypotheses should be
stated in terms of the population mean mu. Knowledge of the Central Limit Theorem or
other large sample approximations is not required.`
  },
  {
    subtopic: "6 Quantities and units in mechanics",
    specContent: `6 Quantities and units in mechanics

(Paper 3: Statistics and Mechanics. All the Pure Mathematics content is assumed
knowledge for Paper 3 and may be tested in parts of questions.)

Content        What students need to learn:
6.1 Understand and use fundamental quantities and units in the S.I. system: length,
time, mass.
- Understand and use derived quantities and units: velocity, acceleration, force,
  weight, moment.
Guidance: Students may be required to convert one unit into another, e.g. km h^-1 into
m s^-1.`
  },
  {
    subtopic: "7 Kinematics",
    specContent: `7 Kinematics

Content        What students need to learn:
7.1 Understand and use the language of kinematics: position; displacement; distance
travelled; velocity; speed; acceleration.
Guidance: Students should know that distance and speed must be positive.

7.2 Understand, use and interpret graphs in kinematics for motion in a straight line:
displacement against time and interpretation of gradient; velocity against time and
interpretation of gradient and area under the graph.
Guidance: Graphical solutions to problems may be required.

7.3 Understand, use and derive the formulae for constant acceleration for motion in a
straight line.
Guidance: Derivation may use knowledge of sections 7.2 and/or 7.4.
- Extend to 2 dimensions using vectors.
Guidance: Understand and use suvat formulae for constant acceleration in 2-D, e.g.
v = u + at, r = ut + (1/2)at^2, with vectors given in i-j or column vector form. Use
vectors to solve problems.

7.4 Use calculus in kinematics for motion in a straight line: v = dr/dt,
a = dv/dt = d^2r/dt^2, r = integral of v dt, v = integral of a dt.
Guidance: The level of calculus required will be consistent with that in Sections 7
and 8 in the Pure Mathematics content.
- Extend to 2 dimensions using vectors.
Guidance: Differentiation and integration of a vector with respect to time, e.g. given
r = t^3 i + 2t^2 j, find r-dot (v) and r-double-dot (a) at a given time.

7.5 Model motion under gravity in a vertical plane using vectors; projectiles.
Guidance: Derivation of formulae for time of flight, range and greatest height and the
derivation of the equation of the path of a projectile may be required.`
  },
  {
    subtopic: "8 Forces and Newton's laws",
    specContent: `8 Forces and Newton's laws

Content        What students need to learn:
8.1 Understand the concept of a force; understand and use Newton's first law.
Guidance: Normal reaction, tension, thrust or compression, resistance.

8.2 Understand and use Newton's second law for motion in a straight line (restricted
to forces in two perpendicular directions or simple cases of forces given as 2-D
vectors); extend to situations where forces need to be resolved (restricted to 2
dimensions).
Guidance: Problems will involve motion in a straight line with constant acceleration
in scalar form, where the forces act either parallel or perpendicular to the motion.
Problems may involve motion in a straight line with constant acceleration in vector
form, where the forces are given in i-j form or as column vectors. Extend to problems
where forces need to be resolved, e.g. a particle moving on an inclined plane.

8.3 Understand and use weight and motion in a straight line under gravity;
gravitational acceleration, g, and its value in S.I. units to varying degrees of
accuracy. (The inverse square law for gravitation is not required and g may be
assumed to be constant, but students should be aware that g is not a universal
constant but depends on location.)
Guidance: The default value of g will be 9.8 m s^-2 but some questions may specify
another value, e.g. g = 10 m s^-2.

8.4 Understand and use Newton's third law; equilibrium of forces on a particle and
motion in a straight line (restricted to forces in two perpendicular directions or
simple cases of forces given as 2-D vectors); application to problems involving
smooth pulleys and connected particles; resolving forces in 2 dimensions; equilibrium
of a particle under coplanar forces.
Guidance: Connected particle problems could include problems with particles in
contact, e.g. lift problems. Problems may be set where forces need to be resolved,
e.g. at least one of the particles is moving on an inclined plane.

8.5 Understand and use addition of forces; resultant forces; dynamics for motion in a
plane.
Guidance: Students may be required to resolve a vector into two components or use a
vector diagram, e.g. problems involving two or more forces, given in
magnitude-direction form.

8.6 Understand and use the F <= mu*R model for friction; coefficient of friction;
motion of a body on a rough surface; limiting friction and statics.
Guidance: An understanding of F = mu*R when a particle is moving. An understanding of
F <= mu*R in a situation of equilibrium.`
  },
  {
    subtopic: "9 Moments",
    specContent: `9 Moments

Content        What students need to learn:
9.1 Understand and use moments in simple static contexts.
Guidance: Equilibrium of rigid bodies. Problems involving parallel and non-parallel
coplanar forces, e.g. ladder problems.`
  }
];

function stripCodeFences(text) {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}

// Found live on this exact subject's real run: two coverage-check
// responses came back missing precisely their final closing '}' - every
// string properly terminated, every array properly closed, just the one
// outermost brace dropped (confirmed by counting: 3 '{' vs 2 '}' in both
// cases, nothing else off). Too small and too specific a defect to be
// max_tokens truncation (these responses were a few hundred tokens
// against a 16000 cap) - looks like an occasional real model formatting
// slip on this call shape. A plain JSON.parse has no way to recover from
// that; this repairs the one specific, common case (a handful of missing
// closers at the very end, string content itself intact) by walking the
// text tracking bracket/brace/string-quote state and appending whatever
// closers are still open, in the correct nesting order, before a final
// parse attempt. Does not attempt to fix anything IN the middle of the
// text (a truncated string value, a missing comma) - those are genuine
// truncations that should keep failing loudly, not be silently patched.
function parseJsonWithRepair(text, context) {
  try {
    return JSON.parse(text);
  } catch (firstErr) {
    const stack = [];
    let inString = false;
    let escaped = false;
    for (const ch of text) {
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{') stack.push('}');
      else if (ch === '[') stack.push(']');
      else if (ch === '}' || ch === ']') {
        if (stack[stack.length - 1] === ch) stack.pop();
      }
    }
    if (inString || !stack.length) throw firstErr; // not the "missing trailing closers" shape - a real truncation, don't paper over it
    const repaired = text + stack.reverse().join('');
    try {
      const parsed = JSON.parse(repaired);
      console.error(`  [repair] ${context}: response was missing ${stack.length} trailing closer(s) - repaired and parsed successfully`);
      return parsed;
    } catch (secondErr) {
      throw firstErr; // repair attempt didn't work either - surface the ORIGINAL error, not the repaired one
    }
  }
}

async function generateSubtopic(subtopic, specContent, missingConcepts) {
  // missingConcepts is only ever set on a coverage-driven retry (see
  // main()) - appending it rather than silently starting over means the
  // model still has every reason for the atomicity/breadth decisions it
  // already got right, plus an explicit, unmissable instruction covering
  // exactly what the coverage check found absent.
  const retryNote = missingConcepts && missingConcepts.length
    ? `\n\nA completeness check against this same specification text found that your previous attempt did not cover the following - make sure this regeneration includes proper decomposed coverage of each one (not just a one-line mention):\n${missingConcepts.map(m => `- ${m.term}: ${m.whyItMatters}`).join('\n')}`
    : '';
  // 16k (up from 8k): a dense subtopic (e.g. 4.3's market/interventionist/
  // other strategy lists) can genuinely produce more than 8k tokens of
  // nodes+edges once rules 7/8's "brainstorm 4-6 points per side" is
  // followed properly - 8k risked silently truncating valid JSON on
  // exactly the subtopics that need the most decomposition. Streamed
  // (not just a higher max_tokens) because a long non-streamed generation
  // risks the client's own request timeout, independent of the token cap.
  // thinking explicitly disabled, matching claudeClient.ts's
  // THINKS_BY_DEFAULT_MODELS handling for every other Sonnet 5/Opus 5 call
  // in this codebase: this is a rule-driven structured-JSON extraction
  // task, not one that benefits from extended reasoning, and adaptive
  // thinking is what caused the original truncation bug this comment used
  // to describe (it was burning most of a 16k budget on invisible
  // reasoning before writing a single character of the actual JSON).
  // max_tokens now only has to cover the actual output.
  assertUnderCap();
  const stream1 = client.messages.stream({
    model: GENERATION_MODEL,
    max_tokens: 32000,
    thinking: { type: 'disabled' },
    system: cachedSystem(KNOWLEDGE_MAP_GENERATION_PROMPT),
    messages: [{
      role: 'user',
      content: `Subject: ${SUBJECT}\nQualification: ${QUALIFICATION}\nExam board: ${EXAM_BOARD}\nSubtopic: ${subtopic}\n\nReal specification content:\n${specContent}${retryNote}`,
    }],
  });
  stream1.on('error', (e) => console.error('STREAM ERROR EVENT:', e));
  stream1.on('streamEvent', (e) => { if (e.type === 'message_delta' || e.type === 'message_stop') console.error('STREAM EVENT:', JSON.stringify(e)); });
  const resp = await stream1.finalMessage();
  console.error('stop_reason:', resp.stop_reason, ' usage:', JSON.stringify(resp.usage));
  recordUsage(GENERATION_MODEL, resp.usage);
  const debugPath = path.join(__dirname, `debug_generation_${safeId(subtopic)}.txt`);
  const textBlock1 = resp.content.find(b => b.type === 'text');
  if (!textBlock1) {
    fs.writeFileSync(debugPath, JSON.stringify(resp, null, 2));
    throw new Error(`No text block in response for subtopic "${subtopic}" - stop_reason: ${resp.stop_reason}, full response dumped to ${debugPath}`);
  }
  const text = textBlock1.text;
  const cleaned = stripCodeFences(text);
  try {
    return parseJsonWithRepair(cleaned, `generate ${subtopic}`);
  } catch (err) {
    fs.writeFileSync(debugPath, cleaned);
    console.error(`JSON parse failed for subtopic "${subtopic}" - raw response written to ${debugPath}`);
    throw err;
  }
}

function safeId(raw) {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
}

async function checkCoverage(subtopic, specContent, nodes) {
  // 6k (up from 4k): a thin margin above what a genuinely thorough
  // missing-concepts list for a dense subtopic could need - this call's
  // output is bounded by how much the FIRST pass actually missed, so it
  // rarely approaches this, but 4k was cutting it close on worst-case
  // subtopics with several dropped named theories at once.
  assertUnderCap();
  const stream2 = client.messages.stream({
    model: COVERAGE_MODEL,
    max_tokens: 16000,
    thinking: { type: 'disabled' },
    system: cachedSystem(KNOWLEDGE_MAP_COVERAGE_PROMPT),
    messages: [{
      role: 'user',
      content: `Specification text:\n${specContent}\n\nNode labels already generated from it:\n${JSON.stringify(nodes.map(n => n.label))}`,
    }],
  });
  const resp = await stream2.finalMessage();
  recordUsage(COVERAGE_MODEL, resp.usage);
  const textBlock2 = resp.content.find(b => b.type === 'text');
  if (!textBlock2) throw new Error(`Coverage check: no text block, stop_reason: ${resp.stop_reason}`);
  try {
    return parseJsonWithRepair(stripCodeFences(textBlock2.text), `coverage ${subtopic}`).missingConcepts || [];
  } catch (err) {
    const debugPath = path.join(__dirname, `debug_coverage_${safeId(subtopic)}.txt`);
    fs.writeFileSync(debugPath, textBlock2.text);
    console.error(`Coverage JSON parse failed for "${subtopic}" - raw response written to ${debugPath}`);
    throw err;
  }
}

async function verifyBatch(allNodes, allEdges) {
  // 32k (up from 8k): this is the one call that sees the ENTIRE subject
  // at once (700+ nodes for Economics) and can legitimately surface
  // dozens of issues, each carrying its own explanation plus proposed
  // new_nodes/new_edges - the single most likely call in this whole
  // pipeline to have been silently truncating its JSON output at 8k on a
  // real full-subject run. Streamed for the same request-timeout reason
  // as generateSubtopic, more so here given the larger cap.
  assertUnderCap();
  const stream3 = client.messages.stream({
    model: VERIFICATION_MODEL,
    max_tokens: 60000,
    thinking: { type: 'disabled' },
    system: cachedSystem(KNOWLEDGE_MAP_VERIFICATION_PROMPT),
    messages: [{
      role: 'user',
      content: `Subject: ${SUBJECT} (${QUALIFICATION}, ${EXAM_BOARD})\n\nNodes:\n${JSON.stringify(allNodes)}\n\nEdges:\n${JSON.stringify(allEdges)}`,
    }],
  });
  const resp = await stream3.finalMessage();
  console.error('verification stop_reason:', resp.stop_reason, ' usage:', JSON.stringify(resp.usage));
  recordUsage(VERIFICATION_MODEL, resp.usage);
  const textBlock = resp.content.find(b => b.type === 'text');
  if (!textBlock) throw new Error(`Verification: no text block, stop_reason: ${resp.stop_reason}`);
  try {
    return parseJsonWithRepair(stripCodeFences(textBlock.text), 'verification');
  } catch (err) {
    fs.writeFileSync(path.join(__dirname, 'debug_last_verification_response.txt'), textBlock.text);
    console.error('Verification JSON parse failed - raw response written to scripts/debug_last_verification_response.txt');
    throw err;
  }
}

function applyFixes(nodes, edges, issues) {
  const nodeIds = new Set(nodes.map(n => n.id));
  const edgeKey = ([a, b]) => a + '->' + b;
  const edgeSet = new Set(edges.map(edgeKey));

  issues.forEach(issue => {
    (issue.fix?.new_nodes || []).forEach(n => {
      if (!nodeIds.has(n.id)) { nodes.push(n); nodeIds.add(n.id); }
    });
    (issue.fix?.new_edges || []).forEach(e => {
      if (!edgeSet.has(edgeKey(e))) { edges.push(e); edgeSet.add(edgeKey(e)); }
    });
    (issue.fix?.remove_edges || []).forEach(e => {
      const k = edgeKey(e);
      const idx = edges.findIndex(x => edgeKey(x) === k);
      if (idx !== -1) edges.splice(idx, 1);
    });
  });
  return { nodes, edges };
}

// Same validity check used throughout the artifact this pipeline is
// replacing - a DAG with no orphaned edges, run automatically rather than
// by hand every time.
function validate(nodes, edges) {
  const nodeIds = new Set(nodes.map(n => n.id));
  const dupes = {};
  nodes.forEach(n => dupes[n.id] = (dupes[n.id] || 0) + 1);
  Object.entries(dupes).forEach(([id, c]) => { if (c > 1) console.warn('DUPLICATE ID:', id); });

  const bad = edges.filter(([a, b]) => !nodeIds.has(a) || !nodeIds.has(b));
  bad.forEach(([a, b]) => console.warn('ORPHANED EDGE:', a, '->', b));

  const adj = {};
  nodes.forEach(n => adj[n.id] = []);
  edges.forEach(([a, b]) => { if (adj[a]) adj[a].push(b); });
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = {};
  nodes.forEach(n => color[n.id] = WHITE);
  let cyclePath = null;
  function dfs(u, path) {
    color[u] = GRAY;
    for (const v of adj[u]) {
      if (color[v] === GRAY) { cyclePath = path.concat([u, v]); return true; }
      if (color[v] === WHITE && dfs(v, path.concat([u]))) return true;
    }
    color[u] = BLACK;
    return false;
  }
  for (const n of nodes) if (color[n.id] === WHITE && dfs(n.id, [])) break;
  if (cyclePath) console.warn('CYCLE:', cyclePath.join(' -> '));

  return { valid: bad.length === 0 && !cyclePath && Object.values(dupes).every(c => c === 1) };
}

// Retries a transient failure (dropped connection, momentary API
// overload) with exponential backoff - discovered necessary on the real
// first full run, which died to a mid-stream ECONNRESET on subtopic 2.5
// after already paying for five subtopics' worth of generation calls.
// Does NOT retry a JSON-parse failure (that's a real content bug worth
// seeing immediately, not a flaky-network symptom) or anything already
// wrapped in its own try/catch inside generateSubtopic/checkCoverage/
// verifyBatch that writes a debug dump - only the raw network/SDK-level
// exception these three functions can also throw.
async function withRetry(fn, label, maxRetries = 4) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      // 429 added after raising SUBTOPIC_CONCURRENCY made hitting a rate
      // limit a real possibility, not just a network blip - a 429 needs a
      // longer, escalating wait than a dropped connection does, since
      // retrying immediately into an active rate limit just fails again.
      const isRateLimit = err?.status === 429;
      const transient = isRateLimit || err?.cause?.code === 'ECONNRESET' || err?.status >= 500 || err?.name === 'APIConnectionError';
      if (!transient || attempt === maxRetries) throw err;
      const waitMs = isRateLimit ? 20000 * attempt : 5000 * attempt;
      console.warn(`  ! ${label} failed (attempt ${attempt}/${maxRetries}: ${err.message}) - retrying in ${waitMs / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }
}

const CHECKPOINT_PATH = path.join(__dirname, `_checkpoint_${SUBJECT.toLowerCase()}_${QUALIFICATION.toLowerCase().replace(/[^a-z0-9]/g, '')}.json`);

function loadCheckpoint() {
  if (!fs.existsSync(CHECKPOINT_PATH)) return { completedSubtopics: [], allNodes: [], allEdges: [] };
  const data = JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf8'));
  console.log(`Resuming from checkpoint: ${data.completedSubtopics.length}/${SUBTOPICS.length} subtopics already done.`);
  return data;
}

function saveCheckpoint(state) {
  fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify(state));
}

// One subtopic's full generate -> coverage-check -> regenerate pipeline,
// as a standalone unit safe to run concurrently with others (each only
// ever touches its own local `nodes`/`edges`, never shared state) - the
// only genuine cross-subtopic dependency in the whole pipeline is the
// FINAL verifyBatch call, which needs everything already finished, so
// nothing here needs to run sequentially.
async function processSubtopic(subtopic, specContent) {
  console.log(`Generating: ${subtopic}...`);
  let { nodes, edges } = await withRetry(() => generateSubtopic(subtopic, specContent), `generate ${subtopic}`);
  console.log(`  -> ${subtopic}: ${nodes.length} nodes, ${edges.length} edges`);

  // Coverage check against the RAW spec text - the only check in this
  // pipeline that can catch a whole named theory/model dropped entirely,
  // since it's the only one that ever sees the source text rather than
  // just the nodes already produced from it (see the comment above
  // KNOWLEDGE_MAP_COVERAGE_PROMPT for why this is a distinct failure
  // mode from anything verifyBatch below can catch).
  for (let round = 0; round < MAX_COVERAGE_ROUNDS; round++) {
    console.log(`  [${subtopic}] Checking coverage (round ${round + 1})...`);
    const missing = await withRetry(() => checkCoverage(subtopic, specContent, nodes), `coverage check ${subtopic}`);
    if (!missing.length) {
      console.log(`  -> ${subtopic}: full coverage confirmed`);
      break;
    }
    console.log(`  -> ${subtopic}: ${missing.length} concept(s) missing, regenerating: ${missing.map(m => m.term).join('; ')}`);
    ({ nodes, edges } = await withRetry(() => generateSubtopic(subtopic, specContent, missing), `regenerate ${subtopic}`));
    console.log(`  -> ${subtopic}: ${nodes.length} nodes, ${edges.length} edges after regeneration`);
  }

  nodes.forEach(n => n.subtopic = subtopic);
  return { subtopic, nodes, edges };
}

// Concurrency limited (not all 19 at once) to stay well clear of the
// account's own rate limits rather than guess at exactly where they are
// and find out the hard way mid-run. Lowered from 4 to 2 specifically for
// this run's hard SPEND_CAP_USD - the cap is only checked between calls,
// not mid-stream, so the worst-case overshoot once it trips is bounded by
// however many calls were already in flight in that chunk; halving
// concurrency halves that worst case, at the cost of roughly doubling
// wall-clock time.
const SUBTOPIC_CONCURRENCY = 2;

async function main() {
  const state = loadCheckpoint();
  let { allNodes, allEdges } = state;
  const done = new Set(state.completedSubtopics);

  const remaining = SUBTOPICS.filter(s => !done.has(s.subtopic));
  for (const s of SUBTOPICS) { if (done.has(s.subtopic)) console.log(`Skipping (already done): ${s.subtopic}`); }

  let anyFailed = false;
  for (let i = 0; i < remaining.length; i += SUBTOPIC_CONCURRENCY) {
    const chunk = remaining.slice(i, i + SUBTOPIC_CONCURRENCY);
    // allSettled, not all - a genuine failure in one subtopic (e.g. a
    // real max_tokens truncation, not just a transient network blip)
    // must not throw away the OTHER subtopics in the same chunk that
    // finished fine. Promise.all would reject the whole chunk the moment
    // any one item threw, silently discarding already-done work that
    // was never given a chance to reach saveCheckpoint - exactly what
    // happened on the real run this was found on.
    const settled = await Promise.allSettled(chunk.map(s => processSubtopic(s.subtopic, s.specContent)));
    settled.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        const { subtopic, nodes, edges } = result.value;
        allNodes = allNodes.concat(nodes);
        allEdges = allEdges.concat(edges);
        done.add(subtopic);
      } else {
        anyFailed = true;
        console.error(`FAILED: ${chunk[idx].subtopic}: ${result.reason?.message || result.reason}`);
      }
    });
    saveCheckpoint({ completedSubtopics: Array.from(done), allNodes, allEdges });
    console.log(`Checkpoint saved: ${done.size}/${SUBTOPICS.length} subtopics done.`);
  }
  if (anyFailed) {
    console.error('\nOne or more subtopics failed permanently (see FAILED lines above) - fix the underlying issue, then just re-run this script. The checkpoint means only the failed subtopic(s) get retried, nothing already-done gets re-paid for.');
    process.exit(1);
  }

  console.log(`\nVerifying batch of ${allNodes.length} nodes...`);
  const { issues } = await withRetry(() => verifyBatch(allNodes, allEdges), 'verification');
  console.log(`  -> ${issues.length} issue(s) found`);
  issues.forEach(i => console.log(`  [${i.type}] ${i.affected_node}: ${i.explanation}`));

  const fixed = applyFixes(allNodes, allEdges, issues);
  const result = validate(fixed.nodes, fixed.edges);
  console.log(`\nFinal: ${fixed.nodes.length} nodes, ${fixed.edges.length} edges, valid DAG: ${result.valid}`);

  const outPath = `knowledge_map_${SUBJECT.toLowerCase()}_${QUALIFICATION.toLowerCase().replace(/[^a-z0-9]/g, '')}.json`;
  fs.writeFileSync(outPath, JSON.stringify({ subject: SUBJECT, qualification: QUALIFICATION, examBoard: EXAM_BOARD, nodes: fixed.nodes, edges: fixed.edges }, null, 2));
  console.log(`Written to ${outPath}`);
}

main().catch(err => { console.error(err); process.exit(1); });
