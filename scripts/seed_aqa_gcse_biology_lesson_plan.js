require('dotenv/config');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SUBJECT = 'Biology';
const QUALIFICATION = 'GCSE';
const EXAM_BOARD = 'AQA';

function clean(s) { return (s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_'); }
function conceptId(subtopic, concept) { return `${clean(SUBJECT)}:${clean(subtopic)}:${clean(concept)}`; }

// Dependency-ordered lesson breakdown built by hand against the real AQA
// GCSE Biology (8461) specification's own topic/subtopic numbering. This
// is the SEPARATE science spec (triple award), not Combined Science:
// Trilogy (8464) - a student taking three individual GCSEs in Biology,
// Chemistry and Physics gets the full depth below, including every
// "triple only" subtopic; a Trilogy/combined-science student would only
// see a subset of this at reduced depth, which is a different (and
// currently unseeded) spec entirely. Required practicals are listed as
// their own concept item wherever the practical itself is separately
// examinable technique/skill, not just a demonstration of theory already
// covered by an adjacent concept.
const TOPICS = [
  {
    theme: 'Topic 1 - Cell biology',
    branch: 'Paper 1',
    subtopics: [
      {
        subtopic: '1.1 Cell structure',
        concepts: [
          'Eukaryotic and prokaryotic cells',
          'Animal and plant cell structure',
          'Cell specialisation and differentiation',
          'Microscopy: light microscopes and electron microscopes (required practical)',
          'Culturing microorganisms (required practical)',
        ],
      },
      {
        subtopic: '1.2 Cell division',
        concepts: [
          'The cell cycle and mitosis',
          'Stem cells in animals and plants',
          'Uses and ethics of stem cell therapy',
        ],
      },
      {
        subtopic: '1.3 Transport in cells',
        concepts: [
          'Diffusion',
          'Osmosis (required practical)',
          'Active transport',
          'Factors affecting the rate of diffusion, osmosis and active transport',
        ],
      },
    ],
  },
  {
    theme: 'Topic 2 - Organisation',
    branch: 'Paper 1',
    subtopics: [
      {
        subtopic: '2.1 Principles of organisation',
        concepts: [
          'Cells, tissues, organs and organ systems',
        ],
      },
      {
        subtopic: '2.2 The human digestive system',
        concepts: [
          'The human digestive system: organs and their roles',
          'Enzymes: catalysts and enzyme action',
          'Digestive enzymes: amylase, protease and lipase',
          'Testing food samples for biological molecules (required practical)',
          'Investigating the effect of pH on enzyme activity (required practical)',
        ],
      },
      {
        subtopic: '2.3 The heart and blood vessels',
        concepts: [
          'The structure and function of the heart',
          'Blood vessels and blood as a transport medium',
          'Coronary heart disease and its treatment',
        ],
      },
      {
        subtopic: '2.4 The lungs',
        concepts: [
          'The lungs and gas exchange',
        ],
      },
      {
        subtopic: '2.5 Cancer',
        concepts: [
          'Non-communicable diseases and risk factors',
          'Cancer: tumours, causes and treatment',
        ],
      },
      {
        subtopic: '2.6 Plant tissues, organs and systems',
        concepts: [
          'Plant tissues: epidermis, palisade mesophyll, xylem and phloem',
          'Leaf structure and gas/water exchange',
          'Transpiration and translocation',
          'Investigating factors affecting the rate of water uptake (required practical)',
        ],
      },
    ],
  },
  {
    theme: 'Topic 3 - Infection and response',
    branch: 'Paper 1',
    subtopics: [
      {
        subtopic: '3.1 Communicable (infectious) diseases',
        concepts: [
          'Pathogens and communicable disease',
          'Viral diseases: measles, HIV and tobacco mosaic virus',
          'Bacterial diseases: salmonella and gonorrhoea',
          'Fungal disease: rose black spot',
          'Protist disease: malaria',
          'How pathogens spread and how spread is prevented',
        ],
      },
      {
        subtopic: '3.2 Human defence systems',
        concepts: [
          "The body's non-specific defence systems",
          'The immune system: white blood cells',
          'Vaccination',
        ],
      },
      {
        subtopic: '3.3 Treatment and prevention of disease',
        concepts: [
          'Discovery and development of drugs',
          'Aseptic technique and testing antibiotics (required practical)',
          'Monoclonal antibodies and their production',
          'Uses of monoclonal antibodies (triple only)',
          'Plant disease: detection and identification (triple only)',
          'Plant defence responses (triple only)',
        ],
      },
    ],
  },
  {
    theme: 'Topic 4 - Bioenergetics',
    branch: 'Paper 1',
    subtopics: [
      {
        subtopic: '4.1 Photosynthesis',
        concepts: [
          'The photosynthesis reaction and its uses',
          'Rate of photosynthesis and limiting factors',
          'Investigating the effect of light intensity on photosynthesis (required practical)',
          'Uses of glucose produced by photosynthesis',
        ],
      },
      {
        subtopic: '4.2 Respiration',
        concepts: [
          'Aerobic respiration',
          'Anaerobic respiration in animals and in plants/microorganisms',
          'Metabolism and the uses of energy from respiration',
          "The body's response to exercise",
        ],
      },
    ],
  },
  {
    theme: 'Topic 5 - Homeostasis and response',
    branch: 'Paper 2',
    subtopics: [
      {
        subtopic: '5.1 Homeostasis',
        concepts: [
          'The principles of homeostasis',
        ],
      },
      {
        subtopic: '5.2 The human nervous system',
        concepts: [
          'The structure and function of the nervous system',
          'Reflex actions',
          'Investigating human reaction time (required practical)',
        ],
      },
      {
        subtopic: '5.3 The human endocrine system',
        concepts: [
          'Hormones and the endocrine system',
          'Control of blood glucose: insulin and glucagon',
          'Diabetes: type 1 and type 2',
          'Hormones in human reproduction',
          'Hormonal and non-hormonal methods of contraception',
          'Using hormones to treat infertility (triple only)',
          'The control of body temperature (triple only)',
          'Negative feedback (triple only)',
        ],
      },
      {
        subtopic: '5.4 Plant hormones (triple only)',
        concepts: [
          'Auxins and plant growth responses (tropisms)',
          'Investigating plant responses to light or gravity (required practical)',
          'Uses of plant hormones in agriculture and horticulture',
        ],
      },
    ],
  },
  {
    theme: 'Topic 6 - Inheritance, variation and evolution',
    branch: 'Paper 2',
    subtopics: [
      {
        subtopic: '6.1 Reproduction',
        concepts: [
          'Sexual and asexual reproduction',
          'Meiosis',
          'DNA and the genome',
          'DNA structure (triple only detail)',
          'Genetic inheritance: alleles, genotype and phenotype',
          'Inherited disorders: polydactyly and cystic fibrosis',
          'Sex determination',
        ],
      },
      {
        subtopic: '6.2 Variation and evolution',
        concepts: [
          'Variation: genetic and environmental causes',
          'Evolution by natural selection',
          'Evidence for evolution: fossils and extinction',
          'Resistant bacteria and antibiotic resistance',
          'Genetic engineering (triple only detail)',
          'Cloning (triple only)',
        ],
      },
      {
        subtopic: '6.3 The development of genetic and evolutionary theory',
        concepts: [
          "Mendel's discovery of genetics",
          "Darwin's theory of evolution and its acceptance",
        ],
      },
      {
        subtopic: '6.4 Classification of living organisms',
        concepts: [
          'The Linnaean system of classification',
          'The three-domain system',
        ],
      },
    ],
  },
  {
    theme: 'Topic 7 - Ecology',
    branch: 'Paper 2',
    subtopics: [
      {
        subtopic: '7.1 Adaptations, interdependence and competition',
        concepts: [
          'Communities and competition between organisms',
          'Structural, behavioural and functional adaptations',
          'Investigating the population size of organisms (required practical)',
        ],
      },
      {
        subtopic: '7.2 Organisation of an ecosystem',
        concepts: [
          'Levels of organisation in an ecosystem',
          'The carbon cycle',
          'The water cycle (triple only)',
        ],
      },
      {
        subtopic: '7.3 Biodiversity and the effect of human interaction on ecosystems',
        concepts: [
          'Biodiversity and the importance of maintaining it',
          'Global warming and its biological effects',
          'Deforestation and land use',
          'Waste management, land use and maintaining biodiversity',
        ],
      },
      {
        subtopic: '7.4 Trophic levels in an ecosystem (triple only)',
        concepts: [
          'Trophic levels and pyramids of biomass',
          'Transfer of biomass between trophic levels and its efficiency',
        ],
      },
      {
        subtopic: '7.5 Food production (triple only)',
        concepts: [
          'Factors affecting food security',
          'Farming techniques and food production',
          'Sustainable food production, including fish stocks and biotechnology',
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
