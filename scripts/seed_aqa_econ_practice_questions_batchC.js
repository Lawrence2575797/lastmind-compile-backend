require('dotenv/config');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SUBJECT = 'Economics';
const QUALIFICATION = 'A-Level';
const EXAM_BOARD = 'AQA';

function clean(s) { return (s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_'); }
function conceptId(subtopic, concept) { return `${clean(SUBJECT)}:${clean(subtopic)}:${clean(concept)}`; }

const mc = (options, correctIndex, explanation) => ({ markSchemeType: 'multiple_choice', markSchemeJson: { options, correctIndex, explanation } });
const points = (criteria) => ({ markSchemeType: 'points', markSchemeJson: { criteria } });
const levels = (levelsArr) => ({ markSchemeType: 'levels', markSchemeJson: { levels: levelsArr } });
const band4 = (t4, t3, t2, t1) => levels([
  { level: 4, marks: '4', descriptor: t4 },
  { level: 3, marks: '3', descriptor: t3 },
  { level: 2, marks: '2', descriptor: t2 },
  { level: 1, marks: '1', descriptor: t1 },
]);

const T421 = '4.2.1 The measurement of macroeconomic performance';
const T422 = '4.2.2 How the macroeconomy works';
const T423 = '4.2.3 Economic performance';

const QUESTIONS = [
  // ───────────────────────── 4.2.1 The measurement of macroeconomic performance ─────────────────────────
  {
    subtopic: T421, concept: 'The objectives of government economic policy',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'Which of the following is one of the main macroeconomic objectives of the UK government?\nA. Maximising a single firm\'s market share\nB. Low and stable inflation\nC. Increasing the price elasticity of demand for a specific good\nD. Reducing the number of firms in an industry',
        ...mc(['A','B','C','D'], 1, 'The main macroeconomic objectives are: economic growth, low unemployment, low and stable inflation, and a satisfactory balance of payments.'),
        answerStructureAdvice: 'Learn the standard list of macroeconomic objectives so you can recall them under pressure.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'State two macroeconomic objectives of the UK government.',
        ...points([{ name: 'Naming any two of: economic growth, low unemployment, low/stable inflation, balance of payments equilibrium', marks: 2 }]),
        answerStructureAdvice: 'One mark per correctly named objective.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'Explain why low unemployment is considered an important macroeconomic objective for a government.',
        ...band4(
          'Clearly identifies both the economic cost (lost output/tax revenue) and social cost (reduced wellbeing) of unemployment, with a precise, well-developed explanation.',
          'Identifies at least one genuine cost of unemployment with a reasonably clear explanation.',
          'Makes a limited or unclear attempt to explain the importance of low unemployment.',
          'Makes only a very vague reference to unemployment with little real explanation.'
        ),
        answerStructureAdvice: 'Cover both an ECONOMIC cost (e.g. lost output) and a SOCIAL cost (e.g. reduced wellbeing) for full marks.' },
      { markTariff: 9, requiresDiagram: false,
        questionText: 'Explain why a government might find it difficult to achieve all of its macroeconomic objectives simultaneously.',
        ...levels([
          { level: 3, marks: '7-9', descriptor: 'Well organised, develops one or more relevant issues (e.g. the trade-off between low unemployment and low inflation) with sound knowledge, good application, and a clear chain of reasoning.' },
          { level: 2, marks: '4-6', descriptor: 'Includes a relevant issue with reasonable knowledge and application, but analysis may not be fully developed.' },
          { level: 1, marks: '1-3', descriptor: 'A brief or weak response with limited knowledge and very limited application.' },
        ]),
        answerStructureAdvice: 'Name a specific conflict (e.g. unemployment vs. inflation) and follow the chain of reasoning through fully.' },
    ],
  },
  {
    subtopic: T421, concept: 'Macroeconomic indicators',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'Real GDP differs from nominal GDP because real GDP:\nA. Excludes government spending\nB. Is adjusted for inflation\nC. Only measures exports\nD. Ignores population size',
        ...mc(['A','B','C','D'], 1, 'Real GDP strips out the effect of price changes (inflation), so it measures the actual change in the volume of output, not just a rise in prices.'),
        answerStructureAdvice: 'Remember: "real" always means inflation has been removed from the figure.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'State two macroeconomic indicators used to measure the health of an economy.',
        ...points([{ name: 'Correctly named indicator (e.g. real GDP growth, the inflation rate, the unemployment rate, the current account balance)', marks: 1 }, { name: 'A second, different correctly named indicator', marks: 1 }]),
        answerStructureAdvice: 'One mark per correctly named indicator.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'A country\'s Consumer Prices Index (CPI) rises from 108 to 112 over a year. Explain what this shows about the rate of inflation.',
        ...band4(
          'Correctly calculates the approximate inflation rate (about 3.7%) and precisely explains that CPI measures the change in the average price level of a representative basket of goods.',
          'Correctly identifies that prices have risen with a reasonably clear explanation, even without a precise percentage.',
          'Makes a limited or unclear attempt to link the CPI change to inflation.',
          'Makes only a very vague reference to prices or CPI with little real explanation.'
        ),
        answerStructureAdvice: 'Show the calculation ((112-108)/108 × 100 ≈ 3.7%) and state clearly that CPI tracks the AVERAGE price level of a basket of goods.' },
      { markTariff: 9, requiresDiagram: false,
        questionText: 'Explain the limitations of using real GDP as a measure of a country\'s living standards.',
        ...levels([
          { level: 3, marks: '7-9', descriptor: 'Well organised, develops one or more relevant issues (e.g. income distribution, the informal economy, environmental costs) with sound knowledge, good application, and a clear chain of reasoning.' },
          { level: 2, marks: '4-6', descriptor: 'Includes a relevant issue with reasonable knowledge and application, but analysis may not be fully developed.' },
          { level: 1, marks: '1-3', descriptor: 'A brief or weak response with limited knowledge and very limited application.' },
        ]),
        answerStructureAdvice: 'Develop ONE limitation (e.g. GDP says nothing about how income is distributed) rather than listing several briefly.' },
    ],
  },
  {
    subtopic: T421, concept: 'Uses of national income data',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'National income data is most useful for which of the following purposes?\nA. Setting an individual firm\'s prices\nB. Comparing living standards and economic performance between countries or over time\nC. Determining a single consumer\'s spending habits\nD. Setting exchange rates directly',
        ...mc(['A','B','C','D'], 2, 'National income data (e.g. GDP, GNI) is widely used to compare economic performance and living standards between countries and across time periods.'),
        answerStructureAdvice: 'Think about the BROAD, economy-wide comparisons this data is designed for.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain one limitation of using GDP data to compare living standards between two different countries.',
        ...points([{ name: 'Naming a genuine limitation (e.g. different population sizes, exchange rate distortions, informal economy differences)', marks: 1 }, { name: 'Brief development of that limitation', marks: 1 }]),
        answerStructureAdvice: 'Name the limitation clearly, then add one sentence explaining why it matters for cross-country comparison.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'Explain why GDP per capita, rather than total GDP, is usually used to compare living standards between countries of very different population sizes.',
        ...band4(
          'Clearly identifies that dividing by population accounts for the fact that a larger population naturally has a larger total GDP, precisely explaining why per capita gives a fairer comparison.',
          'Identifies the population-size issue with a reasonably clear explanation.',
          'Makes a limited or unclear attempt to explain the reasoning.',
          'Makes only a very vague reference to GDP or population with little real explanation.'
        ),
        answerStructureAdvice: 'Explain precisely WHY dividing by population corrects for the size distortion in a simple total-GDP comparison.' },
      { markTariff: 9, requiresDiagram: false,
        questionText: 'Explain why using national income data to measure changes in economic welfare over time can be problematic.',
        ...levels([
          { level: 3, marks: '7-9', descriptor: 'Well organised, develops one or more relevant issues (e.g. income distribution changes, quality-of-life factors, environmental degradation) with sound knowledge, good application, and a clear chain of reasoning.' },
          { level: 2, marks: '4-6', descriptor: 'Includes a relevant issue with reasonable knowledge and application, but analysis may not be fully developed.' },
          { level: 1, marks: '1-3', descriptor: 'A brief or weak response with limited knowledge and very limited application.' },
        ]),
        answerStructureAdvice: 'Develop one genuine problem (e.g. rising GDP alongside worsening environmental quality) in depth.' },
    ],
  },
  // ───────────────────────── 4.2.2 How the macroeconomy works ─────────────────────────
  {
    subtopic: T422, concept: 'The circular flow of income',
    questions: [
      { markTariff: 1, requiresDiagram: true,
        questionText: 'In the circular flow of income model, households provide firms with:\nA. Goods and services\nB. Factors of production, in exchange for income\nC. Government spending\nD. Taxation revenue',
        ...mc(['A','B','C','D'], 1, 'Households supply factors of production to firms and receive income in return; firms supply goods/services back to households.'),
        answerStructureAdvice: 'Households → factors of production → firms; firms → income → households.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'State the three withdrawals (leakages) from the circular flow of income.',
        ...points([{ name: 'Correctly naming savings, taxation, and imports', marks: 2 }]),
        answerStructureAdvice: 'All three (savings, taxation, imports) are needed for full marks.' },
      { markTariff: 4, requiresDiagram: true,
        questionText: 'Explain what happens to national income if injections into the circular flow exceed withdrawals.',
        ...band4(
          'Clearly identifies that national income will rise and precisely explains the mechanism (more spending flowing round the economy than is leaking out).',
          'Identifies that national income rises with a reasonably clear explanation.',
          'Makes a limited or unclear attempt to explain the effect.',
          'Makes only a very vague reference to injections or income with little real explanation.'
        ),
        answerStructureAdvice: 'Explain the DIRECTION of change and briefly WHY (more new spending entering than leaking out).' },
      { markTariff: 9, requiresDiagram: true,
        questionText: 'Using a diagram, explain the conditions needed for national income to be in equilibrium in the circular flow model.',
        ...levels([
          { level: 3, marks: '7-9', descriptor: 'Well organised, develops the issue with sound knowledge and understanding, good application, well-focused analysis with a clear chain of reasoning, and an accurate, appropriately-used diagram.' },
          { level: 2, marks: '4-6', descriptor: 'Reasonable knowledge and application with some analysis that might not be fully developed; may include a relevant diagram.' },
          { level: 1, marks: '1-3', descriptor: 'Limited knowledge and very limited application; a diagram, if included, is not used well or is inaccurate.' },
        ]),
        answerStructureAdvice: 'State the equilibrium condition explicitly (injections = withdrawals) then explain what happens when they diverge.' },
    ],
  },
  {
    subtopic: T422, concept: 'Aggregate demand and aggregate supply analysis',
    questions: [
      { markTariff: 1, requiresDiagram: true,
        questionText: 'Aggregate demand (AD) is defined as:\nA. The total output an economy can produce at full employment\nB. The total planned spending on goods and services produced within an economy\nC. The total value of a country\'s exports\nD. The total tax revenue collected by government',
        ...mc(['A','B','C','D'], 1, 'AD = C + I + G + (X - M): the total planned spending by all sectors of the economy on domestically produced goods and services.'),
        answerStructureAdvice: 'Learn the AD formula (C+I+G+(X-M)) to recall the definition precisely.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'State the four components of aggregate demand.',
        ...points([{ name: 'Naming all four components: consumption, investment, government spending, net trade', marks: 2 }]),
        answerStructureAdvice: 'All four (C, I, G, X-M) must be named for full marks.' },
      { markTariff: 4, requiresDiagram: true,
        questionText: 'Explain why the aggregate demand curve slopes downwards.',
        ...band4(
          'Correctly identifies at least one relevant mechanism (e.g. the real balance effect, interest rate effect, or international trade effect) and precisely links a lower price level to higher AD.',
          'Identifies a relevant mechanism with a reasonably clear explanation.',
          'Makes a limited or unclear attempt to explain the downward slope.',
          'Makes only a very vague reference to prices or demand with little real explanation.'
        ),
        answerStructureAdvice: 'The AD curve\'s slope comes from whole-economy effects (real balances, interest rates, trade), not from individual demand-curve reasoning.' },
      { markTariff: 9, requiresDiagram: true,
        questionText: 'Using a diagram, explain how equilibrium national output is determined using aggregate demand and aggregate supply analysis.',
        ...levels([
          { level: 3, marks: '7-9', descriptor: 'Well organised, develops the issue with sound knowledge and understanding, good application, well-focused analysis with a clear chain of reasoning, and an accurate, appropriately-used diagram.' },
          { level: 2, marks: '4-6', descriptor: 'Reasonable knowledge and application with some analysis that might not be fully developed; may include a relevant diagram.' },
          { level: 1, marks: '1-3', descriptor: 'Limited knowledge and very limited application; a diagram, if included, is not used well or is inaccurate.' },
        ]),
        answerStructureAdvice: 'Show AD and AS intersecting to determine equilibrium price level and output, and explain what happens if one curve shifts.' },
    ],
  },
  {
    subtopic: T422, concept: 'The determinants of aggregate demand',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'Which of the following would most directly cause a rightward shift of the aggregate demand curve?\nA. A rise in the general price level\nB. A cut in income tax rates\nC. A rise in interest rates\nD. A fall in government spending',
        ...mc(['A','B','C','D'], 2, 'A cut in income tax leaves households with more disposable income, boosting consumption and shifting AD to the right. The price level moving is a movement ALONG the curve, not a shift.'),
        answerStructureAdvice: 'A change in the price level moves ALONG the AD curve; changes in C, I, G, or X-M SHIFT it.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'State two determinants of the level of consumption in an economy.',
        ...points([{ name: 'Correctly named determinant (e.g. disposable income, interest rates, consumer confidence, wealth)', marks: 1 }, { name: 'A second, different correctly named determinant', marks: 1 }]),
        answerStructureAdvice: 'One mark per genuine, distinct determinant.' },
      { markTariff: 4, requiresDiagram: true,
        questionText: 'The central bank raises interest rates significantly. Explain the likely effect on aggregate demand.',
        ...band4(
          'Clearly identifies falls in both consumption and investment as borrowing becomes more expensive, precisely explaining the resulting leftward shift of AD.',
          'Identifies a fall in AD with a reasonably clear explanation of at least one channel (consumption or investment).',
          'Makes a limited or unclear attempt to explain the effect.',
          'Makes only a very vague reference to interest rates or demand with little real explanation.'
        ),
        answerStructureAdvice: 'Trace the chain through BOTH consumption (costlier borrowing/mortgages) and investment (costlier business loans) for full marks.' },
      { markTariff: 15, requiresDiagram: true,
        questionText: 'Explain the factors that determine the level of business investment in an economy.',
        ...levels([
          { level: 3, marks: '11-15', descriptor: 'Well organised, develops a selection of relevant issues (e.g. interest rates, business confidence, the accelerator effect) with sound knowledge, good application, and clear, well-focused chains of reasoning.' },
          { level: 2, marks: '6-10', descriptor: 'Focuses on relevant issues with satisfactory knowledge and reasonable application, but analysis may not be fully developed.' },
          { level: 1, marks: '1-5', descriptor: 'Has identified one or more relevant issues with limited knowledge and very limited application.' },
        ]),
        answerStructureAdvice: 'Cover more than one genuine determinant (e.g. interest rates AND business confidence/the accelerator) for a top-band answer.' },
    ],
  },
  {
    subtopic: T422, concept: 'Aggregate demand and the level of economic activity',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'The multiplier effect describes how:\nA. An initial change in injections leads to a smaller final change in national income\nB. An initial change in injections leads to a larger final change in national income\nC. Taxation always reduces the multiplier to zero\nD. Imports increase the size of the multiplier',
        ...mc(['A','B','C','D'], 1, 'The multiplier shows that an initial injection causes successive rounds of extra spending and income, so the final change in national income is LARGER than the initial injection.'),
        answerStructureAdvice: 'The multiplier makes the final effect BIGGER than the initial injection.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'A government injects £10 million of new spending into the economy, and the multiplier is 2. Calculate the total final change in national income.',
        ...points([{ name: 'Correct answer of £20 million shown with correct method (initial injection × multiplier)', marks: 2 }]),
        answerStructureAdvice: 'Final change = initial injection × multiplier = £10m × 2 = £20m.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'An economy has a high marginal propensity to import. Explain why the size of its multiplier is likely to be relatively small.',
        ...band4(
          'Correctly identifies that a high propensity to import raises the marginal propensity to withdraw, precisely explaining why this shrinks the multiplier (1/MPW).',
          'Identifies the link between imports and a smaller multiplier with a reasonably clear explanation.',
          'Makes a limited or unclear attempt to explain the effect.',
          'Makes only a very vague reference to imports or the multiplier with little real explanation.'
        ),
        answerStructureAdvice: 'Use the formula (multiplier = 1/MPW) to explain precisely why more leaking out abroad each round shrinks the multiplier.' },
      { markTariff: 9, requiresDiagram: false,
        questionText: 'Explain how the multiplier effect might influence the size of a government\'s fiscal stimulus package during a recession.',
        ...levels([
          { level: 3, marks: '7-9', descriptor: 'Well organised, develops the issue with sound knowledge and understanding, good application, and a clear chain of reasoning.' },
          { level: 2, marks: '4-6', descriptor: 'Reasonable knowledge and application, but the analysis may not be fully developed or becomes confused in places.' },
          { level: 1, marks: '1-3', descriptor: 'Limited knowledge and very limited application, with analysis that lacks focus.' },
        ]),
        answerStructureAdvice: 'Explain that a larger multiplier means a smaller initial stimulus is needed to achieve a given rise in national income, and vice versa.' },
    ],
  },
  {
    subtopic: T422, concept: 'Determinants of short-run aggregate supply',
    questions: [
      { markTariff: 1, requiresDiagram: true,
        questionText: 'The short-run aggregate supply (SRAS) curve slopes upwards mainly because:\nA. Consumer confidence always rises with prices\nB. With costs fixed in the short run, a higher price level raises firms\' profitability and incentive to produce more\nC. The exchange rate appreciates as prices rise\nD. Wages always rise faster than prices',
        ...mc(['A','B','C','D'], 1, 'In the short run, wages and input costs are relatively fixed, so a higher price level raises firms\' profit margins and encourages more output.'),
        answerStructureAdvice: 'The short-run slope is about STICKY COSTS (especially wages) not adjusting as fast as prices.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'State two factors that could cause a leftward shift of short-run aggregate supply.',
        ...points([{ name: 'Correctly named factor (e.g. rising raw material costs, rising wages, a weaker exchange rate raising import costs)', marks: 1 }, { name: 'A second, different correctly named factor', marks: 1 }]),
        answerStructureAdvice: 'One mark per genuine, distinct cost-side factor.' },
      { markTariff: 4, requiresDiagram: true,
        questionText: 'The price of imported oil rises sharply. Explain the likely effect on short-run aggregate supply.',
        ...band4(
          'Clearly identifies rising production costs for firms reliant on oil and precisely explains the resulting leftward shift of SRAS.',
          'Identifies the leftward shift with a reasonably clear explanation.',
          'Makes a limited or unclear attempt to explain the effect.',
          'Makes only a very vague reference to oil or supply with little real explanation.'
        ),
        answerStructureAdvice: 'Trace the chain through rising costs to reduced profitability at each price level to less output supplied.' },
      { markTariff: 9, requiresDiagram: true,
        questionText: 'Using a diagram, explain the impact of a fall in the exchange rate on a country\'s short-run aggregate supply.',
        ...levels([
          { level: 3, marks: '7-9', descriptor: 'Well organised, develops the issue with sound knowledge and understanding, good application, well-focused analysis with a clear chain of reasoning, and an accurate, appropriately-used diagram.' },
          { level: 2, marks: '4-6', descriptor: 'Reasonable knowledge and application with some analysis that might not be fully developed; may include a relevant diagram.' },
          { level: 1, marks: '1-3', descriptor: 'Limited knowledge and very limited application; a diagram, if included, is not used well or is inaccurate.' },
        ]),
        answerStructureAdvice: 'The link runs through the COST of imported inputs rising - keep this separate from any AD-side effects of the exchange rate.' },
    ],
  },
  {
    subtopic: T422, concept: 'Determinants of long-run aggregate supply',
    questions: [
      { markTariff: 1, requiresDiagram: true,
        questionText: 'In the classical view, the long-run aggregate supply (LRAS) curve is:\nA. Upward sloping\nB. Downward sloping\nC. Vertical at the full employment (potential) level of output\nD. Horizontal',
        ...mc(['A','B','C','D'], 3, 'The classical LRAS curve is vertical at potential output, reflecting the view that in the long run output is determined by the quantity/quality of factors of production, not the price level.'),
        answerStructureAdvice: 'Classical LRAS = vertical, at potential output.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'State two factors that could cause a rightward shift in long-run aggregate supply.',
        ...points([{ name: 'Correctly named factor (e.g. improved technology, net migration of working-age people, investment in education)', marks: 1 }, { name: 'A second, different correctly named factor', marks: 1 }]),
        answerStructureAdvice: 'One mark per genuine, distinct factor raising productive capacity.' },
      { markTariff: 4, requiresDiagram: true,
        questionText: 'A government significantly increases spending on infrastructure and education. Explain the likely long-run effect on the economy\'s productive capacity.',
        ...band4(
          'Clearly identifies a rightward shift in LRAS and precisely explains how improved infrastructure and human capital raise potential output.',
          'Identifies the rightward shift with a reasonably clear explanation.',
          'Makes a limited or unclear attempt to link the spending to LRAS.',
          'Makes only a very vague reference to spending or capacity with little real explanation.'
        ),
        answerStructureAdvice: 'Link BOTH infrastructure and education spending explicitly to higher productive capacity.' },
      { markTariff: 15, requiresDiagram: true,
        questionText: 'Explain the extent to which supply-side policies can increase a country\'s long-run aggregate supply.',
        ...levels([
          { level: 3, marks: '11-15', descriptor: 'Well organised, develops a selection of relevant issues (e.g. education/training, deregulation, infrastructure investment) with sound knowledge, good application, and clear, well-focused chains of reasoning.' },
          { level: 2, marks: '6-10', descriptor: 'Focuses on relevant issues with satisfactory knowledge and reasonable application, but analysis may not be fully developed.' },
          { level: 1, marks: '1-5', descriptor: 'Has identified one or more relevant issues with limited knowledge and very limited application.' },
        ]),
        answerStructureAdvice: 'Cover more than one supply-side policy for a top-band answer - no evaluation required at this tariff.' },
    ],
  },
  // ───────────────────────── 4.2.3 Economic performance ─────────────────────────
  {
    subtopic: T423, concept: 'Economic growth and the economic cycle',
    questions: [
      { markTariff: 1, requiresDiagram: true,
        questionText: 'A recession is technically defined as:\nA. Any fall in the rate of inflation\nB. A fall in real GDP over two or more consecutive quarters\nC. A rise in the unemployment rate\nD. A fall in the exchange rate',
        ...mc(['A','B','C','D'], 2, 'A recession requires real GDP to fall for at least two consecutive quarters (six months) - not just one quarter, and not simply a slowdown in growth.'),
        answerStructureAdvice: 'Both parts of the technical definition (falling GDP, for at least two consecutive quarters) are needed.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain the difference between actual and potential economic growth.',
        ...points([{ name: 'Definition of actual growth (rise in real GDP, using existing spare capacity)', marks: 1 }, { name: 'Definition of potential growth (a rise in the economy\'s productive capacity)', marks: 1 }]),
        answerStructureAdvice: 'Actual = using what capacity already exists; potential = the capacity itself growing.' },
      { markTariff: 4, requiresDiagram: true,
        questionText: 'An economy is currently producing below its full potential output. Explain how a rise in aggregate demand could lead to a rise in actual economic growth without necessarily causing inflation.',
        ...band4(
          'Clearly identifies the spare capacity (negative output gap) and precisely explains why output can rise without significant upward pressure on the price level.',
          'Identifies spare capacity as relevant with a reasonably clear explanation.',
          'Makes a limited or unclear attempt to link the scenario to non-inflationary growth.',
          'Makes only a very vague reference to demand or growth with little real explanation.'
        ),
        answerStructureAdvice: 'Name the negative output gap/spare capacity explicitly and link it to the SRAS curve being relatively flat below full capacity.' },
      { markTariff: 15, requiresDiagram: true,
        questionText: 'Explain the possible causes of the economic (trade/business) cycle.',
        ...levels([
          { level: 3, marks: '11-15', descriptor: 'Well organised, develops a selection of relevant issues (e.g. changes in confidence, the multiplier/accelerator interaction, external shocks) with sound knowledge, good application, and clear, well-focused chains of reasoning.' },
          { level: 2, marks: '6-10', descriptor: 'Focuses on relevant issues with satisfactory knowledge and reasonable application, but analysis may not be fully developed.' },
          { level: 1, marks: '1-5', descriptor: 'Has identified one or more relevant issues with limited knowledge and very limited application.' },
        ]),
        answerStructureAdvice: 'Cover more than one genuine cause of the cycle (e.g. confidence changes AND external shocks) for a top-band answer.' },
    ],
  },
  {
    subtopic: T423, concept: 'Employment and unemployment',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'Structural unemployment is caused by:\nA. The normal ups and downs of the economic cycle\nB. A long-term decline in demand for a particular industry\'s skills\nC. Workers voluntarily searching for a better job\nD. Seasonal changes in demand for labour',
        ...mc(['A','B','C','D'], 2, 'Structural unemployment arises when workers\' skills no longer match available jobs, often due to long-term industrial decline - not cyclical, seasonal, or frictional factors.'),
        answerStructureAdvice: 'Structural = a lasting MISMATCH between skills and available jobs.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'State two measures used to calculate the rate of unemployment in the UK.',
        ...points([{ name: 'Correctly named measure (e.g. the claimant count, the Labour Force Survey/ILO measure)', marks: 1 }, { name: 'A second, different correctly named measure', marks: 1 }]),
        answerStructureAdvice: 'One mark per correctly named measure.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'A traditional manufacturing industry in a region closes down permanently due to foreign competition. Explain why this is likely to cause structural unemployment.',
        ...band4(
          'Clearly identifies the mismatch between workers\' existing skills and the requirements of other available jobs, precisely explaining the resulting long-term unemployment.',
          'Identifies the skills mismatch with a reasonably clear explanation.',
          'Makes a limited or unclear attempt to link the closure to unemployment.',
          'Makes only a very vague reference to the industry or jobs with little real explanation.'
        ),
        answerStructureAdvice: 'Focus specifically on the SKILLS MISMATCH, not just "jobs were lost" - that\'s what makes it structural rather than another type.' },
      { markTariff: 9, requiresDiagram: false,
        questionText: 'Explain the economic costs of a rise in structural unemployment.',
        ...levels([
          { level: 3, marks: '7-9', descriptor: 'Well organised, develops one or more relevant issues (e.g. lost output, fiscal cost, regional deprivation) with sound knowledge, good application, and a clear chain of reasoning.' },
          { level: 2, marks: '4-6', descriptor: 'Includes a relevant issue with reasonable knowledge and application, but analysis may not be fully developed.' },
          { level: 1, marks: '1-3', descriptor: 'A brief or weak response with limited knowledge and very limited application.' },
        ]),
        answerStructureAdvice: 'Distinguish between costs to the individual, the government (benefits paid, tax lost), and the wider economy (lost output) - developing one fully is enough.' },
    ],
  },
  {
    subtopic: T423, concept: 'Inflation and deflation',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'The Consumer Prices Index (CPI) measures:\nA. The rate of unemployment\nB. The change in the average price level of a representative basket of goods and services\nC. The value of total exports\nD. The exchange rate against the US dollar',
        ...mc(['A','B','C','D'], 2, 'CPI tracks how the price of a fixed, representative "basket" of household goods and services changes over time.'),
        answerStructureAdvice: 'CPI is about the AVERAGE price level of a basket, not any single price.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain the difference between demand-pull and cost-push inflation.',
        ...points([{ name: 'Definition of demand-pull inflation (caused by AD rising faster than AS)', marks: 1 }, { name: 'Definition of cost-push inflation (caused by rising production costs shifting AS left)', marks: 1 }]),
        answerStructureAdvice: 'A precise, textbook-accurate definition of each is enough for full marks.' },
      { markTariff: 4, requiresDiagram: true,
        questionText: 'A sudden rise in global energy prices pushes up firms\' costs across many industries. Explain what type of inflation this is likely to cause.',
        ...band4(
          'Correctly identifies cost-push inflation and precisely explains the chain from rising costs to a leftward shift of SRAS and a higher price level.',
          'Identifies cost-push inflation with a reasonably clear explanation.',
          'Makes a limited or unclear attempt to classify the type of inflation.',
          'Makes only a very vague reference to prices or energy with little real explanation.'
        ),
        answerStructureAdvice: 'Name the inflation type (cost-push) precisely and trace the SRAS-shift mechanism.' },
      { markTariff: 25, requiresDiagram: true,
        questionText: 'Evaluate the view that deflation is always more damaging to an economy than inflation.',
        ...levels([
          { level: 5, marks: '21-25', descriptor: 'Sound, focused analysis and well-supported evaluation: well organised, sound knowledge with few if any errors, good application, well-focused analysis with clear chains of reasoning, and supported evaluation throughout leading to a final conclusion.' },
          { level: 4, marks: '16-20', descriptor: 'Sound, focused analysis and some supported evaluation, with good application and some reasonable, supported evaluation.' },
          { level: 3, marks: '11-15', descriptor: 'Some reasonable analysis but generally unsupported evaluation; satisfactory knowledge and reasonable application, but evaluation is fairly superficial.' },
          { level: 2, marks: '6-10', descriptor: 'A fairly weak response with some understanding; limited knowledge and application, limited and unsupported evaluation.' },
          { level: 1, marks: '1-5', descriptor: 'A very weak response with little relevant knowledge, weak application, and weak, unsupported attempted analysis.' },
        ]),
        answerStructureAdvice: 'Challenge "always" - distinguish demand-deficient deflation (damaging) from deflation caused by falling costs/improved productivity (potentially benign) before your judgement.' },
    ],
  },
  {
    subtopic: T423, concept: 'Possible conflicts between macroeconomic policy objectives',
    questions: [
      { markTariff: 1, requiresDiagram: true,
        questionText: 'The short-run Phillips curve illustrates a trade-off between:\nA. Economic growth and the exchange rate\nB. Unemployment and inflation\nC. Taxation and government spending\nD. Exports and imports',
        ...mc(['A','B','C','D'], 1, 'The short-run Phillips curve shows that lower unemployment has historically tended to come with higher inflation, and vice versa.'),
        answerStructureAdvice: 'Phillips curve = unemployment vs. inflation, specifically.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain one possible conflict between the objective of economic growth and the objective of a satisfactory balance of payments.',
        ...points([{ name: 'Reference to rising domestic incomes from growth pulling in more imports', marks: 1 }, { name: 'Reference to this worsening the current account/balance of payments position', marks: 1 }]),
        answerStructureAdvice: 'Trace the chain briefly: growth → higher incomes → more imports bought → current account worsens.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'A government uses expansionary demand-side policy to reduce unemployment. Explain how this might conflict with the objective of low inflation.',
        ...band4(
          'Clearly identifies the resulting rise in AD reducing spare capacity and precisely explains the resulting demand-pull inflationary pressure.',
          'Identifies the resulting inflationary pressure with a reasonably clear explanation.',
          'Makes a limited or unclear attempt to explain the conflict.',
          'Makes only a very vague reference to unemployment or inflation with little real explanation.'
        ),
        answerStructureAdvice: 'Trace the Phillips-curve-style chain: expansionary policy → lower unemployment → less spare capacity → demand-pull inflation.' },
      { markTariff: 9, requiresDiagram: true,
        questionText: 'Using a diagram, explain how supply-side policy might help a government to achieve both low unemployment and low inflation simultaneously.',
        ...levels([
          { level: 3, marks: '7-9', descriptor: 'Well organised, develops the issue with sound knowledge and understanding, good application, well-focused analysis with a clear chain of reasoning, and an accurate, appropriately-used diagram.' },
          { level: 2, marks: '4-6', descriptor: 'Reasonable knowledge and application with some analysis that might not be fully developed; may include a relevant diagram.' },
          { level: 1, marks: '1-3', descriptor: 'Limited knowledge and very limited application; a diagram, if included, is not used well or is inaccurate.' },
        ]),
        answerStructureAdvice: 'Show LRAS shifting right, allowing unemployment to fall without the same inflationary pressure that demand-side policy alone would cause.' },
    ],
  },
];

