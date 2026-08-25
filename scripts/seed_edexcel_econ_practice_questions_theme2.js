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

// Original content written for LastMind - no question is copied from a
// real Edexcel past paper. Mark scheme structures (points vs levels, AO
// weightings per tariff) reflect the REAL, researched Edexcel A-Level
// Economics A conventions (same ones used for 1.1-1.4); descriptor
// wording is written independently, not quoted from any Pearson document.

const mc = (options, correctIndex, explanation) => ({
  markSchemeType: 'multiple_choice',
  markSchemeJson: { options, correctIndex, explanation },
});
const points = (criteria) => ({
  markSchemeType: 'points',
  markSchemeJson: { criteria },
});
const levels = (levelsArr) => ({
  markSchemeType: 'levels',
  markSchemeJson: { levels: levelsArr },
});

const T21 = '2.1 Measures of economic performance';
const T22 = '2.2 Aggregate demand (AD)';
const T23 = '2.3 Aggregate supply (AS)';
const T24 = '2.4 National income';
const T25 = '2.5 Economic growth';
const T26 = '2.6 Macroeconomic objectives and policies';

const QUESTIONS = [
  // ───────────────────────── 2.1 Measures of economic performance ─────────────────────────
  {
    subtopic: T21, concept: 'Economic growth',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'Real GDP differs from nominal GDP because real GDP:\nA. Excludes government spending\nB. Is adjusted for inflation\nC. Only measures exports\nD. Ignores population size',
        ...mc(['A','B','C','D'], 1, 'Real GDP strips out the effect of price changes (inflation), so it measures the actual change in the volume of output, not just a rise in prices.'),
        answerStructureAdvice: 'Remember: "real" always means inflation has been removed from the figure.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain the difference between economic growth and economic development.',
        ...points([{ name: 'Definition of economic growth (rise in real GDP/output)', marks: 1 }, { name: 'Definition of economic development (broader rise in living standards/wellbeing, not just output)', marks: 1 }]),
        answerStructureAdvice: 'Growth is a narrow, quantitative measure; development is broader and includes quality-of-life factors - state both precisely.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Examine the reliability of real GDP as a measure of a country\'s living standards.',
        ...points([{ name: 'Knowledge of what real GDP measures', marks: 2 }, { name: 'Application - a specific limitation (e.g. income distribution, the informal economy)', marks: 2 }, { name: 'Analysis - a chain of reasoning showing why this limits reliability', marks: 2 }, { name: 'Evaluation - weighing how serious the limitation is', marks: 2 }]),
        answerStructureAdvice: 'Develop ONE limitation in depth (e.g. GDP says nothing about how income is distributed) rather than listing several briefly.' },
      { markTariff: 15, requiresDiagram: false,
        questionText: 'Discuss the extent to which GDP growth should remain the primary objective of UK economic policy.',
        ...levels([
          { level: 1, marks: '1-5', descriptor: 'Basic, undeveloped points on GDP growth with little discussion of alternatives.' },
          { level: 2, marks: '6-10', descriptor: 'Developed knowledge and application with some analysis and a simple judgement.' },
          { level: 3, marks: '11-15', descriptor: 'Sustained chains of reasoning weighing GDP growth against at least one alternative objective (e.g. wellbeing, sustainability), leading to a balanced, well-supported judgement.' },
        ]),
        answerStructureAdvice: 'Name a genuine alternative or complementary objective (environmental sustainability, income equality) and weigh it directly against growth.' },
    ],
  },
  {
    subtopic: T21, concept: 'Inflation',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'The Consumer Prices Index (CPI) measures:\nA. The rate of unemployment\nB. The change in the average price level of a representative basket of goods and services\nC. The value of total exports\nD. The exchange rate against the US dollar',
        ...mc(['A','B','C','D'], 1, 'CPI tracks how the price of a fixed, representative "basket" of household goods and services changes over time, giving a measure of the general (average) price level.'),
        answerStructureAdvice: 'CPI is about the AVERAGE price level of a basket, not any single price.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'Using an example, distinguish between demand-pull and cost-push inflation.',
        ...points([{ name: 'Knowledge of demand-pull inflation (caused by excess demand/AD rising faster than AS)', marks: 1 }, { name: 'Knowledge of cost-push inflation (caused by rising costs of production shifting AS)', marks: 1 }, { name: 'Application - a real or plausible example of each', marks: 2 }]),
        answerStructureAdvice: 'Give one genuine example for EACH type - a demand-side cause (e.g. a consumer spending boom) and a supply-side cause (e.g. rising oil prices).' },
      { markTariff: 8, requiresDiagram: true,
        questionText: 'Examine the likely impact of a rise in the rate of inflation on a country\'s international competitiveness.',
        ...points([{ name: 'Knowledge of inflation and competitiveness', marks: 2 }, { name: 'Application to exports/imports', marks: 2 }, { name: 'Analysis - a chain of reasoning to a fall in competitiveness', marks: 2 }, { name: 'Evaluation - weighing whether the exchange rate offsets this', marks: 2 }]),
        answerStructureAdvice: 'A strong evaluation point is that a floating exchange rate can depreciate to offset higher relative inflation - mention this as a counter-argument.' },
      { markTariff: 12, requiresDiagram: false,
        questionText: 'Discuss the view that deflation is always more damaging to an economy than inflation.',
        ...levels([
          { level: 1, marks: '1-4', descriptor: 'Basic description of inflation and deflation with little real comparison.' },
          { level: 2, marks: '5-8', descriptor: 'Developed points comparing the two with some evaluation.' },
          { level: 3, marks: '9-12', descriptor: 'Sustained, well-developed discussion distinguishing "bad" (demand-deficient) from potentially benign deflation, with a clear, justified judgement on the word "always".' },
        ]),
        answerStructureAdvice: 'Challenge the word "always" - distinguish demand-deficient deflation (damaging) from deflation caused by falling costs/improved productivity (less damaging).' },
    ],
  },
  {
    subtopic: T21, concept: 'Employment and unemployment',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'Structural unemployment is caused by:\nA. The normal ups and downs of the trade cycle\nB. A long-term decline in demand for a particular industry\'s skills\nC. Workers voluntarily searching for a better job\nD. Seasonal changes in demand for labour',
        ...mc(['A','B','C','D'], 1, 'Structural unemployment arises when the skills of workers no longer match the jobs available, often due to long-term industrial decline (e.g. the decline of coal mining) - not short-term or seasonal factors.'),
        answerStructureAdvice: 'Structural = a lasting MISMATCH between skills and available jobs, not a temporary dip in demand.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by the \'claimant count\' measure of unemployment.',
        ...points([{ name: 'Reference to counting those claiming unemployment-related benefits', marks: 1 }, { name: 'Reference to it being narrower than the (survey-based) ILO/Labour Force Survey measure', marks: 1 }]),
        answerStructureAdvice: 'Two facts needed: what it counts, and how it compares to the other main measure.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Examine the economic costs of a rise in structural unemployment.',
        ...points([{ name: 'Knowledge of structural unemployment', marks: 2 }, { name: 'Application - a specific cost (e.g. lost output, fiscal cost, regional deprivation)', marks: 2 }, { name: 'Analysis - a chain of reasoning developing that cost', marks: 2 }, { name: 'Evaluation - weighing how significant the cost is', marks: 2 }]),
        answerStructureAdvice: 'Distinguish between costs to the individual, to the government (benefits paid, tax lost), and to the wider economy (lost output/hysteresis) - developing one fully is enough.' },
      { markTariff: 10, requiresDiagram: false,
        questionText: 'Assess the view that supply-side policies are the best way to reduce structural unemployment.',
        ...levels([
          { level: 1, marks: '1-3', descriptor: 'Isolated, undeveloped knowledge of supply-side policy.' },
          { level: 2, marks: '4-7', descriptor: 'Developed, applied points with some analysis and a simple assessment against an alternative.' },
          { level: 3, marks: '8-10', descriptor: 'Sustained, well-applied analysis comparing supply-side policy against a genuine alternative (e.g. demand-side stimulus), with a substantiated judgement.' },
        ]),
        answerStructureAdvice: 'Name a specific supply-side policy (retraining schemes, education spending) and weigh it against why demand-side policy alone wouldn\'t fix a skills mismatch.' },
    ],
  },
  {
    subtopic: T21, concept: 'Balance of payments',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'A current account deficit means that:\nA. Exports of goods and services exceed imports\nB. Imports of goods and services (plus net income/transfers) exceed exports\nC. The government is running a budget surplus\nD. The exchange rate is fixed',
        ...mc(['A','B','C','D'], 1, 'A current account deficit means more money is flowing out of the country (via imports, income paid abroad, and transfers) than flowing in from exports and income received - the reverse of a surplus.'),
        answerStructureAdvice: 'Don\'t confuse the current account (trade/income) with the government\'s budget position - they are entirely different balances.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'Using an example, explain one cause of a current account deficit.',
        ...points([{ name: 'Knowledge of a cause (e.g. low international competitiveness, strong domestic demand for imports)', marks: 1 }, { name: 'Application to a specific country/scenario', marks: 1 }, { name: 'Analysis - a chain of reasoning from the cause to a growing deficit', marks: 2 }]),
        answerStructureAdvice: 'Follow the chain all the way to the deficit itself - don\'t stop at just naming the cause.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Examine the possible consequences of a persistent current account deficit for the UK economy.',
        ...points([{ name: 'Knowledge of the current account', marks: 2 }, { name: 'Application to the UK', marks: 2 }, { name: 'Analysis - a chain of reasoning to a specific consequence (e.g. currency depreciation, rising external debt)', marks: 2 }, { name: 'Evaluation - weighing how serious this consequence actually is', marks: 2 }]),
        answerStructureAdvice: 'A good evaluation point is that a deficit financed by strong capital inflows (investment) may be far less concerning than one financed by borrowing.' },
      { markTariff: 25, requiresDiagram: false,
        questionText: 'Evaluate the view that a current account deficit is always a sign of a weak economy.',
        ...levels([
          { level: 1, marks: '1-6', descriptor: 'Generic knowledge of the current account with little application.' },
          { level: 2, marks: '7-12', descriptor: 'Developed application to at least one cause/consequence with some analysis.' },
          { level: 3, marks: '13-18', descriptor: 'Sustained analysis across multiple angles (causes, consequences, how it is financed) with clear chains of reasoning.' },
          { level: 4, marks: '19-25', descriptor: 'Consistently well-developed, applied analysis leading to a fully justified conclusion that directly challenges or supports the word "always".' },
        ]),
        answerStructureAdvice: 'Directly engage with "always" - a deficit driven by strong consumer confidence and investment inflows can coexist with (or even reflect) a strong economy.' },
    ],
  },
  // ───────────────────────── 2.2 Aggregate demand (AD) ─────────────────────────
  {
    subtopic: T22, concept: 'Characteristics of aggregate demand',
    questions: [
      { markTariff: 1, requiresDiagram: true,
        questionText: 'Aggregate demand (AD) is defined as:\nA. The total output an economy can produce at full employment\nB. The total planned spending on goods and services produced within an economy\nC. The total value of a country\'s exports\nD. The total tax revenue collected by government',
        ...mc(['A','B','C','D'], 1, 'AD = C + I + G + (X - M): the total planned spending by all sectors of the economy on domestically produced goods and services.'),
        answerStructureAdvice: 'Learn the AD formula (C+I+G+(X-M)) - it\'s the fastest way to recall the definition precisely.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'State the components of aggregate demand.',
        ...points([{ name: 'Naming all four components: consumption, investment, government spending, net trade', marks: 2 }]),
        answerStructureAdvice: 'All four components (C, I, G, X-M) must be named for full marks - missing one loses a mark.' },
      { markTariff: 8, requiresDiagram: true,
        questionText: 'Examine why the aggregate demand curve slopes downwards.',
        ...points([{ name: 'Knowledge of the AD curve', marks: 2 }, { name: 'Application - naming a real-balance, interest rate, or international trade effect', marks: 2 }, { name: 'Analysis - a chain of reasoning from a fall in the price level to higher AD', marks: 2 }, { name: 'Evaluation - weighing which effect is most significant', marks: 2 }]),
        answerStructureAdvice: 'The AD curve\'s downward slope is NOT about individual demand curves - it comes from real-balance, interest-rate, and trade effects at the whole-economy price level.' },
      { markTariff: 12, requiresDiagram: true,
        questionText: 'Discuss the extent to which a fall in interest rates is likely to increase aggregate demand.',
        ...levels([
          { level: 1, marks: '1-4', descriptor: 'Basic description of interest rates and AD with little real discussion of limits.' },
          { level: 2, marks: '5-8', descriptor: 'Developed points on the transmission mechanism with some evaluation.' },
          { level: 3, marks: '9-12', descriptor: 'Sustained, well-developed discussion of the transmission mechanism (consumption, investment, exchange rate) with a clear judgement on its limits (e.g. low consumer confidence).' },
        ]),
        answerStructureAdvice: 'Trace the FULL transmission mechanism (lower rates → cheaper borrowing → higher C and I → higher AD) and then challenge it with a limiting factor like low confidence or a liquidity trap.' },
    ],
  },
  {
    subtopic: T22, concept: 'Consumption',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'The marginal propensity to consume (MPC) is defined as:\nA. The proportion of total income spent on consumption\nB. The proportion of any EXTRA income that is spent rather than saved\nC. The total level of consumer spending in the economy\nD. The interest rate on consumer credit',
        ...mc(['A','B','C','D'], 1, 'MPC specifically measures the proportion of an ADDITIONAL (extra) pound of income that gets spent, not the average proportion of total income spent.'),
        answerStructureAdvice: 'MPC is about the MARGIN (extra income), not the average - a common exam mix-up.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'Using an example, explain how a rise in consumer confidence might affect the level of consumption.',
        ...points([{ name: 'Knowledge of consumer confidence as a determinant of consumption', marks: 1 }, { name: 'Application - a real or plausible trigger for rising confidence', marks: 1 }, { name: 'Analysis - a chain of reasoning from confidence to higher spending (possibly via reduced saving/higher borrowing)', marks: 2 }]),
        answerStructureAdvice: 'A full chain goes: trigger → higher confidence → households save less/borrow more → consumption rises.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Examine the impact of rising household debt on the level of consumption in an economy.',
        ...points([{ name: 'Knowledge of the relationship between debt and consumption', marks: 2 }, { name: 'Application to a real or plausible scenario', marks: 2 }, { name: 'Analysis - a chain of reasoning on both the short-run boost and longer-run constraint', marks: 2 }, { name: 'Evaluation - weighing the short-run effect against the long-run risk', marks: 2 }]),
        answerStructureAdvice: 'A strong answer shows BOTH sides: debt can boost consumption short-run, but higher repayments constrain it later - weighing this tension is the evaluation.' },
      { markTariff: 15, requiresDiagram: false,
        questionText: 'Discuss the extent to which changes in the housing market affect the level of consumption in the UK economy.',
        ...levels([
          { level: 1, marks: '1-5', descriptor: 'Basic, undeveloped points on the wealth effect with little application.' },
          { level: 2, marks: '6-10', descriptor: 'Developed knowledge and application of the housing wealth effect with some analysis and a simple judgement.' },
          { level: 3, marks: '11-15', descriptor: 'Sustained chains of reasoning covering the wealth effect and at least one other channel (e.g. mortgage equity withdrawal, confidence), leading to a balanced judgement.' },
        ]),
        answerStructureAdvice: 'Cover more than the wealth effect alone - mortgage equity withdrawal and confidence effects give you a second, genuinely distinct channel to develop.' },
    ],
  },
  {
    subtopic: T22, concept: 'Investment',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'The accelerator theory of investment states that the level of investment depends primarily on:\nA. The rate of interest alone\nB. The rate of change of national income/output\nC. The level of government spending\nD. The exchange rate',
        ...mc(['A','B','C','D'], 1, 'The accelerator theory links investment to the RATE OF CHANGE (growth) of output/demand, not just its absolute level - firms invest to expand capacity when demand is growing.'),
        answerStructureAdvice: 'Accelerator = driven by the RATE OF CHANGE of output, not its level - that\'s the distinguishing idea.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by \'business confidence\' as a determinant of investment.',
        ...points([{ name: 'Reference to firms\' expectations of future demand/profitability', marks: 1 }, { name: 'Reference to higher confidence increasing planned investment', marks: 1 }]),
        answerStructureAdvice: 'Confidence is about EXPECTATIONS of the future, not current conditions - make that link explicit.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Examine the likely impact of a cut in corporation tax on the level of business investment.',
        ...points([{ name: 'Knowledge of corporation tax and retained profit', marks: 2 }, { name: 'Application to a real or plausible firm/sector', marks: 2 }, { name: 'Analysis - a chain of reasoning from higher retained profit to more investment', marks: 2 }, { name: 'Evaluation - weighing whether firms actually invest the extra profit', marks: 2 }]),
        answerStructureAdvice: 'A key evaluation point: a tax cut raises the ABILITY to invest, but firms only invest if confidence/expected demand also supports it.' },
      { markTariff: 10, requiresDiagram: false,
        questionText: 'Assess the view that low interest rates are the most important determinant of business investment.',
        ...levels([
          { level: 1, marks: '1-3', descriptor: 'Isolated, undeveloped knowledge of interest rates and investment.' },
          { level: 2, marks: '4-7', descriptor: 'Developed, applied points on interest rates with some analysis and a simple assessment against at least one other determinant.' },
          { level: 3, marks: '8-10', descriptor: 'Sustained, well-applied analysis comparing interest rates against a genuine alternative determinant (e.g. business confidence, expected future demand), with a substantiated judgement.' },
        ]),
        answerStructureAdvice: 'Name a specific rival determinant (confidence, or expected demand via the accelerator) and directly compare its importance to interest rates.' },
    ],
  },
  {
    subtopic: T22, concept: 'Government expenditure',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'Which of the following is an example of government expenditure that counts directly in aggregate demand?\nA. A pension payment to a retired worker\nB. Spending on building a new hospital\nC. A jobseeker\'s allowance payment\nD. A student loan repayment received by government',
        ...mc(['A','B','C','D'], 1, 'Spending on building a hospital is spending on goods/services (part of G in AD). Pensions and benefits are transfer payments - money moved between groups with no corresponding output, so they are excluded from AD.'),
        answerStructureAdvice: 'The key distinction: transfer payments (pensions, benefits) do NOT count in G; spending on actual goods/services does.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'Using an example, explain the difference between government expenditure and a transfer payment.',
        ...points([{ name: 'Knowledge of government expenditure (spending on goods/services, counted in G)', marks: 1 }, { name: 'Knowledge of transfer payments (redistribution with no output, excluded from G)', marks: 1 }, { name: 'Application - a genuine example of each', marks: 2 }]),
        answerStructureAdvice: 'One example of each type (e.g. school building spending vs. a state pension) makes the distinction concrete.' },
      { markTariff: 8, requiresDiagram: true,
        questionText: 'Examine the impact of an increase in government expenditure on the level of aggregate demand.',
        ...points([{ name: 'Knowledge of G as a component of AD', marks: 2 }, { name: 'Application to a specific type of spending', marks: 2 }, { name: 'Analysis - a chain of reasoning including the multiplier effect', marks: 2 }, { name: 'Evaluation - weighing whether crowding out limits the impact', marks: 2 }]),
        answerStructureAdvice: 'Bring in the multiplier for analysis, and crowding out (private spending being displaced) as the evaluation counter-argument.' },
      { markTariff: 12, requiresDiagram: false,
        questionText: 'Discuss the extent to which increased government expenditure is an effective way to boost economic growth.',
        ...levels([
          { level: 1, marks: '1-4', descriptor: 'Basic description of G and growth with little real discussion of limits.' },
          { level: 2, marks: '5-8', descriptor: 'Developed points on the multiplier effect with some evaluation.' },
          { level: 3, marks: '9-12', descriptor: 'Sustained, well-developed discussion of the multiplier alongside genuine limits (crowding out, the size of any output gap, the national debt), with a clear judgement.' },
        ]),
        answerStructureAdvice: 'Effectiveness depends on the size of any output gap - link this explicitly: spending is more effective when there\'s spare capacity, less so near full employment.' },
    ],
  },
  {
    subtopic: T22, concept: 'Net trade',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'Net trade (X - M) is positive when:\nA. Imports exceed exports\nB. Exports exceed imports\nC. The exchange rate is fixed\nD. The government runs a budget deficit',
        ...mc(['A','B','C','D'], 1, 'Net trade is exports minus imports (X - M) - it is positive whenever a country sells more abroad than it buys in, adding to aggregate demand.'),
        answerStructureAdvice: 'Net trade is simply X minus M - get the sign right by remembering which one comes first.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain how a depreciation of a currency might affect net trade.',
        ...points([{ name: 'Reference to exports becoming cheaper for foreign buyers / imports becoming more expensive', marks: 1 }, { name: 'Reference to net trade improving (assuming demand is sufficiently price elastic)', marks: 1 }]),
        answerStructureAdvice: 'State the price effect first (cheaper exports, dearer imports), then the resulting change in net trade.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Examine the factors that might cause a fall in a country\'s net trade position.',
        ...points([{ name: 'Knowledge of a determinant of net trade (e.g. exchange rate, relative inflation, domestic income growth)', marks: 2 }, { name: 'Application to a real or plausible scenario', marks: 2 }, { name: 'Analysis - a chain of reasoning to a falling X-M', marks: 2 }, { name: 'Evaluation - weighing the significance of this factor relative to others', marks: 2 }]),
        answerStructureAdvice: 'Rising domestic incomes pulling in more imports is a strong, often-overlooked cause worth developing.' },
      { markTariff: 25, requiresDiagram: true,
        questionText: 'Evaluate the extent to which a depreciation of the pound would improve the UK\'s net trade position.',
        ...levels([
          { level: 1, marks: '1-6', descriptor: 'Generic knowledge of depreciation with little application to the UK.' },
          { level: 2, marks: '7-12', descriptor: 'Developed application with some analysis, referencing the Marshall-Lerner condition or J-curve at a basic level.' },
          { level: 3, marks: '13-18', descriptor: 'Sustained analysis incorporating the Marshall-Lerner condition and/or J-curve effect with clear chains of reasoning.' },
          { level: 4, marks: '19-25', descriptor: 'Consistently well-developed, applied analysis of both the short-run (J-curve) and long-run (Marshall-Lerner) effects with a fully justified, balanced conclusion.' },
        ]),
        answerStructureAdvice: 'A top answer explicitly separates the short-run J-curve effect (net trade can worsen before it improves) from the longer-run outcome, which depends on the Marshall-Lerner condition (combined PED for exports and imports exceeding 1).' },
    ],
  },
  // ───────────────────────── 2.3 Aggregate supply (AS) ─────────────────────────
  {
    subtopic: T23, concept: 'Characteristics of aggregate supply',
    questions: [
      { markTariff: 1, requiresDiagram: true,
        questionText: 'Aggregate supply (AS) represents:\nA. The total planned spending in an economy\nB. The total value of goods and services firms are willing and able to supply at each price level\nC. The total tax revenue collected by government\nD. The exchange rate of the domestic currency',
        ...mc(['A','B','C','D'], 1, 'AS shows the relationship between the general price level and the total output firms across the economy are willing and able to produce and sell.'),
        answerStructureAdvice: 'AS is the whole-economy equivalent of a firm\'s supply curve - output at each price level.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by the \'long-run aggregate supply\' (LRAS) curve.',
        ...points([{ name: 'Reference to LRAS representing the economy\'s productive capacity/potential output', marks: 1 }, { name: 'Reference to it being independent of the price level (in the classical model)', marks: 1 }]),
        answerStructureAdvice: 'LRAS is about the economy\'s CAPACITY, not current spending or prices - two separate facts are needed here.' },
      { markTariff: 8, requiresDiagram: true,
        questionText: 'Examine the factors that might cause a rightward shift in a country\'s long-run aggregate supply curve.',
        ...points([{ name: 'Knowledge of a cause of an LRAS shift', marks: 2 }, { name: 'Application to a real or plausible example', marks: 2 }, { name: 'Analysis - a chain of reasoning from the cause to higher productive capacity', marks: 2 }, { name: 'Evaluation - weighing how quickly or significantly this raises capacity', marks: 2 }]),
        answerStructureAdvice: 'Pick ONE cause (e.g. improved technology, net migration of working-age people, education/training) and develop the full chain to higher potential output.' },
      { markTariff: 12, requiresDiagram: true,
        questionText: 'Discuss the extent to which supply-side policies can increase a country\'s long-run aggregate supply.',
        ...levels([
          { level: 1, marks: '1-4', descriptor: 'Basic description of supply-side policy with little real discussion of limits.' },
          { level: 2, marks: '5-8', descriptor: 'Developed points on at least one policy with some evaluation.' },
          { level: 3, marks: '9-12', descriptor: 'Sustained, well-developed discussion of more than one policy with a clear judgement on time lags and effectiveness.' },
        ]),
        answerStructureAdvice: 'A key evaluation point is the TIME LAG - supply-side policies (e.g. education spending) often take years to raise LRAS, unlike a demand-side policy.' },
    ],
  },
  {
    subtopic: T23, concept: 'Short-run aggregate supply',
    questions: [
      { markTariff: 1, requiresDiagram: true,
        questionText: 'The short-run aggregate supply (SRAS) curve slopes upwards mainly because:\nA. Consumer confidence always rises with prices\nB. Higher prices, with costs fixed in the short run, raise firms\' profitability and incentive to produce more\nC. The exchange rate appreciates as prices rise\nD. Wages always rise faster than prices',
        ...mc(['A','B','C','D'], 1, 'In the short run, wages and other input costs are relatively fixed (sticky), so a higher price level raises firms\' profit margins and encourages more output - hence the upward slope.'),
        answerStructureAdvice: 'The short-run slope is all about STICKY COSTS (especially wages) not adjusting as fast as prices.' },
      { markTariff: 4, requiresDiagram: true,
        questionText: 'Using an example, explain how a rise in raw material costs might affect short-run aggregate supply.',
        ...points([{ name: 'Knowledge of SRAS and production costs', marks: 1 }, { name: 'Application - a real or plausible rise in a specific raw material cost (e.g. oil)', marks: 1 }, { name: 'Analysis - a chain of reasoning to a leftward shift in SRAS', marks: 2 }]),
        answerStructureAdvice: 'Trace it through: higher cost → lower profitability at each price level → firms supply less at each price level → SRAS shifts left.' },
      { markTariff: 8, requiresDiagram: true,
        questionText: 'Examine the impact of a fall in the exchange rate on a country\'s short-run aggregate supply.',
        ...points([{ name: 'Knowledge of the exchange rate and import costs', marks: 2 }, { name: 'Application to a specific imported input (e.g. imported raw materials/components)', marks: 2 }, { name: 'Analysis - a chain of reasoning to a leftward shift in SRAS', marks: 2 }, { name: 'Evaluation - weighing how significant this is given the openness of the economy', marks: 2 }]),
        answerStructureAdvice: 'The link runs through the COST of imported inputs rising, not through demand - keep SRAS (a supply-side, cost-driven curve) separate from AD effects.' },
      { markTariff: 10, requiresDiagram: true,
        questionText: 'Assess the view that rising energy costs pose the greatest threat to short-run aggregate supply in the UK.',
        ...levels([
          { level: 1, marks: '1-3', descriptor: 'Isolated, undeveloped knowledge of energy costs and SRAS.' },
          { level: 2, marks: '4-7', descriptor: 'Developed, applied points with some analysis and a simple assessment against another cost pressure.' },
          { level: 3, marks: '8-10', descriptor: 'Sustained, well-applied analysis comparing energy costs against a genuine alternative pressure (e.g. wage costs, import prices), with a substantiated judgement.' },
        ]),
        answerStructureAdvice: 'Name a specific rival cost pressure (wages, import prices) to genuinely compare against energy costs, rather than only discussing energy in isolation.' },
    ],
  },
  {
    subtopic: T23, concept: 'Long-run aggregate supply',
    questions: [
      { markTariff: 1, requiresDiagram: true,
        questionText: 'In the classical view, the long-run aggregate supply (LRAS) curve is drawn as:\nA. Upward sloping\nB. Downward sloping\nC. Vertical at the full employment (potential) level of output\nD. Horizontal',
        ...mc(['A','B','C','D'], 3, 'The classical LRAS curve is vertical at the economy\'s potential (full employment) output, reflecting the view that in the long run, output is determined by the quantity/quality of factors of production, not the price level.'),
        answerStructureAdvice: 'Classical LRAS = vertical, at potential output - the price level has no effect on it in the long run.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain one difference between the Keynesian and classical views of the long-run aggregate supply curve.',
        ...points([{ name: 'Reference to the classical LRAS being vertical at all output levels', marks: 1 }, { name: 'Reference to the Keynesian LRAS having a flatter/upward-sloping section below full employment (spare capacity)', marks: 1 }]),
        answerStructureAdvice: 'The key contrast is the SHAPE below full employment - Keynesians allow for output to expand without a rising price level when there is spare capacity.' },
      { markTariff: 8, requiresDiagram: true,
        questionText: 'Examine the Keynesian view of the long-run aggregate supply curve.',
        ...points([{ name: 'Knowledge of the Keynesian LRAS shape', marks: 2 }, { name: 'Application - describing the spare capacity/near-full-employment/full-employment sections', marks: 2 }, { name: 'Analysis - a chain of reasoning on why the curve behaves differently in each section', marks: 2 }, { name: 'Evaluation - weighing how realistic this is compared to the classical view', marks: 2 }]),
        answerStructureAdvice: 'Describe all three sections of the Keynesian LRAS (flat with spare capacity, upward sloping as capacity tightens, vertical at full employment) to earn the application marks.' },
      { markTariff: 15, requiresDiagram: true,
        questionText: 'Discuss the extent to which the classical or Keynesian view of aggregate supply better explains how a modern economy behaves.',
        ...levels([
          { level: 1, marks: '1-5', descriptor: 'Basic, undeveloped description of one model with little comparison.' },
          { level: 2, marks: '6-10', descriptor: 'Developed knowledge and application of both models with some analysis and a simple judgement.' },
          { level: 3, marks: '11-15', descriptor: 'Sustained chains of reasoning comparing both models against real economic behaviour (e.g. during a recession vs. at full capacity), leading to a balanced, well-supported judgement.' },
        ]),
        answerStructureAdvice: 'A strong answer argues the two models may both be "right" in different circumstances - Keynesian near spare capacity, classical near full employment - rather than picking one as universally correct.' },
    ],
  },
  // ───────────────────────── 2.4 National income ─────────────────────────
  {
    subtopic: T24, concept: 'National income and the circular flow',
    questions: [
      { markTariff: 1, requiresDiagram: true,
        questionText: 'In the circular flow of income model, households provide firms with:\nA. Goods and services\nB. Factors of production, in exchange for income\nC. Government spending\nD. Taxation revenue',
        ...mc(['A','B','C','D'], 1, 'Households supply factors of production (land, labour, capital, enterprise) to firms and receive income (wages, rent, interest, profit) in return; firms supply goods/services back to households.'),
        answerStructureAdvice: 'Households → factors of production → firms; firms → income → households: get the direction of each flow right.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by a \'leakage\' (withdrawal) from the circular flow of income.',
        ...points([{ name: 'Reference to income earned but not passed on as spending within the domestic economy', marks: 1 }, { name: 'Naming at least one leakage (savings, taxation, imports)', marks: 1 }]),
        answerStructureAdvice: 'Definition plus a named example (savings, taxation, or imports) gets both marks.' },
      { markTariff: 8, requiresDiagram: true,
        questionText: 'Examine the conditions needed for national income to be in equilibrium in the circular flow model.',
        ...points([{ name: 'Knowledge of injections and withdrawals', marks: 2 }, { name: 'Application - naming the three injections and three withdrawals', marks: 2 }, { name: 'Analysis - a chain of reasoning on what happens when they are unequal', marks: 2 }, { name: 'Evaluation - weighing how likely equilibrium is to be at full employment', marks: 2 }]),
        answerStructureAdvice: 'Equilibrium is where injections (I+G+X) equal withdrawals (S+T+M) - state this condition explicitly, then explain what happens when they diverge.' },
      { markTariff: 12, requiresDiagram: true,
        questionText: 'Discuss the usefulness of the circular flow of income model in explaining how a real economy works.',
        ...levels([
          { level: 1, marks: '1-4', descriptor: 'Basic description of the model with little real discussion of its limitations.' },
          { level: 2, marks: '5-8', descriptor: 'Developed points on its usefulness with some evaluation of simplifying assumptions.' },
          { level: 3, marks: '9-12', descriptor: 'Sustained, well-developed discussion of both its usefulness (illustrating injections/withdrawals) and its simplifications (e.g. ignoring the financial sector\'s complexity), with a clear judgement.' },
        ]),
        answerStructureAdvice: 'Name a specific simplification the model makes (e.g. it doesn\'t show HOW savings become investment via the financial sector) to earn real evaluation credit.' },
    ],
  },
  {
    subtopic: T24, concept: 'Injections and withdrawals',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'Which of the following is an injection into the circular flow of income?\nA. Household saving\nB. Government spending\nC. Import spending\nD. Taxation',
        ...mc(['A','B','C','D'], 1, 'Government spending adds new demand into the circular flow (an injection). Saving, imports, and taxation all remove spending from the domestic flow (withdrawals).'),
        answerStructureAdvice: 'Injections ADD spending (I, G, X); withdrawals REMOVE it (S, T, M) - learn the two lists.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'Using an example, explain why an increase in withdrawals might lead to a fall in national income.',
        ...points([{ name: 'Knowledge of withdrawals reducing domestic spending', marks: 1 }, { name: 'Application - a specific withdrawal (e.g. a rise in the savings rate)', marks: 1 }, { name: 'Analysis - a chain of reasoning to falling national income (possibly via the multiplier)', marks: 2 }]),
        answerStructureAdvice: 'Trace the chain: higher withdrawal → less spent within the domestic economy → firms produce less → national income falls.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Examine the impact of an increase in the savings ratio on the level of national income.',
        ...points([{ name: 'Knowledge of saving as a withdrawal', marks: 2 }, { name: 'Application to a real or plausible scenario', marks: 2 }, { name: 'Analysis - a chain of reasoning via the multiplier to a fall in national income', marks: 2 }, { name: 'Evaluation - weighing whether higher saving might instead support future investment/growth', marks: 2 }]),
        answerStructureAdvice: 'A strong evaluation point (the "paradox of thrift") is that while higher saving reduces income short-run, it can fund investment that raises income longer-run.' },
      { markTariff: 25, requiresDiagram: false,
        questionText: 'Evaluate the extent to which an increase in injections is always beneficial for an economy.',
        ...levels([
          { level: 1, marks: '1-6', descriptor: 'Generic knowledge of injections with little application.' },
          { level: 2, marks: '7-12', descriptor: 'Developed application to at least one injection with some analysis.' },
          { level: 3, marks: '13-18', descriptor: 'Sustained analysis across more than one injection with clear chains of reasoning on both benefits and risks (e.g. inflation, current account effects).' },
          { level: 4, marks: '19-25', descriptor: 'Consistently well-developed, applied analysis leading to a fully justified conclusion that directly addresses the word "always".' },
        ]),
        answerStructureAdvice: 'Directly challenge "always" - an injection that pushes the economy beyond full capacity can cause demand-pull inflation rather than pure benefit.' },
    ],
  },
  {
    subtopic: T24, concept: 'Equilibrium national output',
    questions: [
      { markTariff: 1, requiresDiagram: true,
        questionText: 'Equilibrium national output occurs where:\nA. Aggregate demand always equals potential output\nB. Aggregate demand equals aggregate supply\nC. Injections always exceed withdrawals\nD. The price level is zero',
        ...mc(['A','B','C','D'], 1, 'Equilibrium national output is where planned aggregate demand equals aggregate supply - there is no tendency for output to change, though this need not be at full employment.'),
        answerStructureAdvice: 'Equilibrium output is NOT the same as full-employment output - it\'s just wherever AD=AS currently sits.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by a \'deflationary (negative) output gap\'.',
        ...points([{ name: 'Reference to actual output being below potential/full-employment output', marks: 1 }, { name: 'Reference to spare capacity/unused resources existing as a result', marks: 1 }]),
        answerStructureAdvice: 'Two facts: WHERE actual output sits relative to potential, and WHAT that implies (spare capacity).' },
      { markTariff: 8, requiresDiagram: true,
        questionText: 'Examine how an economy might move from an equilibrium below full employment to one at full employment.',
        ...points([{ name: 'Knowledge of a deflationary output gap', marks: 2 }, { name: 'Application - naming a policy or shock that raises AD or AS', marks: 2 }, { name: 'Analysis - a chain of reasoning to output rising to the full-employment level', marks: 2 }, { name: 'Evaluation - weighing any risk (e.g. inflation) as the gap closes', marks: 2 }]),
        answerStructureAdvice: 'A good evaluation point is that as spare capacity is used up, further AD growth risks demand-pull inflation rather than more real output.' },
      { markTariff: 10, requiresDiagram: true,
        questionText: 'Assess the view that an economy will always self-correct back to its full-employment equilibrium.',
        ...levels([
          { level: 1, marks: '1-3', descriptor: 'Isolated, undeveloped knowledge of self-correction.' },
          { level: 2, marks: '4-7', descriptor: 'Developed, applied points on the classical self-correction mechanism with some analysis and a simple assessment.' },
          { level: 3, marks: '8-10', descriptor: 'Sustained, well-applied analysis contrasting the classical self-correction view with the Keynesian view that an economy can remain stuck below full employment, with a substantiated judgement.' },
        ]),
        answerStructureAdvice: 'This question is really classical vs. Keynesian in disguise - directly contrast automatic wage/price adjustment (classical) against sticky wages preventing this (Keynesian).' },
    ],
  },
  {
    subtopic: T24, concept: 'The multiplier',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'The multiplier effect describes how:\nA. An initial change in injections leads to a smaller final change in national income\nB. An initial change in injections leads to a larger final change in national income\nC. Taxation always reduces the multiplier to zero\nD. Imports increase the size of the multiplier',
        ...mc(['A','B','C','D'], 1, 'The multiplier shows that an initial injection (e.g. investment) causes successive rounds of extra spending and income, so the FINAL change in national income is LARGER than the initial injection.'),
        answerStructureAdvice: 'The multiplier makes the final effect BIGGER than the initial injection, via rounds of re-spending.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'Using the formula, explain how the size of the marginal propensity to withdraw (MPW) affects the size of the multiplier.',
        ...points([{ name: 'Knowledge of the multiplier formula (1/MPW)', marks: 1 }, { name: 'Application - stating that a smaller MPW means a larger multiplier', marks: 1 }, { name: 'Analysis - a chain of reasoning on why less leaking out means more re-spent each round', marks: 2 }]),
        answerStructureAdvice: 'State the formula (k = 1/MPW), then explain WHY a smaller MPW (less leaking into savings/tax/imports) means more of each round gets re-spent.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Examine why the size of the multiplier effect might be smaller in a very open economy than in a closed economy.',
        ...points([{ name: 'Knowledge of the multiplier and the MPW', marks: 2 }, { name: 'Application - a high marginal propensity to import in an open economy', marks: 2 }, { name: 'Analysis - a chain of reasoning from high MPM to a higher MPW and smaller multiplier', marks: 2 }, { name: 'Evaluation - weighing how significant this effect is for a real economy like the UK', marks: 2 }]),
        answerStructureAdvice: 'The chain is: open economy → high propensity to import → more of each round leaks abroad → higher MPW → smaller multiplier (1/MPW).' },
      { markTariff: 12, requiresDiagram: false,
        questionText: 'Discuss the extent to which the size of the multiplier effect determines the success of fiscal policy in boosting economic growth.',
        ...levels([
          { level: 1, marks: '1-4', descriptor: 'Basic description of the multiplier with little discussion of fiscal policy success more broadly.' },
          { level: 2, marks: '5-8', descriptor: 'Developed points linking the multiplier to fiscal policy outcomes with some evaluation.' },
          { level: 3, marks: '9-12', descriptor: 'Sustained, well-developed discussion of the multiplier alongside other genuine determinants (e.g. spare capacity, crowding out, time lags), with a clear judgement.' },
        ]),
        answerStructureAdvice: 'The multiplier is only one factor - bring in at least one other genuine determinant of fiscal policy success (the size of any output gap, or crowding out) to properly "discuss the extent".' },
    ],
  },
  // ───────────────────────── 2.5 Economic growth ─────────────────────────
  {
    subtopic: T25, concept: 'Causes of economic growth',
    questions: [
      { markTariff: 1, requiresDiagram: true,
        questionText: 'An increase in short-run (actual) economic growth is best illustrated on a PPF diagram by:\nA. An outward shift of the whole curve\nB. A movement from a point inside the curve towards the curve\nC. A movement along the curve\nD. An inward shift of the whole curve',
        ...mc(['A','B','C','D'], 1, 'Short-run/actual growth uses previously spare capacity - a movement from inside the PPF towards it. An outward shift of the whole curve instead represents long-run (potential) growth.'),
        answerStructureAdvice: 'Distinguish actual growth (using spare capacity, movement TOWARDS the curve) from potential growth (the curve itself shifting out).' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain the difference between actual and potential economic growth.',
        ...points([{ name: 'Definition of actual growth (rise in real GDP/using existing spare capacity)', marks: 1 }, { name: 'Definition of potential growth (rise in the economy\'s productive capacity)', marks: 1 }]),
        answerStructureAdvice: 'Actual = using what capacity already exists; potential = the capacity itself growing. Keep the two separate.' },
      { markTariff: 8, requiresDiagram: true,
        questionText: 'Examine the causes of long-run economic growth in a developed economy.',
        ...points([{ name: 'Knowledge of a cause of LRAS/potential output growth', marks: 2 }, { name: 'Application to a real or plausible example', marks: 2 }, { name: 'Analysis - a chain of reasoning from the cause to higher potential output', marks: 2 }, { name: 'Evaluation - weighing how significant this cause is relative to others', marks: 2 }]),
        answerStructureAdvice: 'Pick one cause (e.g. capital investment, technological progress, net migration) and develop the full chain rather than listing several.' },
      { markTariff: 15, requiresDiagram: true,
        questionText: 'Discuss the extent to which increased investment is the most important cause of a country\'s economic growth.',
        ...levels([
          { level: 1, marks: '1-5', descriptor: 'Basic, undeveloped points on investment with little comparison to other causes.' },
          { level: 2, marks: '6-10', descriptor: 'Developed knowledge and application of investment with some analysis and a simple judgement against an alternative cause.' },
          { level: 3, marks: '11-15', descriptor: 'Sustained chains of reasoning comparing investment against at least one other genuine cause (e.g. technological progress, human capital), leading to a balanced, well-supported judgement.' },
        ]),
        answerStructureAdvice: 'Name a specific rival cause (e.g. education/human capital) and directly weigh its importance against investment before concluding.' },
    ],
  },
  {
    subtopic: T25, concept: 'Output gaps',
    questions: [
      { markTariff: 1, requiresDiagram: true,
        questionText: 'A positive (inflationary) output gap exists when:\nA. Actual output is below potential output\nB. Actual output exceeds potential output\nC. Actual output equals potential output\nD. Potential output is falling',
        ...mc(['A','B','C','D'], 2, 'A positive output gap means the economy is producing beyond its normal sustainable capacity (e.g. through overtime working) - this typically generates upward pressure on inflation.'),
        answerStructureAdvice: 'Positive gap = actual ABOVE potential (unsustainable, inflationary); negative gap = actual BELOW potential (spare capacity).' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain why a negative output gap might be associated with low inflation.',
        ...points([{ name: 'Reference to spare capacity/unused resources existing', marks: 1 }, { name: 'Reference to weak demand relative to supply keeping prices/wages from rising quickly', marks: 1 }]),
        answerStructureAdvice: 'Link spare capacity directly to weak pressure on prices and wages.' },
      { markTariff: 8, requiresDiagram: true,
        questionText: 'Examine the possible policy responses to a persistent positive (inflationary) output gap.',
        ...points([{ name: 'Knowledge of a positive output gap', marks: 2 }, { name: 'Application - naming a specific policy response (e.g. raising interest rates)', marks: 2 }, { name: 'Analysis - a chain of reasoning from the policy to a narrower gap', marks: 2 }, { name: 'Evaluation - weighing any trade-off (e.g. slower growth)', marks: 2 }]),
        answerStructureAdvice: 'A demand-side policy (raising interest rates or cutting spending) is the natural answer - the evaluation should weigh the resulting trade-off with growth/employment.' },
      { markTariff: 10, requiresDiagram: true,
        questionText: 'Assess the difficulty faced by policymakers in accurately measuring the size of an output gap.',
        ...levels([
          { level: 1, marks: '1-3', descriptor: 'Isolated, undeveloped knowledge of output gaps.' },
          { level: 2, marks: '4-7', descriptor: 'Developed, applied points on measurement difficulty with some analysis and a simple assessment.' },
          { level: 3, marks: '8-10', descriptor: 'Sustained, well-applied analysis of why potential output itself is hard to estimate, with a substantiated judgement on the consequences for policy.' },
        ]),
        answerStructureAdvice: 'The core difficulty is that potential output is NOT directly observable - it must be estimated, and different methods give different answers, which is what makes policy risky.' },
    ],
  },
  {
    subtopic: T25, concept: 'The trade (business) cycle',
    questions: [
      { markTariff: 1, requiresDiagram: true,
        questionText: 'Which of the following correctly lists the phases of the trade (business) cycle in order?\nA. Boom, recession, recovery, slowdown\nB. Recovery, boom, slowdown, recession\nC. Recession, slowdown, boom, recovery\nD. Slowdown, boom, recovery, recession',
        ...mc(['A','B','C','D'], 1, 'The standard cycle runs: recovery (output starts rising) → boom (output at or above potential) → slowdown (growth weakens) → recession (output falls), before recovery begins again.'),
        answerStructureAdvice: 'Picture the cycle as a wave: rising, peaking, falling, and troughing, then repeating.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by a \'recession\'.',
        ...points([{ name: 'Reference to a fall in real GDP', marks: 1 }, { name: 'Reference to this occurring over two or more consecutive quarters', marks: 1 }]),
        answerStructureAdvice: 'Both parts of the technical definition (falling GDP, for at least two consecutive quarters) are needed for full marks.' },
      { markTariff: 8, requiresDiagram: true,
        questionText: 'Examine the possible causes of a downturn in the trade cycle.',
        ...points([{ name: 'Knowledge of a cause of a downturn (e.g. a fall in confidence, an external shock)', marks: 2 }, { name: 'Application to a real or plausible example', marks: 2 }, { name: 'Analysis - a chain of reasoning from the cause to falling AD/output', marks: 2 }, { name: 'Evaluation - weighing how quickly this might feed through the economy', marks: 2 }]),
        answerStructureAdvice: 'Develop ONE cause (e.g. a fall in global demand, a financial shock) into a full chain reaching falling national output.' },
      { markTariff: 25, requiresDiagram: true,
        questionText: 'Evaluate the view that government policy can eliminate the trade (business) cycle entirely.',
        ...levels([
          { level: 1, marks: '1-6', descriptor: 'Generic knowledge of the trade cycle with little application to policy.' },
          { level: 2, marks: '7-12', descriptor: 'Developed application to at least one policy with some analysis.' },
          { level: 3, marks: '13-18', descriptor: 'Sustained analysis of both demand-side and supply-side/external causes of the cycle, with clear chains of reasoning on the limits of policy.' },
          { level: 4, marks: '19-25', descriptor: 'Consistently well-developed, applied analysis leading to a fully justified conclusion on why the cycle is unlikely to ever be fully eliminated (e.g. external shocks, time lags, imperfect information).' },
        ]),
        answerStructureAdvice: 'A top answer explains why POLICY LAGS and external shocks (that no domestic policy controls) make full elimination unrealistic, even if the cycle can be smoothed.' },
    ],
  },
  {
    subtopic: T25, concept: 'The impact of economic growth',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'Which of the following is most likely to be a negative consequence of rapid economic growth?\nA. Falling unemployment\nB. Rising tax revenues\nC. Increased environmental degradation\nD. Higher business confidence',
        ...mc(['A','B','C','D'], 2, 'Rapid growth, especially if resource- or carbon-intensive, is commonly associated with increased pollution and environmental degradation - a genuine cost alongside its benefits.'),
        answerStructureAdvice: 'Look for the option that describes a genuine COST, not a further benefit of growth.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'Using an example, explain one benefit of economic growth for a developing economy.',
        ...points([{ name: 'Knowledge of a benefit (e.g. rising incomes, higher tax revenue for public services)', marks: 1 }, { name: 'Application to a real or plausible developing economy', marks: 1 }, { name: 'Analysis - a chain of reasoning to an improvement in living standards', marks: 2 }]),
        answerStructureAdvice: 'Follow through to the FINAL improvement in living standards, not just the immediate rise in income/output.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Examine the possible costs of rapid economic growth for an economy.',
        ...points([{ name: 'Knowledge of a cost of growth (e.g. inflation, environmental damage, inequality)', marks: 2 }, { name: 'Application to a real or plausible example', marks: 2 }, { name: 'Analysis - a chain of reasoning developing that cost', marks: 2 }, { name: 'Evaluation - weighing how serious the cost is relative to the benefits', marks: 2 }]),
        answerStructureAdvice: 'Develop ONE cost in depth (e.g. demand-pull inflation from growth beyond capacity) rather than briefly listing several.' },
      { markTariff: 12, requiresDiagram: false,
        questionText: 'Discuss the extent to which the benefits of economic growth outweigh its costs.',
        ...levels([
          { level: 1, marks: '1-4', descriptor: 'Basic description of benefits and costs with little real discussion.' },
          { level: 2, marks: '5-8', descriptor: 'Developed points on both benefits and costs with some evaluation.' },
          { level: 3, marks: '9-12', descriptor: 'Sustained, well-developed discussion weighing benefits (higher living standards, employment) against costs (inflation risk, inequality, environmental damage), with a clear, justified judgement.' },
        ]),
        answerStructureAdvice: 'A strong judgement often depends on the TYPE of growth (sustainable vs. rapid/unsustainable) - use this distinction to reach a nuanced conclusion.' },
    ],
  },
  // ───────────────────────── 2.6 Macroeconomic objectives and policies ─────────────────────────
  {
    subtopic: T26, concept: 'Macroeconomic objectives',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'Which of the following is one of the four main macroeconomic objectives of most governments?\nA. Maximising a single firm\'s market share\nB. Low and stable inflation\nC. Increasing a specific product\'s price elasticity of demand\nD. Reducing the number of firms in an industry',
        ...mc(['A','B','C','D'], 1, 'The four widely-cited macroeconomic objectives are: economic growth, low unemployment, low and stable inflation, and a satisfactory balance of payments/exchange rate stability.'),
        answerStructureAdvice: 'Learn the standard list of four objectives - growth, unemployment, inflation, balance of payments - so you can recall them under pressure.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'State two macroeconomic objectives of the UK government.',
        ...points([{ name: 'Naming any two of: economic growth, low unemployment, low/stable inflation, balance of payments equilibrium', marks: 2 }]),
        answerStructureAdvice: 'One mark per correctly named objective - no explanation needed for this question.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Examine why it might be difficult for a government to achieve low unemployment and low inflation simultaneously.',
        ...points([{ name: 'Knowledge of the (short-run) Phillips curve trade-off', marks: 2 }, { name: 'Application to a real or plausible policy scenario', marks: 2 }, { name: 'Analysis - a chain of reasoning from lower unemployment to demand-pull inflation', marks: 2 }, { name: 'Evaluation - weighing whether this trade-off always holds', marks: 2 }]),
        answerStructureAdvice: 'Name the Phillips curve trade-off explicitly, then use evaluation to question whether it holds in the long run (or during supply-side improvements).' },
      { markTariff: 15, requiresDiagram: false,
        questionText: 'Discuss the extent to which conflicts between macroeconomic objectives are unavoidable.',
        ...levels([
          { level: 1, marks: '1-5', descriptor: 'Basic, undeveloped points on one conflict with little wider discussion.' },
          { level: 2, marks: '6-10', descriptor: 'Developed knowledge and application of at least one conflict with some analysis and a simple judgement.' },
          { level: 3, marks: '11-15', descriptor: 'Sustained chains of reasoning across more than one conflict (e.g. growth vs. inflation, unemployment vs. inflation), leading to a balanced, well-supported judgement on whether supply-side policy can reduce these trade-offs.' },
        ]),
        answerStructureAdvice: 'Cover more than one conflict and consider whether supply-side policy (raising LRAS) can genuinely reduce trade-offs rather than just shift where they occur.' },
    ],
  },
  {
    subtopic: T26, concept: 'Demand-side policies: fiscal policy',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'Expansionary fiscal policy involves:\nA. Raising interest rates\nB. Increasing government spending and/or cutting taxes\nC. Cutting government spending and raising taxes\nD. Depreciating the exchange rate',
        ...mc(['A','B','C','D'], 1, 'Expansionary fiscal policy uses the government\'s own spending and taxation tools to boost aggregate demand - more spending and/or lower taxes leaves households and firms with more to spend.'),
        answerStructureAdvice: 'Fiscal policy = government spending and taxation. Interest rates and the exchange rate belong to monetary policy, not fiscal.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by a \'budget deficit\'.',
        ...points([{ name: 'Reference to government spending exceeding tax revenue in a given period (usually a year)', marks: 1 }, { name: 'Reference to the shortfall being financed through borrowing', marks: 1 }]),
        answerStructureAdvice: 'Both the definition and HOW the gap is covered (borrowing) are needed for full marks.' },
      { markTariff: 8, requiresDiagram: true,
        questionText: 'Examine the impact of an expansionary fiscal policy on the level of aggregate demand.',
        ...points([{ name: 'Knowledge of expansionary fiscal policy', marks: 2 }, { name: 'Application - a specific measure (e.g. higher infrastructure spending)', marks: 2 }, { name: 'Analysis - a chain of reasoning including the multiplier effect on AD', marks: 2 }, { name: 'Evaluation - weighing whether crowding out limits the impact', marks: 2 }]),
        answerStructureAdvice: 'Bring in the multiplier for analysis, and crowding out as your evaluation counter-argument, exactly as with government expenditure more broadly.' },
      { markTariff: 12, requiresDiagram: false,
        questionText: 'Discuss the extent to which fiscal policy is constrained by the size of the national debt.',
        ...levels([
          { level: 1, marks: '1-4', descriptor: 'Basic description of the national debt with little real discussion of constraint.' },
          { level: 2, marks: '5-8', descriptor: 'Developed points on debt as a constraint with some evaluation.' },
          { level: 3, marks: '9-12', descriptor: 'Sustained, well-developed discussion weighing debt-servicing costs and credit-rating risk against the case for using fiscal policy when needed, with a clear judgement.' },
        ]),
        answerStructureAdvice: 'A balanced answer weighs the real risk (rising debt-interest payments, credit rating concerns) against the counter-argument that fiscal policy may still be justified during a serious downturn.' },
    ],
  },
  {
    subtopic: T26, concept: 'Demand-side policies: monetary policy',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'In the UK, the base interest rate is set by:\nA. HM Treasury\nB. The Monetary Policy Committee (MPC) of the Bank of England\nC. The Prime Minister\nD. Individual commercial banks',
        ...mc(['A','B','C','D'], 1, 'The Bank of England\'s Monetary Policy Committee (MPC) sets the base interest rate independently of the government, with a remit to meet the inflation target.'),
        answerStructureAdvice: 'Remember the Bank of England is operationally INDEPENDENT of the government on interest rate decisions.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by \'quantitative easing\'.',
        ...points([{ name: 'Reference to a central bank creating new money electronically', marks: 1 }, { name: 'Reference to using it to buy financial assets (e.g. government bonds), increasing money supply/liquidity', marks: 1 }]),
        answerStructureAdvice: 'Two parts: WHERE the money comes from (newly created) and WHAT the central bank does with it (buys assets).' },
      { markTariff: 8, requiresDiagram: true,
        questionText: 'Examine the transmission mechanism through which a cut in interest rates affects aggregate demand.',
        ...points([{ name: 'Knowledge of the interest rate transmission mechanism', marks: 2 }, { name: 'Application - naming a specific channel (e.g. cheaper borrowing, exchange rate, asset prices)', marks: 2 }, { name: 'Analysis - a chain of reasoning from the channel to higher AD', marks: 2 }, { name: 'Evaluation - weighing how quickly/strongly this feeds through', marks: 2 }]),
        answerStructureAdvice: 'Name a specific channel (cheaper mortgages/loans boosting C and I is the clearest) and trace the FULL chain to higher AD.' },
      { markTariff: 25, requiresDiagram: true,
        questionText: 'Evaluate the effectiveness of monetary policy in achieving the UK\'s inflation target during a period of low consumer confidence.',
        ...levels([
          { level: 1, marks: '1-6', descriptor: 'Generic knowledge of monetary policy with little application to low confidence.' },
          { level: 2, marks: '7-12', descriptor: 'Developed application to the scenario with some analysis.' },
          { level: 3, marks: '13-18', descriptor: 'Sustained analysis of why low confidence weakens the transmission mechanism, with clear chains of reasoning.' },
          { level: 4, marks: '19-25', descriptor: 'Consistently well-developed, applied analysis including a genuine limit (e.g. a liquidity trap, near-zero interest rates) with a fully justified, balanced conclusion.' },
        ]),
        answerStructureAdvice: 'The scenario (low confidence) is your route to a top-band answer - explain why cutting rates further may fail to boost spending if households/firms remain too pessimistic to borrow, even referencing a liquidity trap.' },
    ],
  },
  {
    subtopic: T26, concept: 'Supply-side policies',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'Which of the following is an example of a market-based supply-side policy?\nA. Government spending on a state-run training scheme\nB. Cutting corporation tax to encourage investment\nC. Direct government provision of healthcare\nD. Nationalising a failing industry',
        ...mc(['A','B','C','D'], 1, 'Market-based (free-market) supply-side policies reduce the role of the state and use incentives - such as tax cuts - to encourage private-sector activity, in contrast to interventionist policies where government spends directly.'),
        answerStructureAdvice: 'Market-based = incentives/deregulation, reducing state involvement; interventionist = direct government spending/provision.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'Using an example, distinguish between market-based and interventionist supply-side policies.',
        ...points([{ name: 'Knowledge of market-based supply-side policy (reducing state involvement, using incentives)', marks: 1 }, { name: 'Knowledge of interventionist supply-side policy (direct government spending/provision)', marks: 1 }, { name: 'Application - a genuine example of each', marks: 2 }]),
        answerStructureAdvice: 'One clear example of each type (e.g. deregulation vs. government-funded infrastructure spending) makes the distinction concrete.' },
      { markTariff: 8, requiresDiagram: true,
        questionText: 'Examine the impact of increased government spending on education and training on long-run aggregate supply.',
        ...points([{ name: 'Knowledge of human capital and LRAS', marks: 2 }, { name: 'Application to education/training spending', marks: 2 }, { name: 'Analysis - a chain of reasoning to a more productive workforce and higher LRAS', marks: 2 }, { name: 'Evaluation - weighing the time lag before this policy takes effect', marks: 2 }]),
        answerStructureAdvice: 'The time lag (years before better-trained workers enter the workforce) is the natural evaluation point for any human-capital-based supply-side policy.' },
      { markTariff: 12, requiresDiagram: true,
        questionText: 'Discuss the extent to which supply-side policies are more effective than demand-side policies at achieving long-term economic growth.',
        ...levels([
          { level: 1, marks: '1-4', descriptor: 'Basic description of supply-side and demand-side policy with little real comparison.' },
          { level: 2, marks: '5-8', descriptor: 'Developed points comparing the two with some evaluation.' },
          { level: 3, marks: '9-12', descriptor: 'Sustained, well-developed comparison of supply-side policy\'s effect on LRAS against demand-side policy\'s (temporary, cyclical) effect on AD, with a clear judgement on which better suits the LONG TERM specifically.' },
        ]),
        answerStructureAdvice: 'The word "long-term" is the key - argue that only a rightward shift in LRAS (supply-side) permanently raises potential output, while demand-side policy mainly affects the SHORT-RUN position within existing capacity.' },
    ],
  },
  {
    subtopic: T26, concept: 'Conflicts and trade-offs between objectives and policies',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'The short-run Phillips curve illustrates a trade-off between:\nA. Economic growth and the exchange rate\nB. Unemployment and inflation\nC. Taxation and government spending\nD. Exports and imports',
        ...mc(['A','B','C','D'], 1, 'The short-run Phillips curve shows that, historically, lower unemployment has tended to come with higher inflation, and vice versa - a classic macroeconomic trade-off.'),
        answerStructureAdvice: 'Phillips curve = unemployment vs. inflation, specifically - not to be confused with other macro trade-offs.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain one possible conflict between the objectives of economic growth and a satisfactory balance of payments.',
        ...points([{ name: 'Reference to rising domestic incomes from growth pulling in more imports', marks: 1 }, { name: 'Reference to this worsening the current account/balance of payments position', marks: 1 }]),
        answerStructureAdvice: 'Trace the chain briefly: growth → higher incomes → more imports bought → current account worsens.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Examine the potential conflict between using expansionary demand-side policy to reduce unemployment and the objective of low inflation.',
        ...points([{ name: 'Knowledge of the Phillips curve trade-off', marks: 2 }, { name: 'Application to a specific expansionary policy', marks: 2 }, { name: 'Analysis - a chain of reasoning from lower unemployment to demand-pull inflation', marks: 2 }, { name: 'Evaluation - weighing whether supply-side policy could reduce this conflict', marks: 2 }]),
        answerStructureAdvice: 'Use supply-side policy (raising LRAS so unemployment can fall without extra inflation) as your evaluation - it directly addresses whether the conflict is truly unavoidable.' },
      { markTariff: 15, requiresDiagram: false,
        questionText: 'Discuss the extent to which the UK government can successfully manage conflicts between its macroeconomic objectives.',
        ...levels([
          { level: 1, marks: '1-5', descriptor: 'Basic, undeveloped points on one conflict with little wider policy discussion.' },
          { level: 2, marks: '6-10', descriptor: 'Developed knowledge and application of at least one conflict and one policy response with some analysis and a simple judgement.' },
          { level: 3, marks: '11-15', descriptor: 'Sustained chains of reasoning across more than one conflict and policy response, leading to a balanced, well-supported judgement on the genuine limits of policy management.' },
        ]),
        answerStructureAdvice: 'Cover more than one conflict (e.g. growth vs. inflation, AND unemployment vs. inflation) and evaluate whether ANY policy mix can fully resolve them, or only ever manage the trade-off.' },
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

  console.log(`Inserting ${rows.length} practice questions (Theme 2) across ${byConcept.size} concepts...`);
  const { error } = await supabase.from('practice_questions').insert(rows);
  if (error) { console.error('Insert failed:', JSON.stringify(error)); process.exit(1); }
  console.log('Done.');
}

main();
