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

const T424 = '4.2.4 Financial markets and monetary policy';
const T425 = '4.2.5 Fiscal policy and supply-side policies';
const T426 = '4.2.6 The international economy';

const QUESTIONS = [
  // ───────────────────────── 4.2.4 Financial markets and monetary policy ─────────────────────────
  {
    subtopic: T424, concept: 'The structure of financial markets and financial assets',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'A key economic function of financial markets is to:\nA. Set the level of government spending\nB. Channel funds from savers (surplus units) to borrowers (deficit units)\nC. Determine the rate of inflation directly\nD. Fix exchange rates between currencies',
        ...mc(['A','B','C','D'], 1, 'Financial markets intermediate between those with surplus funds (savers) and those needing funds (borrowers/investors), allocating capital across the economy.'),
        answerStructureAdvice: 'The core function: connecting SAVERS with BORROWERS/investors.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'State two examples of financial assets.',
        ...points([{ name: 'Correctly named financial asset (e.g. shares, government bonds, savings accounts)', marks: 1 }, { name: 'A second, different correctly named financial asset', marks: 1 }]),
        answerStructureAdvice: 'One mark per genuine, named financial asset.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'A firm sells shares on the stock market to raise money for expansion. Explain how this illustrates the role of financial markets in the economy.',
        ...band4(
          'Clearly identifies the stock market channelling savers\' funds to the firm (a deficit unit) and precisely explains how this supports investment and growth.',
          'Identifies the channelling of funds with a reasonably clear explanation.',
          'Makes a limited or unclear attempt to link the scenario to the role of financial markets.',
          'Makes only a very vague reference to shares or the firm with little real explanation.'
        ),
        answerStructureAdvice: 'Name the specific function (channelling savings to investment) and link it directly to the firm\'s expansion.' },
      { markTariff: 9, requiresDiagram: false,
        questionText: 'Explain the role of financial markets in facilitating economic growth.',
        ...levels([
          { level: 3, marks: '7-9', descriptor: 'Well organised, develops the issue with sound knowledge and understanding, good application, and a clear, well-focused chain of reasoning.' },
          { level: 2, marks: '4-6', descriptor: 'Reasonable knowledge and application, but the analysis may not be fully developed or becomes confused in places.' },
          { level: 1, marks: '1-3', descriptor: 'Limited knowledge and very limited application, with analysis that lacks focus.' },
        ]),
        answerStructureAdvice: 'Follow the chain from efficient capital allocation to higher investment and, eventually, higher economic growth.' },
    ],
  },
  {
    subtopic: T424, concept: 'Central banks and monetary policy',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'In the UK, the base interest rate is set by:\nA. HM Treasury\nB. The Monetary Policy Committee (MPC) of the Bank of England\nC. The Prime Minister\nD. Individual commercial banks',
        ...mc(['A','B','C','D'], 1, 'The Bank of England\'s Monetary Policy Committee (MPC) sets the base interest rate independently of the government, with a remit to meet the inflation target.'),
        answerStructureAdvice: 'The Bank of England is operationally INDEPENDENT of the government on interest rate decisions.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by \'quantitative easing\'.',
        ...points([{ name: 'Reference to a central bank creating new money electronically', marks: 1 }, { name: 'Reference to using it to buy financial assets, increasing money supply/liquidity', marks: 1 }]),
        answerStructureAdvice: 'Two parts: WHERE the money comes from and WHAT the central bank does with it.' },
      { markTariff: 4, requiresDiagram: true,
        questionText: 'The Bank of England cuts the base interest rate. Explain how this is likely to affect the level of consumer spending.',
        ...band4(
          'Clearly identifies cheaper borrowing/mortgages and lower returns on saving, precisely explaining the resulting rise in consumer spending.',
          'Identifies a rise in consumer spending with a reasonably clear explanation of the channel.',
          'Makes a limited or unclear attempt to explain the effect.',
          'Makes only a very vague reference to interest rates or spending with little real explanation.'
        ),
        answerStructureAdvice: 'Name a specific channel (cheaper mortgages/loans, or lower incentive to save) and trace it through to higher spending.' },
      { markTariff: 25, requiresDiagram: true,
        questionText: 'Evaluate the effectiveness of monetary policy in achieving the UK\'s inflation target during a period of very low consumer confidence.',
        ...levels([
          { level: 5, marks: '21-25', descriptor: 'Sound, focused analysis and well-supported evaluation: well organised, sound knowledge with few if any errors, good application to the scenario, well-focused analysis with clear chains of reasoning, and supported evaluation throughout leading to a final conclusion.' },
          { level: 4, marks: '16-20', descriptor: 'Sound, focused analysis and some supported evaluation, with good application and some reasonable, supported evaluation.' },
          { level: 3, marks: '11-15', descriptor: 'Some reasonable analysis but generally unsupported evaluation; satisfactory knowledge and reasonable application, but evaluation is fairly superficial.' },
          { level: 2, marks: '6-10', descriptor: 'A fairly weak response with some understanding; limited knowledge and application, limited and unsupported evaluation.' },
          { level: 1, marks: '1-5', descriptor: 'A very weak response with little relevant knowledge, weak application, and weak, unsupported attempted analysis.' },
        ]),
        answerStructureAdvice: 'Explain why low confidence weakens the interest-rate transmission mechanism, and consider a genuine limit such as a liquidity trap near-zero rates, before your judgement.' },
    ],
  },
  {
    subtopic: T424, concept: 'The regulation of the financial system',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'A central bank acting as \'lender of last resort\' means it:\nA. Refuses to lend to any commercial bank\nB. Provides emergency funds to solvent banks facing a short-term liquidity crisis, to prevent a wider banking collapse\nC. Sets the level of government taxation\nD. Directly controls all commercial bank lending decisions',
        ...mc(['A','B','C','D'], 2, 'As lender of last resort, a central bank provides emergency liquidity to fundamentally solvent banks facing a short-term cash shortage, preventing a bank run from destabilising the wider system.'),
        answerStructureAdvice: 'Lender of last resort is about preventing a SYSTEMIC crisis, not routinely funding weak banks.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by \'moral hazard\' in the financial sector.',
        ...points([{ name: 'Reference to a party taking on more risk because it does not bear the full consequences', marks: 1 }, { name: 'Reference to this being encouraged by an expectation of a government bailout ("too big to fail")', marks: 1 }]),
        answerStructureAdvice: 'State the general concept and the specific "too big to fail" example.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'A large bank takes on excessive risk, believing the government would bail it out if it got into difficulty. Explain how this illustrates moral hazard.',
        ...band4(
          'Clearly identifies the bank being insulated from the full consequences of failure and precisely explains why this encourages excessive risk-taking.',
          'Identifies moral hazard as relevant with a reasonably clear explanation.',
          'Makes a limited or unclear attempt to link the scenario to moral hazard.',
          'Makes only a very vague reference to the bank or risk with little real explanation.'
        ),
        answerStructureAdvice: 'Name moral hazard explicitly and link the bailout expectation directly to the incentive to take more risk.' },
      { markTariff: 9, requiresDiagram: false,
        questionText: 'Explain why the financial sector might require greater regulation than other, more competitive sectors of the economy.',
        ...levels([
          { level: 3, marks: '7-9', descriptor: 'Well organised, develops one or more relevant issues (e.g. systemic risk, moral hazard, asymmetric information) with sound knowledge, good application, and a clear chain of reasoning.' },
          { level: 2, marks: '4-6', descriptor: 'Includes a relevant issue with reasonable knowledge and application, but analysis may not be fully developed.' },
          { level: 1, marks: '1-3', descriptor: 'A brief or weak response with limited knowledge and very limited application.' },
        ]),
        answerStructureAdvice: 'Develop ONE genuine market failure specific to finance (e.g. systemic risk from interconnected institutions) rather than listing several briefly.' },
    ],
  },
  // ───────────────────────── 4.2.5 Fiscal policy and supply-side policies ─────────────────────────
  {
    subtopic: T425, concept: 'Fiscal policy',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'Expansionary fiscal policy involves:\nA. Raising interest rates\nB. Increasing government spending and/or cutting taxes\nC. Cutting government spending and raising taxes\nD. Depreciating the exchange rate',
        ...mc(['A','B','C','D'], 1, 'Expansionary fiscal policy uses government spending and taxation tools to boost aggregate demand - more spending and/or lower taxes leaves households and firms with more to spend.'),
        answerStructureAdvice: 'Fiscal policy = government spending and taxation. Interest rates belong to monetary policy, not fiscal.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by a \'budget deficit\'.',
        ...points([{ name: 'Reference to government spending exceeding tax revenue in a given year', marks: 1 }, { name: 'Reference to the shortfall being financed through borrowing', marks: 1 }]),
        answerStructureAdvice: 'Both the definition and HOW the gap is covered (borrowing) are needed.' },
      { markTariff: 4, requiresDiagram: true,
        questionText: 'A government increases spending on infrastructure projects. Explain the likely impact on aggregate demand, including the role of the multiplier.',
        ...band4(
          'Clearly identifies the direct rise in G shifting AD right, and precisely explains how the multiplier effect leads to a further, larger rise in national income.',
          'Identifies the rise in AD with a reasonably clear reference to the multiplier.',
          'Makes a limited or unclear attempt to explain the effect on AD.',
          'Makes only a very vague reference to spending or demand with little real explanation.'
        ),
        answerStructureAdvice: 'Mention the multiplier explicitly - the final rise in national income should exceed the initial injection.' },
      { markTariff: 15, requiresDiagram: true,
        questionText: 'Explain the extent to which fiscal policy is constrained by the size of a country\'s national debt.',
        ...levels([
          { level: 3, marks: '11-15', descriptor: 'Well organised, develops a selection of relevant issues (e.g. rising debt-interest payments, credit rating concerns, the case for using fiscal policy during a downturn) with sound knowledge, good application, and clear, well-focused chains of reasoning.' },
          { level: 2, marks: '6-10', descriptor: 'Focuses on relevant issues with satisfactory knowledge and reasonable application, but analysis may not be fully developed.' },
          { level: 1, marks: '1-5', descriptor: 'Has identified one or more relevant issues with limited knowledge and very limited application.' },
        ]),
        answerStructureAdvice: 'Weigh the genuine constraint (rising debt-interest costs) against the counter-argument that fiscal policy may still be needed during a serious downturn - no formal evaluation required here, just develop both sides.' },
    ],
  },
  {
    subtopic: T425, concept: 'Supply-side policies',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'Which of the following is an example of a market-based supply-side policy?\nA. Government spending on a state-run training scheme\nB. Cutting corporation tax to encourage investment\nC. Direct government provision of healthcare\nD. Nationalising a failing industry',
        ...mc(['A','B','C','D'], 2, 'Market-based supply-side policies reduce the role of the state and use incentives - such as tax cuts - to encourage private-sector activity, unlike interventionist policies where government spends directly.'),
        answerStructureAdvice: 'Market-based = incentives/deregulation; interventionist = direct government spending/provision.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'State two examples of an interventionist supply-side policy.',
        ...points([{ name: 'Correctly named interventionist policy (e.g. government-funded infrastructure, state education/training spending)', marks: 1 }, { name: 'A second, different correctly named interventionist policy', marks: 1 }]),
        answerStructureAdvice: 'One mark per genuine, named interventionist (state-led) policy.' },
      { markTariff: 4, requiresDiagram: true,
        questionText: 'A government increases spending on vocational training programmes. Explain the likely long-run effect on long-run aggregate supply.',
        ...band4(
          'Clearly identifies improved worker skills raising labour productivity and precisely explains the resulting rightward shift of LRAS.',
          'Identifies the rightward shift with a reasonably clear explanation.',
          'Makes a limited or unclear attempt to link training to LRAS.',
          'Makes only a very vague reference to training or supply with little real explanation.'
        ),
        answerStructureAdvice: 'Trace the chain from better-trained workers to higher productivity to a rightward shift of LRAS.' },
      { markTariff: 25, requiresDiagram: true,
        questionText: 'Evaluate the view that market-based supply-side policies are more effective than interventionist supply-side policies at raising long-run economic growth.',
        ...levels([
          { level: 5, marks: '21-25', descriptor: 'Sound, focused analysis and well-supported evaluation: well organised, sound knowledge with few if any errors, good application to real examples of both policy types, well-focused analysis with clear chains of reasoning, and supported evaluation throughout leading to a final conclusion.' },
          { level: 4, marks: '16-20', descriptor: 'Sound, focused analysis and some supported evaluation, with good application and some reasonable, supported evaluation.' },
          { level: 3, marks: '11-15', descriptor: 'Some reasonable analysis but generally unsupported evaluation; satisfactory knowledge and reasonable application, but evaluation is fairly superficial.' },
          { level: 2, marks: '6-10', descriptor: 'A fairly weak response with some understanding; limited knowledge and application, limited and unsupported evaluation.' },
          { level: 1, marks: '1-5', descriptor: 'A very weak response with little relevant knowledge, weak application, and weak, unsupported attempted analysis.' },
        ]),
        answerStructureAdvice: 'A top answer avoids declaring one approach universally superior - argue effectiveness depends on the specific market failure being addressed and the time lags involved, before a supported judgement.' },
    ],
  },
  // ───────────────────────── 4.2.6 The international economy ─────────────────────────
  {
    subtopic: T426, concept: 'Globalisation',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'Globalisation refers to:\nA. A country closing its borders to trade\nB. The growing economic interdependence of countries worldwide through trade, investment, and the movement of capital and labour\nC. A single country\'s domestic economic growth\nD. A fixed exchange rate system',
        ...mc(['A','B','C','D'], 1, 'Globalisation describes the increasing integration and interdependence of national economies through trade, investment flows, migration, and the spread of technology.'),
        answerStructureAdvice: 'Globalisation is about growing INTERDEPENDENCE between economies.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'State two factors that have contributed to globalisation.',
        ...points([{ name: 'Naming any two of: falling transport costs, improved technology/communication, trade liberalisation, growth of multinational companies', marks: 2 }]),
        answerStructureAdvice: 'One mark per correctly named factor.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'Explain how falling international transport costs have contributed to the growth of globalisation.',
        ...band4(
          'Clearly identifies that lower transport costs make international trade more profitable/competitive and precisely explains the resulting growth in global trade flows.',
          'Identifies the link between transport costs and trade growth with a reasonably clear explanation.',
          'Makes a limited or unclear attempt to explain the link.',
          'Makes only a very vague reference to transport or trade with little real explanation.'
        ),
        answerStructureAdvice: 'Explain the CHAIN from cheaper transport to more competitively-priced imported/exported goods to more international trade.' },
      { markTariff: 15, requiresDiagram: false,
        questionText: 'Explain the impact of globalisation on developing economies.',
        ...levels([
          { level: 3, marks: '11-15', descriptor: 'Well organised, develops a selection of relevant issues (e.g. FDI inflows, export-led growth, vulnerability to global shocks) with sound knowledge, good application, and clear, well-focused chains of reasoning.' },
          { level: 2, marks: '6-10', descriptor: 'Focuses on relevant issues with satisfactory knowledge and reasonable application, but analysis may not be fully developed.' },
          { level: 1, marks: '1-5', descriptor: 'Has identified one or more relevant issues with limited knowledge and very limited application.' },
        ]),
        answerStructureAdvice: 'Cover both a benefit (e.g. FDI/export growth) AND a cost (e.g. vulnerability to global shocks) for a top-band answer.' },
    ],
  },
  {
    subtopic: T426, concept: 'Trade',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'A country has a comparative advantage in producing a good when it can produce it:\nA. Using fewer total resources than any other country\nB. At a lower opportunity cost than another country\nC. At a lower absolute cost in money terms than another country\nD. Using only domestic resources',
        ...mc(['A','B','C','D'], 1, 'Comparative advantage is about OPPORTUNITY COST - a country should specialise in what it gives up least to produce, even if another country has an absolute advantage in everything.'),
        answerStructureAdvice: 'Comparative advantage = lowest OPPORTUNITY COST, not necessarily the lowest absolute cost.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by a \'trade bloc\'.',
        ...points([{ name: 'Reference to a group of countries agreeing to reduce/remove trade barriers between members', marks: 1 }, { name: 'Reference to an example (e.g. a free trade area or customs union)', marks: 1 }]),
        answerStructureAdvice: 'State the definition and give a genuine example of the type of arrangement.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'Explain why international trade based on comparative advantage can benefit both trading countries.',
        ...band4(
          'Clearly identifies that specialising according to comparative advantage and trading lets both countries consume beyond their own PPF, with a precise explanation.',
          'Identifies a mutual benefit from specialisation and trade with a reasonably clear explanation.',
          'Makes a limited or unclear attempt to explain the benefit.',
          'Makes only a very vague reference to trade or countries with little real explanation.'
        ),
        answerStructureAdvice: 'The strongest answers show BOTH countries can consume more than they could produce alone.' },
      { markTariff: 9, requiresDiagram: true,
        questionText: 'Using a diagram, explain the effect of a tariff on the domestic price and quantity of an imported good.',
        ...levels([
          { level: 3, marks: '7-9', descriptor: 'Well organised, develops the issue with sound knowledge and understanding, good application, well-focused analysis with a clear chain of reasoning, and an accurate, appropriately-used diagram.' },
          { level: 2, marks: '4-6', descriptor: 'Reasonable knowledge and application with some analysis that might not be fully developed; may include a relevant diagram.' },
          { level: 1, marks: '1-3', descriptor: 'Limited knowledge and very limited application; a diagram, if included, is not used well or is inaccurate.' },
        ]),
        answerStructureAdvice: 'Describe the effect on THREE things: the price paid, the quantity domestically produced, and the quantity imported.' },
    ],
  },
  {
    subtopic: T426, concept: 'The balance of payments',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'A current account deficit means that:\nA. Exports of goods and services exceed imports\nB. Imports of goods and services (plus net income/transfers) exceed exports\nC. The government is running a budget surplus\nD. The exchange rate is fixed',
        ...mc(['A','B','C','D'], 1, 'A current account deficit means more money flows out of the country (via imports, income paid abroad, transfers) than flows in from exports and income received.'),
        answerStructureAdvice: 'Don\'t confuse the current account with the government\'s budget position - they are entirely different balances.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'State the four main components of the current account of the balance of payments.',
        ...points([{ name: 'Naming trade in goods, trade in services, primary income, and secondary income', marks: 2 }]),
        answerStructureAdvice: 'All four components together earn full marks - a partial list earns partial credit.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'A country experiences a sustained rise in domestic consumer spending. Explain the likely effect on its current account balance.',
        ...band4(
          'Clearly identifies that higher domestic spending raises demand for imports and precisely explains the resulting worsening of the current account.',
          'Identifies a worsening current account with a reasonably clear explanation.',
          'Makes a limited or unclear attempt to explain the effect.',
          'Makes only a very vague reference to spending or the current account with little real explanation.'
        ),
        answerStructureAdvice: 'Trace the chain: higher domestic spending → more imports bought → current account worsens.' },
      { markTariff: 25, requiresDiagram: true,
        questionText: 'Evaluate the view that a persistent current account deficit is always a sign of a weak economy.',
        ...levels([
          { level: 5, marks: '21-25', descriptor: 'Sound, focused analysis and well-supported evaluation: well organised, sound knowledge with few if any errors, good application, well-focused analysis with clear chains of reasoning, and supported evaluation throughout leading to a final conclusion.' },
          { level: 4, marks: '16-20', descriptor: 'Sound, focused analysis and some supported evaluation, with good application and some reasonable, supported evaluation.' },
          { level: 3, marks: '11-15', descriptor: 'Some reasonable analysis but generally unsupported evaluation; satisfactory knowledge and reasonable application, but evaluation is fairly superficial.' },
          { level: 2, marks: '6-10', descriptor: 'A fairly weak response with some understanding; limited knowledge and application, limited and unsupported evaluation.' },
          { level: 1, marks: '1-5', descriptor: 'A very weak response with little relevant knowledge, weak application, and weak, unsupported attempted analysis.' },
        ]),
        answerStructureAdvice: 'Directly reject "always" - a deficit financed by strong capital inflows (investment) can coexist with (or even reflect) a strong, confident economy, unlike one financed by unsustainable borrowing.' },
    ],
  },
  {
    subtopic: T426, concept: 'Exchange rate systems',
    questions: [
      { markTariff: 1, requiresDiagram: true,
        questionText: 'A \'depreciation\' of a floating exchange rate means:\nA. The government has devalued the currency by law\nB. The currency has fallen in value against other currencies due to market forces\nC. The currency has risen in value against other currencies\nD. The exchange rate is fixed by the central bank',
        ...mc(['A','B','C','D'], 2, 'Depreciation refers to a market-driven fall in a floating currency\'s value; a government-imposed fall in a fixed exchange rate is instead called a devaluation.'),
        answerStructureAdvice: 'Depreciation = market-driven fall (floating rate); devaluation = government-imposed fall (fixed rate).' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'State two factors that might cause a currency to appreciate.',
        ...points([{ name: 'Naming any two of: higher relative interest rates, higher demand for exports, speculative inflows, lower relative inflation', marks: 2 }]),
        answerStructureAdvice: 'One mark per correctly named factor.' },
      { markTariff: 4, requiresDiagram: true,
        questionText: 'The Bank of England raises interest rates while other countries keep theirs unchanged. Explain the likely effect on the value of the pound.',
        ...band4(
          'Clearly identifies increased inflows of foreign "hot money" seeking higher returns and precisely explains the resulting appreciation of the pound.',
          'Identifies an appreciation of the pound with a reasonably clear explanation.',
          'Makes a limited or unclear attempt to explain the effect.',
          'Makes only a very vague reference to interest rates or the pound with little real explanation.'
        ),
        answerStructureAdvice: 'Link higher relative interest rates directly to increased demand for the currency from foreign investors.' },
      { markTariff: 9, requiresDiagram: true,
        questionText: 'Using a diagram, explain how a floating exchange rate can help a country automatically adjust to a current account deficit.',
        ...levels([
          { level: 3, marks: '7-9', descriptor: 'Well organised, develops the issue with sound knowledge and understanding, good application, well-focused analysis with a clear chain of reasoning, and an accurate, appropriately-used diagram.' },
          { level: 2, marks: '4-6', descriptor: 'Reasonable knowledge and application with some analysis that might not be fully developed; may include a relevant diagram.' },
          { level: 1, marks: '1-3', descriptor: 'Limited knowledge and very limited application; a diagram, if included, is not used well or is inaccurate.' },
        ]),
        answerStructureAdvice: 'Trace the automatic mechanism: deficit → more currency sold to buy imports → currency depreciates → exports cheaper/imports dearer → deficit narrows.' },
    ],
  },
  {
    subtopic: T426, concept: 'Economic growth and development',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'The Human Development Index (HDI) is a composite measure combining:\nA. GDP per capita, inflation, and unemployment\nB. Income, life expectancy, and education\nC. Exports, imports, and the exchange rate\nD. Government spending and taxation',
        ...mc(['A','B','C','D'], 2, 'The HDI combines a measure of income, a health measure (life expectancy), and an education measure into one composite index of development.'),
        answerStructureAdvice: 'Learn the THREE components of HDI: income, health, education.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by \'economic development\', as distinct from economic growth.',
        ...points([{ name: 'Reference to a broader improvement in living standards/wellbeing, not just output', marks: 1 }, { name: 'Reference to it including factors such as health, education, and freedom, unlike growth', marks: 1 }]),
        answerStructureAdvice: 'Growth is narrow and quantitative; development is broader, including quality-of-life factors.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'Two countries have similar GDP per capita, but one has a much higher life expectancy and literacy rate. Explain what this shows about their relative levels of development.',
        ...band4(
          'Clearly identifies that the country with better health/education outcomes has a higher level of DEVELOPMENT despite similar income, with a precise explanation using HDI-style reasoning.',
          'Identifies that development differs despite similar income with a reasonably clear explanation.',
          'Makes a limited or unclear attempt to compare the two countries.',
          'Makes only a very vague reference to GDP or development with little real explanation.'
        ),
        answerStructureAdvice: 'Explicitly separate GROWTH (similar in this case) from DEVELOPMENT (different, due to health/education) in your answer.' },
      { markTariff: 15, requiresDiagram: false,
        questionText: 'Explain the factors that might limit economic growth and development in a low-income developing country.',
        ...levels([
          { level: 3, marks: '11-15', descriptor: 'Well organised, develops a selection of relevant issues (e.g. poor infrastructure, limited access to education, political instability) with sound knowledge, good application, and clear, well-focused chains of reasoning.' },
          { level: 2, marks: '6-10', descriptor: 'Focuses on relevant issues with satisfactory knowledge and reasonable application, but analysis may not be fully developed.' },
          { level: 1, marks: '1-5', descriptor: 'Has identified one or more relevant issues with limited knowledge and very limited application.' },
        ]),
        answerStructureAdvice: 'Cover more than one genuine barrier (e.g. poor infrastructure AND political instability) for a top-band answer.' },
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

  console.log(`Inserting ${rows.length} practice questions (AQA batch D: 4.2.4-4.2.6) across ${byConcept.size} concepts...`);
  const { error } = await supabase.from('practice_questions').insert(rows);
  if (error) { console.error('Insert failed:', JSON.stringify(error)); process.exit(1); }
  console.log('Done.');
}

main();
