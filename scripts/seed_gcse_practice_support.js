require('dotenv/config');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const profiles = [
  {
    subject: 'Biology', qualification: 'GCSE', examBoard: 'AQA', style: 'points',
    definitions: [
      { key: 'AO1', label: 'Knowledge and understanding' },
      { key: 'AO2', label: 'Application' },
      { key: 'AO3', label: 'Analysis and evaluation' },
    ],
    notes: 'AQA GCSE Biology questions are marked with indicative points and level descriptors where appropriate, rewarding accurate knowledge, application to unfamiliar contexts, analysis of evidence and evaluation.',
    types: [
      ['multiple_choice_1', '1-mark multiple choice', 'Select', 1, 'multiple_choice'],
      ['state_1', '1-mark state question', 'State', 1, 'points'],
      ['describe_2', '2-mark describe question', 'Describe', 2, 'points'],
      ['calculate_3', '3-mark calculation or data question', 'Calculate', 3, 'points'],
      ['explain_4', '4-mark explain question', 'Explain', 4, 'points'],
      ['analyse_5', '5-mark analyse question', 'Analyse', 5, 'points'],
      ['extended_6', '6-mark extended response', 'Evaluate', 6, 'levels'],
    ],
  },
  ...['GCSE Foundation', 'GCSE Higher'].map((qualification) => ({
    subject: 'Mathematics', qualification, examBoard: 'Edexcel', style: 'mab',
    definitions: [
      { key: 'M', label: 'Method' },
      { key: 'A', label: 'Accuracy' },
      { key: 'B', label: 'Independent fact' },
    ],
    notes: 'Edexcel GCSE Mathematics uses M marks for valid methods, A marks for accurate results following a method, and B marks for independent facts or conclusions.',
    types: [
      ['short_1', '1-mark short answer', 'Write down', 1, 'points'],
      ['short_2', '2-mark question', 'Work out', 2, 'points'],
      ['method_3', '3-mark method question', 'Work out', 3, 'points'],
      ['method_4', '4-mark problem', 'Solve', 4, 'points'],
      ['reasoning_5', '5-mark reasoning problem', 'Show that', 5, 'points'],
      ['extended_6', '6-mark extended problem', 'Solve', 6, 'points'],
    ],
  })),
];

function themeForMathsSubtopic(subtopic) {
  const text = String(subtopic || '').toLowerCase();
  if (text.includes('number')) return 'Number';
  if (text.includes('algebra')) return 'Algebra';
  if (text.includes('ratio') || text.includes('proportion')) return 'Ratio, proportion and rates of change';
  if (text.includes('geometry') || text.includes('measure')) return 'Geometry and measures';
  if (text.includes('probability')) return 'Probability';
  if (text.includes('statistic')) return 'Statistics';
  return 'Mathematics';
}

async function seedProfile(profile) {
  const match = { subject: profile.subject, qualification: profile.qualification, exam_board: profile.examBoard };
  await supabase.from('exam_mark_scheme_styles').delete().match(match);
  const { error: styleError } = await supabase.from('exam_mark_scheme_styles').insert({
    ...match,
    mark_scheme_style: profile.style,
    component_definitions: profile.definitions,
    notes: profile.notes,
  });
  if (styleError) throw styleError;

  await supabase.from('exam_question_types').delete().match(match);
  const rows = profile.types.map(([type_key, display_label, command_word, mark_tariff, mark_scheme_type], index) => ({
    ...match, type_key, display_label, command_word, mark_tariff, mark_scheme_type,
    requires_diagram: false,
    requires_maths_keyboard: profile.subject === 'Mathematics',
    component_split: null,
    confirmed: true,
    active: true,
    sort_order: index + 1,
  }));
  const { error: typesError } = await supabase.from('exam_question_types').insert(rows);
  if (typesError) throw typesError;
}

async function seedMathsPlans() {
  for (const tier of ['foundation', 'higher']) {
    const map = JSON.parse(fs.readFileSync(path.join(__dirname, `knowledge_map_mathematics_gcse${tier}.json`), 'utf8'));
    const match = { subject: map.subject, qualification: map.qualification, exam_board: map.examBoard };
    await supabase.from('spec_lesson_plans').delete().match(match);
    const orderBySubtopic = new Map();
    const rows = map.nodes.map((node) => {
      const lesson_order = (orderBySubtopic.get(node.subtopic) || 0) + 1;
      orderBySubtopic.set(node.subtopic, lesson_order);
      return {
        ...match,
        theme: themeForMathsSubtopic(node.subtopic),
        branch: tier === 'higher' ? 'Higher tier' : 'Foundation tier',
        subtopic: node.subtopic,
        concept: node.label,
        concept_id: `mathematics:${tier}:${node.id}`,
        lesson_order,
      };
    });
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase.from('spec_lesson_plans').insert(rows.slice(i, i + 500));
      if (error) throw error;
    }
  }
}

async function main() {
  for (const profile of profiles) await seedProfile(profile);
  await seedMathsPlans();
  console.log('GCSE Biology and GCSE Mathematics practice support seeded.');
}

main().catch((error) => {
  console.error('Seed failed:', error.message || error);
  process.exit(1);
});
