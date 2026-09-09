require('dotenv/config');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SUBJECT = 'Economics';
const QUALIFICATION = 'A Level';
const EXAM_BOARD = 'Edexcel';

const MARK_SCHEME_STYLE = {
  subject: SUBJECT,
  qualification: QUALIFICATION,
  exam_board: EXAM_BOARD,
  mark_scheme_style: 'ao_additive',
  component_definitions: [
    { key: 'AO1', label: 'Knowledge' },
    { key: 'AO2', label: 'Application' },
    { key: 'AO3', label: 'Analysis' },
    { key: 'AO4', label: 'Evaluation' },
  ],
  notes: 'Real Edexcel Econ A structure: Section A (MCQ/short-answer, ~25 marks, no evaluation), Section B data-response (~50 marks, parts typically 5/8/10/12/15), Section C essays (25 marks). Two anchors below are confirmed against a real exam guide; everything else is reasoned extrapolation from the same knowledge/application/analysis/evaluation pattern (see each row\'s own comment).',
};

// component_split groups are {key, components, marks} - "KAA" bundles
// AO1+AO2+AO3 together since Pearson marks these three together below
// essay scale, not as three separately-itemized numbers; "AO4" (or "AO1"
// alone for a pure definition) is its own group. confirmed:true is used
// ONLY for the two numbers directly confirmed against a real Edexcel exam
// guide (15-mark and 25-mark) - every other row is reasoned extrapolation,
// not verbatim Pearson text, and should be corrected in this one row if a
// more authoritative source is ever found.
const QUESTION_TYPES = [
  {
    type_key: 'mcq_1',
    display_label: '1-mark multiple choice',
    command_word: null,
    mark_tariff: 1,
    mark_scheme_type: 'multiple_choice',
    requires_maths_keyboard: false,
    component_split: null,
    confirmed: false,
    sort_order: 1,
  },
  {
    type_key: 'definition_2',
    display_label: '2-mark definition',
    command_word: 'Define',
    mark_tariff: 2,
    mark_scheme_type: 'points',
    requires_maths_keyboard: false,
    component_split: { groups: [{ key: 'AO1', components: ['AO1'], marks: 2 }] },
    confirmed: false,
    sort_order: 2,
  },
  {
    type_key: 'calc_4',
    display_label: '4-mark calculation',
    command_word: 'Calculate',
    mark_tariff: 4,
    mark_scheme_type: 'points',
    requires_maths_keyboard: true,
    component_split: { groups: [{ key: 'KAA', components: ['AO1', 'AO2'], marks: 4 }] },
    confirmed: false,
    sort_order: 3,
  },
  {
    type_key: 'explain_4',
    display_label: '4-mark explain',
    command_word: 'Explain',
    mark_tariff: 4,
    mark_scheme_type: 'points',
    requires_maths_keyboard: false,
    component_split: { groups: [{ key: 'KAA', components: ['AO1', 'AO2'], marks: 4 }] },
    confirmed: false,
    sort_order: 4,
  },
  {
    type_key: 'short_answer_5',
    display_label: '5-mark short answer',
    command_word: 'Explain',
    mark_tariff: 5,
    mark_scheme_type: 'points',
    requires_maths_keyboard: false,
    component_split: { groups: [{ key: 'KAA', components: ['AO1', 'AO2', 'AO3'], marks: 5 }] },
    confirmed: false,
    sort_order: 5,
  },
  {
    type_key: 'explain_8',
    display_label: '8-mark analysis',
    command_word: 'Analyse',
    mark_tariff: 8,
    mark_scheme_type: 'levels',
    requires_maths_keyboard: false,
    component_split: { groups: [{ key: 'KAA', components: ['AO1', 'AO2', 'AO3'], marks: 8 }] },
    confirmed: false,
    sort_order: 6,
  },
  {
    type_key: 'data_response_10',
    display_label: '10-mark data response',
    command_word: 'Assess',
    mark_tariff: 10,
    mark_scheme_type: 'levels',
    requires_maths_keyboard: false,
    // Linearly scaled between the two confirmed anchors (15-mark: 9/6,
    // 25-mark: 16/9) rather than measured - flagged confirmed:false.
    component_split: {
      groups: [
        { key: 'KAA', components: ['AO1', 'AO2', 'AO3'], marks: 6 },
        { key: 'AO4', components: ['AO4'], marks: 4 },
      ],
    },
    confirmed: false,
    sort_order: 7,
  },
  {
    type_key: 'data_response_12',
    display_label: '12-mark data response',
    command_word: 'Assess',
    mark_tariff: 12,
    mark_scheme_type: 'levels',
    requires_maths_keyboard: false,
    component_split: {
      groups: [
        { key: 'KAA', components: ['AO1', 'AO2', 'AO3'], marks: 7 },
        { key: 'AO4', components: ['AO4'], marks: 5 },
      ],
    },
    confirmed: false,
    sort_order: 8,
  },
  {
    type_key: 'essay_15',
    display_label: '15-mark essay',
    command_word: 'Evaluate',
    mark_tariff: 15,
    mark_scheme_type: 'levels',
    requires_maths_keyboard: false,
    // CONFIRMED: 9 KAA + 6 AO4, from a real Edexcel Econ exam guide.
    component_split: {
      groups: [
        { key: 'KAA', components: ['AO1', 'AO2', 'AO3'], marks: 9 },
        { key: 'AO4', components: ['AO4'], marks: 6 },
      ],
    },
    confirmed: true,
    sort_order: 9,
  },
  {
    type_key: 'essay_25',
    display_label: '25-mark essay',
    command_word: 'Evaluate',
    mark_tariff: 25,
    mark_scheme_type: 'levels',
    requires_maths_keyboard: false,
    // CONFIRMED: 16 KAA + 9 AO4, from a real Edexcel Econ exam guide.
    component_split: {
      groups: [
        { key: 'KAA', components: ['AO1', 'AO2', 'AO3'], marks: 16 },
        { key: 'AO4', components: ['AO4'], marks: 9 },
      ],
    },
    confirmed: true,
    sort_order: 10,
  },
];

async function main() {
  console.log('Upserting mark scheme style...');
  const { error: styleError } = await supabase
    .from('exam_mark_scheme_styles')
    .upsert([MARK_SCHEME_STYLE], { onConflict: 'subject,qualification,exam_board' });
  if (styleError) {
    console.error('Mark scheme style upsert failed:', JSON.stringify(styleError));
    process.exit(1);
  }

  const rows = QUESTION_TYPES.map((t) => ({
    subject: SUBJECT,
    qualification: QUALIFICATION,
    exam_board: EXAM_BOARD,
    requires_diagram: false,
    active: true,
    ...t,
  }));

  console.log(`Upserting ${rows.length} question type rows...`);
  const { error } = await supabase
    .from('exam_question_types')
    .upsert(rows, { onConflict: 'subject,qualification,exam_board,type_key' });
  if (error) {
    console.error('Question types upsert failed:', JSON.stringify(error));
    process.exit(1);
  }
  console.log('Done.');
}

main();
