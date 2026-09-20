// Seeds everything OCR A Level Law needs outside the knowledge map itself:
//  - spec_lesson_plans: the spec's themes/topics as lesson-sized chunks in our own words
//    (used for the "where are you in the course" plan when a student joins part way,
//    theme titles on the map, and the Practice Questions tree),
//  - exam_mark_scheme_styles + exam_question_types: the four OCR H415 question types
//    (10-mark explain, 15-mark discuss, 25-mark scenario "advise", 25-mark essay), all
//    levels-based, so practice-question generation and marking work in the lesson feed.
// Idempotent: replaces only Law / A Level / OCR rows. Does not touch student data.
require('dotenv/config');
const { createClient } = require('@supabase/supabase-js');
const { THEMES, SUBJECT, EXAM_BOARD } = require('./ocr_law_build/ocr_law_spec');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const match = { subject: SUBJECT, qualification: 'A Level', exam_board: EXAM_BOARD };
const clean = (v) => v.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

const TYPES = [
  ['explain_10', '10-mark explain / describe (legal system)', 'Explain', 10, [{ key: 'AO1', marks: 10, components: ['AO1'] }]],
  ['discuss_15', '15-mark discuss (analyse and evaluate, no conclusion)', 'Discuss', 15, [{ key: 'AO3', marks: 15, components: ['AO3'] }]],
  ['advise_25', '25-mark scenario question: advise', 'Advise', 25, [{ key: 'AO1', marks: 10, components: ['AO1'] }, { key: 'AO2', marks: 15, components: ['AO2'] }]],
  ['essay_25', '25-mark essay: discuss the extent to which', 'Discuss the extent to which', 25, [{ key: 'AO1', marks: 10, components: ['AO1'] }, { key: 'AO3', marks: 15, components: ['AO3'] }]],
];

async function main() {
  // ---- lesson plans ----
  const rows = [];
  for (const t of THEMES) {
    for (const s of t.subtopics) {
      const subtopic = `${s.code} ${s.title}`;
      s.lessons.forEach((concept, i) => rows.push({
        ...match, theme: t.theme, branch: t.branch, subtopic, concept, lesson_order: i + 1,
        concept_id: `law:${clean(subtopic)}:${clean(concept)}`,
      }));
    }
  }
  const ids = new Set(rows.map((r) => r.concept_id));
  if (ids.size !== rows.length) throw new Error('Duplicate concept_id in the lesson plan');
  let r = await db.from('spec_lesson_plans').delete().match(match);
  if (r.error) throw r.error;
  for (let i = 0; i < rows.length; i += 100) {
    r = await db.from('spec_lesson_plans').insert(rows.slice(i, i + 100));
    if (r.error) throw r.error;
  }
  console.log(`spec_lesson_plans: ${rows.length} lessons across ${THEMES.length} themes.`);

  // ---- marking style ----
  r = await db.from('exam_mark_scheme_styles').delete().match(match);
  if (r.error) throw r.error;
  r = await db.from('exam_mark_scheme_styles').insert({
    ...match,
    mark_scheme_style: 'ao_additive',
    component_definitions: [
      { key: 'AO1', label: 'Knowledge and understanding of the legal system and legal rules and principles' },
      { key: 'AO2', label: 'Application of legal rules and principles to scenarios' },
      { key: 'AO3', label: 'Analysis and evaluation of legal rules, principles, concepts and issues' },
    ],
    notes: 'OCR A Level Law (H415).',
  });
  if (r.error) throw r.error;

  // ---- question types ----
  r = await db.from('exam_question_types').delete().match(match);
  if (r.error) throw r.error;
  r = await db.from('exam_question_types').insert(TYPES.map(([type_key, display_label, command_word, mark_tariff, groups], i) => ({
    ...match, type_key, display_label, command_word, mark_tariff,
    mark_scheme_type: 'levels', requires_diagram: false, requires_maths_keyboard: false,
    component_split: { groups }, confirmed: true, active: true, sort_order: i + 1,
  })));
  if (r.error) throw r.error;
  console.log(`Seeded ${TYPES.length} question types and the marking style.`);
}
main().catch((e) => { console.error(e.message || e); process.exitCode = 1; });
