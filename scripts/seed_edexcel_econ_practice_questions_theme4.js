require('dotenv/config');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SUBJECT = 'Economics';
const QUALIFICATION = 'A Level';
const EXAM_BOARD = 'Edexcel';

function clean(s) { return (s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_'); }
function conceptId(subtopic, concept) { return `${clean(SUBJECT)}:${clean(subtopic)}:${clean(concept)}`; }

// Original content written for LastMind - no question is copied from a
// real Edexcel past paper. Mark scheme structures reflect the REAL,
// researched Edexcel A-Level Economics A conventions used throughout
// this series; descriptor wording is written independently.

const mc = (options, correctIndex, explanation) => ({ markSchemeType: 'multiple_choice', markSchemeJson: { options, correctIndex, explanation } });
const points = (criteria) => ({ markSchemeType: 'points', markSchemeJson: { criteria } });
const levels = (levelsArr) => ({ markSchemeType: 'levels', markSchemeJson: { levels: levelsArr } });

const T41 = '4.1 International economics';
const T42 = '4.2 Poverty and inequality';
const T43 = '4.3 Emerging and developing economies';
const T44 = '4.4 The financial sector';
const T45 = '4.5 Role of the state in the macroeconomy';

const QUESTIONS = [
  // ───────────────────────── 4.1 International economics ─────────────────────────
  {
    subtopic: T41, concept: 'Globalisation',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'Globalisation refers to:\nA. A country closing its borders to trade\nB. The growing economic interdependence of countries worldwide through trade, investment, and the movement of capital and labour\nC. A single country\'s domestic economic growth\nD. A fixed exchange rate system',
        ...mc(['A','B','C','D'], 1, 'Globalisation describes the increasing integration and interdependence of national economies through trade, investment flows, migration, and the spread of technology.'),
        answerStructureAdvice: 'Globalisation is about growing INTERDEPENDENCE between economies - trade is just one part of it, alongside investment and labour movement.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'State two factors that have contributed to globalisation.',
        ...points([{ name: 'Naming any two of: falling transport costs, improved technology/communication, trade liberalisation, growth of multinational companies, financial market liberalisation', marks: 2 }]),
        answerStructureAdvice: 'One mark per correctly named factor - no explanation needed.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Examine the impact of globalisation on the growth of multinational companies.',
        ...points([{ name: 'Knowledge of globalisation and multinational companies', marks: 2 }, { name: 'Application to a real or plausible multinational', marks: 2 }, { name: 'Analysis - a chain of reasoning from globalisation (falling trade barriers/costs) to MNC expansion', marks: 2 }, { name: 'Evaluation - weighing how significant this driver is relative to others', marks: 2 }]),
        answerStructureAdvice: 'Link a specific driver of globalisation (e.g. falling transport costs) directly to why it makes overseas expansion more attractive for a multinational.' },
      { markTariff: 15, requiresDiagram: false,
        questionText: 'Discuss the extent to which globalisation has benefited developing economies.',
        ...levels([
          { level: 1, marks: '1-5', descriptor: 'Basic, undeveloped points on globalisation with little application to developing economies.' },
          { level: 2, marks: '6-10', descriptor: 'Developed knowledge and application of at least one benefit or cost with some analysis and a simple judgement.' },
          { level: 3, marks: '11-15', descriptor: 'Sustained chains of reasoning across both benefits (FDI, export growth, technology transfer) and costs (deindustrialisation risk, exploitation concerns), leading to a balanced, well-supported judgement.' },
        ]),
        answerStructureAdvice: 'Cover both a genuine benefit (FDI inflows, export-led growth) and a genuine cost (vulnerability to global shocks, race-to-the-bottom concerns) before concluding.' },
    ],
  },
  {
    subtopic: T41, concept: 'Specialisation and trade',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'A country has a comparative advantage in producing a good when it can produce it:\nA. Using fewer total resources than any other country\nB. At a lower opportunity cost than another country\nC. At a lower absolute cost in money terms than another country\nD. Using only domestic resources',
        ...mc(['A','B','C','D'], 1, 'Comparative advantage is about OPPORTUNITY COST - a country should specialise in producing what it gives up least to produce, even if another country is better at producing everything (absolute advantage).'),
        answerStructureAdvice: 'Comparative advantage = lowest OPPORTUNITY COST, not necessarily the lowest absolute cost - this distinction is very commonly tested.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'Using an example, explain why international trade based on comparative advantage can benefit both trading countries.',
        ...points([{ name: 'Knowledge of comparative advantage', marks: 1 }, { name: 'Application - a specific pair of countries/goods', marks: 1 }, { name: 'Analysis - a chain of reasoning showing both countries can consume beyond their own PPF through trade', marks: 2 }]),
        answerStructureAdvice: 'The strongest answers show that specialising and trading lets BOTH countries consume MORE than they could produce alone - beyond their individual PPFs.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Examine the assumptions underlying the theory of comparative advantage.',
        ...points([{ name: 'Knowledge of a key assumption (e.g. no transport costs, perfect factor mobility, constant returns to scale)', marks: 2 }, { name: 'Application - explaining what the assumption means in practice', marks: 2 }, { name: 'Analysis - a chain of reasoning on how unrealistic this assumption is', marks: 2 }, { name: 'Evaluation - weighing how much this undermines the theory\'s real-world usefulness', marks: 2 }]),
        answerStructureAdvice: 'Pick ONE assumption (e.g. zero transport costs, or that factors of production can move freely between industries) and follow it through to how realistic it actually is.' },
      { markTariff: 25, requiresDiagram: true,
        questionText: 'Evaluate the extent to which specialisation and trade based on comparative advantage always benefits all countries involved.',
        ...levels([
          { level: 1, marks: '1-6', descriptor: 'Generic knowledge of comparative advantage with little application.' },
          { level: 2, marks: '7-12', descriptor: 'Developed application to a real or plausible trading pair with some analysis.' },
          { level: 3, marks: '13-18', descriptor: 'Sustained analysis of the theory\'s benefits alongside genuine real-world limitations (unrealistic assumptions, over-specialisation risk, structural unemployment from adjustment), with clear chains of reasoning.' },
          { level: 4, marks: '19-25', descriptor: 'Consistently well-developed, applied analysis leading to a fully justified conclusion that directly addresses the word "always".' },
        ]),
        answerStructureAdvice: 'Directly reject "always" using a real risk - over-specialisation leaving a country dangerously exposed to a single industry\'s decline, or structural unemployment as an economy adjusts to trade patterns.' },
    ],
  },
  {
    subtopic: T41, concept: 'Pattern of trade',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'The \'pattern of trade\' of a country refers to:\nA. The exchange rate regime it uses\nB. Which goods/services it exports and imports, and with which trading partners\nC. Its total level of GDP\nD. Its rate of inflation',
        ...mc(['A','B','C','D'], 2, 'The pattern of trade describes WHAT a country trades (which goods/services) and WHO it trades with (which partner countries/regions) - a descriptive, not a policy, concept.'),
        answerStructureAdvice: 'Pattern of trade is about WHAT and WITH WHOM a country trades - not about currency or growth.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'State two factors that might explain a change in a country\'s pattern of trade over time.',
        ...points([{ name: 'Naming any two of: changing comparative advantage, exchange rate changes, new trade agreements, emergence of new competitor countries, changing consumer tastes', marks: 2 }]),
        answerStructureAdvice: 'One mark per correctly named factor - no explanation needed.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Examine why the UK\'s pattern of trade has shifted towards services and away from manufactured goods over recent decades.',
        ...points([{ name: 'Knowledge of comparative advantage shifting over time', marks: 2 }, { name: 'Application to the UK economy specifically', marks: 2 }, { name: 'Analysis - a chain of reasoning to why emerging economies now have a comparative advantage in manufacturing', marks: 2 }, { name: 'Evaluation - weighing how significant this shift has been for UK employment/growth', marks: 2 }]),
        answerStructureAdvice: 'Link the shift explicitly to comparative advantage moving to lower-cost manufacturing economies, leaving the UK to specialise in higher-value services instead.' },
      { markTariff: 12, requiresDiagram: false,
        questionText: 'Discuss the extent to which a country should be concerned about a narrow pattern of trade concentrated on a small number of goods or trading partners.',
        ...levels([
          { level: 1, marks: '1-4', descriptor: 'Basic description of a narrow trade pattern with little real discussion of risk.' },
          { level: 2, marks: '5-8', descriptor: 'Developed points on the risk of over-reliance with some evaluation.' },
          { level: 3, marks: '9-12', descriptor: 'Sustained, well-developed discussion weighing the efficiency benefits of specialisation against the vulnerability of over-reliance on few goods/partners, with a clear judgement.' },
        ]),
        answerStructureAdvice: 'Weigh the efficiency gain from specialising (comparative advantage) against the genuine risk of a shock to that one good/partner hitting the whole economy hard.' },
    ],
  },
  {
    subtopic: T41, concept: 'Terms of trade',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'A country\'s terms of trade are calculated as:\nA. Total exports minus total imports\nB. (Index of average export prices ÷ index of average import prices) × 100\nC. The exchange rate against the US dollar\nD. Total trade divided by GDP',
        ...mc(['A','B','C','D'], 1, 'The terms of trade index compares how export prices are moving relative to import prices: (average export price index ÷ average import price index) × 100.'),
        answerStructureAdvice: 'Learn the formula precisely: export price index over import price index, times 100.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by an \'improvement\' in the terms of trade.',
        ...points([{ name: 'Reference to export prices rising relative to import prices (the index rising)', marks: 1 }, { name: 'Reference to a given quantity of exports now buying a greater quantity of imports', marks: 1 }]),
        answerStructureAdvice: 'State both the technical definition (the index rising) and what it MEANS in practice (exports buy more imports).' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Examine the possible causes of an improvement in a country\'s terms of trade.',
        ...points([{ name: 'Knowledge of a cause (e.g. rising demand for a country\'s exports, currency appreciation, inflation differences)', marks: 2 }, { name: 'Application to a real or plausible scenario', marks: 2 }, { name: 'Analysis - a chain of reasoning from the cause to rising export prices relative to import prices', marks: 2 }, { name: 'Evaluation - weighing whether this improvement is likely to persist', marks: 2 }]),
        answerStructureAdvice: 'Develop ONE cause (e.g. an appreciation of the exchange rate raising relative export prices) fully rather than listing several.' },
      { markTariff: 10, requiresDiagram: false,
        questionText: 'Assess the view that an improvement in the terms of trade always benefits a country\'s economy.',
        ...levels([
          { level: 1, marks: '1-3', descriptor: 'Isolated, undeveloped knowledge of the terms of trade.' },
          { level: 2, marks: '4-7', descriptor: 'Developed, applied points on the benefit (cheaper imports) with some analysis and a simple assessment.' },
          { level: 3, marks: '8-10', descriptor: 'Sustained, well-applied analysis weighing the benefit of cheaper imports against the risk of reduced export competitiveness/volume, with a substantiated judgement.' },
        ]),
        answerStructureAdvice: 'The key tension: an improved terms of trade means cheaper imports, but if it\'s caused by a stronger currency, it can also make exports LESS competitive - weigh both.' },
    ],
  },
  {
    subtopic: T41, concept: 'Trading blocs and the WTO',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'A customs union differs from a free trade area because a customs union additionally involves:\nA. The complete abolition of all tariffs between all countries worldwide\nB. A common external tariff applied by all member countries to non-members\nC. A single shared currency\nD. Free movement of labour between members',
        ...mc(['A','B','C','D'], 2, 'Both a free trade area and a customs union remove tariffs between members, but a customs union ALSO adopts a common external tariff towards non-member countries - a free trade area does not.'),
        answerStructureAdvice: 'The common EXTERNAL tariff is the specific feature that distinguishes a customs union from a plain free trade area.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by \'trade diversion\'.',
        ...points([{ name: 'Reference to trade shifting from a lower-cost producer outside a trading bloc to a higher-cost producer inside it', marks: 1 }, { name: 'Reference to this occurring because of the bloc\'s common external tariff/preferential treatment of members', marks: 1 }]),
        answerStructureAdvice: 'Trade diversion is a NEGATIVE effect - production shifts to a LESS efficient producer purely because of tariff preference, not genuine comparative advantage.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Examine the role of the World Trade Organization (WTO) in promoting international trade.',
        ...points([{ name: 'Knowledge of the WTO\'s role (negotiating trade agreements, resolving disputes, reducing trade barriers)', marks: 2 }, { name: 'Application to a real or plausible example of WTO action', marks: 2 }, { name: 'Analysis - a chain of reasoning from the WTO\'s role to increased global trade', marks: 2 }, { name: 'Evaluation - weighing how effective the WTO has actually been in recent years', marks: 2 }]),
        answerStructureAdvice: 'Name a specific WTO function (e.g. its dispute settlement mechanism) and follow it through, then evaluate against real recent difficulties reaching global agreements.' },
      { markTariff: 12, requiresDiagram: false,
        questionText: 'Discuss the extent to which membership of a trading bloc benefits a country\'s economy.',
        ...levels([
          { level: 1, marks: '1-4', descriptor: 'Basic description of trading blocs with little real discussion of costs.' },
          { level: 2, marks: '5-8', descriptor: 'Developed points on benefits (trade creation, larger market) with some evaluation.' },
          { level: 3, marks: '9-12', descriptor: 'Sustained, well-developed discussion weighing trade creation against trade diversion and any loss of independent trade policy, with a clear judgement.' },
        ]),
        answerStructureAdvice: 'Contrast trade creation (a genuine benefit) against trade diversion (a genuine cost) explicitly - this pairing is the natural structure for a strong answer.' },
    ],
  },
  {
    subtopic: T41, concept: 'Restrictions on free trade',
    questions: [
      { markTariff: 1, requiresDiagram: true,
        questionText: 'A tariff is:\nA. A legal limit on the physical quantity of a good that can be imported\nB. A tax imposed on imported goods\nC. A government payment to a domestic producer\nD. A voluntary agreement to limit trade between two countries',
        ...mc(['A','B','C','D'], 1, 'A tariff is a tax on imports, raising their price to consumers in the importing country - distinct from a quota (a physical limit) or a subsidy (a payment, not a tax).'),
        answerStructureAdvice: 'Keep the different protectionist tools separate: tariff (tax), quota (quantity limit), subsidy (payment to domestic producers).' },
      { markTariff: 4, requiresDiagram: true,
        questionText: 'Using a diagram, explain the impact of a tariff on the domestic price and quantity of an imported good.',
        ...points([{ name: 'Knowledge of a tariff raising the price of the imported good', marks: 1 }, { name: 'Application - describing the effect on domestic supply/consumption', marks: 1 }, { name: 'Analysis - a chain of reasoning showing domestic production rises while imports/consumption fall', marks: 2 }]),
        answerStructureAdvice: 'Even in words, describe the effect on THREE things: the price paid, the quantity domestically produced, and the quantity imported.' },
      { markTariff: 8, requiresDiagram: true,
        questionText: 'Examine the arguments a government might use to justify imposing protectionist measures on trade.',
        ...points([{ name: 'Knowledge of a named justification (e.g. protecting infant industries, national security, preventing dumping)', marks: 2 }, { name: 'Application to a real or plausible industry/scenario', marks: 2 }, { name: 'Analysis - a chain of reasoning showing how protection achieves this aim', marks: 2 }, { name: 'Evaluation - weighing whether the justification is genuinely strong or often used to disguise simple protectionism', marks: 2 }]),
        answerStructureAdvice: 'Develop ONE justification (e.g. the infant industry argument) fully, then use evaluation to question whether it\'s a genuine case or just political cover for protecting inefficient firms.' },
      { markTariff: 25, requiresDiagram: true,
        questionText: 'Evaluate the view that protectionism always causes more harm than good to the economy that imposes it.',
        ...levels([
          { level: 1, marks: '1-6', descriptor: 'Generic knowledge of protectionism with little application.' },
          { level: 2, marks: '7-12', descriptor: 'Developed application to at least one protectionist measure with some analysis.' },
          { level: 3, marks: '13-18', descriptor: 'Sustained analysis of both costs (higher prices, retaliation, reduced choice) and genuine potential benefits (infant industry protection, national security), with clear chains of reasoning.' },
          { level: 4, marks: '19-25', descriptor: 'Consistently well-developed, applied analysis across multiple angles with a fully justified conclusion that directly addresses the word "always".' },
        ]),
        answerStructureAdvice: 'Directly reject "always" - a well-targeted, temporary measure (e.g. genuine infant industry protection) can have a real long-run case, even though most protectionism reduces welfare overall.' },
    ],
  },
  {
    subtopic: T41, concept: 'Exchange rates',
    questions: [
      { markTariff: 1, requiresDiagram: true,
        questionText: 'A \'depreciation\' of a floating exchange rate means:\nA. The government has devalued the currency by law\nB. The currency has fallen in value against other currencies due to market forces\nC. The currency has risen in value against other currencies\nD. The exchange rate is fixed by the central bank',
        ...mc(['A','B','C','D'], 2, 'Depreciation refers specifically to a MARKET-DRIVEN fall in a floating currency\'s value; a government-imposed fall in a FIXED exchange rate is instead called a devaluation.'),
        answerStructureAdvice: 'Depreciation = market-driven fall (floating rate); devaluation = government-imposed fall (fixed rate) - a very commonly tested distinction.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'State two factors that might cause a currency to appreciate.',
        ...points([{ name: 'Naming any two of: higher relative interest rates, higher demand for exports, speculation/inflows of hot money, lower relative inflation', marks: 2 }]),
        answerStructureAdvice: 'One mark per correctly named factor - no explanation needed.' },
      { markTariff: 8, requiresDiagram: true,
        questionText: 'Examine the impact of a depreciation of the pound on UK inflation.',
        ...points([{ name: 'Knowledge of depreciation raising the price of imports', marks: 2 }, { name: 'Application to UK imported goods/raw materials', marks: 2 }, { name: 'Analysis - a chain of reasoning from higher import prices to cost-push inflation', marks: 2 }, { name: 'Evaluation - weighing how significant this effect is given the openness of the UK economy', marks: 2 }]),
        answerStructureAdvice: 'The chain is cost-push: depreciation → dearer imported inputs/finished goods → firms\' costs rise → inflation.' },
      { markTariff: 12, requiresDiagram: true,
        questionText: 'Discuss the extent to which a depreciation of the exchange rate will improve a country\'s current account position.',
        ...levels([
          { level: 1, marks: '1-4', descriptor: 'Basic description of depreciation and the current account with little discussion of conditions.' },
          { level: 2, marks: '5-8', descriptor: 'Developed points referencing the Marshall-Lerner condition and/or J-curve with some evaluation.' },
          { level: 3, marks: '9-12', descriptor: 'Sustained, well-developed discussion of the Marshall-Lerner condition and J-curve effect together, with a clear, justified judgement on the likely outcome.' },
        ]),
        answerStructureAdvice: 'Bring in both the Marshall-Lerner condition (elasticities need to sum above 1) and the J-curve (short-run worsening before improvement) for a genuinely developed answer.' },
    ],
  },
  {
    subtopic: T41, concept: 'International competitiveness',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'A country\'s international competitiveness would be improved by:\nA. Rising relative unit labour costs\nB. Rising productivity relative to other countries\nC. A rise in the domestic rate of inflation relative to trading partners\nD. An appreciation of the exchange rate\'s real value',
        ...mc(['A','B','C','D'], 2, 'Higher productivity relative to competitors means a country can produce more output per unit of input, lowering unit costs and improving price competitiveness abroad.'),
        answerStructureAdvice: 'Higher relative productivity is a genuine competitiveness IMPROVEMENT; the other three options all describe factors that would WORSEN it.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'Using an example, distinguish between price competitiveness and non-price competitiveness.',
        ...points([{ name: 'Knowledge of price competitiveness (relative price of goods/services)', marks: 1 }, { name: 'Knowledge of non-price competitiveness (quality, design, branding, reliability)', marks: 1 }, { name: 'Application - a genuine example of each', marks: 2 }]),
        answerStructureAdvice: 'One example of each type (e.g. a low-cost manufacturer competing on price vs. a premium brand competing on design/quality) makes the distinction concrete.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Examine the factors that determine a country\'s international competitiveness.',
        ...points([{ name: 'Knowledge of a determinant (e.g. relative unit labour costs, productivity, exchange rate, non-price factors)', marks: 2 }, { name: 'Application to a real or plausible economy/industry', marks: 2 }, { name: 'Analysis - a chain of reasoning from the determinant to changed competitiveness', marks: 2 }, { name: 'Evaluation - weighing which factor matters most for that specific industry', marks: 2 }]),
        answerStructureAdvice: 'Develop ONE determinant (e.g. unit labour costs) fully, and use evaluation to note that non-price factors may matter more for some industries (e.g. luxury goods) than price alone.' },
      { markTariff: 15, requiresDiagram: false,
        questionText: 'Discuss the extent to which improving productivity is the most effective way for a country to improve its international competitiveness.',
        ...levels([
          { level: 1, marks: '1-5', descriptor: 'Basic, undeveloped points on productivity with little comparison to other approaches.' },
          { level: 2, marks: '6-10', descriptor: 'Developed knowledge and application of productivity with some analysis and a simple judgement against an alternative.' },
          { level: 3, marks: '11-15', descriptor: 'Sustained chains of reasoning comparing productivity improvement against at least one genuine alternative (e.g. exchange rate depreciation, non-price competitiveness investment), leading to a balanced, well-supported judgement.' },
        ]),
        answerStructureAdvice: 'Name a specific alternative route to competitiveness (currency depreciation is fast but unreliable; investing in non-price factors like quality/branding is slower but more durable) and directly weigh it against productivity.' },
    ],
  },
  // ───────────────────────── 4.2 Poverty and inequality ─────────────────────────
  {
    subtopic: T42, concept: 'Absolute and relative poverty',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'Absolute poverty is best defined as:\nA. Having an income below 60% of the median income\nB. Lacking the minimum income needed to meet basic needs such as food, clean water, and shelter\nC. Owning less wealth than the average household\nD. Living in a country with a low GDP per capita',
        ...mc(['A','B','C','D'], 2, 'Absolute poverty is a fixed, minimum standard - not having enough income/resources to meet basic survival needs - unlike relative poverty, which compares income to others in the same society.'),
        answerStructureAdvice: 'Absolute = a fixed minimum needs threshold; relative = compared to others in society (e.g. below 60% of median income) - keep the two separate.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain the difference between absolute and relative poverty.',
        ...points([{ name: 'Definition of absolute poverty (below a fixed minimum needed for basic needs)', marks: 1 }, { name: 'Definition of relative poverty (income significantly below the average/median in that society)', marks: 1 }]),
        answerStructureAdvice: 'Knowledge only - a precise definition of each earns full marks, no examples required.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Examine the possible causes of relative poverty in a developed economy.',
        ...points([{ name: 'Knowledge of a cause (e.g. unemployment, low pay, lack of education/skills)', marks: 2 }, { name: 'Application to a real or plausible group/scenario', marks: 2 }, { name: 'Analysis - a chain of reasoning from the cause to income falling well below the median', marks: 2 }, { name: 'Evaluation - weighing how significant this cause is relative to others', marks: 2 }]),
        answerStructureAdvice: 'Develop ONE cause (e.g. structural unemployment in a declining industry) into a full chain reaching low relative income.' },
      { markTariff: 12, requiresDiagram: false,
        questionText: 'Discuss whether economic growth alone is sufficient to reduce relative poverty in a country.',
        ...levels([
          { level: 1, marks: '1-4', descriptor: 'Basic description of growth and poverty with little real discussion.' },
          { level: 2, marks: '5-8', descriptor: 'Developed points on growth reducing absolute poverty with some evaluation of relative poverty.' },
          { level: 3, marks: '9-12', descriptor: 'Sustained, well-developed discussion of why growth can reduce absolute poverty while leaving (or even worsening) relative poverty if the gains are unequally distributed, with a clear judgement.' },
        ]),
        answerStructureAdvice: 'The key insight: growth can raise everyone\'s income (reducing absolute poverty) while relative poverty stays the same or worsens if the poorest households don\'t share proportionally in the gains.' },
    ],
  },
  {
    subtopic: T42, concept: 'Income and wealth inequality',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'The Gini coefficient measures:\nA. The absolute level of poverty in a country\nB. The degree of income (or wealth) inequality in a country, from 0 (perfect equality) to 1 (perfect inequality)\nC. The rate of economic growth\nD. The unemployment rate',
        ...mc(['A','B','C','D'], 2, 'The Gini coefficient is a summary statistic of inequality, derived from the Lorenz curve, ranging from 0 (everyone has equal income/wealth) to 1 (one person has everything).'),
        answerStructureAdvice: 'Remember the scale: 0 = perfect equality, 1 = perfect (maximum) inequality.' },
      { markTariff: 2, requiresDiagram: true,
        questionText: 'Explain what the Lorenz curve shows.',
        ...points([{ name: 'Reference to the cumulative % of income/wealth held by the cumulative % of the population', marks: 1 }, { name: 'Reference to the distance from the line of perfect equality showing the degree of inequality', marks: 1 }]),
        answerStructureAdvice: 'Two facts: WHAT is plotted on the curve, and HOW its shape (distance from the diagonal) reveals inequality.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Examine the difference between income inequality and wealth inequality.',
        ...points([{ name: 'Knowledge of income (a flow, over a period) versus wealth (a stock, at a point in time)', marks: 2 }, { name: 'Application - genuine examples of each', marks: 2 }, { name: 'Analysis - a chain of reasoning on why wealth inequality is often greater than income inequality', marks: 2 }, { name: 'Evaluation - weighing which matters more for living standards', marks: 2 }]),
        answerStructureAdvice: 'The flow/stock distinction is key: income is earned over a period (a flow), wealth is accumulated assets held at one point in time (a stock).' },
      { markTariff: 25, requiresDiagram: true,
        questionText: 'Evaluate the effectiveness of government policies aimed at reducing income inequality.',
        ...levels([
          { level: 1, marks: '1-6', descriptor: 'Generic knowledge of inequality with little application to specific policies.' },
          { level: 2, marks: '7-12', descriptor: 'Developed application to at least one named policy (e.g. progressive taxation) with some analysis.' },
          { level: 3, marks: '13-18', descriptor: 'Sustained analysis across more than one policy type with clear chains of reasoning on effectiveness.' },
          { level: 4, marks: '19-25', descriptor: 'Consistently well-developed, applied analysis across multiple distinct policies (progressive taxation, benefits, minimum wage, education spending) with a fully justified, balanced conclusion.' },
        ]),
        answerStructureAdvice: 'Bring in at least three distinct policy types (a tax policy, a benefits/transfer policy, and a labour-market policy like the minimum wage) so your evaluation can genuinely compare their relative effectiveness.' },
    ],
  },
  // ───────────────────────── 4.3 Emerging and developing economies ─────────────────────────
  {
    subtopic: T43, concept: 'Measures of development',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'The Human Development Index (HDI) is a composite measure combining:\nA. GDP per capita, inflation, and unemployment\nB. Income (GNI per capita), life expectancy, and education\nC. Exports, imports, and the exchange rate\nD. Government spending and taxation',
        ...mc(['A','B','C','D'], 2, 'The HDI combines a measure of income (GNI per capita), a health measure (life expectancy at birth), and an education measure (expected/mean years of schooling) into one index.'),
        answerStructureAdvice: 'Learn the THREE components of HDI: income, health (life expectancy), education.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain one limitation of using GDP per capita alone as a measure of development.',
        ...points([{ name: 'Naming a genuine limitation (e.g. ignores income distribution, ignores non-market activity, ignores quality of life factors)', marks: 1 }, { name: 'Brief development of that limitation', marks: 1 }]),
        answerStructureAdvice: 'Name the limitation clearly, then add one sentence explaining why it matters.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Examine why the Human Development Index (HDI) might give a more complete picture of development than GDP per capita alone.',
        ...points([{ name: 'Knowledge of the HDI\'s additional components (health, education)', marks: 2 }, { name: 'Application to a real or plausible country comparison', marks: 2 }, { name: 'Analysis - a chain of reasoning showing how two countries with similar GDP per capita could have different HDI scores', marks: 2 }, { name: 'Evaluation - weighing whether HDI itself still has limitations', marks: 2 }]),
        answerStructureAdvice: 'A concrete comparison (two countries with similar income but different life expectancy/education) demonstrates the point better than an abstract description.' },
      { markTariff: 12, requiresDiagram: false,
        questionText: 'Discuss the extent to which any single indicator can fully capture a country\'s level of economic development.',
        ...levels([
          { level: 1, marks: '1-4', descriptor: 'Basic description of one or two indicators with little real discussion of their limits.' },
          { level: 2, marks: '5-8', descriptor: 'Developed points on the limitations of at least one indicator with some evaluation.' },
          { level: 3, marks: '9-12', descriptor: 'Sustained, well-developed discussion of the limitations of GDP, HDI, and/or other measures (e.g. the Multidimensional Poverty Index), with a clear judgement on whether a combination of measures is needed.' },
        ]),
        answerStructureAdvice: 'Conclude that development is genuinely multi-dimensional - even the HDI misses things (e.g. inequality, environmental sustainability, political freedom) that a single number can\'t capture.' },
    ],
  },
  {
    subtopic: T43, concept: 'Factors influencing growth and development',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'Which of the following is most likely to be a barrier to growth and development in a developing economy?\nA. High levels of foreign direct investment\nB. Poor infrastructure and limited access to education\nC. Political stability\nD. A well-developed financial sector',
        ...mc(['A','B','C','D'], 2, 'Poor infrastructure and limited education directly reduce productive capacity and human capital - genuine barriers - while the other three options all describe conditions that typically SUPPORT growth and development.'),
        answerStructureAdvice: 'Look for the option describing an actual BARRIER, not a further supporting condition.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'Using an example, explain how a lack of infrastructure can act as a barrier to economic development.',
        ...points([{ name: 'Knowledge of infrastructure as a factor of development', marks: 1 }, { name: 'Application - a specific type of infrastructure (e.g. roads, electricity, internet access)', marks: 1 }, { name: 'Analysis - a chain of reasoning to reduced investment/productivity/trade', marks: 2 }]),
        answerStructureAdvice: 'Follow the chain: poor infrastructure → higher costs/reduced access to markets → less investment and lower productivity.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Examine the impact of political instability on the economic growth of a developing country.',
        ...points([{ name: 'Knowledge of political instability as a barrier to growth', marks: 2 }, { name: 'Application to a real or plausible developing economy', marks: 2 }, { name: 'Analysis - a chain of reasoning from instability to reduced FDI/investment', marks: 2 }, { name: 'Evaluation - weighing how significant this barrier is relative to other factors', marks: 2 }]),
        answerStructureAdvice: 'The clearest chain: instability raises the risk to investors → FDI and domestic investment fall → growth is held back.' },
      { markTariff: 15, requiresDiagram: false,
        questionText: 'Discuss the extent to which access to international trade is essential for the economic development of a developing country.',
        ...levels([
          { level: 1, marks: '1-5', descriptor: 'Basic, undeveloped points on trade and development with little wider discussion.' },
          { level: 2, marks: '6-10', descriptor: 'Developed knowledge and application of trade\'s benefits with some analysis and a simple judgement.' },
          { level: 3, marks: '11-15', descriptor: 'Sustained chains of reasoning weighing trade against at least one other genuine factor (e.g. domestic institutions, education, infrastructure), leading to a balanced, well-supported judgement on the word "essential".' },
        ]),
        answerStructureAdvice: 'Challenge "essential" directly - name at least one other genuinely important factor (strong institutions, education) and argue trade alone isn\'t sufficient without them.' },
    ],
  },
  {
    subtopic: T43, concept: 'Strategies influencing growth and development',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'A \'trade liberalisation\' strategy for economic development involves:\nA. Increasing tariffs and quotas to protect domestic industry\nB. Reducing barriers to trade to encourage exports and inward investment\nC. Nationalising all major industries\nD. Fixing the exchange rate permanently',
        ...mc(['A','B','C','D'], 2, 'Trade liberalisation means removing/reducing tariffs, quotas, and other trade barriers, opening the economy up to more international trade and investment as a growth strategy.'),
        answerStructureAdvice: 'Liberalisation = REMOVING barriers, the opposite of protectionism.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'Using an example, distinguish between a market-based development strategy and an interventionist development strategy.',
        ...points([{ name: 'Knowledge of a market-based strategy (e.g. trade liberalisation, deregulation, privatisation)', marks: 1 }, { name: 'Knowledge of an interventionist strategy (e.g. state-led industrialisation, infrastructure investment)', marks: 1 }, { name: 'Application - a genuine example of each', marks: 2 }]),
        answerStructureAdvice: 'One clear example of each (e.g. removing trade barriers vs. a state-funded infrastructure programme) makes the distinction concrete.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Examine the role of foreign aid in promoting economic development.',
        ...points([{ name: 'Knowledge of a type of foreign aid (e.g. bilateral, multilateral, humanitarian, development aid)', marks: 2 }, { name: 'Application to a real or plausible use of aid', marks: 2 }, { name: 'Analysis - a chain of reasoning from aid to a specific development outcome (e.g. improved infrastructure/education)', marks: 2 }, { name: 'Evaluation - weighing common criticisms (e.g. dependency, corruption/leakage)', marks: 2 }]),
        answerStructureAdvice: 'Develop ONE positive chain (aid funding a specific type of investment) and then weigh a genuine criticism (aid dependency, or funds not reaching intended projects) as your evaluation.' },
      { markTariff: 25, requiresDiagram: false,
        questionText: 'Evaluate the view that market-based strategies are more effective than interventionist strategies at promoting economic development.',
        ...levels([
          { level: 1, marks: '1-6', descriptor: 'Generic knowledge of one type of strategy with little comparison.' },
          { level: 2, marks: '7-12', descriptor: 'Developed application of at least one strategy from each category with some analysis.' },
          { level: 3, marks: '13-18', descriptor: 'Sustained analysis comparing market-based and interventionist strategies across multiple angles, with clear chains of reasoning.' },
          { level: 4, marks: '19-25', descriptor: 'Consistently well-developed, applied analysis recognising that effectiveness depends on a country\'s specific circumstances (institutions, starting point), with a fully justified, balanced conclusion.' },
        ]),
        answerStructureAdvice: 'A top answer avoids declaring one approach universally superior - argue that the BEST strategy depends on a country\'s specific institutional strength, starting level of development, and circumstances.' },
    ],
  },
  // ───────────────────────── 4.4 The financial sector ─────────────────────────
  {
    subtopic: T44, concept: 'Role of financial markets',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'One key economic function of financial markets is to:\nA. Set the level of government spending\nB. Channel funds from savers (surplus units) to borrowers (deficit units)\nC. Determine the rate of inflation directly\nD. Fix exchange rates between currencies',
        ...mc(['A','B','C','D'], 1, 'Financial markets (banks, stock markets, bond markets) intermediate between those with surplus funds (savers) and those needing funds (borrowers/investors), allocating capital across the economy.'),
        answerStructureAdvice: 'The core function to remember: connecting SAVERS with BORROWERS/investors.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by \'market rigging\' in a financial market.',
        ...points([{ name: 'Reference to traders/institutions colluding to manipulate a price or benchmark (e.g. an interest rate benchmark, an exchange rate)', marks: 1 }, { name: 'Reference to this distorting the market away from a fair, competitively determined outcome', marks: 1 }]),
        answerStructureAdvice: 'State WHAT is being manipulated and WHY it is harmful (an unfair, distorted outcome for other market participants).' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Examine the role of financial markets in facilitating economic growth.',
        ...points([{ name: 'Knowledge of financial markets channelling savings into investment', marks: 2 }, { name: 'Application to a real or plausible financing scenario (e.g. a firm raising capital via a stock market)', marks: 2 }, { name: 'Analysis - a chain of reasoning from efficient capital allocation to higher investment and growth', marks: 2 }, { name: 'Evaluation - weighing whether financial markets always allocate capital efficiently', marks: 2 }]),
        answerStructureAdvice: 'A strong evaluation point is that financial markets don\'t always allocate capital well - asset bubbles and short-termism are real risks worth naming.' },
      { markTariff: 12, requiresDiagram: false,
        questionText: 'Discuss the extent to which well-functioning financial markets are essential for economic growth.',
        ...levels([
          { level: 1, marks: '1-4', descriptor: 'Basic description of financial markets\' role with little real discussion of limits.' },
          { level: 2, marks: '5-8', descriptor: 'Developed points on their contribution to growth with some evaluation.' },
          { level: 3, marks: '9-12', descriptor: 'Sustained, well-developed discussion weighing their essential role in channelling investment against the real risks they can pose (instability, crises), with a clear judgement.' },
        ]),
        answerStructureAdvice: 'A well-developed answer acknowledges financial markets can also be a source of instability (e.g. the 2008 financial crisis) even while being essential for normal investment financing - hold both ideas together.' },
    ],
  },
  {
    subtopic: T44, concept: 'Market failure in the financial sector',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: '\'Moral hazard\' in the financial sector describes a situation where:\nA. A bank has perfect information about a borrower\nB. A party takes on more risk because they do not bear the full consequences of that risk\nC. Interest rates are set below the market equilibrium\nD. A financial market has too many competing firms',
        ...mc(['A','B','C','D'], 2, 'Moral hazard occurs when a party is insulated from the consequences of risk (e.g. a bank believing it will be bailed out) and so takes on excessive risk it otherwise wouldn\'t.'),
        answerStructureAdvice: 'Moral hazard is about incentives to take EXCESSIVE RISK once someone else bears the consequences - a form of market failure caused by information/incentive problems.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by \'too big to fail\' in relation to large financial institutions.',
        ...points([{ name: 'Reference to a bank being so large/interconnected that its failure would seriously damage the whole financial system', marks: 1 }, { name: 'Reference to this creating an expectation of a government bailout, encouraging excessive risk-taking', marks: 1 }]),
        answerStructureAdvice: 'Both facts matter: WHY the bank is systemically important, and HOW that expectation changes its behaviour (moral hazard).' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Examine why asymmetric information can lead to market failure in the market for financial products such as mortgages.',
        ...points([{ name: 'Knowledge of asymmetric information', marks: 2 }, { name: 'Application to mortgage lending specifically', marks: 2 }, { name: 'Analysis - a chain of reasoning to poor lending decisions/mispriced risk', marks: 2 }, { name: 'Evaluation - weighing how serious this contributed to a real financial crisis', marks: 2 }]),
        answerStructureAdvice: 'A strong, concrete example is lenders not fully knowing a borrower\'s true ability to repay - trace this through to risky loans being issued and mispriced.' },
      { markTariff: 25, requiresDiagram: false,
        questionText: 'Evaluate the extent to which market failure in the financial sector was the main cause of the 2008 global financial crisis.',
        ...levels([
          { level: 1, marks: '1-6', descriptor: 'Generic knowledge of the crisis with little application of specific market failure concepts.' },
          { level: 2, marks: '7-12', descriptor: 'Developed application of at least one market failure concept (e.g. moral hazard, asymmetric information) with some analysis.' },
          { level: 3, marks: '13-18', descriptor: 'Sustained analysis of multiple market failure concepts together, with clear chains of reasoning connecting them to the crisis.' },
          { level: 4, marks: '19-25', descriptor: 'Consistently well-developed, applied analysis of multiple genuine causes (market failure alongside regulatory failure/government failure) with a fully justified, balanced conclusion on which mattered most.' },
        ]),
        answerStructureAdvice: 'A top answer doesn\'t rely on market failure alone - weigh it against regulatory/government failure (weak oversight of the sector) to reach a genuinely balanced conclusion on the word "main".' },
    ],
  },
  {
    subtopic: T44, concept: 'Role of central banks',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'A central bank acting as \'lender of last resort\' means it:\nA. Refuses to lend to any commercial bank\nB. Provides emergency funds to solvent banks facing a short-term liquidity crisis, to prevent a wider banking collapse\nC. Sets the level of government taxation\nD. Directly controls all commercial bank lending decisions',
        ...mc(['A','B','C','D'], 2, 'As lender of last resort, a central bank provides emergency liquidity to banks that are fundamentally solvent but face a short-term cash shortage, to stop a bank run spreading and destabilising the wider system.'),
        answerStructureAdvice: 'Lender of last resort is about preventing a SYSTEMIC crisis, not routinely funding weak or insolvent banks.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'State two functions of a central bank, other than setting interest rates.',
        ...points([{ name: 'Naming any two of: lender of last resort, regulating/supervising the banking sector, managing the currency/foreign reserves, issuing banknotes', marks: 2 }]),
        answerStructureAdvice: 'One mark per correctly named function - no explanation needed.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Examine the role of a central bank in maintaining financial stability.',
        ...points([{ name: 'Knowledge of a financial stability function (e.g. regulation, lender of last resort)', marks: 2 }, { name: 'Application to a real or plausible scenario', marks: 2 }, { name: 'Analysis - a chain of reasoning from the function to preventing a wider financial crisis', marks: 2 }, { name: 'Evaluation - weighing how effective this role has been historically', marks: 2 }]),
        answerStructureAdvice: 'Develop ONE function (e.g. macroprudential regulation of bank capital requirements) fully into a chain reaching a more stable financial system.' },
      { markTariff: 12, requiresDiagram: false,
        questionText: 'Discuss the extent to which central bank independence improves the effectiveness of monetary policy.',
        ...levels([
          { level: 1, marks: '1-4', descriptor: 'Basic description of central bank independence with little real discussion of effectiveness.' },
          { level: 2, marks: '5-8', descriptor: 'Developed points on the benefits of independence with some evaluation.' },
          { level: 3, marks: '9-12', descriptor: 'Sustained, well-developed discussion weighing the credibility benefit of independence (freedom from short-term political pressure) against the democratic accountability concern, with a clear judgement.' },
        ]),
        answerStructureAdvice: 'Weigh the classic benefit (freeing policy from short-term electoral pressure, boosting inflation-fighting credibility) against the classic concern (an unelected body making decisions that affect everyone).' },
    ],
  },
  // ───────────────────────── 4.5 Role of the state in the macroeconomy ─────────────────────────
  {
    subtopic: T45, concept: 'Public expenditure',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'Capital expenditure by the government refers to spending on:\nA. Day-to-day running costs such as public sector wages\nB. Long-term physical/social infrastructure, such as roads, schools, and hospitals\nC. Interest payments on the national debt\nD. Welfare benefits paid to individuals',
        ...mc(['A','B','C','D'], 2, 'Capital expenditure is spending on long-lasting assets (infrastructure) that add to the economy\'s productive capacity, as opposed to current expenditure (day-to-day running costs like wages).'),
        answerStructureAdvice: 'Capital = long-term ASSETS; current = day-to-day RUNNING COSTS - a very common distinction to test.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain the difference between current and capital government expenditure.',
        ...points([{ name: 'Definition of current expenditure (day-to-day running costs, e.g. public sector wages)', marks: 1 }, { name: 'Definition of capital expenditure (spending on long-term infrastructure/assets)', marks: 1 }]),
        answerStructureAdvice: 'Knowledge only - a precise definition of each, no examples strictly required for full marks.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Examine the potential impact of increased government capital expenditure on long-run economic growth.',
        ...points([{ name: 'Knowledge of capital expenditure raising productive capacity', marks: 2 }, { name: 'Application to a specific type of infrastructure spending', marks: 2 }, { name: 'Analysis - a chain of reasoning from the spending to a rightward shift in LRAS', marks: 2 }, { name: 'Evaluation - weighing the opportunity cost/funding method of this spending', marks: 2 }]),
        answerStructureAdvice: 'The natural evaluation is opportunity cost - what is given up (higher borrowing, higher taxes, or cuts elsewhere) to fund the capital spending.' },
      { markTariff: 15, requiresDiagram: false,
        questionText: 'Discuss the extent to which government spending on infrastructure should be prioritised over spending on welfare benefits.',
        ...levels([
          { level: 1, marks: '1-5', descriptor: 'Basic, undeveloped points on either type of spending with little real comparison.' },
          { level: 2, marks: '6-10', descriptor: 'Developed knowledge and application of at least one type of spending with some analysis and a simple judgement.' },
          { level: 3, marks: '11-15', descriptor: 'Sustained chains of reasoning comparing the long-run growth case for infrastructure against the social/equity case for welfare spending, leading to a balanced, well-supported judgement.' },
        ]),
        answerStructureAdvice: 'Frame this as a genuine trade-off between long-run growth (infrastructure) and short-run social welfare/equity (benefits) rather than declaring one simply "better".' },
    ],
  },
  {
    subtopic: T45, concept: 'Taxation',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'A progressive tax is one where:\nA. The proportion of income paid in tax falls as income rises\nB. The proportion of income paid in tax rises as income rises\nC. Everyone pays exactly the same amount of tax regardless of income\nD. Only businesses pay the tax, never individuals',
        ...mc(['A','B','C','D'], 2, 'A progressive tax takes a larger PROPORTION of income from higher earners than lower earners - UK income tax, with its rising marginal rate bands, is a classic example.'),
        answerStructureAdvice: 'Progressive = higher % as income rises; regressive = lower % as income rises; proportional = same % regardless.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain why VAT (Value Added Tax) is often considered a regressive tax.',
        ...points([{ name: 'Reference to VAT being charged at the same rate regardless of income', marks: 1 }, { name: 'Reference to it therefore taking a larger proportion of a low earner\'s income than a high earner\'s', marks: 1 }]),
        answerStructureAdvice: 'The logic: a flat-rate tax on spending takes a BIGGER share of a low earner\'s income, since they spend a higher proportion of what they earn.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Examine the impact of raising the higher rate of income tax on tax revenue.',
        ...points([{ name: 'Knowledge of the relationship between tax rates and revenue', marks: 2 }, { name: 'Application - referencing the Laffer curve concept', marks: 2 }, { name: 'Analysis - a chain of reasoning to possible disincentive effects on work/tax avoidance', marks: 2 }, { name: 'Evaluation - weighing whether the UK is on the "correct" side of the Laffer curve', marks: 2 }]),
        answerStructureAdvice: 'Bring in the Laffer curve explicitly - beyond a certain tax rate, disincentive/avoidance effects can mean revenue actually FALLS as the rate rises further.' },
      { markTariff: 25, requiresDiagram: true,
        questionText: 'Evaluate the view that a more progressive tax system is always beneficial for an economy.',
        ...levels([
          { level: 1, marks: '1-6', descriptor: 'Generic knowledge of progressive taxation with little application.' },
          { level: 2, marks: '7-12', descriptor: 'Developed application to at least one benefit (reduced inequality) with some analysis.' },
          { level: 3, marks: '13-18', descriptor: 'Sustained analysis of both benefits (equity, automatic stabiliser effects) and costs (disincentive effects, potential capital/talent flight), with clear chains of reasoning.' },
          { level: 4, marks: '19-25', descriptor: 'Consistently well-developed, applied analysis referencing the Laffer curve and international competitiveness, with a fully justified conclusion directly addressing "always".' },
        ]),
        answerStructureAdvice: 'Directly reject "always" - weigh genuine equity/stabiliser benefits against a real risk of disincentive effects or skilled workers/capital relocating abroad if rates are pushed too high.' },
    ],
  },
  {
    subtopic: T45, concept: 'Public sector finances',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'The \'national debt\' refers to:\nA. The government\'s spending in a single year\nB. The total accumulated stock of government borrowing built up over time\nC. A single household\'s personal debt\nD. The trade deficit with other countries',
        ...mc(['A','B','C','D'], 2, 'The national debt is a STOCK - the total accumulated amount the government owes, built up from past budget deficits over many years - unlike the budget deficit, which is a FLOW measured over one year.'),
        answerStructureAdvice: 'Budget deficit = a FLOW (one year); national debt = a STOCK (the accumulated total) - a key, commonly-confused pair of terms.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by a \'structural budget deficit\'.',
        ...points([{ name: 'Reference to a deficit that persists even when the economy is at full employment/normal output', marks: 1 }, { name: 'Reference to it being caused by an underlying imbalance between spending and tax revenue, not the state of the trade cycle', marks: 1 }]),
        answerStructureAdvice: 'Contrast this with a CYCLICAL deficit (caused temporarily by a downturn) - structural means it wouldn\'t disappear even at full employment.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Examine the factors that determine the size of a government\'s budget deficit in any given year.',
        ...points([{ name: 'Knowledge of a determinant (e.g. the state of the economic cycle, discretionary fiscal policy)', marks: 2 }, { name: 'Application to a real or plausible scenario (e.g. a recession)', marks: 2 }, { name: 'Analysis - a chain of reasoning from the determinant to a larger/smaller deficit', marks: 2 }, { name: 'Evaluation - weighing the relative importance of cyclical versus structural factors', marks: 2 }]),
        answerStructureAdvice: 'The clearest chain: a recession → tax revenue falls (lower incomes/spending) and welfare spending rises (more unemployment) → the deficit widens automatically.' },
      { markTariff: 12, requiresDiagram: false,
        questionText: 'Discuss the extent to which a rising national debt is a serious problem for a country\'s economy.',
        ...levels([
          { level: 1, marks: '1-4', descriptor: 'Basic description of the national debt with little real discussion of consequences.' },
          { level: 2, marks: '5-8', descriptor: 'Developed points on the risks of a rising national debt with some evaluation.' },
          { level: 3, marks: '9-12', descriptor: 'Sustained, well-developed discussion weighing the risks (debt-servicing costs, credit rating, intergenerational burden) against mitigating factors (low interest rates, debt used to fund productive investment), with a clear judgement.' },
        ]),
        answerStructureAdvice: 'A nuanced answer distinguishes debt funding productive investment (potentially less concerning) from debt funding current spending, and considers whether interest rates on that debt are low or high.' },
    ],
  },
  {
    subtopic: T45, concept: 'Macroeconomic policies in a global context',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'A domestic interest rate cut is likely to be less effective at boosting a country\'s own economy the more:\nA. Closed the economy is to international trade and capital flows\nB. Open the economy is to international trade and capital flows\nC. High domestic unemployment already is\nD. Low domestic inflation already is',
        ...mc(['A','B','C','D'], 2, 'In a very open economy, some of the stimulus from a rate cut can leak abroad (e.g. via a weaker currency drawing in more imports, or capital moving to seek better returns elsewhere), diluting the domestic effect compared to a closed economy.'),
        answerStructureAdvice: 'Openness to trade/capital flows is the key factor in how much a domestic policy\'s effect "leaks" internationally rather than staying at home.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by \'policy spillover\' in an interconnected global economy.',
        ...points([{ name: 'Reference to one country\'s economic policy affecting other countries\' economies', marks: 1 }, { name: 'Reference to this happening via channels such as trade or exchange rates/capital flows', marks: 1 }]),
        answerStructureAdvice: 'State WHAT happens (one country\'s policy affects others) and HOW (via trade or capital flow channels).' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Examine why international coordination of macroeconomic policy might be beneficial during a global recession.',
        ...points([{ name: 'Knowledge of policy spillovers between interconnected economies', marks: 2 }, { name: 'Application to a real or plausible global downturn scenario', marks: 2 }, { name: 'Analysis - a chain of reasoning showing coordinated stimulus avoids one country\'s efforts leaking abroad while others free-ride', marks: 2 }, { name: 'Evaluation - weighing the practical difficulty of achieving genuine international coordination', marks: 2 }]),
        answerStructureAdvice: 'A strong evaluation point is that countries have differing domestic priorities and political constraints, making genuine, sustained coordination difficult in practice.' },
      { markTariff: 25, requiresDiagram: false,
        questionText: 'Evaluate the extent to which a country\'s domestic macroeconomic policy is constrained by its position within the global economy.',
        ...levels([
          { level: 1, marks: '1-6', descriptor: 'Generic knowledge of globalisation with little application to specific policy constraints.' },
          { level: 2, marks: '7-12', descriptor: 'Developed application to at least one policy area (e.g. monetary policy) with some analysis.' },
          { level: 3, marks: '13-18', descriptor: 'Sustained analysis across more than one policy area (monetary, fiscal, exchange rate) with clear chains of reasoning on global constraints.' },
          { level: 4, marks: '19-25', descriptor: 'Consistently well-developed, applied analysis recognising both genuine constraints (capital mobility, exchange rate pressures, trade dependence) and the degree of policy independence a country still retains, with a fully justified, balanced conclusion.' },
        ]),
        answerStructureAdvice: 'A top answer avoids treating policy as either fully independent or fully constrained - weigh genuine limits (capital flight risk, competitiveness pressures) against real remaining freedom (a country still sets its own tax rates and spending priorities).' },
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

  console.log(`Inserting ${rows.length} practice questions (Theme 4) across ${byConcept.size} concepts...`);
  const { error } = await supabase.from('practice_questions').insert(rows);
  if (error) { console.error('Insert failed:', JSON.stringify(error)); process.exit(1); }
  console.log('Done.');
}

main();
