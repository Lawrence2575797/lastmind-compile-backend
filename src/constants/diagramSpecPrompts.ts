// Generates a DiagramSpec (see diagramGradingService.ts) for a node whose
// concept is genuinely diagrammatic - the model never invents geometry
// (curve shapes/positions are a fixed palette + placement logic owned by
// diagramGradingService.ts and the frontend widget), it only picks WHICH
// named curves, shifts, shaded region, and labels the real economics
// content actually calls for. This is a classification/selection task
// over a small fixed vocabulary, not open-ended generation - the whole
// point of keeping geometry out of the model's hands entirely.

export const CURVE_TYPE_LIST = [
  'demand', 'supply', 'generic_price_line', 'generic_quantity_line',
  'marginal_cost', 'average_cost', 'world_supply',
  'average_revenue', 'marginal_revenue',
  'ad', 'as_curve', 'lras_classical', 'lras_keynesian',
  'phillips', 'laffer', 'lorenz_curve', 'line_of_equality', 'ppf',
];

// MECHANISTIC mode - a node's own diagram question, the first full
// construction of this diagram (no prerequisite diagram assumed). Every
// curve the model lists must actually be placed and is graded.
export const MECHANISTIC_DIAGRAM_SPEC_PROMPT = `You are writing the diagram-construction answer key for one UK A-Level Economics concept, to be graded by a deterministic geometry engine - not by you. You never produce coordinates; you only select which named curves (from a fixed palette), shifts, shaded region, and labels this concept's diagram actually requires.

You will be given: the concept's label and its own explanation text (ground truth for what this diagram shows).

Available curve types - this is the COMPLETE, FIXED list. "type" must be copied character-for-character from this list (or one of these exact strings with "_shift_left"/"_shift_right" appended for a shifted variant) - NEVER invent a new type string, even a plausible-sounding one like "demand_curve" or "downward_sloping". If a curve doesn't match any of these exactly, pick the closest real match from the list - do not describe it in a new string of your own:
${CURVE_TYPE_LIST.map((t) => `- ${t}`).join('\n')}

Mapping guide for ambiguous cases: an ordinary downward-sloping demand-side curve (a normal demand curve, an AD curve, average revenue, a Phillips curve, a Lorenz curve context) is "demand", "ad", "average_revenue", "phillips", or "lorenz_curve" respectively - NEVER a made-up "downward_sloping". An ordinary upward-sloping supply-side curve (a normal supply curve, an AS curve, world supply) is "supply", "as_curve", or "world_supply" respectively - NEVER a made-up "upward_sloping". A production possibility frontier (PPF) is "ppf" - never a made-up "concave_curve" or "bowed_curve". Long-run aggregate supply (LRAS) is either "lras_classical" (a vertical line - use this whenever the concept doesn't specifically discuss spare capacity/Keynesian shape) or "lras_keynesian" - NEVER a made-up "lras" or "vertical_line". Short-run aggregate supply (SRAS) has no dedicated palette entry - use "as_curve" for it (the same upward-sloping macro supply shape), never a made-up "sras".

Rules:
1. Output ONLY valid JSON, nothing else.
2. If this concept does NOT genuinely require constructing a diagram (it's a definition, a list, a comparison with no diagram element), output exactly { "notDiagrammatic": true } and nothing else - do not force a diagram spec onto content that doesn't need one.
3. "curves": each needs a short id (e.g. "D", "S0", "S1"), a "type" copied EXACTLY from the list above, and — ONLY for a shifted variant — a "baseCurveId" naming which other curve id in THIS SAME list it shifts from. An original curve (no shift) has no baseCurveId.
4. "shades": at most the shaded regions this concept's own explanation actually discusses (e.g. consumer surplus, producer surplus, deadweight loss, welfare loss/gain) - each needs an id, "boundedBy" as an array of EXACTLY 2 curve ids from "curves" above plus exactly ONE of the literal strings "price-axis" or "quantity-axis" (never two axis strings, never two curve ids and zero axis strings, never fewer than 3 total entries), and an "expectedLabel" naming the region in plain words (e.g. "consumer surplus"). Example of a VALID boundedBy: ["D", "S1", "price-axis"]. Example of an INVALID boundedBy (two axis strings): ["D", "price-axis", "price-axis"]. Omit shades entirely if this concept has none.
5. "labels": one per curve worth naming on the diagram (e.g. "D", "S", "S1", "Q1", "P1") - each needs "text" and an "anchor" of the form "curve:<id>" (nearest point on that curve) or "intersection:<id1>,<id2>" (where two curves cross) or "price-axis"/"quantity-axis".
6. "arrows": only include one where the concept's own explanation specifically describes a directional shift or movement worth marking with an arrow (e.g. "the curve shifts left") - each needs an id, "near" (same anchor grammar as a label), "direction" (one of "up","down","left","right"), and a short "description" used in student feedback text (e.g. "the supply shift").
7. Every curve id referenced anywhere (shades/labels/arrows) must actually exist in "curves" above - never reference an id you didn't define.
8. Keep it to what this ONE concept's own diagram genuinely shows - do not add curves/shades/labels for related concepts not actually part of this one.

Output schema (when diagrammatic):
{ "curves": [ { "id": string, "type": string, "baseCurveId": string | null } ], "shades": [ { "id": string, "boundedBy": [string, string, string], "expectedLabel": string } ], "labels": [ { "text": string, "anchor": string } ], "arrows": [ { "id": string, "near": string, "direction": string, "description": string } ] }`;
