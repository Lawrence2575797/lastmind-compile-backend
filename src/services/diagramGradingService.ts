// Deterministic grading for the 'diagram' practice-question answer type -
// a student places curve/line shapes on a fixed axis canvas, shades a
// region, and drags labels into position; this compares that submission
// against a question's diagram_spec WITHOUT any LLM call, since geometry
// comparison doesn't need one (see practiceQuestionService.ts's own
// comment on why plain marking is cheap/reliable - same logic applies
// here even more directly).
//
// Canvas/coordinate contract (the frontend widget, built in a later
// phase, MUST match these exactly - there is no shared-types mechanism
// between this backend and the plain-JS frontend, so this file is the
// single source of truth for the convention):
//   - Canvas is a fixed 600x400 logical box, y increasing DOWNWARD
//     (standard screen/SVG convention).
//   - The price axis is a fixed vertical segment at x=60, from y=20 to
//     y=340. The quantity axis is a fixed horizontal segment at y=340,
//     from x=60 to x=580.
//   - Every curve type in CURVE_SHAPES is a straight-line polyline
//     defined in LOCAL coordinates with its own first point at (0,0) -
//     placing a curve at (x,y) translates that local polyline so its
//     first point lands at (x,y) in canvas space. No resize/rotate in v1
//     - grading is relative-position based, not scale-based, so a fixed
//     size loses nothing.
// Curves are deliberately straight lines, not true Bezier curves - a
// real textbook supply/demand diagram is very often drawn this way too,
// and it keeps every intersection/region computation below exact rather
// than an approximation of a curved boundary.

export const CANVAS_WIDTH = 640;
export const CANVAS_HEIGHT = 440;
// Must match the axis line the frontend widget actually draws exactly -
// see diagram_drawer_preview's render() - a grading segment shorter than
// the visible axis rejects a curve that visually, correctly, crosses it.
export const PRICE_AXIS: [Point, Point] = [{ x: 70, y: 20 }, { x: 70, y: 390 }];
export const QUANTITY_AXIS: [Point, Point] = [{ x: 60, y: 380 }, { x: 620, y: 380 }];

export interface Point { x: number; y: number }

