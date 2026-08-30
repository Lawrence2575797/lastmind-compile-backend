require('dotenv/config');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SUBJECT = 'Chemistry';
const QUALIFICATION = 'GCSE';
const EXAM_BOARD = 'AQA';

function clean(s) { return (s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_'); }
function conceptId(subtopic, concept) { return `${clean(SUBJECT)}:${clean(subtopic)}:${clean(concept)}`; }

// Dependency-ordered lesson breakdown built by hand against the real AQA
// GCSE Chemistry (8462) specification's own topic/subtopic numbering.
// Separate science (triple award), not Combined Science: Trilogy (8464) -
// see seed_aqa_gcse_biology_lesson_plan.js for why that's the deliberate
// scope choice across all three sciences. Required practicals are listed
// as their own concept item wherever the practical is itself a distinctly
// examinable technique, not just a demonstration of an adjacent concept.
const TOPICS = [
  {
    theme: 'Topic 1 - Atomic structure and the periodic table',
    branch: 'Paper 1',
    subtopics: [
      {
        subtopic: '1.1 A simple model of the atom',
        concepts: [
          'Atoms, elements and compounds',
          'Structure of the atom: protons, neutrons and electrons',
          'The development of the atomic model: Dalton, Thomson, Rutherford and Bohr',
        ],
      },
      {
        subtopic: '1.2 Mixtures',
        concepts: [
          'Mixtures and separation techniques: filtration and crystallisation',
          'Simple distillation and fractional distillation',
          'Investigating paper chromatography (required practical)',
          'Methods of drinking water purification',
        ],
      },
      {
        subtopic: '1.3 Relative atomic mass and electronic structure',
        concepts: [
          'Relative masses of subatomic particles',
          'Isotopes and relative atomic mass calculations',
          'Electronic structure and electron shells',
        ],
      },
      {
        subtopic: '1.4 The periodic table',
        concepts: [
          "The development of the periodic table and Mendeleev's contribution",
          'Metals and non-metals in the periodic table',
          'Group 0: the noble gases',
          'Group 1: the alkali metals',
          'Group 7: the halogens',
        ],
      },
    ],
  },
  {
    theme: 'Topic 2 - Bonding, structure and the properties of matter',
    branch: 'Paper 1',
    subtopics: [
      {
        subtopic: '2.1 Chemical bonds',
        concepts: [
          'Ionic bonding and the structure of ionic compounds',
          'Covalent bonding in small molecules',
          'Metallic bonding',
        ],
      },
      {
        subtopic: '2.2 How bonding and structure relate to the properties of substances',
        concepts: [
          'Properties of ionic compounds',
          'Properties of small molecules',
          'Structure and properties of polymers',
          'Giant covalent structures',
          'Properties of metals and alloys',
          'States of matter and changes of state',
        ],
      },
      {
        subtopic: '2.3 Structure and bonding of carbon',
        concepts: [
          'Diamond',
          'Graphite',
          'Fullerenes and nanotubes',
          'Graphene',
        ],
      },
      {
        subtopic: '2.4 Bulk and surface properties of matter, including nanoparticles (triple only)',
        concepts: [
          'Sizes of particles: nanoparticles, fine particles and coarse particles',
          'Uses of nanoparticles and their possible risks',
        ],
      },
    ],
  },
  {
    theme: 'Topic 3 - Quantitative chemistry',
    branch: 'Paper 1',
    subtopics: [
      {
        subtopic: '3.1 Conservation of mass and balanced chemical equations',
        concepts: [
          'Conservation of mass and balanced symbol equations',
          'Mass changes when a reactant or product is a gas',
        ],
      },
      {
        subtopic: '3.2 Relative formula mass and mole calculations',
        concepts: [
          'Relative formula mass',
          'The mole as the unit of amount of substance',
          'Amount of substance calculations from balanced equations (higher tier)',
        ],
      },
      {
        subtopic: '3.3 Concentration of solutions',
        concepts: [
          'Concentration of a solution in mol/dm3 and g/dm3',
          'Using concentration to determine unknown quantities',
        ],
      },
      {
        subtopic: '3.4 Yield and atom economy (triple only)',
        concepts: [
          'Percentage yield of a chemical reaction',
          'Atom economy of a chemical reaction',
        ],
      },
    ],
  },
  {
    theme: 'Topic 4 - Chemical changes',
    branch: 'Paper 1',
    subtopics: [
      {
        subtopic: '4.1 Reactivity of metals',
        concepts: [
          'Metal oxidation and reduction',
          'The reactivity series',
          'Investigating reactivity using displacement reactions (required practical)',
          'Extraction of metals by reduction with carbon',
          'Extraction of metals below carbon in the reactivity series',
          'Recycling and life cycle assessment of metals',
        ],
      },
      {
        subtopic: '4.2 Reactions of acids',
        concepts: [
          'Acids, bases and neutralisation',
          'Strong and weak acids (triple only)',
          'Reactions of acids with metals',
          'Reactions of acids with carbonates',
          'Preparing a soluble salt (required practical)',
          'Investigating the pH of neutralisation using titration (required practical)',
        ],
      },
      {
        subtopic: '4.3 Electrolysis',
        concepts: [
          'Electrolysis of molten ionic compounds',
          'Electrolysis of aqueous solutions',
          'Investigating the electrolysis of aqueous solutions (required practical)',
          'Extraction of aluminium by electrolysis',
        ],
      },
    ],
  },
  {
    theme: 'Topic 5 - Energy changes',
    branch: 'Paper 1',
    subtopics: [
      {
        subtopic: '5.1 Exothermic and endothermic reactions',
        concepts: [
          'Exothermic and endothermic reactions',
          'Investigating the variables that affect temperature changes in reactions (required practical)',
          'Reaction profiles',
          'Calculations using bond energies (triple only)',
        ],
      },
      {
        subtopic: '5.2 Chemical cells and fuel cells (triple only)',
        concepts: [
          'Cells and batteries',
          'Fuel cells',
        ],
      },
    ],
  },
  {
    theme: 'Topic 6 - The rate and extent of chemical change',
    branch: 'Paper 2',
    subtopics: [
      {
        subtopic: '6.1 Rate of reaction',
        concepts: [
          'Calculating rates of reaction',
          'Factors affecting rate: concentration, pressure, surface area and temperature',
          'Investigating how changing conditions affects the rate of reaction (required practical)',
          'The effect of catalysts on rate of reaction',
          'Collision theory and activation energy',
        ],
      },
      {
        subtopic: '6.2 Reversible reactions and dynamic equilibrium',
        concepts: [
          'Reversible reactions and their energy changes',
          'Dynamic equilibrium',
          'The effect of changing conditions on equilibrium position (triple detail)',
        ],
      },
    ],
  },
  {
    theme: 'Topic 7 - Organic chemistry',
    branch: 'Paper 2',
    subtopics: [
      {
        subtopic: '7.1 Carbon compounds as fuels and feedstock',
        concepts: [
          'Crude oil, hydrocarbons and alkanes',
          'Fractional distillation of crude oil and petrochemicals',
          'Properties of hydrocarbons',
          'Combustion of fuels',
          'Cracking hydrocarbons and alkenes',
        ],
      },
      {
        subtopic: '7.2 Reactions of alkenes and alcohols (triple only)',
        concepts: [
          'Structure and formulae of alkenes',
          'Reactions of alkenes',
          'Properties and uses of alcohols',
          'Properties and uses of carboxylic acids',
        ],
      },
      {
        subtopic: '7.3 Synthetic and naturally occurring polymers (triple only)',
        concepts: [
          'Addition polymerisation',
          'Condensation polymerisation',
          'Naturally occurring polymers: DNA, proteins, starch and cellulose',
        ],
      },
    ],
  },
  {
    theme: 'Topic 8 - Chemical analysis',
    branch: 'Paper 2',
    subtopics: [
      {
        subtopic: '8.1 Purity, formulations and chromatography',
        concepts: [
          'Pure substances and formulations',
          'Chromatography and Rf values',
        ],
      },
      {
        subtopic: '8.2 Identification of common gases',
        concepts: [
          'Tests for hydrogen, oxygen, carbon dioxide and chlorine',
        ],
      },
      {
        subtopic: '8.3 Identification of ions by chemical and spectroscopic means (triple only)',
        concepts: [
          'Flame tests for metal ions',
          'Tests for cations using sodium hydroxide',
          'Tests for anions: carbonates, halides and sulfates',
          'Instrumental methods: flame emission spectroscopy',
        ],
      },
    ],
  },
  {
    theme: 'Topic 9 - Chemistry of the atmosphere',
    branch: 'Paper 2',
    subtopics: [
      {
        subtopic: "9.1 The composition and evolution of the Earth's atmosphere",
        concepts: [
          "The Earth's early atmosphere",
          'How atmospheric oxygen increased over time',
        ],
      },
      {
        subtopic: '9.2 Carbon dioxide and methane as greenhouse gases',
        concepts: [
          'The greenhouse effect',
          'Human activities that increase greenhouse gas emissions',
          'Global climate change and its consequences',
        ],
      },
      {
        subtopic: '9.3 Common atmospheric pollutants and their sources',
        concepts: [
          'Products of combustion and atmospheric pollutants',
          'Effects of atmospheric pollutants',
        ],
      },
    ],
  },
  {
    theme: 'Topic 10 - Using resources',
    branch: 'Paper 2',
    subtopics: [
      {
        subtopic: "10.1 Using the Earth's resources and obtaining potable water",
        concepts: [
          'Finite and renewable resources',
          'Potable water production',
          'Waste water treatment (triple only)',
        ],
      },
      {
        subtopic: '10.2 Life cycle assessment and recycling',
        concepts: [
          'Life cycle assessments',
          'Reducing the use of resources: reuse and recycling',
        ],
      },
      {
        subtopic: '10.3 Using materials',
        concepts: [
          'Corrosion and its prevention',
          'Alloys as useful materials',
          'Ceramics, polymers and composites (triple only)',
        ],
      },
      {
        subtopic: '10.4 The Haber process and NPK fertilisers (triple only)',
        concepts: [
          'The Haber process',
          'Production and use of NPK fertilisers',
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
