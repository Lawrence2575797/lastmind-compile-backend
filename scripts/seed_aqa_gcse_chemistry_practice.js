require('dotenv/config');
const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const match = { subject: 'Chemistry', qualification: 'GCSE', exam_board: 'AQA' };
const types = [
  ['multiple_choice_1', '1-mark multiple choice', 'Select', 1, 'multiple_choice'],
  ['state_1', '1-mark state question', 'State', 1, 'points'],
  ['describe_2', '2-mark describe question', 'Describe', 2, 'points'],
  ['calculate_3', '3-mark calculation', 'Calculate', 3, 'points'],
  ['explain_4', '4-mark explain question', 'Explain', 4, 'points'],
  ['analyse_5', '5-mark analyse question', 'Analyse', 5, 'points'],
  ['extended_6', '6-mark extended response', 'Evaluate', 6, 'levels'],
];

async function main() {
  const { error: deleteStyleError } = await db.from('exam_mark_scheme_styles').delete().match(match);
  if (deleteStyleError) throw deleteStyleError;
  const { error: styleError } = await db.from('exam_mark_scheme_styles').insert({
    ...match,
    mark_scheme_style: 'points',
    component_definitions: [
      { key: 'AO1', label: 'Knowledge and understanding' },
      { key: 'AO2', label: 'Application' },
      { key: 'AO3', label: 'Analysis and evaluation' },
    ],
    notes: 'AQA GCSE Chemistry rewards accurate chemical knowledge, application to unfamiliar contexts and practical work, and analysis or evaluation of evidence. Six-mark extended responses are judged by level of response.',
  });
  if (styleError) throw styleError;

  const { error: deleteTypesError } = await db.from('exam_question_types').delete().match(match);
  if (deleteTypesError) throw deleteTypesError;
  const rows = types.map(([type_key, display_label, command_word, mark_tariff, mark_scheme_type], index) => ({
    ...match,
    type_key,
    display_label,
    command_word,
    mark_tariff,
    mark_scheme_type,
    requires_diagram: false,
    requires_maths_keyboard: false,
    component_split: null,
    confirmed: true,
    active: true,
    sort_order: index + 1,
  }));
  const { error: typesError } = await db.from('exam_question_types').insert(rows);
  if (typesError) throw typesError;
  console.log(`Seeded ${rows.length} AQA GCSE Chemistry question types and marking guidance.`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