// Base shape library - what the frontend palette actually offers. A
// "shift" is expressed by placing a SECOND instance of the same base
// shape further along, not by picking a distinct palette item (baseType()
// below is what maps a spec's "demand_shift_right" back to the base
// palette item "demand" it's found under).
const CURVE_SHAPES: Record<string, Point[]> = {
  demand: [{ x: 0, y: 0 }, { x: 130, y: 80 }, { x: 260, y: 160 }],
  supply: [{ x: 0, y: 160 }, { x: 130, y: 80 }, { x: 260, y: 0 }],
  generic_price_line: [{ x: 0, y: 0 }, { x: 260, y: 0 }],
  generic_quantity_line: [{ x: 0, y: 0 }, { x: 0, y: 220 }],
  // U-shaped short-run cost curves - a handful of segments is enough to
  // read as "dips then rises" without needing true curve fitting.
  marginal_cost: [{ x: 0, y: 70 }, { x: 70, y: 15 }, { x: 140, y: 10 }, { x: 210, y: 35 }, { x: 260, y: 85 }],
  average_cost: [{ x: 0, y: 100 }, { x: 90, y: 48 }, { x: 170, y: 46 }, { x: 260, y: 95 }],
  // A perfectly elastic world supply curve for trade diagrams - drawn
  // horizontal like a price line, but a distinct palette item since it
  // means something different (the world price a small country faces).
  world_supply: [{ x: 0, y: 110 }, { x: 260, y: 110 }],
  // Monopoly/imperfect-competition revenue curves - AR shares demand's
  // exact shape (AR = D for a single-price seller), MR shares its
  // price-intercept but falls at twice the slope (half the horizontal
  // run), the standard straight-line-demand relationship, not invented.
  average_revenue: [{ x: 0, y: 0 }, { x: 130, y: 80 }, { x: 260, y: 160 }],
  marginal_revenue: [{ x: 0, y: 0 }, { x: 65, y: 80 }, { x: 130, y: 160 }],
  // Macro family - AD/AS are geometrically identical to demand/supply
  // (same reasoning as average_revenue reusing demand's shape above): a
  // separate palette item so they're graded as AD/AS, not D/S.
  ad: [{ x: 0, y: 0 }, { x: 130, y: 80 }, { x: 260, y: 160 }],
  as_curve: [{ x: 0, y: 160 }, { x: 130, y: 80 }, { x: 260, y: 0 }],
  lras_classical: [{ x: 0, y: 0 }, { x: 0, y: 220 }],
  // Keynesian LRAS: flat at low output (spare capacity), curving up
  // through the intermediate range, near-vertical at full capacity - a
  // genuinely different shape from the classical vertical line.
  lras_keynesian: [{ x: 0, y: 200 }, { x: 100, y: 190 }, { x: 170, y: 120 }, { x: 220, y: 40 }, { x: 260, y: 0 }],
  // Downward-sloping like demand, but its own semantic item so it's
  // graded as the Phillips curve, not demand.
  phillips: [{ x: 0, y: 0 }, { x: 130, y: 80 }, { x: 260, y: 160 }],
  // Inverted-U: zero revenue at a 0% rate, rising to a peak, falling back
  // toward zero as the rate approaches 100%.
  laffer: [{ x: 0, y: 200 }, { x: 65, y: 60 }, { x: 130, y: 20 }, { x: 195, y: 60 }, { x: 260, y: 200 }],
  // Bows below the 45-degree line of perfect equality - paired with
  // line_of_equality for the Gini-coefficient area between them.
  lorenz_curve: [{ x: 0, y: 200 }, { x: 80, y: 170 }, { x: 150, y: 120 }, { x: 210, y: 60 }, { x: 260, y: 0 }],
  line_of_equality: [{ x: 0, y: 200 }, { x: 260, y: 0 }],
  // Production possibility frontier - concave (bowed outward, away from
  // the origin), the standard "opportunity cost rises as you specialise
  // further" shape, genuinely distinct from every straight-line curve
  // above. First point (0,0) is the all-of-good-Y intercept, last point
  // is the all-of-good-X intercept, same "first point is the origin of
  // this shape" convention as every other entry here.
  ppf: [{ x: 0, y: 0 }, { x: 60, y: 100 }, { x: 130, y: 160 }, { x: 200, y: 200 }, { x: 260, y: 215 }],
};

const SHIFT_SUFFIX_RE = /_shift_(left|right)$/;

function baseType(type: string): string {
  return type.replace(SHIFT_SUFFIX_RE, '');
}

function shiftDirection(type: string): 'left' | 'right' | null {
  const m = type.match(SHIFT_SUFFIX_RE);
  return m ? (m[1] as 'left' | 'right') : null;
}

// A noise floor (tells "genuinely drawn to the other side" apart from
// two near-identical curves), NOT a minimum shift size - a real exam
// question never grades how far a shift is drawn, only which way, so
// this stays tiny on purpose.
const MIN_SHIFT_PX = 3;
const LABEL_TOLERANCE_PX = 55;
const SHADE_IOU_THRESHOLD = 0.3;
const SHADE_GRID_RESOLUTION = 60;

export interface DiagramSpecCurve {
  id: string;
  type: string;
  baseCurveId?: string;
}
export interface DiagramSpecShade {
  id: string;
  boundedBy: string[]; // exactly two curve ids + one of "price-axis"/"quantity-axis" in v1
  // Checked against the student's OWN label for whichever shade matches
  // this region (see labelMentionsPhrase) - optional since not every
  // shaded-area question needs a named label to earn full credit.
  expectedLabel?: string;
}
export interface DiagramSpecLabel {
  text: string;
  anchor: string; // "curve:<id>" | "intersection:<id1>,<id2>" | "price-axis" | "quantity-axis"
}
export interface DiagramSpecArrow {
  id: string;
  near: string; // same anchor grammar as DiagramSpecLabel
  direction: 'up' | 'down' | 'left' | 'right';
  description: string; // used in feedback text, e.g. "the demand shift"
}
// A curve already known from a PREREQUISITE (e.g. the base supply/demand
// diagram an edge-level question builds on) - shown on the board already
// drawn, fixed, not graded, but still resolvable by id so a shade/label/
// arrow anchored to it (or a NEW curve's baseCurveId shift check) works
// exactly as if it were one of `curves`. This is what makes the atomic
// mode (see this file's own module comment) possible with zero change to
// the actual grading algorithm below - a "given" curve is just a curve
// the student never has to place.
export interface DiagramSpecGivenCurve {
  id: string;
  type: string;
  x: number;
  y: number;
  scaleX?: number;
  scaleY?: number;
}