function conceptIdFor(subtopic, concept) { return conceptId(subtopic, concept); }

async function main() {
  const rows = [];
  for (const group of QUESTIONS) {
    for (const q of group.questions) {
      rows.push({
        concept_id: conceptIdFor(group.subtopic, group.concept),
        subject: SUBJECT, topic: group.subtopic, concept: group.concept,
        qualification: QUALIFICATION, exam_board: EXAM_BOARD,
        question_text: q.questionText, mark_tariff: q.markTariff,
        requires_diagram: q.requiresDiagram, mark_scheme_type: q.markSchemeType,
        mark_scheme_json: q.markSchemeJson, answer_structure_advice: q.answerStructureAdvice,
      });
    }
  }

  const byConcept = new Map();
  for (const r of rows) byConcept.set(r.concept, (byConcept.get(r.concept) || 0) + 1);
  let shortfall = false;
  for (const [concept, count] of byConcept) {
    if (count < 4) { console.error(`SHORTFALL: "${concept}" only has ${count} questions`); shortfall = true; }
  }
  if (shortfall) process.exit(1);

  console.log(`Inserting ${rows.length} practice questions (AQA batch C: 4.2.1-4.2.3) across ${byConcept.size} concepts...`);
  const { error } = await supabase.from('practice_questions').insert(rows);
  if (error) { console.error('Insert failed:', JSON.stringify(error)); process.exit(1); }
  console.log('Done.');
}

main();
