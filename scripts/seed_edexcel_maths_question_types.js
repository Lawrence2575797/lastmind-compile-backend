require('dotenv/config');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SUBJECT = 'Mathematics';
const QUALIFICATION = 'A Level';
const EXAM_BOARD = 'Edexcel';

// Real Edexcel Maths mark schemes are NOT assessment-objective-additive
// like Economics - every mark is one of M (Method), A (Accuracy, only
// awardable after/alongside its supporting method mark), or B (an
// independent fact/result, standalone). Which specific steps of a
// question carry which letter is inherent to that one question's working
// - there is no fixed per-tariff table the way Economics' AO split has
// (see exam_mark_scheme_styles' own component_definitions for this
// subject), so component_split is null for every row here; the
// generation prompt decides the real M/A/B allocation per question (see
// PRACTICE_QUESTION_GENERATION_PROMPT rule 4).
const MARK_SCHEME_STYLE = {
  subject: SUBJECT,
  qualification: QUALIFICATION,
  exam_board: EXAM_BOARD,
  mark_scheme_style: 'mab',
  component_definitions: [
    { key: 'M', label: 'Method' },
    { key: 'A', label: 'Accuracy' },
    { key: 'B', label: 'Independent fact' },
  ],
  notes: 'Edexcel A-Level Maths mark schemes are M/A/B marks per working step, not assessment-objective-additive - the real allocation is inherent to each specific question, decided at generation time rather than fixed per tariff.',
};

// Tariffs matched to realistic Edexcel Maths question-part mark values
// (individual parts on a real paper typically run 1-12 marks; anything
// bigger is really several parts in sequence, out of scope for one
// generated question here).
const QUESTION_TYPES = [
  { type_key: 'short_1', display_label: '1-mark short answer', command_word: 'State', mark_tariff: 1, sort_order: 1 },
  { type_key: 'short_2', display_label: '2-mark question', command_word: 'Solve', mark_tariff: 2, sort_order: 2 },
  { type_key: 'short_3', display_label: '3-mark question', command_word: 'Find', mark_tariff: 3, sort_order: 3 },
  { type_key: 'medium_4', display_label: '4-mark question', command_word: 'Find', mark_tariff: 4, sort_order: 4 },
  { type_key: 'medium_5', display_label: '5-mark question', command_word: 'Show that', mark_tariff: 5, sort_order: 5 },
  { type_key: 'medium_6', display_label: '6-mark question', command_word: 'Find', mark_tariff: 6, sort_order: 6 },
  { type_key: 'extended_8', display_label: '8-mark extended question', command_word: 'Show that', mark_tariff: 8, sort_order: 7 },
  { type_key: 'extended_10', display_label: '10-mark extended question', command_word: 'Prove', mark_tariff: 10, sort_order: 8 },
  { type_key: 'extended_12', display_label: '12-mark extended question', command_word: 'Solve', mark_tariff: 12, sort_order: 9 },
].map((t) => ({
  ...t,
  subject: SUBJECT,
  qualification: QUALIFICATION,
  exam_board: EXAM_BOARD,
  mark_scheme_type: 'points',
  requires_diagram: false,
  requires_maths_keyboard: true,
  component_split: null,
  confirmed: false,
  active: true,
}));

async function main() {
  await supabase.from('exam_mark_scheme_styles').delete().match({ subject: SUBJECT, qualification: QUALIFICATION, exam_board: EXAM_BOARD });
  const { error: styleError } = await supabase.from('exam_mark_scheme_styles').insert([MARK_SCHEME_STYLE]);
  if (styleError) {
    console.error('Mark scheme style insert failed:', JSON.stringify(styleError));
    process.exit(1);
  }

  await supabase.from('exam_question_types').delete().match({ subject: SUBJECT, qualification: QUALIFICATION, exam_board: EXAM_BOARD });
  console.log(`Inserting ${QUESTION_TYPES.length} question type rows for ${SUBJECT}...`);
  const { error } = await supabase.from('exam_question_types').insert(QUESTION_TYPES);
  if (error) {
    console.error('Question types insert failed:', JSON.stringify(error));
    process.exit(1);
  }
  console.log('Done.');
}

main();