export interface DiagramSpec {
  // MECHANISTIC mode (a node's own question, first full introduction of a
  // diagram): every one of these must be placed and is graded. ATOMIC
  // mode (an edge's question, building on an already-known diagram): only
  // the genuinely NEW curve(s) this edge represents belong here - the
  // prerequisite's own curves go in `given` instead, never re-graded.
  curves: DiagramSpecCurve[];
  given?: DiagramSpecGivenCurve[];
  shades: DiagramSpecShade[];
  labels: DiagramSpecLabel[];
  arrows: DiagramSpecArrow[];
}

export interface DiagramAnswerSubmission {
  curves: { instanceId: string; curveTypeId: string; x: number; y: number; scaleX?: number; scaleY?: number }[];
  // Each shaded area the student traced, in whatever colour they picked
  // (never graded) with whatever label they wrote for it (checked against
  // a shade spec's expectedLabel, if one is set).
  shades: { points: Point[]; color?: string; label?: string }[];
  labels: { text: string; x: number; y: number }[];
  // Direction indicators (a shift, a price/quantity rise or fall) -
  // direction is derived from x1/y1 -> x2/y2, not chosen by the student.
  arrows: { x1: number; y1: number; x2: number; y2: number }[];
  // Free-text exam-technique explanation - captured and stored, but not
  // algorithmically graded (that would need an LLM call, which this
  // deterministic diagram grader deliberately doesn't make).
  notes?: string;
}

// A worked-example placement a future teaching step could draw for the
// student rather than leaving the board blank - same shape as a graded
// submission, since "correct answer" and "worked example" are the same
// underlying data (concrete curve/shade/label placements), just authored
// by different sources.
export type DiagramPlacement = DiagramAnswerSubmission;

// Deliberately NOT a fractional/weighted mark out of some tariff - a real
// exam's exact mark allocation for a given diagram varies by question and
// isn't something to guess at (a "consumer surplus alone" question and a
// "shift + surplus + arrow" question aren't worth the same, and inventing
// a number that LOOKS like a mark scheme is worse than not pretending to
// have one). This diagram either has every element right, or it doesn't -
// what matters for a student is WHICH element is wrong and why, not a
// manufactured score.
export interface DiagramGradingResult {
  correct: boolean;
  feedback: string;
  conceptualMistakes: string | null;
}

function translate(local: Point[], x: number, y: number): Point[] {
  return local.map((p) => ({ x: p.x + x, y: p.y + y }));
}

// Scales a curve's local shape outward from its own first point (what a
// resize handle on the frontend pulls away from) before translating into
// board space. Independent X/Y factors, not one uniform scale - that's
// what lets the frontend's resize handle change a curve's steepness
// (gradient) and not just its length - matches diagram_drawer_preview's
// scaleLocal() exactly.
function scaleLocal(local: Point[], scaleX: number, scaleY: number): Point[] {
  const origin = local[0];
  return local.map((p) => ({ x: origin.x + (p.x - origin.x) * scaleX, y: origin.y + (p.y - origin.y) * scaleY }));
}

function placedPolyline(instance: { curveTypeId: string; x: number; y: number; scaleX?: number; scaleY?: number }): Point[] | null {
  const local = CURVE_SHAPES[instance.curveTypeId];
  if (!local) return null;
  return translate(scaleLocal(local, instance.scaleX ?? 1, instance.scaleY ?? 1), instance.x, instance.y);
}

// Standard segment-segment intersection (parametric form) - polylines are
// sampled into consecutive segments and checked pairwise; every curve
// here has 2-3 points, so this is cheap.
function segmentIntersection(a1: Point, a2: Point, b1: Point, b2: Point): Point | null {
  const d1x = a2.x - a1.x, d1y = a2.y - a1.y;
  const d2x = b2.x - b1.x, d2y = b2.y - b1.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / denom;
  const u = ((b1.x - a1.x) * d1y - (b1.y - a1.y) * d1x) / denom;
  if (t < -0.01 || t > 1.01 || u < -0.01 || u > 1.01) return null;
  return { x: a1.x + t * d1x, y: a1.y + t * d1y };
}

