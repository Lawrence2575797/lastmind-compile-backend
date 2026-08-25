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

// Every question here is original content written for LastMind - none are
// copied from any real Edexcel past paper. Mark scheme structures (points
// vs levels, AO weightings per tariff) reflect the REAL, researched
// Edexcel A-Level Economics A conventions, but the level/criterion
// descriptor wording is written independently, not quoted from any
// Pearson document.

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

const SUBTOPIC_1_1 = '1.1 Nature of economics';
const SUBTOPIC_1_2 = '1.2 How markets work';

const QUESTIONS = [
  // ───────────────────────── 1.1 Nature of economics ─────────────────────────
  {
    subtopic: SUBTOPIC_1_1,
    concept: 'Positive and normative statements',
    questions: [
      {
        markTariff: 1, requiresDiagram: false,
        questionText: 'Which of the following is a normative statement?\nA. Unemployment in the UK was 4.2% last month.\nB. The government should increase the minimum wage.\nC. Higher interest rates tend to reduce consumer spending.\nD. Inflation was above the Bank of England\'s 2% target in 2023.',
        ...mc(['A', 'B', 'C', 'D'], 1, 'Normative statements contain a value judgement about what OUGHT to happen, signalled by words like "should". The others are positive statements: testable, fact-based claims.'),
        answerStructureAdvice: 'Multiple choice questions are marked right or wrong - look for the word that signals an opinion or value judgement rather than a testable fact.',
      },
      {
        markTariff: 2, requiresDiagram: false,
        questionText: 'Explain the difference between a positive and a normative economic statement.',
        ...points([{ name: 'Positive statement definition', marks: 1 }, { name: 'Normative statement definition', marks: 1 }]),
        answerStructureAdvice: 'This is knowledge-only - just define both terms clearly and accurately. You don\'t need examples or application to earn full marks here.',
      },
      {
        markTariff: 8, requiresDiagram: false,
        questionText: 'Examine whether economic policy should be based only on positive statements.',
        ...points([
          { name: 'Knowledge of the positive/normative distinction', marks: 2 },
          { name: 'Application to a real policy example', marks: 2 },
          { name: 'Analysis - a developed chain of reasoning linking objectivity to policy design', marks: 2 },
          { name: 'Evaluation - weighing whether value judgements are unavoidable in policy', marks: 2 },
        ]),
        answerStructureAdvice: 'An 8-mark "Examine" needs real evaluation - don\'t just describe the distinction, weigh up whether policy actually could (or should) rely only on positive statements.',
      },
      {
        markTariff: 15, requiresDiagram: false,
        questionText: 'Discuss the extent to which economics can be considered a value-free social science.',
        ...levels([
          { level: 1, marks: '1-5', descriptor: 'Basic, undeveloped points on positive/normative economics with little application.' },
          { level: 2, marks: '6-10', descriptor: 'Developed knowledge and application with some analysis and a simple judgement.' },
          { level: 3, marks: '11-15', descriptor: 'Sustained chains of reasoning across multiple angles, applied throughout, leading to a balanced, well-supported judgement.' },
        ]),
        answerStructureAdvice: 'This is levels-marked, not points-added - plan two well-developed lines of argument (e.g. the objectivity of positive statements vs. the value judgements built into any policy goal) rather than many short ones, and end with a genuine judgement.',
      },
    ],
  },
  {
    subtopic: SUBTOPIC_1_1,
    concept: 'The economic problem: scarcity and choice',
    questions: [
      {
        markTariff: 1, requiresDiagram: false,
        questionText: 'The basic economic problem arises because:\nA. Governments intervene too much in markets\nB. Wants are unlimited but resources are finite\nC. Firms aim to maximise profit\nD. Prices are set by supply and demand',
        ...mc(['A', 'B', 'C', 'D'], 1, 'The economic problem is the mismatch between unlimited human wants and the finite resources available to satisfy them - not a statement about firms, prices, or government.'),
        answerStructureAdvice: 'Marked right or wrong - focus on what the economic problem fundamentally IS, not on any one actor\'s behaviour.',
      },
      {
        markTariff: 4, requiresDiagram: false,
        questionText: 'Using an example, explain why scarcity forces individuals to make economic choices.',
        ...points([
          { name: 'Knowledge of scarcity', marks: 1 },
          { name: 'Application via a specific example', marks: 1 },
          { name: 'Analysis - a chain of reasoning from scarcity to the need to choose', marks: 2 },
        ]),
        answerStructureAdvice: 'Use a genuine, specific example (not just "a person choosing between two things"), then build a clear because-leads-to-therefore chain from limited resources to the need to choose.',
      },
      {
        markTariff: 10, requiresDiagram: false,
        questionText: 'Assess the view that scarcity is the most significant problem facing a developing economy.',
        ...levels([
          { level: 1, marks: '1-3', descriptor: 'Isolated, undeveloped knowledge of scarcity.' },
          { level: 2, marks: '4-7', descriptor: 'Developed, applied points with some analysis and a simple assessment.' },
          { level: 3, marks: '8-10', descriptor: 'Sustained, well-applied analysis with a substantiated judgement weighing scarcity against at least one other genuine constraint.' },
        ]),
        answerStructureAdvice: 'One well-developed point is enough if you push it far enough - don\'t spread yourself thin. Your judgement needs to directly weigh scarcity against another named problem (e.g. political instability, lack of infrastructure).',
      },
      {
        markTariff: 25, requiresDiagram: false,
        questionText: 'Evaluate the extent to which the concept of opportunity cost helps explain how individuals, firms, and governments make decisions.',
        ...levels([
          { level: 1, marks: '1-6', descriptor: 'Basic, generic knowledge with little application.' },
          { level: 2, marks: '7-12', descriptor: 'Developed knowledge applied to at least one decision-maker, with some analysis.' },
          { level: 3, marks: '13-18', descriptor: 'Sustained analysis applied across multiple decision-makers with clear chains of reasoning.' },
          { level: 4, marks: '19-25', descriptor: 'Consistently well-developed, applied analysis across all three decision-makers with a fully justified, balanced conclusion.' },
        ]),
        answerStructureAdvice: 'At 25 marks you need at least two well-developed paragraphs covering more than one type of decision-maker (individuals, firms, AND government) before your evaluation - one short paragraph per group won\'t have enough depth.',
      },
    ],
  },
  {
    subtopic: SUBTOPIC_1_1,
    concept: 'Opportunity cost',
    questions: [
      {
        markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by the term \'opportunity cost\'.',
        ...points([{ name: 'Accurate definition of opportunity cost', marks: 2 }]),
        answerStructureAdvice: 'A precise, textbook-accurate definition - the value of the next best alternative foregone - is enough for full marks here.',
      },
      {
        markTariff: 8, requiresDiagram: false,
        questionText: 'Examine the opportunity costs a government might face when deciding to increase spending on healthcare.',
        ...points([
          { name: 'Knowledge of opportunity cost', marks: 2 },
          { name: 'Application to government healthcare spending', marks: 2 },
          { name: 'Analysis - a chain of reasoning on what is foregone', marks: 2 },
          { name: 'Evaluation - weighing the significance of the opportunity cost', marks: 2 },
        ]),
        answerStructureAdvice: 'Name at least one specific alternative use of the money (e.g. education, defence) rather than a vague "other things" - specificity is what earns the application marks.',
      },
      {
        markTariff: 12, requiresDiagram: false,
        questionText: 'Discuss whether the opportunity cost of studying for a degree is higher for an 18-year-old school leaver than for a 30-year-old with five years of work experience.',
        ...levels([
          { level: 1, marks: '1-4', descriptor: 'Undeveloped knowledge with little real comparison between the two individuals.' },
          { level: 2, marks: '5-8', descriptor: 'Developed application to both individuals with some analysis and evaluation.' },
          { level: 3, marks: '9-12', descriptor: 'Sustained comparative analysis of both individuals with a well-supported judgement.' },
        ]),
        answerStructureAdvice: 'Depth over breadth at 12 marks - make fewer points but develop them fully, and explicitly compare the two named individuals rather than discussing opportunity cost in the abstract.',
      },
      {
        markTariff: 25, requiresDiagram: false,
        questionText: 'Evaluate the significance of opportunity cost in explaining a firm\'s decision to relocate its production overseas.',
        ...levels([
          { level: 1, marks: '1-6', descriptor: 'Generic knowledge with little application to the specific scenario.' },
          { level: 2, marks: '7-12', descriptor: 'Developed application with some analysis.' },
          { level: 3, marks: '13-18', descriptor: 'Sustained analysis with multiple developed points.' },
          { level: 4, marks: '19-25', descriptor: 'Consistently well-developed analysis across at least two distinct angles with a fully justified conclusion.' },
        ]),
        answerStructureAdvice: 'Cover at least two distinct, well-developed paragraphs (e.g. labour cost savings vs. the opportunity cost of lost domestic jobs/investment) before your evaluation.',
      },
    ],
  },
  {
    subtopic: SUBTOPIC_1_1,
    concept: 'Production possibility frontiers',
    questions: [
      {
        markTariff: 1, requiresDiagram: true,
        questionText: 'A point inside a country\'s production possibility frontier (PPF) represents:\nA. An unattainable combination of output\nB. Productive efficiency\nC. Unemployed or underused resources\nD. Economic growth',
        ...mc(['A', 'B', 'C', 'D'], 2, 'A point inside the PPF shows the economy is not using all its resources fully or efficiently - it could produce more of at least one good without giving up any of the other. Points ON the frontier represent productive efficiency; points OUTSIDE are currently unattainable.'),
        answerStructureAdvice: 'Picture the diagram: inside the curve means spare capacity, on the curve means full/efficient use, outside means not currently possible.',
      },
      {
        markTariff: 4, requiresDiagram: true,
        questionText: 'Explain how a PPF diagram illustrates the concept of opportunity cost.',
        ...points([
          { name: 'Knowledge of PPF/opportunity cost', marks: 1 },
          { name: 'Application - describing movement along the curve', marks: 1 },
          { name: 'Analysis - a chain of reasoning linking movement along the curve to cost', marks: 2 },
        ]),
        answerStructureAdvice: 'Even without drawing it, describe the diagram precisely in words - moving along the curve, the amount of one good given up to produce more of the other IS the opportunity cost.',
      },
      {
        markTariff: 8, requiresDiagram: true,
        questionText: 'Examine how an outward shift of a country\'s production possibility frontier might occur.',
        ...points([
          { name: 'Knowledge of PPF shifts', marks: 2 },
          { name: 'Application - a real cause of a shift', marks: 2 },
          { name: 'Analysis - a chain of reasoning from cause to shift', marks: 2 },
          { name: 'Evaluation - weighing significance or limits', marks: 2 },
        ]),
        answerStructureAdvice: 'Name at least two genuinely distinct causes (e.g. improved technology AND a growing labour force) rather than the same cause described twice in different words.',
      },
      {
        markTariff: 12, requiresDiagram: true,
        questionText: 'Discuss the extent to which a production possibility frontier diagram is a realistic representation of a real economy\'s choices.',
        ...levels([
          { level: 1, marks: '1-4', descriptor: 'Basic description of PPF assumptions with little real discussion.' },
          { level: 2, marks: '5-8', descriptor: 'Developed points on realism/unrealism with some evaluation.' },
          { level: 3, marks: '9-12', descriptor: 'Sustained, well-developed discussion of the model\'s assumptions and limitations with a clear judgement.' },
        ]),
        answerStructureAdvice: 'Focus on the model\'s simplifying assumptions (only two goods, fixed resources/technology) - name them explicitly and judge how much they limit real-world realism.',
      },
    ],
  },
  {
    subtopic: SUBTOPIC_1_1,
    concept: 'Specialisation and division of labour',
    questions: [
      {
        markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by \'division of labour\'.',
        ...points([{ name: 'Accurate definition', marks: 2 }]),
        answerStructureAdvice: 'Define it precisely: breaking a production process down into separate, specialised tasks performed by different workers.',
      },
      {
        markTariff: 10, requiresDiagram: false,
        questionText: 'Assess the benefits to a firm of adopting a greater division of labour in its production process.',
        ...levels([
          { level: 1, marks: '1-3', descriptor: 'Undeveloped knowledge of benefits.' },
          { level: 2, marks: '4-7', descriptor: 'Developed, applied benefits with some analysis and assessment.' },
          { level: 3, marks: '8-10', descriptor: 'Sustained analysis of multiple benefits with a substantiated assessment, ideally acknowledging limits.' },
        ]),
        answerStructureAdvice: 'Go beyond "increased productivity" - explain WHY specialisation raises productivity (less time switching tasks, workers becoming more skilled at a narrow task) to earn the higher analysis marks.',
      },
      {
        markTariff: 15, requiresDiagram: false,
        questionText: 'Discuss the view that increased specialisation and division of labour always benefits workers.',
        ...levels([
          { level: 1, marks: '1-5', descriptor: 'Basic, one-sided knowledge.' },
          { level: 2, marks: '6-10', descriptor: 'Developed points on both benefits and drawbacks with some evaluation.' },
          { level: 3, marks: '11-15', descriptor: 'Sustained, balanced chains of reasoning on both sides with a well-justified conclusion.' },
        ]),
        answerStructureAdvice: 'The word "always" is doing a lot of work here - challenge it directly, bringing in a genuine downside for workers (monotony, deskilling, alienation) alongside the productivity/wage benefits.',
      },
      {
        markTariff: 25, requiresDiagram: false,
        questionText: 'Evaluate the economic case for a country specialising in the production of goods where it holds a comparative advantage.',
        ...levels([
          { level: 1, marks: '1-6', descriptor: 'Generic knowledge of comparative advantage with little application.' },
          { level: 2, marks: '7-12', descriptor: 'Developed application with some analysis.' },
          { level: 3, marks: '13-18', descriptor: 'Sustained analysis across multiple angles.' },
          { level: 4, marks: '19-25', descriptor: 'Consistently well-developed analysis with a fully justified conclusion weighing benefits against real-world limitations.' },
        ]),
        answerStructureAdvice: 'Explicitly explain comparative advantage\'s logic (differing opportunity costs of production between countries) in your KAA paragraphs, then evaluate using real-world limitations like transport costs, over-specialisation risk, or trade barriers.',
      },
    ],
  },
  {
    subtopic: SUBTOPIC_1_1,
    concept: 'Economic systems: free market, mixed, and command economies',
    questions: [
      {
        markTariff: 1, requiresDiagram: false,
        questionText: 'In a command economy, the allocation of resources is primarily determined by:\nA. The price mechanism responding to supply and demand\nB. Central government planning\nC. Individual consumer preferences alone\nD. Competition between private firms',
        ...mc(['A', 'B', 'C', 'D'], 1, 'A command (or planned) economy is characterised by the state directing what is produced and how resources are allocated, rather than market prices (free market) or a combination of both (mixed economy).'),
        answerStructureAdvice: 'Focus on WHO is making the allocation decisions in each system, not on outcomes like prices or output.',
      },
      {
        markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by a \'mixed economy\'.',
        ...points([{ name: 'Accurate definition combining market and government allocation', marks: 2 }]),
        answerStructureAdvice: 'Define it precisely as an economy where resources are allocated through BOTH the price mechanism/market forces AND government intervention - not just "a bit of both" vaguely.',
      },
      {
        markTariff: 15, requiresDiagram: false,
        questionText: 'Discuss the case for a country moving from a command economy towards a more market-based system.',
        ...levels([
          { level: 1, marks: '1-5', descriptor: 'Basic, generic knowledge of economic systems.' },
          { level: 2, marks: '6-10', descriptor: 'Developed points for and against, with some evaluation.' },
          { level: 3, marks: '11-15', descriptor: 'Sustained, balanced analysis with a well-justified conclusion.' },
        ]),
        answerStructureAdvice: 'Discuss both sides properly - the efficiency/incentive gains often claimed for markets, and a genuine risk (e.g. inequality, loss of state provision) before reaching your judgement.',
      },
      {
        markTariff: 25, requiresDiagram: false,
        questionText: 'Evaluate the extent to which a free market economy can be relied upon to allocate resources efficiently.',
        ...levels([
          { level: 1, marks: '1-6', descriptor: 'Basic knowledge with little real application.' },
          { level: 2, marks: '7-12', descriptor: 'Developed application with some analysis.' },
          { level: 3, marks: '13-18', descriptor: 'Sustained analysis across multiple angles.' },
          { level: 4, marks: '19-25', descriptor: 'Consistently well-developed analysis with a fully justified, balanced conclusion explicitly weighing market failure against market strengths.' },
        ]),
        answerStructureAdvice: 'A strong answer explicitly brings in market failure as the main limitation on the free market\'s efficiency claim - linking forward to a later topic is exactly what a top-band answer does.',
      },
    ],
  },
  // ───────────────────────── 1.2 How markets work ─────────────────────────
  {
    subtopic: SUBTOPIC_1_2,
    concept: 'Rational decision-making',
    questions: [
      {
        markTariff: 1, requiresDiagram: false,
        questionText: 'Traditional economic theory assumes that consumers are:\nA. Altruistic\nB. Rational utility-maximisers\nC. Prone to systematic bias\nD. Indifferent to price',
        ...mc(['A', 'B', 'C', 'D'], 1, 'The standard "rational economic man" assumption is that individuals make decisions that maximise their own utility (satisfaction), using all available information consistently.'),
        answerStructureAdvice: 'This is testing the standard textbook assumption, not a real-world observation - focus on what the MODEL assumes.',
      },
      {
        markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by "rational decision-making" in economics.',
        ...points([{ name: 'Accurate definition of rational decision-making', marks: 2 }]),
        answerStructureAdvice: 'Define it as decision-makers acting consistently to maximise their own self-interest/utility given the information available to them.',
      },
      {
        markTariff: 10, requiresDiagram: false,
        questionText: 'Assess whether the assumption of rational decision-making is a useful starting point for economic models.',
        ...levels([
          { level: 1, marks: '1-3', descriptor: 'Undeveloped knowledge of the rationality assumption.' },
          { level: 2, marks: '4-7', descriptor: 'Developed points on its usefulness and limits, with some assessment.' },
          { level: 3, marks: '8-10', descriptor: 'Sustained analysis with a substantiated judgement on usefulness versus realism.' },
        ]),
        answerStructureAdvice: 'A strong answer acknowledges the assumption is a simplification, but still assesses why it remains a USEFUL starting point (predictability, tractable models) even if not perfectly realistic.',
      },
      {
        markTariff: 12, requiresDiagram: false,
        questionText: 'Discuss the extent to which real consumer behaviour matches the rational decision-making assumption.',
        ...levels([
          { level: 1, marks: '1-4', descriptor: 'Basic, one-sided knowledge.' },
          { level: 2, marks: '5-8', descriptor: 'Developed points on both matching and diverging behaviour.' },
          { level: 3, marks: '9-12', descriptor: 'Sustained, balanced discussion with a well-justified conclusion.' },
        ]),
        answerStructureAdvice: 'Bring in specific real-world examples of behaviour that DOESN\'T match the assumption (e.g. impulse buying, herd behaviour) to earn the higher marks, not just abstract description.',
      },
    ],
  },
  {
    subtopic: SUBTOPIC_1_2,
    concept: 'Demand and the law of demand',
    questions: [
      {
        markTariff: 4, requiresDiagram: true,
        questionText: 'Explain the law of demand, using a demand curve to support your answer.',
        ...points([
          { name: 'Knowledge of the law of demand', marks: 1 },
          { name: 'Application - reference to the demand curve\'s shape', marks: 1 },
          { name: 'Analysis - chain of reasoning on why price and quantity demanded are inversely related', marks: 2 },
        ]),
        answerStructureAdvice: 'Describe the downward-sloping curve in words if you can\'t draw it, and explain WHY demand falls as price rises (e.g. the substitution and income effects), not just that it does.',
      },
      {
        markTariff: 8, requiresDiagram: true,
        questionText: 'Examine the factors, other than price, that could cause an increase in demand for a good.',
        ...points([
          { name: 'Knowledge of non-price determinants of demand', marks: 2 },
          { name: 'Application to a real good/market', marks: 2 },
          { name: 'Analysis - chain of reasoning on how each factor shifts the curve', marks: 2 },
          { name: 'Evaluation - weighing which factor is likely most significant', marks: 2 },
        ]),
        answerStructureAdvice: 'Name at least two genuinely different determinants (e.g. income, price of a substitute, advertising/tastes) rather than variations on the same one.',
      },
      {
        markTariff: 10, requiresDiagram: true,
        questionText: 'Assess the view that consumer income is the most significant determinant of demand for a normal good.',
        ...levels([
          { level: 1, marks: '1-3', descriptor: 'Undeveloped knowledge of demand determinants.' },
          { level: 2, marks: '4-7', descriptor: 'Developed application and analysis with a simple assessment.' },
          { level: 3, marks: '8-10', descriptor: 'Sustained analysis with a substantiated judgement weighing income against at least one other determinant.' },
        ]),
        answerStructureAdvice: 'Make sure you actually compare income against another named determinant (e.g. tastes, price of substitutes) rather than only discussing income in isolation.',
      },
      {
        markTariff: 2, requiresDiagram: false,
        questionText: 'Explain the difference between a movement along a demand curve and a shift of the demand curve.',
        ...points([{ name: 'Movement along the curve (caused by a price change)', marks: 1 }, { name: 'Shift of the curve (caused by a non-price determinant)', marks: 1 }]),
        answerStructureAdvice: 'This is a common source of confusion - be explicit that a movement is caused ONLY by a change in the good\'s own price, while a shift is caused by anything else.',
      },
    ],
  },
  {
    subtopic: SUBTOPIC_1_2,
    concept: 'Price elasticity of demand (PED)',
    questions: [
      {
        markTariff: 1, requiresDiagram: false,
        questionText: 'If a 10% increase in the price of a good leads to a 20% fall in quantity demanded, demand for the good is:\nA. Perfectly inelastic\nB. Price inelastic\nC. Price elastic\nD. Unitary elastic',
        ...mc(['A', 'B', 'C', 'D'], 2, 'Since the percentage change in quantity demanded (20%) is greater than the percentage change in price (10%), PED is greater than 1 in magnitude, meaning demand is price elastic.'),
        answerStructureAdvice: 'This is a calculation-recognition question - compare the two percentage changes directly rather than the raw numbers.',
      },
      {
        markTariff: 2, requiresDiagram: false,
        questionText: 'A good has a price of £8 and quantity demanded of 200 units. When the price rises to £9, quantity demanded falls to 170 units. Calculate the price elasticity of demand.',
        ...points([{ name: 'Correct PED calculation shown with working', marks: 2 }]),
        answerStructureAdvice: 'This is a maths question - show your working: % change in quantity demanded ÷ % change in price, and don\'t forget PED is conventionally negative (though often quoted as its absolute value).',
      },
      {
        markTariff: 8, requiresDiagram: true,
        questionText: 'Examine how knowledge of price elasticity of demand might affect a firm\'s pricing decisions.',
        ...points([
          { name: 'Knowledge of PED', marks: 2 },
          { name: 'Application to a firm\'s pricing decision', marks: 2 },
          { name: 'Analysis - chain of reasoning linking PED to revenue changes', marks: 2 },
          { name: 'Evaluation - weighing when this matters most', marks: 2 },
        ]),
        answerStructureAdvice: 'Link PED explicitly to total revenue: for an inelastic good, raising price increases revenue; for an elastic good, it reduces it. That link is the core of the analysis mark.',
      },
      {
        markTariff: 12, requiresDiagram: true,
        questionText: 'Discuss the factors that determine whether the demand for a good is price elastic or price inelastic.',
        ...levels([
          { level: 1, marks: '1-4', descriptor: 'Basic, list-like knowledge of determinants.' },
          { level: 2, marks: '5-8', descriptor: 'Developed application of determinants to specific goods.' },
          { level: 3, marks: '9-12', descriptor: 'Sustained, well-developed discussion with a clear judgement on which determinants matter most.' },
        ]),
        answerStructureAdvice: 'Depth over breadth - fully develop two or three determinants (availability of substitutes, necessity vs. luxury, proportion of income spent) with real examples, rather than listing many determinants shallowly.',
      },
    ],
  },
  {
    subtopic: SUBTOPIC_1_2,
    concept: 'Income elasticity of demand (YED)',
    questions: [
      {
        markTariff: 4, requiresDiagram: false,
        questionText: 'Using a calculation, explain whether a good with a YED of -0.6 is a normal or inferior good.',
        ...points([
          { name: 'Knowledge - correct interpretation of a negative YED', marks: 1 },
          { name: 'Application - identifying the good as inferior', marks: 1 },
          { name: 'Analysis - reasoning linking the negative sign to falling demand as income rises', marks: 2 },
        ]),
        answerStructureAdvice: 'The SIGN of YED is what matters here: negative means demand falls as income rises, which is the definition of an inferior good.',
      },
      {
        markTariff: 8, requiresDiagram: false,
        questionText: 'Examine why a firm selling a luxury good might be more vulnerable to an economic downturn than a firm selling a necessity.',
        ...points([
          { name: 'Knowledge of YED for luxuries vs. necessities', marks: 2 },
          { name: 'Application to a specific luxury and necessity good', marks: 2 },
          { name: 'Analysis - chain of reasoning from falling income to falling demand', marks: 2 },
          { name: 'Evaluation - weighing how significant this vulnerability really is', marks: 2 },
        ]),
        answerStructureAdvice: 'Name a real luxury good (high positive YED) and a real necessity (low/inelastic YED) to earn the application marks, not just the abstract categories.',
      },
      {
        markTariff: 10, requiresDiagram: false,
        questionText: 'Assess the usefulness of income elasticity of demand to a business planning for a future recession.',
        ...levels([
          { level: 1, marks: '1-3', descriptor: 'Undeveloped knowledge of YED.' },
          { level: 2, marks: '4-7', descriptor: 'Developed application with some analysis and assessment.' },
          { level: 3, marks: '8-10', descriptor: 'Sustained, well-applied analysis with a substantiated judgement on usefulness and its limits.' },
        ]),
        answerStructureAdvice: 'A top-band answer acknowledges a real limitation too - e.g. that YED estimates are based on past data and may not hold during an unusually severe or unusual recession.',
      },
      {
        markTariff: 1, requiresDiagram: false,
        questionText: 'A good with a positive income elasticity of demand greater than 1 is best described as:\nA. An inferior good\nB. A necessity\nC. A luxury good\nD. A Giffen good',
        ...mc(['A', 'B', 'C', 'D'], 2, 'A YED greater than 1 means demand rises more than proportionally as income rises - the defining characteristic of a luxury good.'),
        answerStructureAdvice: 'Compare the SIZE of the YED value to 1, not just whether it\'s positive or negative.',
      },
    ],
  },
  {
    subtopic: SUBTOPIC_1_2,
    concept: 'Cross elasticity of demand (XED)',
    questions: [
      {
        markTariff: 1, requiresDiagram: false,
        questionText: 'A positive cross elasticity of demand between two goods indicates that they are:\nA. Complements\nB. Substitutes\nC. Inferior goods\nD. Necessities',
        ...mc(['A', 'B', 'C', 'D'], 1, 'A positive XED means that as the price of one good rises, demand for the other rises too - this is the defining characteristic of substitute goods.'),
        answerStructureAdvice: 'Focus on the SIGN: positive = substitutes, negative = complements.',
      },
      {
        markTariff: 8, requiresDiagram: false,
        questionText: 'Examine the significance of cross elasticity of demand for a firm operating in a market with close substitutes.',
        ...points([
          { name: 'Knowledge of XED for substitutes', marks: 2 },
          { name: 'Application to a real market with close substitutes', marks: 2 },
          { name: 'Analysis - chain of reasoning on how a rival\'s price change affects this firm\'s demand', marks: 2 },
          { name: 'Evaluation - weighing how much this constrains the firm\'s own pricing freedom', marks: 2 },
        ]),
        answerStructureAdvice: 'Explain the mechanism precisely: a HIGH positive XED means a rival cutting its price will noticeably reduce this firm\'s own demand - that sensitivity is the "significance" the question is asking about.',
      },
      {
        markTariff: 12, requiresDiagram: false,
        questionText: 'Discuss how a firm might use its knowledge of cross elasticity of demand to inform its business strategy.',
        ...levels([
          { level: 1, marks: '1-4', descriptor: 'Basic, list-like knowledge of XED.' },
          { level: 2, marks: '5-8', descriptor: 'Developed application to pricing or product strategy with some analysis.' },
          { level: 3, marks: '9-12', descriptor: 'Sustained, well-developed discussion covering multiple strategic uses with a clear judgement.' },
        ]),
        answerStructureAdvice: 'Cover more than one strategic use (e.g. monitoring rival pricing for substitutes, and bundling/pricing complements together) to reach the top level, not just one idea repeated.',
      },
      {
        markTariff: 2, requiresDiagram: false,
        questionText: 'Two goods have a cross elasticity of demand of -1.4. Explain what this value tells you about the relationship between the two goods.',
        ...points([{ name: 'Correct identification: strong complements', marks: 1 }, { name: 'Explanation linking the negative sign and size to strength of the complementary relationship', marks: 1 }]),
        answerStructureAdvice: 'Address both the SIGN (negative = complements) and the SIZE (further from zero = a stronger relationship) of the value given.',
      },
    ],
  },
  {
    subtopic: SUBTOPIC_1_2,
    concept: 'Supply and the law of supply',
    questions: [
      {
        markTariff: 1, requiresDiagram: true,
        questionText: 'The law of supply states that, other things being equal, as price rises:\nA. Quantity supplied falls\nB. Quantity supplied rises\nC. Quantity demanded rises\nD. Supply shifts left',
        ...mc(['A', 'B', 'C', 'D'], 1, 'The law of supply describes a direct (positive) relationship between price and quantity supplied - as price rises, firms are willing to supply more, all else equal.'),
        answerStructureAdvice: 'Don\'t confuse a movement ALONG the supply curve (this question) with a SHIFT of the whole curve.',
      },
      {
        markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by the "law of supply".',
        ...points([{ name: 'Accurate definition of the law of supply', marks: 2 }]),
        answerStructureAdvice: 'State the direct relationship clearly: as price rises, quantity supplied rises, other things being equal.',
      },
      {
        markTariff: 8, requiresDiagram: true,
        questionText: 'Examine the factors, other than price, that could cause a decrease in the supply of a good.',
        ...points([
          { name: 'Knowledge of non-price determinants of supply', marks: 2 },
          { name: 'Application to a real good/market', marks: 2 },
          { name: 'Analysis - chain of reasoning on how each factor shifts the curve', marks: 2 },
          { name: 'Evaluation - weighing which factor is likely most significant', marks: 2 },
        ]),
        answerStructureAdvice: 'Name at least two genuinely different determinants (e.g. a rise in the cost of raw materials AND a new tax on production) rather than the same idea twice.',
      },
      {
        markTariff: 12, requiresDiagram: true,
        questionText: 'Discuss the extent to which government regulation is the main constraint on the supply of new housing.',
        ...levels([
          { level: 1, marks: '1-4', descriptor: 'Basic, generic knowledge of supply constraints.' },
          { level: 2, marks: '5-8', descriptor: 'Developed points on regulation and at least one other constraint, with some evaluation.' },
          { level: 3, marks: '9-12', descriptor: 'Sustained, well-developed discussion weighing regulation against other genuine constraints with a clear judgement.' },
        ]),
        answerStructureAdvice: 'Compare regulation explicitly against at least one other real constraint (e.g. land availability, construction costs, labour shortages) rather than only discussing regulation.',
      },
    ],
  },
  {
    subtopic: SUBTOPIC_1_2,
    concept: 'Price elasticity of supply (PES)',
    questions: [
      {
        markTariff: 4, requiresDiagram: false,
        questionText: 'Using a calculation, explain whether the supply of a good is elastic or inelastic if a 5% rise in price leads to a 15% rise in quantity supplied.',
        ...points([
          { name: 'Knowledge - correct PES calculation', marks: 1 },
          { name: 'Application - identifying supply as elastic', marks: 1 },
          { name: 'Analysis - reasoning that PES > 1 means elastic supply', marks: 2 },
        ]),
        answerStructureAdvice: 'Show your working (15 ÷ 5 = 3), then state clearly that a PES greater than 1 means supply is elastic.',
      },
      {
        markTariff: 10, requiresDiagram: true,
        questionText: 'Assess the factors that determine the price elasticity of supply of agricultural products.',
        ...levels([
          { level: 1, marks: '1-3', descriptor: 'Undeveloped, list-like knowledge of determinants.' },
          { level: 2, marks: '4-7', descriptor: 'Developed application to agriculture specifically, with some assessment.' },
          { level: 3, marks: '8-10', descriptor: 'Sustained, well-applied analysis with a substantiated judgement on which determinant matters most for this sector.' },
        ]),
        answerStructureAdvice: 'Apply the determinants specifically to agriculture (e.g. long production time lags, limited ability to store some crops) rather than giving a generic list that could apply to any industry.',
      },
      {
        markTariff: 15, requiresDiagram: true,
        questionText: 'Discuss the extent to which time is the most important factor influencing the price elasticity of supply of a good.',
        ...levels([
          { level: 1, marks: '1-5', descriptor: 'Basic, generic knowledge of PES determinants.' },
          { level: 2, marks: '6-10', descriptor: 'Developed points on time and at least one other factor, with some evaluation.' },
          { level: 3, marks: '11-15', descriptor: 'Sustained, balanced discussion weighing time against other genuine factors with a well-justified conclusion.' },
        ]),
        answerStructureAdvice: 'Explicitly compare time against at least one other determinant (e.g. spare capacity, ease of storage) rather than only explaining why time matters.',
      },
      {
        markTariff: 1, requiresDiagram: false,
        questionText: 'A good with a price elasticity of supply of zero is:\nA. Perfectly elastic\nB. Perfectly inelastic\nC. Unitary elastic\nD. Negatively elastic',
        ...mc(['A', 'B', 'C', 'D'], 1, 'A PES of exactly zero means quantity supplied does not change at all regardless of price - shown as a perfectly vertical supply curve, i.e. perfectly inelastic.'),
        answerStructureAdvice: 'Remember: zero elasticity means NO responsiveness at all - the opposite of "perfectly elastic", which is an infinite response.',
      },
    ],
  },
  {
    subtopic: SUBTOPIC_1_2,
    concept: 'Price determination and market equilibrium',
    questions: [
      {
        markTariff: 1, requiresDiagram: true,
        questionText: 'At market equilibrium:\nA. Quantity demanded exceeds quantity supplied\nB. Quantity supplied exceeds quantity demanded\nC. Quantity demanded equals quantity supplied\nD. Price is below the market-clearing level',
        ...mc(['A', 'B', 'C', 'D'], 2, 'Market equilibrium is defined as the point where the quantity buyers wish to purchase exactly equals the quantity sellers wish to supply, at the market-clearing price.'),
        answerStructureAdvice: 'Equilibrium is specifically about quantities being EQUAL - not about price being high or low.',
      },
      {
        markTariff: 8, requiresDiagram: true,
        questionText: 'Examine how an increase in consumer income might affect the equilibrium price and quantity in the market for a normal good.',
        ...points([
          { name: 'Knowledge of demand shifts and equilibrium', marks: 2 },
          { name: 'Application to a normal good', marks: 2 },
          { name: 'Analysis - chain of reasoning from higher income to a new equilibrium', marks: 2 },
          { name: 'Evaluation - weighing the size of the effect', marks: 2 },
        ]),
        answerStructureAdvice: 'Describe the sequence precisely: demand shifts right, creating excess demand at the old price, pushing price up until a new, higher equilibrium is reached - both price AND quantity should rise.',
      },
      {
        markTariff: 12, requiresDiagram: true,
        questionText: 'Discuss the extent to which the price mechanism can be relied upon to quickly restore equilibrium after a sudden shock to demand or supply.',
        ...levels([
          { level: 1, marks: '1-4', descriptor: 'Basic description of the price mechanism with little real discussion.' },
          { level: 2, marks: '5-8', descriptor: 'Developed points on speed of adjustment with some evaluation.' },
          { level: 3, marks: '9-12', descriptor: 'Sustained, well-developed discussion of what could slow or prevent adjustment, with a clear judgement.' },
        ]),
        answerStructureAdvice: 'A strong answer names real reasons adjustment might be SLOW (price stickiness, information gaps, government price controls) rather than just asserting that markets always clear quickly.',
      },
      {
        markTariff: 4, requiresDiagram: true,
        questionText: 'Explain how a decrease in the supply of a good affects its equilibrium price and quantity.',
        ...points([
          { name: 'Knowledge of supply shifts and equilibrium', marks: 1 },
          { name: 'Application via a specific good/cause of the decrease', marks: 1 },
          { name: 'Analysis - chain of reasoning from the shift to the new equilibrium', marks: 2 },
        ]),
        answerStructureAdvice: 'Trace it through step by step: supply shifts left, causing excess demand at the old price, which pushes price up and quantity down to a new equilibrium.',
      },
    ],
  },
  {
    subtopic: SUBTOPIC_1_2,
    concept: 'The price mechanism',
    questions: [
      {
        markTariff: 2, requiresDiagram: false,
        questionText: 'Explain one function of the price mechanism.',
        ...points([{ name: 'Accurate explanation of one function (signalling, rationing, or incentive)', marks: 2 }]),
        answerStructureAdvice: 'Pick just ONE of the three functions (signalling, rationing, or incentivising) and explain it clearly, rather than briefly naming all three.',
      },
      {
        markTariff: 4, requiresDiagram: false,
        questionText: 'Explain how the rationing function of the price mechanism operates when there is a shortage of a good.',
        ...points([
          { name: 'Knowledge of the rationing function', marks: 1 },
          { name: 'Application to a shortage scenario', marks: 1 },
          { name: 'Analysis - chain of reasoning on how price rises allocate the scarce good', marks: 2 },
        ]),
        answerStructureAdvice: 'Trace the mechanism through: shortage causes price to rise, which prices out some buyers, rationing the limited supply to those willing/able to pay the higher price.',
      },
      {
        markTariff: 10, requiresDiagram: false,
        questionText: 'Assess the effectiveness of the price mechanism as a way of allocating scarce resources across an economy.',
        ...levels([
          { level: 1, marks: '1-3', descriptor: 'Undeveloped, generic knowledge of the price mechanism.' },
          { level: 2, marks: '4-7', descriptor: 'Developed points on effectiveness and its limits, with some assessment.' },
          { level: 3, marks: '8-10', descriptor: 'Sustained analysis with a substantiated judgement acknowledging market failure as a genuine limit.' },
        ]),
        answerStructureAdvice: 'A top-band answer explicitly brings in a case where the price mechanism fails to allocate resources well (e.g. externalities or public goods) rather than treating it as always effective.',
      },
      {
        markTariff: 1, requiresDiagram: false,
        questionText: 'Which of the following is NOT one of the three functions of the price mechanism?\nA. Signalling\nB. Rationing\nC. Incentivising\nD. Redistributing',
        ...mc(['A', 'B', 'C', 'D'], 3, 'The three standard functions of the price mechanism are signalling, rationing, and incentivising. Redistributing income is a role of government policy, not the price mechanism itself.'),
        answerStructureAdvice: 'Learn the three named functions precisely - a question like this is testing recall of the exact list.',
      },
    ],
  },
  {
    subtopic: SUBTOPIC_1_2,
    concept: 'Consumer and producer surplus',
    questions: [
      {
        markTariff: 1, requiresDiagram: true,
        questionText: 'Consumer surplus is best described as:\nA. The difference between what a consumer is willing to pay and what they actually pay\nB. The profit earned by a firm\nC. The total revenue received by a firm\nD. The tax paid by consumers on a good',
        ...mc(['A', 'B', 'C', 'D'], 0, 'Consumer surplus is the extra benefit consumers receive because they were willing to pay more than the market price actually charged.'),
        answerStructureAdvice: 'Keep consumer surplus (a benefit to buyers) clearly separate in your mind from producer surplus (a benefit to sellers) and from profit (a firm-level accounting concept).',
      },
      {
        markTariff: 8, requiresDiagram: true,
        questionText: 'Examine how a fall in the market price of a good affects consumer and producer surplus.',
        ...points([
          { name: 'Knowledge of consumer and producer surplus', marks: 2 },
          { name: 'Application to a falling-price scenario', marks: 2 },
          { name: 'Analysis - chain of reasoning on how each area of surplus changes', marks: 2 },
          { name: 'Evaluation - weighing the overall welfare effect', marks: 2 },
        ]),
        answerStructureAdvice: 'Address BOTH surpluses separately and explicitly - consumer surplus generally rises when price falls, while producer surplus generally falls - don\'t just describe one and assume the other follows.',
      },
      {
        markTariff: 12, requiresDiagram: true,
        questionText: 'Discuss the usefulness of consumer and producer surplus as measures of economic welfare.',
        ...levels([
          { level: 1, marks: '1-4', descriptor: 'Basic description of both concepts with little real discussion.' },
          { level: 2, marks: '5-8', descriptor: 'Developed points on usefulness with some evaluation.' },
          { level: 3, marks: '9-12', descriptor: 'Sustained, well-developed discussion of strengths and limitations with a clear judgement.' },
        ]),
        answerStructureAdvice: 'Bring in at least one genuine limitation (e.g. that willingness to pay depends partly on ability to pay, which isn\'t the same as need) to reach the top level.',
      },
      {
        markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by "producer surplus".',
        ...points([{ name: 'Accurate definition of producer surplus', marks: 2 }]),
        answerStructureAdvice: 'Define it precisely: the difference between the price a producer actually receives and the minimum price they would have been willing to accept.',
      },
    ],
  },
  {
    subtopic: SUBTOPIC_1_2,
    concept: 'Indirect taxes and subsidies',
    questions: [
      {
        markTariff: 1, requiresDiagram: true,
        questionText: 'The imposition of an indirect tax on a good will cause the supply curve to shift:\nA. Left (upwards)\nB. Right (downwards)\nC. It will not shift, only the demand curve shifts\nD. Neither curve shifts',
        ...mc(['A', 'B', 'C', 'D'], 0, 'An indirect tax raises the cost of supplying each unit, so firms require a higher price to supply the same quantity as before - shown as the supply curve shifting left (or upwards).'),
        answerStructureAdvice: 'Remember: a tax is a COST increase to the firm, so it affects SUPPLY, not demand.',
      },
      {
        markTariff: 8, requiresDiagram: true,
        questionText: 'Examine how the price elasticity of demand for a good affects the impact of an indirect tax on that good.',
        ...points([
          { name: 'Knowledge of indirect taxes and PED', marks: 2 },
          { name: 'Application to a specific good', marks: 2 },
          { name: 'Analysis - chain of reasoning on tax incidence and PED', marks: 2 },
          { name: 'Evaluation - weighing the significance for government revenue or consumer behaviour', marks: 2 },
        ]),
        answerStructureAdvice: 'Link PED directly to tax incidence: for an inelastic good, consumers bear most of the tax burden through higher prices with little fall in quantity; for an elastic good, the opposite is true.',
      },
      {
        markTariff: 15, requiresDiagram: true,
        questionText: 'Discuss the effectiveness of an indirect tax as a way of reducing consumption of a demerit good.',
        ...levels([
          { level: 1, marks: '1-5', descriptor: 'Basic, generic knowledge of indirect taxes.' },
          { level: 2, marks: '6-10', descriptor: 'Developed points on effectiveness and its limits with some evaluation.' },
          { level: 3, marks: '11-15', descriptor: 'Sustained, balanced discussion (e.g. addiction/inelastic demand limiting effectiveness, or regressive impact on lower-income consumers) with a well-justified conclusion.' },
        ]),
        answerStructureAdvice: 'A demerit good\'s demand is often inelastic (e.g. due to addiction), which limits how much a tax reduces consumption - raising and weighing this point is exactly what "discuss...effectiveness" is asking for.',
      },
      {
        markTariff: 4, requiresDiagram: false,
        questionText: 'Explain how a government subsidy on a merit good could increase the good\'s consumption.',
        ...points([
          { name: 'Knowledge of how a subsidy affects supply', marks: 1 },
          { name: 'Application to a specific merit good', marks: 1 },
          { name: 'Analysis - chain of reasoning from lower production cost to a lower price and higher quantity', marks: 2 },
        ]),
        answerStructureAdvice: 'Trace the mechanism through: a subsidy lowers firms\' production costs, shifting supply right, which lowers price and raises the quantity consumed.',
      },
    ],
  },
  {
    subtopic: SUBTOPIC_1_2,
    concept: 'Behavioural economics and non-rational decision-making',
    questions: [
      {
        markTariff: 4, requiresDiagram: false,
        questionText: 'Using an example, explain what is meant by "bounded rationality".',
        ...points([
          { name: 'Knowledge of bounded rationality', marks: 1 },
          { name: 'Application via a specific example', marks: 1 },
          { name: 'Analysis - chain of reasoning on why limited information/cognitive ability leads to a non-optimal decision', marks: 2 },
        ]),
        answerStructureAdvice: 'Use a genuine example of a real decision made with incomplete information or limited time/ability to process it, not just a restated definition.',
      },
      {
        markTariff: 8, requiresDiagram: false,
        questionText: 'Examine how insights from behavioural economics challenge the traditional assumption of rational decision-making.',
        ...points([
          { name: 'Knowledge of a behavioural economics concept (e.g. herd behaviour, anchoring)', marks: 2 },
          { name: 'Application to a real consumer decision', marks: 2 },
          { name: 'Analysis - chain of reasoning on why this contradicts rational choice theory', marks: 2 },
          { name: 'Evaluation - weighing how significant a challenge this really is', marks: 2 },
        ]),
        answerStructureAdvice: 'Name a specific behavioural concept (herd behaviour, anchoring, or altruism) rather than just saying "people aren\'t always rational" in general terms.',
      },
      {
        markTariff: 25, requiresDiagram: false,
        questionText: 'Evaluate the extent to which behavioural economics provides a better explanation of real consumer behaviour than the traditional rational decision-making model.',
        ...levels([
          { level: 1, marks: '1-6', descriptor: 'Generic knowledge of both models with little application.' },
          { level: 2, marks: '7-12', descriptor: 'Developed application of behavioural concepts with some analysis.' },
          { level: 3, marks: '13-18', descriptor: 'Sustained analysis comparing both models across multiple angles.' },
          { level: 4, marks: '19-25', descriptor: 'Consistently well-developed analysis of both models with a fully justified conclusion on which better explains real behaviour, and in what contexts.' },
        ]),
        answerStructureAdvice: 'A top-band answer doesn\'t just pick a winner - it recognises the rational model can still be a useful simplification in some contexts, while behavioural economics explains specific, well-documented deviations in others.',
      },
      {
        markTariff: 1, requiresDiagram: false,
        questionText: 'Herd behaviour in financial markets, where investors buy an asset simply because others are buying it, is an example of:\nA. Rational utility-maximisation\nB. Non-rational decision-making\nC. Perfect information\nD. Diminishing marginal utility',
        ...mc(['A', 'B', 'C', 'D'], 1, 'Herd behaviour means following the actions of others rather than independently weighing costs and benefits - a clear departure from the traditional rational decision-making assumption.'),
        answerStructureAdvice: 'Focus on WHY the decision is being made (copying others) rather than on the outcome itself.',
      },
    ],
  },
];

function conceptIdFor(subtopic, concept) {
  return conceptId(subtopic, concept);
}

async function main() {
  const rows = [];
  for (const group of QUESTIONS) {
    for (const q of group.questions) {
      rows.push({
        concept_id: conceptIdFor(group.subtopic, group.concept),
        subject: SUBJECT,
        topic: group.subtopic,
        concept: group.concept,
        qualification: QUALIFICATION,
        exam_board: EXAM_BOARD,
        question_text: q.questionText,
        mark_tariff: q.markTariff,
        requires_diagram: q.requiresDiagram,
        mark_scheme_type: q.markSchemeType,
        mark_scheme_json: q.markSchemeJson,
        answer_structure_advice: q.answerStructureAdvice,
      });
    }
  }

  console.log(`Inserting ${rows.length} practice questions (1.1 + 1.2)...`);
  const { error } = await supabase.from('practice_questions').insert(rows);
  if (error) {
    console.error('Insert failed:', JSON.stringify(error));
    process.exit(1);
  }
  console.log('Done.');
}

main();
