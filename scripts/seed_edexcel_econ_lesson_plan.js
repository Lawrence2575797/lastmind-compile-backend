require('dotenv/config');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SUBJECT = 'Economics';
const QUALIFICATION = 'A Level';
const EXAM_BOARD = 'Edexcel';

function clean(s) {
  return (s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
}
function conceptId(subtopic, concept) {
  return `${clean(SUBJECT)}:${clean(subtopic)}:${clean(concept)}`;
}

// Dependency-ordered lesson breakdown, same standard as CORTEX_INTENT_PROMPT
// rule 8 (core definitions/models first, then how they combine, then
// evaluation/application angles) applied by hand against the real seeded
// spec outline (exam_spec_outlines: economics::a_level::edexcel).
const THEMES = [
  {
    theme: 'Theme 1 - Introduction to markets and market failure',
    branch: 'Microeconomics',
    subtopics: [
      {
        subtopic: '1.1 Nature of economics',
        concepts: [
          'Positive and normative statements',
          'The economic problem: scarcity and choice',
          'Opportunity cost',
          'Production possibility frontiers',
          'Specialisation and division of labour',
          'Economic systems: free market, mixed, and command economies',
        ],
      },
      {
        subtopic: '1.2 How markets work',
        concepts: [
          'Rational decision-making',
          'Demand and the law of demand',
          'Price elasticity of demand (PED)',
          'Income elasticity of demand (YED)',
          'Cross elasticity of demand (XED)',
          'Supply and the law of supply',
          'Price elasticity of supply (PES)',
          'Price determination and market equilibrium',
          'The price mechanism',
          'Consumer and producer surplus',
          'Indirect taxes and subsidies',
          'Behavioural economics and non-rational decision-making',
        ],
      },
      {
        subtopic: '1.3 Market failure',
        concepts: [
          'Types of market failure',
          'Externalities',
          'Public goods',
          'Information gaps',
        ],
      },
      {
        subtopic: '1.4 Government intervention',
        concepts: [
          'Government intervention in markets',
          'Government failure',
        ],
      },
    ],
  },
  {
    theme: 'Theme 2 - The UK economy: performance and policies',
    branch: 'Macroeconomics',
    subtopics: [
      {
        subtopic: '2.1 Measures of economic performance',
        concepts: [
          'Economic growth',
          'Inflation',
          'Employment and unemployment',
          'Balance of payments',
        ],
      },
      {
        subtopic: '2.2 Aggregate demand (AD)',
        concepts: [
          'Characteristics of aggregate demand',
          'Consumption',
          'Investment',
          'Government expenditure',
          'Net trade',
        ],
      },
      {
        subtopic: '2.3 Aggregate supply (AS)',
        concepts: [
          'Characteristics of aggregate supply',
          'Short-run aggregate supply',
          'Long-run aggregate supply',
        ],
      },
      {
        subtopic: '2.4 National income',
        concepts: [
          'National income and the circular flow',
          'Injections and withdrawals',
          'Equilibrium national output',
          'The multiplier',
        ],
      },
      {
        subtopic: '2.5 Economic growth',
        concepts: [
          'Causes of economic growth',
          'Output gaps',
          'The trade (business) cycle',
          'The impact of economic growth',
        ],
      },
      {
        subtopic: '2.6 Macroeconomic objectives and policies',
        concepts: [
          'Macroeconomic objectives',
          'Demand-side policies: fiscal policy',
          'Demand-side policies: monetary policy',
          'Supply-side policies',
          'Conflicts and trade-offs between objectives and policies',
        ],
      },
    ],
  },
  {
    theme: 'Theme 3 - Business behaviour and the labour market',
    branch: 'Microeconomics',
    subtopics: [
      {
        subtopic: '3.1 Business growth',
        concepts: [
          'Sizes and types of firms',
          'How businesses grow',
          'Demergers',
        ],
      },
      {
        subtopic: '3.2 Business objectives',
        concepts: [
          'Profit maximisation',
          'Alternative business objectives',
        ],
      },
      {
        subtopic: '3.3 Revenues, costs and profits',
        concepts: [
          'Revenue',
          'Costs',
          'Economies and diseconomies of scale',
          'Normal profit, supernormal profit and losses',
        ],
      },
      {
        subtopic: '3.4 Market structures',
        concepts: [
          'Efficiency',
          'Perfect competition',
          'Monopolistic competition',
          'Oligopoly',
          'Monopoly',
          'Monopsony',
          'Contestability',
        ],
      },
      {
        subtopic: '3.5 Labour market',
        concepts: [
          'Demand for labour',
          'Supply of labour',
          'Wage determination in competitive labour markets',
          'Wage determination in non-competitive labour markets',
        ],
      },
      {
        subtopic: '3.6 Government intervention in business/labour markets',
        concepts: [
          'Intervention to promote competition and protect consumers/suppliers',
          'The impact of government intervention',
        ],
      },
    ],
  },
  {
    theme: 'Theme 4 - A global perspective',
    branch: 'Macroeconomics',
    subtopics: [
      {
        subtopic: '4.1 International economics',
        concepts: [
          'Globalisation',
          'Specialisation and trade',
          'Pattern of trade',
          'Terms of trade',
          'Trading blocs and the WTO',
          'Restrictions on free trade',
          'Exchange rates',
          'International competitiveness',
        ],
      },
      {
        subtopic: '4.2 Poverty and inequality',
        concepts: [
          'Absolute and relative poverty',
          'Income and wealth inequality',
        ],
      },
      {
        subtopic: '4.3 Emerging and developing economies',
        concepts: [
          'Measures of development',
          'Factors influencing growth and development',
          'Strategies influencing growth and development',
        ],
      },
      {
        subtopic: '4.4 The financial sector',
        concepts: [
          'Role of financial markets',
          'Market failure in the financial sector',
          'Role of central banks',
        ],
      },
      {
        subtopic: '4.5 Role of the state in the macroeconomy',
        concepts: [
          'Public expenditure',
          'Taxation',
          'Public sector finances',
          'Macroeconomic policies in a global context',
        ],
      },
    ],
  },
];

async function main() {
  const rows = [];
  for (const { theme, branch, subtopics } of THEMES) {
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
