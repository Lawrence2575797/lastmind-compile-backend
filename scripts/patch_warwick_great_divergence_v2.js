// Second hand-authored pass (no API calls) on stage 32 (Great Divergence cluster), following direct user feedback
// on the first version:
// 1. Passive 'read' steps just hand the student the answer inside a paragraph and a Next button - no active recall
//    at all, which is why nothing stuck. Rebuilt every step as 'ask' (scenario -> pick the right implication ->
//    term only reveals on a correct click), the exact same active-recall mechanism the fully mechanistic lessons
//    (Atlantic trade, partial derivatives) already use - comparative/historical content can be tested the same way
//    a formula can, it just needs the right question, not a inherently different, weaker interaction.
// 2. Each step was cramming a scholar's name, a date, a book title AND the argument into one dense paragraph.
//    Trimmed each question to ONE testable claim; scholar attribution now lives in the short "pre" reveal caption
//    (matching how every other ask step in this app already works: a one-line pre, not a paragraph).
require('dotenv/config');
const { createClient } = require('@supabase/supabase-js');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SUBJECT = 'Economics', QUALIFICATION = 'Undergraduate Year 1', EXAM_BOARD = 'Warwick';
const GD = 'economics:ec104_early_modern_period:the_great_divergence_question_why_europe_';
const INST = 'economics:ec104_early_modern_period:institutional_explanations_for_economic_development_property_rights_constraints_on_rulers_';
const GEO = 'economics:ec104_early_modern_period:geographic_explanations_for_divergence_resources_disease_climate_';
const CULT = 'economics:ec104_early_modern_period:cultural_ideational_explanations_for_divergence_values_religion_science_';
const GLOR = 'economics:ec104_early_modern_period:case_study_england_s_glorious_revolution_1688_and_credible_commitment';

const script = [
  { type: 'title' },
  {
    q: "Around 1700, Qing China's Yangtze Delta had living standards, markets and technology broadly comparable to Britain's - yet only Britain then broke into sustained growth. Is that outcome something we can just assume was inevitable?",
    ok: 0,
    pre: "Historians Pomeranz and Allen call this puzzle",
    hint: 'Two regions that looked evenly matched had very different outcomes - that needs explaining, not assuming.',
    opts: ["No - the two regions looked evenly matched, so the outcome needs real explanation", "Yes - Europe was obviously more advanced already"],
    term: GD, type: 'ask',
  },
  {
    q: "After 1688, England's Parliament could stop the king seizing merchants' property at will. Would that make merchants more or less willing to invest in risky new ventures?",
    ok: 0,
    pre: 'North, and more recently Acemoglu and Robinson, call this the',
    hint: 'If your gains are safe from being confiscated, you take more risks to make them.',
    opts: ['More willing - their gains are now safer from being seized', 'Less willing - safety makes no difference to investment'],
    term: INST, type: 'ask',
  },
  {
    q: 'Britain could dig coal close to its industrial towns; China\'s coal sat far from its most developed region. Does nearby, cheap fuel plausibly matter for who industrialises first?',
    ok: 0,
    pre: "Pomeranz's coal argument, alongside Allen's point about Britain's unusually high wages making machines worth building, forms the",
    hint: 'Moving coal long distances before railways was slow and expensive - distance to fuel was a real constraint.',
    opts: ['Yes - cheap nearby fuel makes machine power far cheaper to run', 'No - fuel location never affects industrial growth'],
    term: GEO, type: 'ask',
  },
  {
    done: 'Four candidate explanations locked in - one puzzle, three competing theories.',
    type: 'order',
    order: [GD, INST, GEO, CULT],
    pairs: [[GD, INST], [INST, GEO], [GEO, CULT]],
    title: 'Milestone: the puzzle and its three theories',
    prompt: 'Drag and drop the 4 terms in the order they were introduced above.',
  },
  {
    q: "Max Weber argued Protestant religious values pushed merchants to reinvest profits rather than spend them on luxury. Would reinvesting profits, rather than spending them, plausibly speed up how fast capital builds up?",
    ok: 0,
    pre: "Weber's argument, alongside the Scientific Revolution's culture of open experimentation, forms the",
    hint: 'Money reinvested keeps compounding; money spent on luxury is gone.',
    opts: ['Yes - reinvested profit keeps growing instead of being spent', 'No - what you do with profit makes no difference to growth'],
    term: CULT, type: 'ask',
  },
  {
    q: "England's 1688 Glorious Revolution is the actual historical episode where a monarch's power over property was constrained by Parliament. Does this look like a real test case for the institutional theory covered earlier?",
    ok: 0,
    pre: 'Historians treat this as the real-world case study for',
    hint: "It's a genuine historical event, not a hypothetical - exactly the kind of evidence a theory needs to be tested against.",
    opts: ['Yes - it is the actual episode historians point to as a test case', 'No - it has nothing to do with the institutional theory'],
    term: GLOR, type: 'ask',
  },
  { type: 'derive', title: 'Final test: the whole derivation', prompt: 'Drag and drop the 5 key terms into the boxes to rebuild the whole derivation from memory. Chains meet at the concept.' },
  { type: 'done' },
];

async function main() {
  const { data: row, error } = await db.from('derivation_generated_stages').select('compiled')
    .eq('subject', SUBJECT).eq('qualification', QUALIFICATION).eq('exam_board', EXAM_BOARD).eq('stage_index', 32).maybeSingle();
  if (error) throw error;
  if (!row) throw new Error('Stage 32 not found - run the first patch script first.');
  row.compiled.stage.script = script;
  const { error: upErr } = await db.from('derivation_generated_stages').update({ compiled: row.compiled })
    .match({ subject: SUBJECT, qualification: QUALIFICATION, exam_board: EXAM_BOARD, stage_index: 32 });
  if (upErr) throw upErr;
  console.log('Stage 32 rewritten as active-recall ask steps.');
}
main().catch((e) => { console.error(e); process.exit(1); });
