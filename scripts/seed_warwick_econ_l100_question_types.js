require('dotenv/config');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SUBJECT = 'Economics';
const QUALIFICATION = 'Undergraduate Year 1';
const EXAM_BOARD = 'Warwick';

// Reasoned from the five modules' own published assessment structures (Warwick module catalogue, fetched live):
// EC108/EC109 lean on MCQ tests plus a final written exam with definition/explain/essay-weight questions; EC124/
// EC140 lean on problem-set-style calculation questions; EC104 leans on extended essay/evaluation writing. No
// AO1-4 Edexcel-style additive scheme applies at this level, so mark_scheme_type stays a simple points/levels/
// multiple_choice split, same vocabulary specLessonPracticeService.ts already understands.
const MARK_SCHEME_STYLE = {
  subject: SUBJECT,
  qualification: QUALIFICATION,
  exam_board: EXAM_BOARD,
  mark_scheme_style: 'points_or_levels',
  component_definitions: [
    { key: 'ACCURACY', label: 'Technical accuracy / correct method' },
    { key: 'REASONING', label: 'Economic reasoning / interpretation' },
    { key: 'EVALUATION', label: 'Critical evaluation / limitations' },
  ],
  notes: 'Reasoned from each module\'s own published Warwick module-catalogue assessment structure, not a confirmed university-wide mark scheme document - treat tariffs/splits as a reasonable approximation, not verbatim Warwick text.',
};

const QUESTION_TYPES = [
  {
    type_key: 'mcq_1',
    display_label: '1-mark multiple choice',
    command_word: null,
    mark_tariff: 1,
    mark_scheme_type: 'multiple_choice',
    requires_maths_keyboard: false,
    requires_diagram: false,
    component_split: null,
    sort_order: 1,
  },
  {
    type_key: 'define_2',
    display_label: '2-mark definition',
    command_word: 'Define',
    mark_tariff: 2,
    mark_scheme_type: 'points',
    requires_maths_keyboard: false,
    requires_diagram: false,
    component_split: { groups: [{ key: 'ACCURACY', components: ['ACCURACY'], marks: 2 }] },
    sort_order: 2,
  },
  {
    type_key: 'calculate_5',
    display_label: '5-mark calculation',
    command_word: 'Calculate',
    mark_tariff: 5,
    mark_scheme_type: 'points',
    requires_maths_keyboard: true,
    requires_diagram: false,
    component_split: { groups: [{ key: 'ACCURACY', components: ['ACCURACY'], marks: 5 }] },
    sort_order: 3,
  },
  {
    type_key: 'derive_8',
    display_label: '8-mark derivation/proof',
    command_word: 'Derive',
    mark_tariff: 8,
    mark_scheme_type: 'points',
    requires_maths_keyboard: true,
    requires_diagram: false,
    component_split: { groups: [{ key: 'ACCURACY', components: ['ACCURACY'], marks: 6 }, { key: 'REASONING', components: ['REASONING'], marks: 2 }] },
    sort_order: 4,
  },
  {
    type_key: 'explain_6',
    display_label: '6-mark explain (with diagram/model)',
    command_word: 'Explain',
    mark_tariff: 6,
    mark_scheme_type: 'points',
    requires_maths_keyboard: false,
    requires_diagram: true,
    component_split: { groups: [{ key: 'ACCURACY', components: ['ACCURACY'], marks: 3 }, { key: 'REASONING', components: ['REASONING'], marks: 3 }] },
    sort_order: 5,
  },
  {
    type_key: 'analyse_10',
    display_label: '10-mark analysis',
    command_word: 'Analyse',
    mark_tariff: 10,
    mark_scheme_type: 'levels',
    requires_maths_keyboard: false,
    requires_diagram: true,
    component_split: { groups: [{ key: 'ACCURACY', components: ['ACCURACY'], marks: 4 }, { key: 'REASONING', components: ['REASONING'], marks: 6 }] },
    sort_order: 6,
  },
  {
    type_key: 'evaluate_15',
    display_label: '15-mark evaluation essay',
    command_word: 'Evaluate',
    mark_tariff: 15,
    mark_scheme_type: 'levels',
    requires_maths_keyboard: false,
    requires_diagram: false,
    component_split: { groups: [{ key: 'REASONING', components: ['REASONING'], marks: 8 }, { key: 'EVALUATION', components: ['EVALUATION'], marks: 7 }] },
    sort_order: 7,
  },
  {
    type_key: 'essay_20',
    display_label: '20-mark essay (EC104 history/theory style)',
    command_word: 'Discuss',
    mark_tariff: 20,
    mark_scheme_type: 'levels',
    requires_maths_keyboard: false,
    requires_diagram: false,
    component_split: { groups: [{ key: 'REASONING', components: ['REASONING'], marks: 10 }, { key: 'EVALUATION', components: ['EVALUATION'], marks: 10 }] },
    sort_order: 8,
  },
];

async function main() {
  console.log('Upserting mark scheme style...');
  await supabase.from('exam_mark_scheme_styles').delete().match({ subject: SUBJECT, qualification: QUALIFICATION, exam_board: EXAM_BOARD });
  const { error: styleError } = await supabase.from('exam_mark_scheme_styles').insert([MARK_SCHEME_STYLE]);
  if (styleError) { console.error('Mark scheme style insert failed:', JSON.stringify(styleError)); process.exit(1); }

  const rows = QUESTION_TYPES.map((t) => ({ subject: SUBJECT, qualification: QUALIFICATION, exam_board: EXAM_BOARD, active: true, ...t }));
  await supabase.from('exam_question_types').delete().match({ subject: SUBJECT, qualification: QUALIFICATION, exam_board: EXAM_BOARD });
  console.log(`Inserting ${rows.length} question type rows...`);
  const { error } = await supabase.from('exam_question_types').insert(rows);
  if (error) { console.error('Question types insert failed:', JSON.stringify(error)); process.exit(1); }
  console.log('Done.');
}
main();