function polylineIntersection(a: Point[], b: Point[]): Point | null {
  for (let i = 0; i < a.length - 1; i++) {
    for (let j = 0; j < b.length - 1; j++) {
      const hit = segmentIntersection(a[i], a[i + 1], b[j], b[j + 1]);
      if (hit) return hit;
    }
  }
  return null;
}

// A drawn axis always spans the full chart - a curve shifted further out
// than its own drawn length shouldn't lose credit just because its own
// short polyline no longer physically reaches the axis (confirmed as a
// real failure mode via the interactive prototype: a demand curve shifted
// right by a plausible amount stopped touching the price axis under a
// strict segment-bounded check). Extends the curve's own end segment as
// an infinite line for this check only; the axis itself stays bounded to
// what's actually drawn (u still clamped).
function curveAxisIntersection(curvePoly: Point[], axisSeg: Point[]): Point | null {
  const a1 = curvePoly[0], a2 = curvePoly[curvePoly.length - 1];
  const [b1, b2] = axisSeg;
  const d1x = a2.x - a1.x, d1y = a2.y - a1.y;
  const d2x = b2.x - b1.x, d2y = b2.y - b1.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / denom;
  const u = ((b1.x - a1.x) * d1y - (b1.y - a1.y) * d1x) / denom;
  if (u < -0.01 || u > 1.01) return null;
  return { x: a1.x + t * d1x, y: a1.y + t * d1y };
}

// Interpolates/extrapolates a straight-line curve (its first and last
// point define the line) to find x at a given y - the only geometrically
// sound way to tell whether one hand-drawn curve has shifted right/left
// of another (see the shift-direction check below). Comparing raw start
// points instead (poly[0].x vs basePoly[0].x) was a real bug: two
// freehand curves are essentially never exact parallel copies - different
// slope, length, and starting point on the page - so that comparison
// could read an obviously-correct rightward shift as "shifted the wrong
// way" purely because of where each curve happened to be drawn from.
// "At any given price, quantity demanded is higher" (the actual
// definition of a rightward demand shift) means comparing both curves
// AT THE SAME y. Extrapolates past the drawn segment on purpose, same as
// curveAxisIntersection.
function xAtY(poly: Point[], y: number): number | null {
  const a = poly[0], b = poly[poly.length - 1];
  if (Math.abs(b.y - a.y) < 1e-6) return null;
  const t = (y - a.y) / (b.y - a.y);
  return a.x + t * (b.x - a.x);
}

// Shortest distance from a point to anywhere along a polyline - used so a
// label anchored to a curve is checked against the curve's nearest point,
// not one arbitrary fixed spot on it (see the label-scoring loop below;
// a label placed correctly but not dead-centre on its own curve was
// being marked wrong for no real reason).
function distanceToPolyline(poly: Point[], p: Point): number {
  let best = Infinity;
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i], b = poly[i + 1];
    const abx = b.x - a.x, aby = b.y - a.y;
    const len2 = abx * abx + aby * aby;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2)) : 0;
    const proj = { x: a.x + abx * t, y: a.y + aby * t };
    best = Math.min(best, Math.hypot(p.x - proj.x, p.y - proj.y));
  }
  return best;
}

function axisSegment(id: string): [Point, Point] | null {
  if (id === 'price-axis') return PRICE_AXIS;
  if (id === 'quantity-axis') return QUANTITY_AXIS;
  return null;
}

