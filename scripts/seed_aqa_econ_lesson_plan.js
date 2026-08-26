require('dotenv/config');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SUBJECT = 'Economics';
const QUALIFICATION = 'A-Level';
const EXAM_BOARD = 'AQA';

function clean(s) { return (s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_'); }
function conceptId(subtopic, concept) { return `${clean(SUBJECT)}:${clean(subtopic)}:${clean(concept)}`; }

// Dependency-ordered lesson breakdown built by hand against the real AQA
// A-level Economics (7136) specification's own subsection numbering
// (sections 4.1 and 4.2, which are the full A-level content areas -
// 4.1 supersedes/extends the AS-only 3.1, 4.2 extends 3.2). A different
// exam board from the existing Edexcel Economics plan, so this is a
// distinct (subject, qualification, examBoard) triple in the same table.
const THEMES = [
  {
    theme: '4.1 Individuals, firms, markets and market failure',
    branch: 'Microeconomics',
    subtopics: [
      {
        subtopic: '4.1.1 Economic methodology and the economic problem',
        concepts: [
          'Economic methodology: positive and normative economics',
          'The nature and purpose of economic activity',
          'Economic resources and factors of production',
          'Scarcity, choice and the allocation of resources',
          'Production possibility diagrams',
        ],
      },
      {
        subtopic: '4.1.2 Individual economic decision making',
        concepts: [
          'Consumer behaviour and rational decision making',
          'Imperfect information',
          'Aspects of behavioural economic theory',
          'Behavioural economics and economic policy',
        ],
      },
      {
        subtopic: '4.1.3 Price determination in a competitive market',
        concepts: [
          'The determinants of demand',
          'Price, income and cross elasticities of demand',
          'The determinants of supply and price elasticity of supply',
          'The determination of equilibrium market prices',
          'The interrelationship between markets',
        ],
      },
      {
        subtopic: '4.1.4 Production, costs and revenue',
        concepts: [
          'Production and productivity',
          'Specialisation, division of labour and exchange',
          'The law of diminishing returns and returns to scale',
          'Costs of production and economies of scale',
          'Revenue and profit',
        ],
      },
      {
        subtopic: '4.1.5 Perfect competition, imperfectly competitive markets and monopoly',
        concepts: [
          'Market structures and the objectives of firms',
          'Perfect competition',
          'Monopolistic competition',
          'Oligopoly',
          'Monopoly and monopoly power',
          'Price discrimination',
          'Contestable and non-contestable markets',
          'Static efficiency, dynamic efficiency and resource allocation',
        ],
      },
      {
        subtopic: '4.1.6 The labour market',
        concepts: [
          'The demand for labour and marginal productivity theory',
          'The supply of labour',
          'Wage determination in competitive labour markets',
          'Wage determination in imperfectly competitive labour markets',
          'Trade unions and the National Minimum Wage',
          'Discrimination in the labour market',
        ],
      },
      {
        subtopic: '4.1.7 The distribution of income and wealth: poverty and inequality',
        concepts: [
          'The distribution of income and wealth',
          'The problem of poverty',
          'Government policies to alleviate poverty and inequality',
        ],
      },
      {
        subtopic: '4.1.8 The market mechanism, market failure and government intervention',
        concepts: [
          'How markets allocate resources and the meaning of market failure',
          'Public goods, private goods and quasi-public goods',
          'Externalities in consumption and production',
          'Merit and demerit goods',
          'Market imperfections and competition policy',
          'Government intervention in markets',
          'Government failure',
        ],
      },
    ],
  },
  {
    theme: '4.2 The national and international economy',
    branch: 'Macroeconomics',
    subtopics: [
      {
        subtopic: '4.2.1 The measurement of macroeconomic performance',
        concepts: [
          'The objectives of government economic policy',
          'Macroeconomic indicators',
          'Uses of national income data',
        ],
      },
      {
        subtopic: '4.2.2 How the macroeconomy works',
        concepts: [
          'The circular flow of income',
          'Aggregate demand and aggregate supply analysis',
          'The determinants of aggregate demand',
          'Aggregate demand and the level of economic activity',
          'Determinants of short-run aggregate supply',
          'Determinants of long-run aggregate supply',
        ],
      },
      {
        subtopic: '4.2.3 Economic performance',
        concepts: [
          'Economic growth and the economic cycle',
          'Employment and unemployment',
          'Inflation and deflation',
          'Possible conflicts between macroeconomic policy objectives',
        ],
      },
      {
        subtopic: '4.2.4 Financial markets and monetary policy',
        concepts: [
          'The structure of financial markets and financial assets',
          'Central banks and monetary policy',
          'The regulation of the financial system',
        ],
      },
      {
        subtopic: '4.2.5 Fiscal policy and supply-side policies',
        concepts: [
          'Fiscal policy',
          'Supply-side policies',
        ],
      },
      {
        subtopic: '4.2.6 The international economy',
        concepts: [
          'Globalisation',
          'Trade',
          'The balance of payments',
          'Exchange rate systems',
          'Economic growth and development',
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
