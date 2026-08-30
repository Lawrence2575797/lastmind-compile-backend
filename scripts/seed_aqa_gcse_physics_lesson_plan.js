require('dotenv/config');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SUBJECT = 'Physics';
const QUALIFICATION = 'GCSE';
const EXAM_BOARD = 'AQA';

function clean(s) { return (s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_'); }
function conceptId(subtopic, concept) { return `${clean(SUBJECT)}:${clean(subtopic)}:${clean(concept)}`; }

// Dependency-ordered lesson breakdown built by hand against the real AQA
// GCSE Physics (8463) specification's own topic/subtopic numbering.
// Separate science (triple award), not Combined Science: Trilogy (8464) -
// see seed_aqa_gcse_biology_lesson_plan.js for why that's the deliberate
// scope choice across all three sciences. Topic 8 (Space physics) is
// triple-only in full - Combined Science drops it entirely, which is one
// reason this file is a distinct spec from Trilogy rather than a subset
// of it. Required practicals are listed as their own concept item
// wherever the practical is itself a distinctly examinable technique.
const TOPICS = [
  {
    theme: 'Topic 1 - Energy',
    branch: 'Paper 1',
    subtopics: [
      {
        subtopic: '1.1 Energy changes in a system',
        concepts: [
          'Energy stores and energy transfers within systems',
          'Calculating kinetic energy',
          'Calculating gravitational potential energy',
          'Calculating elastic potential energy',
          'Investigating specific heat capacity (required practical)',
        ],
      },
      {
        subtopic: '1.2 Conservation and dissipation of energy',
        concepts: [
          'Energy transfers in a closed system',
          'Efficiency and reducing unwanted energy transfers',
          'Investigating the effectiveness of thermal insulation (required practical)',
        ],
      },
      {
        subtopic: '1.3 National and global energy resources',
        concepts: [
          'Renewable and non-renewable energy resources',
          'Trends in the use of energy resources',
        ],
      },
    ],
  },
  {
    theme: 'Topic 2 - Electricity',
    branch: 'Paper 1',
    subtopics: [
      {
        subtopic: '2.1 Current, potential difference and resistance',
        concepts: [
          'Standard circuit diagram symbols',
          'Electrical charge and current',
          'Current, resistance and potential difference',
          'Investigating the I-V characteristics of circuit elements (required practical)',
          'Ohmic conductors and filament lamps',
          'Diodes, thermistors and light-dependent resistors',
        ],
      },
      {
        subtopic: '2.2 Series and parallel circuits',
        concepts: [
          'Current, potential difference and resistance rules in series circuits',
          'Current, potential difference and resistance rules in parallel circuits',
        ],
      },
      {
        subtopic: '2.3 Domestic uses and safety',
        concepts: [
          'Direct current and alternating current',
          'UK mains electricity and the structure of a three-pin plug',
        ],
      },
      {
        subtopic: '2.4 Energy transfers',
        concepts: [
          'Electrical power calculations',
          'Energy transfers by electrical appliances',
          'The National Grid',
        ],
      },
      {
        subtopic: '2.5 Static electricity (triple only)',
        concepts: [
          'Static charge and electric fields',
        ],
      },
    ],
  },
  {
    theme: 'Topic 3 - Particle model of matter',
    branch: 'Paper 1',
    subtopics: [
      {
        subtopic: '3.1 Changes of state and the particle model',
        concepts: [
          'Density of materials',
          'Investigating densities of solids, liquids and gases (required practical)',
          'Changes of state and conservation of mass',
        ],
      },
      {
        subtopic: '3.2 Internal energy and energy transfers',
        concepts: [
          'Internal energy',
          'Specific latent heat',
          'Interpreting heating and cooling graphs',
        ],
      },
      {
        subtopic: '3.3 Particle model and pressure (triple only)',
        concepts: [
          'Particle motion in gases and gas pressure',
          "The relationship between pressure and volume for a gas (Boyle's law)",
        ],
      },
    ],
  },
  {
    theme: 'Topic 4 - Atomic structure',
    branch: 'Paper 1',
    subtopics: [
      {
        subtopic: '4.1 Atoms and isotopes',
        concepts: [
          'The structure of an atom',
          'Isotopes and atomic notation',
        ],
      },
      {
        subtopic: '4.2 Atoms and nuclear radiation',
        concepts: [
          'The development of the atomic model: the discovery of the nucleus',
          'Radioactive decay and nuclear radiation: alpha, beta and gamma',
          'Nuclear equations',
          'Half-lives and the random nature of radioactive decay',
        ],
      },
      {
        subtopic: '4.3 Hazards and uses of radioactive emissions and background radiation',
        concepts: [
          'Background radiation and its sources',
          'Hazards and uses of radioactive emissions',
        ],
      },
      {
        subtopic: '4.4 Nuclear fission and fusion (triple only)',
        concepts: [
          'Nuclear fission and its use in power stations',
          'Nuclear fusion',
        ],
      },
    ],
  },
  {
    theme: 'Topic 5 - Forces',
    branch: 'Paper 2',
    subtopics: [
      {
        subtopic: '5.1 Forces and their interactions',
        concepts: [
          'Scalar and vector quantities',
          'Contact and non-contact forces',
          'Gravity, weight and mass',
          'Resultant forces',
        ],
      },
      {
        subtopic: '5.2 Work done and energy transfer',
        concepts: [
          'Work done and its relation to energy transfer',
        ],
      },
      {
        subtopic: '5.3 Forces and elasticity',
        concepts: [
          "Elastic and inelastic deformation, and Hooke's law",
          'Investigating the extension of a spring (required practical)',
        ],
      },
      {
        subtopic: '5.4 Moments, levers and gears (triple only)',
        concepts: [
          'The moment of a force',
          'Levers and gears as force multipliers',
        ],
      },
      {
        subtopic: '5.5 Pressure and pressure differences in fluids (triple only)',
        concepts: [
          'Pressure in a fluid',
          'Atmospheric pressure',
          'Upthrust and floating',
        ],
      },
      {
        subtopic: '5.6 Motion',
        concepts: [
          'Describing motion: distance, displacement, speed and velocity',
          'Acceleration',
          'Distance-time and velocity-time graphs',
          'Investigating the motion of an object (required practical)',
        ],
      },
      {
        subtopic: "5.7 Newton's laws of motion",
        concepts: [
          "Newton's first law",
          "Newton's second law",
          "Newton's third law",
        ],
      },
      {
        subtopic: '5.8 Stopping distance',
        concepts: [
          'Reaction time and thinking distance',
          'Braking distance and factors affecting stopping distance',
        ],
      },
      {
        subtopic: '5.9 Momentum (triple only)',
        concepts: [
          'Momentum as a property of moving objects',
          'Conservation of momentum',
          'Changes in momentum and the forces involved',
        ],
      },
    ],
  },
  {
    theme: 'Topic 6 - Waves',
    branch: 'Paper 2',
    subtopics: [
      {
        subtopic: '6.1 Waves in air, fluids and solids',
        concepts: [
          'Transverse and longitudinal waves',
          'Properties of waves: amplitude, wavelength, frequency and period',
          'Wave speed calculations',
          'Investigating the frequency, wavelength and speed of waves (required practical)',
        ],
      },
      {
        subtopic: '6.2 Electromagnetic waves',
        concepts: [
          'Types of electromagnetic wave and the electromagnetic spectrum',
          'Properties of electromagnetic waves',
          'Uses and applications of electromagnetic waves',
          'Hazards of electromagnetic radiation',
          'Investigating the refraction of light (required practical, triple detail)',
        ],
      },
      {
        subtopic: '6.3 Black body radiation (triple only)',
        concepts: [
          'Emission and absorption of infrared radiation',
          'Perfect black bodies and radiation',
        ],
      },
    ],
  },
  {
    theme: 'Topic 7 - Magnetism and electromagnetism',
    branch: 'Paper 2',
    subtopics: [
      {
        subtopic: '7.1 Permanent and induced magnetism, magnetic forces and fields',
        concepts: [
          'Poles of a magnet and magnetic fields',
          'The magnetic effect of a current',
          'Investigating the magnetic field around a wire or solenoid (required practical)',
          'The motor effect (triple only)',
          "Fleming's left-hand rule (triple only)",
        ],
      },
      {
        subtopic: '7.2 Loudspeakers (triple only)',
        concepts: [
          'Loudspeakers and the motor effect',
        ],
      },
      {
        subtopic: '7.3 Induced potential, transformers and the National Grid (triple only)',
        concepts: [
          'The generator effect',
          'Microphones',
          'Transformers and their role in the National Grid',
        ],
      },
    ],
  },
  {
    theme: 'Topic 8 - Space physics (triple only)',
    branch: 'Paper 2',
    subtopics: [
      {
        subtopic: '8.1 Solar system; stability of orbital motions; satellites',
        concepts: [
          'Our solar system',
          'The life cycle of a star',
          'Orbital motion and satellites',
        ],
      },
      {
        subtopic: '8.2 Red-shift',
        concepts: [
          'Red-shift and the expanding universe',
          'Evidence for the Big Bang theory',
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
