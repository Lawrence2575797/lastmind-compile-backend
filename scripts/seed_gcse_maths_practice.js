// Exam Preparation question types + mark-scheme style for Edexcel GCSE
// Mathematics (1MA1), Foundation and Higher tiers. Only touches these two
// tiers' exam_question_types / exam_mark_scheme_styles rows - the spec
// lesson plans (spec_lesson_plans) and every other subject are untouched.
//
// Types mirror how real Edexcel papers actually ask questions: command words
// and tariffs that really occur at each tier (Foundation tops out at 5-mark
// problem solving; Higher adds "Prove that" and 6-mark extended problems).
// Mark codes follow Edexcel mark schemes: M (method), A (accuracy, follows a
// method), B (independent mark), P (process, in problem-solving questions),
// C (communication / reasoned conclusion).
require('dotenv/config');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SUBJECT = 'Mathematics';
const EXAM_BOARD = 'Edexcel';

const DEFINITIONS = [
  { key: 'M', label: 'Method' },
  { key: 'A', label: 'Accuracy' },
  { key: 'B', label: 'Independent fact' },
  { key: 'P', label: 'Process (problem solving)' },
  { key: 'C', label: 'Communication / reasoned conclusion' },
];

const COMMON = [
  ['short_1', '1-mark short answer', 'Write down', 1],
  ['short_2', '2-mark question', 'Work out', 2],
  ['explain_2', '2-mark explain / give a reason', 'Give a reason', 2],
  ['method_3', '3-mark method question', 'Work out', 3],
  ['show_3', '3-mark "Show that" question', 'Show that', 3],
  ['problem_4', '4-mark problem-solving question', 'Solve', 4],
  ['reasoning_5', '5-mark problem in context', 'Work out', 5],
];
const HIGHER_ONLY = [
  ['proof_4', '4-mark proof', 'Prove that', 4],
  ['extended_6', '6-mark extended problem', 'Solve', 6],
];

const TIERS = {
  'GCSE Foundation': COMMON,
  'GCSE Higher': [...COMMON, ...HIGHER_ONLY],
};

async function main() {
  for (const [qualification, types] of Object.entries(TIERS)) {
    const match = { subject: SUBJECT, qualification, exam_board: EXAM_BOARD };
    await supabase.from('exam_mark_scheme_styles').delete().match(match);
    const { error: styleError } = await supabase.from('exam_mark_scheme_styles').insert({
      ...match,
      mark_scheme_style: 'mab',
      component_definitions: DEFINITIONS,
      notes: 'Edexcel GCSE Mathematics mark schemes: M = method, A = accuracy (only after a method), B = independent mark, P = process mark in problem-solving questions, C = communication / reasoned conclusion. The real allocation is inherent to each question.',
    });
    if (styleError) throw styleError;

    await supabase.from('exam_question_types').delete().match(match);
    const rows = types.map(([type_key, display_label, command_word, mark_tariff], index) => ({
      ...match, type_key, display_label, command_word, mark_tariff,
      mark_scheme_type: 'points',
      requires_diagram: false,
      requires_maths_keyboard: true,
      component_split: null,
      confirmed: true,
      active: true,
      sort_order: index + 1,
    }));
    const { error } = await supabase.from('exam_question_types').insert(rows);
    if (error) throw error;
    console.log(`${qualification}: ${rows.length} question types seeded.`);
  }
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
