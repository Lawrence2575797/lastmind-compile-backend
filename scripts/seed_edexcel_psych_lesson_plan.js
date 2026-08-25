require('dotenv/config');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SUBJECT = 'Psychology';
const QUALIFICATION = 'A-Level';
const EXAM_BOARD = 'Edexcel';

function clean(s) {
  return (s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
}
function conceptId(subtopic, concept) {
  return `${clean(SUBJECT)}:${clean(subtopic)}:${clean(concept)}`;
}

// Dependency-ordered lesson breakdown built by hand against the real
// Pearson Edexcel Level 3 Advanced GCE in Psychology (9PS0) specification
// (Issue 4) - Topics 1-4 (Paper 1: Foundations, compulsory) and Topics
// 5-8 (Paper 2: Applications - Clinical is compulsory, Criminological/
// Child/Health are the three optional choices in a real school; all
// three are included here so the practice-question library is complete
// regardless of which option a student's school teaches). Topic 9
// (Psychological skills/research methods) is synoptic across every
// topic rather than its own content area, so it isn't broken into
// lesson pages here, same reasoning as Economics' exam-technique
// material never becoming its own "topic".
const TOPICS = [
  {
    theme: 'Topic 1 - Social psychology',
    branch: 'Foundations',
    subtopics: [
      {
        subtopic: '1.1 Obedience',
        concepts: [
          'Theories of obedience: agency theory and social impact theory',
          "Milgram's research into obedience",
          'Factors affecting obedience and resistance to obedience',
        ],
      },
      {
        subtopic: '1.2 Prejudice',
        concepts: [
          'Explanations of prejudice: social identity theory and realistic conflict theory',
          'Factors affecting prejudice and discrimination',
        ],
      },
    ],
  },
  {
    theme: 'Topic 2 - Cognitive psychology',
    branch: 'Foundations',
    subtopics: [
      {
        subtopic: '2.1 Memory',
        concepts: [
          'The working memory model',
          'The multi-store model of memory',
          'Long-term memory: episodic and semantic memory',
          'Reconstructive memory and schema theory',
        ],
      },
    ],
  },
  {
    theme: 'Topic 3 - Biological psychology',
    branch: 'Foundations',
    subtopics: [
      {
        subtopic: '3.1 Biological explanations of aggression',
        concepts: [
          'The nervous system and synaptic transmission',
          'Brain structure and aggression',
          'Evolutionary explanations of aggression',
          "Freud's psychodynamic explanation of aggression",
          'Hormonal explanations of aggression',
        ],
      },
    ],
  },
  {
    theme: 'Topic 4 - Learning theories',
    branch: 'Foundations',
    subtopics: [
      {
        subtopic: '4.1 Learning theories and behaviour',
        concepts: [
          'Classical conditioning',
          'Operant conditioning',
          'Social learning theory',
          'Explaining and treating phobias',
        ],
      },
    ],
  },
  {
    theme: 'Topic 5 - Clinical psychology',
    branch: 'Applications',
    subtopics: [
      {
        subtopic: '5.1 Diagnosis and classification',
        concepts: [
          'Diagnosis and classification of mental disorders',
        ],
      },
      {
        subtopic: '5.2 Schizophrenia',
        concepts: [
          'Symptoms and features of schizophrenia',
          'Biological explanations of schizophrenia',
          'Non-biological explanations of schizophrenia',
          'Treatments for schizophrenia',
        ],
      },
      {
        subtopic: '5.3 Obsessive-compulsive disorder (OCD)',
        concepts: [
          'Symptoms and features of OCD',
          'Biological explanations of OCD',
          'Non-biological explanations of OCD',
          'Treatments for OCD',
        ],
      },
    ],
  },
  {
    theme: 'Topic 6 - Criminological psychology',
    branch: 'Applications',
    subtopics: [
      {
        subtopic: '6.1 Criminological psychology',
        concepts: [
          'Biological explanations of criminal behaviour',
          'Social explanations of criminal behaviour',
          'The cognitive interview',
          'Treatments for offenders',
          'Eyewitness testimony',
          'Jury decision-making',
        ],
      },
    ],
  },
  {
    theme: 'Topic 7 - Child psychology',
    branch: 'Applications',
    subtopics: [
      {
        subtopic: '7.1 Attachment',
        concepts: [
          "Bowlby's theory of attachment",
          "Ainsworth's Strange Situation and attachment types",
          'Deprivation',
          'Privation',
          'Day care',
        ],
      },
      {
        subtopic: '7.2 Autism',
        concepts: [
          'Autism: features and explanations',
        ],
      },
    ],
  },
  {
    theme: 'Topic 8 - Health psychology',
    branch: 'Applications',
    subtopics: [
      {
        subtopic: '8.1 Addiction',
        concepts: [
          'Concepts of addiction: tolerance, dependency and withdrawal',
          'Biological explanations of addiction',
          'Learning explanations of addiction',
          'Treatments for addiction',
        ],
      },
    ],
  },
];

async function main() {
  const rows = [];
  for (const { theme, branch, subtopics } of TOPICS) {
    for (const { subtopic, concepts } of subtopics) {
      concepts.forEach((concept, i) => {
        rows.push({
          subject: SUBJECT,
          qualification: QUALIFICATION,
          exam_board: EXAM_BOARD,
          theme,
          subtopic,
          lesson_order: i + 1,
          concept,
          branch,
          concept_id: conceptId(subtopic, concept),
        });
      });
    }
  }

  console.log(`Inserting ${rows.length} lesson plan rows...`);
  const { error } = await supabase.from('spec_lesson_plans').insert(rows);
  if (error) {
    console.error('Insert failed:', JSON.stringify(error));
    process.exit(1);
  }
  console.log('Done.');
}

main();