// Point-in-polygon (ray casting) - used only for the grid-sampled IoU
// below, which is why it doesn't need to handle self-intersecting input
// specially.
function pointInPolygon(pt: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    const intersect = (yi > pt.y) !== (yj > pt.y) && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Grid-sampled intersection-over-union - deliberately not exact polygon
// clipping. A student's traced shading polygon can be any shape
// (convex or not); sampling is robust to that without needing a general
// polygon-clipping algorithm, at negligible cost for a fixed small grid.
function polygonIoU(a: Point[], b: Point[]): number {
  if (a.length < 3 || b.length < 3) return 0;
  const allPts = a.concat(b);
  const minX = Math.min(...allPts.map((p) => p.x));
  const maxX = Math.max(...allPts.map((p) => p.x));
  const minY = Math.min(...allPts.map((p) => p.y));
  const maxY = Math.max(...allPts.map((p) => p.y));
  let both = 0, either = 0;
  for (let i = 0; i < SHADE_GRID_RESOLUTION; i++) {
    for (let j = 0; j < SHADE_GRID_RESOLUTION; j++) {
      const pt = { x: minX + ((i + 0.5) / SHADE_GRID_RESOLUTION) * (maxX - minX), y: minY + ((j + 0.5) / SHADE_GRID_RESOLUTION) * (maxY - minY) };
      const inA = pointInPolygon(pt, a);
      const inB = pointInPolygon(pt, b);
      if (inA && inB) both++;
      if (inA || inB) either++;
    }
  }
  return either === 0 ? 0 : both / either;
}

export function gradeDiagramAnswer(specInput: DiagramSpec, answerInput: DiagramAnswerSubmission): DiagramGradingResult {
  // Generated specs correctly OMIT shades/labels/arrows entirely when a
  // concept has none (see diagramSpecPrompts.ts's own rules) rather than
  // writing empty arrays - normalize once here instead of null-checking
  // every loop below.
  const spec: DiagramSpec = { curves: specInput.curves || [], given: specInput.given, shades: specInput.shades || [], labels: specInput.labels || [], arrows: specInput.arrows || [] };
  const answer: DiagramAnswerSubmission = { curves: answerInput.curves || [], shades: answerInput.shades || [], labels: answerInput.labels || [], arrows: answerInput.arrows || [], notes: answerInput.notes };
  const usedInstanceIds = new Set<string>();
  const resolvedByCurveId = new Map<string, Point[]>();
  const curveIssues: string[] = [];

  // Given curves resolve first, unconditionally - fixed position, never
  // matched against the student's submission, never graded. Anything
  // else below (a shift's baseCurveId, a shade's boundedBy, a label's or
  // arrow's anchor) can reference one exactly like a graded curve.
  for (const g of spec.given || []) {
    const poly = placedPolyline({ curveTypeId: g.type, x: g.x, y: g.y, scaleX: g.scaleX, scaleY: g.scaleY });
    if (poly) resolvedByCurveId.set(g.id, poly);
  }

  // Resolve "originals" first (no baseCurveId), then shifted variants,
  // since a shifted curve's own check needs its base already resolved.
  const originals = spec.curves.filter((c) => !c.baseCurveId);
  const shifted = spec.curves.filter((c) => c.baseCurveId);

  for (const c of originals) {
    const wanted = baseType(c.type);
    const match = answer.curves.find((inst) => !usedInstanceIds.has(inst.instanceId) && inst.curveTypeId === wanted);
    if (!match) { curveIssues.push(`missing a ${wanted} curve`); continue; }
    const poly = placedPolyline(match);
    if (!poly) { curveIssues.push(`missing a ${wanted} curve`); continue; }
    usedInstanceIds.add(match.instanceId);
    resolvedByCurveId.set(c.id, poly);
  }

  for (const c of shifted) {
    const wanted = baseType(c.type);
    const dir = shiftDirection(c.type);
    const basePoly = c.baseCurveId ? resolvedByCurveId.get(c.baseCurveId) : null;
    const match = answer.curves.find((inst) => !usedInstanceIds.has(inst.instanceId) && inst.curveTypeId === wanted);
    if (!match || !basePoly) { curveIssues.push(`missing the shifted ${wanted} curve`); continue; }
    const poly = placedPolyline(match);
    if (!poly) { curveIssues.push(`missing the shifted ${wanted} curve`); continue; }
    const refY = (basePoly[0].y + basePoly[basePoly.length - 1].y) / 2;
    const baseX = xAtY(basePoly, refY);
    const shiftedX = xAtY(poly, refY);
    if (baseX === null || shiftedX === null) {
      curveIssues.push(`could not read the ${wanted} curve's position to check its shift direction`);
      continue;
    }
    const dx = shiftedX - baseX;
    const correctDirection = dir === 'right' ? dx > MIN_SHIFT_PX : dir === 'left' ? dx < -MIN_SHIFT_PX : true;
    if (!correctDirection) {
      curveIssues.push(`the ${wanted} curve should shift ${dir}, not the other way`);
      continue;
    }
    usedInstanceIds.add(match.instanceId);
    resolvedByCurveId.set(c.id, poly);
  }

  // Multiple shaded areas, each checked independently against whichever
  // UNUSED submitted shade best matches it by geometry - colour is the
  // student's own organisational choice, never part of what's checked.
  const shadeIssues: string[] = [];
  const usedShadeIdx = new Set<number>();
  for (const shadeSpec of spec.shades) {
    const boundaries: Point[][] = [];
    for (const ref of shadeSpec.boundedBy) {
      const axis = axisSegment(ref);
      if (axis) { boundaries.push(axis); continue; }
      const curvePoly = resolvedByCurveId.get(ref);
      if (curvePoly) boundaries.push(curvePoly);
    }
    // v1 supports exactly the dominant real case: two curves + one axis
    // forming a triangle (consumer/producer surplus, deadweight loss) -
    // the actual bounded region is computed from wherever the student's
    // own curves ended up, not a fixed answer key. Anything else in
    // boundedBy is out of v1's scope and is marked as ungraded rather
    // than silently scored wrong.
    const curveBoundaries = boundaries.length === 3 ? boundaries.filter((b) => b !== PRICE_AXIS && b !== QUANTITY_AXIS) : [];
    const axisBoundary = boundaries.find((b) => b === PRICE_AXIS || b === QUANTITY_AXIS) || null;
    if (!(boundaries.length === 3 && curveBoundaries.length === 2 && axisBoundary && !curveIssues.length)) {
      // Curves needed for the shade weren't placed correctly - already
      // reflected in curveIssues, don't double-report the same defect.
      if (!curveIssues.length) shadeIssues.push('could not resolve a shaded region for this diagram');
      continue;
    }
    const [curveA, curveB] = curveBoundaries;
    const e = polylineIntersection(curveA, curveB);
    const f = curveAxisIntersection(curveA, axisBoundary);
    const g = curveAxisIntersection(curveB, axisBoundary);
    if (!(e && f && g)) {
      shadeIssues.push('could not find where your curves cross to check a shaded area - check they actually intersect');
      continue;
    }
    const expected = [e, f, g];

    type ShadeMatch = { iou: number; idx: number; sub: DiagramAnswerSubmission['shades'][number] };
    let best: ShadeMatch | null = null;
    for (let idx = 0; idx < answer.shades.length; idx++) {
      const sub = answer.shades[idx];
      if (usedShadeIdx.has(idx) || sub.points.length < 3) continue;
      const iou = polygonIoU(expected, sub.points);
      if (!best || iou > (best as ShadeMatch).iou) best = { iou, idx, sub };
    }

    if (!best || best.iou < SHADE_IOU_THRESHOLD) {
      shadeIssues.push(`no shaded area matches the region bounded by your own curves${shadeSpec.expectedLabel ? ` (${shadeSpec.expectedLabel})` : ''}`);
      continue;
    }
    usedShadeIdx.add(best.idx);

    if (shadeSpec.expectedLabel) {
      const labelOk = labelMentionsPhrase(best.sub.label, shadeSpec.expectedLabel);
      if (!labelOk) shadeIssues.push(`the shaded area is right, but its label doesn't mention "${shadeSpec.expectedLabel}"`);
    }
  }

  const labelIssues: string[] = [];
  for (const l of spec.labels) {
    const match = answer.labels.find((sub) => sub.text.trim().toLowerCase() === l.text.trim().toLowerCase());
    if (!match) { labelIssues.push(`missing label "${l.text}"`); continue; }
    // A "curve:" anchor checks distance to the nearest point ANYWHERE
    // along that curve, not one fixed midpoint - axis/intersection
    // anchors are still a single genuine point, so those keep a plain
    // point-to-point check.
    const curveMatch = l.anchor.match(/^curve:(.+)$/);
    let dist: number;
    if (curveMatch) {
      const poly = resolvedByCurveId.get(curveMatch[1]);
      if (!poly) { labelIssues.push(`label "${l.text}" can't be checked - the curve it belongs to isn't on the board`); continue; }
      dist = distanceToPolyline(poly, match);
    } else {
      const anchorPoint = resolveAnchor(l.anchor, resolvedByCurveId);
      if (!anchorPoint) { labelIssues.push(`label "${l.text}" can't be checked - what it anchors to isn't on the board`); continue; }
      dist = Math.hypot(match.x - anchorPoint.x, match.y - anchorPoint.y);
    }
    if (dist > LABEL_TOLERANCE_PX) { labelIssues.push(`label "${l.text}" is not close enough to where it belongs`); continue; }
  }

  // Arrows - checked on both position (near the right curve/axis, same
  // nearest-point rule as labels) and direction (does it actually point
  // the way the spec expects).
  const arrowIssues: string[] = [];
  for (const a of spec.arrows) {
    const curveMatch = a.near.match(/^curve:(.+)$/);
    const poly = curveMatch ? resolvedByCurveId.get(curveMatch[1]) : null;
    const anchorPt = curveMatch ? null : resolveAnchor(a.near, resolvedByCurveId);
    if (curveMatch && !poly) { arrowIssues.push(`the arrow near ${a.description} can't be checked - its curve isn't on the board`); continue; }
    if (!curveMatch && !anchorPt) { arrowIssues.push(`the arrow near ${a.description} can't be checked - what it anchors to isn't on the board`); continue; }

    type ArrowMatch = { dist: number; arrow: DiagramAnswerSubmission['arrows'][number] };
    let best: ArrowMatch | null = null;
    for (const ar of answer.arrows) {
      const mid = { x: (ar.x1 + ar.x2) / 2, y: (ar.y1 + ar.y2) / 2 };
      const dist = poly ? distanceToPolyline(poly, mid) : Math.hypot(mid.x - (anchorPt as Point).x, mid.y - (anchorPt as Point).y);
      if (!best || dist < (best as ArrowMatch).dist) best = { dist, arrow: ar };
    }
    if (!best || best.dist > LABEL_TOLERANCE_PX) {
      arrowIssues.push(`missing an arrow near ${a.description}`);
      continue;
    }
    const dir = classifyArrowDirection(best.arrow.x2 - best.arrow.x1, best.arrow.y2 - best.arrow.y1);
    if (dir !== a.direction) {
      arrowIssues.push(`the arrow near ${a.description} should point ${a.direction}, not ${dir}`);
      continue;
    }
  }

  const issues = [...curveIssues, ...shadeIssues, ...labelIssues, ...arrowIssues];
  const correct = issues.length === 0;
  const feedback = correct
    ? 'Correct - every curve, shaded area, label, and arrow is right.'
    : `${issues.join('; ')}.`;

  return { correct, feedback, conceptualMistakes: issues.length ? issues.join('; ') : null };
}

// Board y grows downward, so "down" is a positive dy - whichever axis (x
// or y) the arrow moves further along decides its dominant direction,
// exactly how a student would describe it by eye.
function classifyArrowDirection(dx: number, dy: number): 'up' | 'down' | 'left' | 'right' {
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'down' : 'up';
}

// Simple keyword-containment check, not fuzzy NLP - every significant
// (3+ letter) word in the expected phrase must appear somewhere in the
// student's own label, e.g. "consumer surplus" matches "the rise in
// consumer surplus (CS)". Deterministic, no API call, matching this
// whole grading algorithm's own approach.
function labelMentionsPhrase(submitted: string | undefined, expectedPhrase: string): boolean {
  const text = (submitted || '').toLowerCase();
  const words = expectedPhrase.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
  return words.length > 0 && words.every((w) => text.includes(w));
}

function resolveAnchor(anchor: string, resolved: Map<string, Point[]>): Point | null {
  if (anchor === 'price-axis') return PRICE_AXIS[0];
  if (anchor === 'quantity-axis') return QUANTITY_AXIS[1];
  const curveMatch = anchor.match(/^curve:(.+)$/);
  if (curveMatch) {
    const poly = resolved.get(curveMatch[1]);
    return poly ? poly[Math.floor(poly.length / 2)] : null;
  }
  const intersectMatch = anchor.match(/^intersection:(.+),(.+)$/);
  if (intersectMatch) {
    const a = resolved.get(intersectMatch[1]);
    const b = resolved.get(intersectMatch[2]);
    return a && b ? polylineIntersection(a, b) : null;
  }
  return null;
}
