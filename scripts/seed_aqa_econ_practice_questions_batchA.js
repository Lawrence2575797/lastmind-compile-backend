require('dotenv/config');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SUBJECT = 'Economics';
const QUALIFICATION = 'A-Level';
const EXAM_BOARD = 'AQA';

function clean(s) { return (s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_'); }
function conceptId(subtopic, concept) { return `${clean(SUBJECT)}:${clean(subtopic)}:${clean(concept)}`; }

// Original content written for LastMind - no question is copied from any
// real AQA past paper or specimen material. The mark scheme STRUCTURE
// (tariffs used, number of levels, mark ranges, and - crucially - which
// tariffs require evaluation and which don't) reflects the REAL,
// researched AQA convention (verified against AQA's own specimen Paper 1
// mark scheme): AQA judges knowledge/application/analysis/evaluation as
// ONE holistic level descriptor rather than splitting marks into named
// AO amounts like Edexcel does, and - distinctively - AQA's 9 and
// 15-mark "explain" levels questions require NO evaluation at all;
// only the 25-mark essay is evaluation-led. Descriptor wording below is
// written independently, not quoted from any AQA document.

const mc = (options, correctIndex, explanation) => ({ markSchemeType: 'multiple_choice', markSchemeJson: { options, correctIndex, explanation } });
const points = (criteria) => ({ markSchemeType: 'points', markSchemeJson: { criteria } });
const levels = (levelsArr) => ({ markSchemeType: 'levels', markSchemeJson: { levels: levelsArr } });

// The real AQA 4-mark "explain, using the data/example" band - a small
// banded scale (not added-up points), same shape at this tariff on
// every concept unless a question needs its own wording.
const band4 = (t4, t3, t2, t1) => levels([
  { level: 4, marks: '4', descriptor: t4 },
  { level: 3, marks: '3', descriptor: t3 },
  { level: 2, marks: '2', descriptor: t2 },
  { level: 1, marks: '1', descriptor: t1 },
]);

const T411 = '4.1.1 Economic methodology and the economic problem';
const T412 = '4.1.2 Individual economic decision making';
const T413 = '4.1.3 Price determination in a competitive market';
const T414 = '4.1.4 Production, costs and revenue';

const QUESTIONS = [
  // ───────────────────────── 4.1.1 Economic methodology and the economic problem ─────────────────────────
  {
    subtopic: T411, concept: 'Economic methodology: positive and normative economics',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'Which of the following is a normative economic statement?\nA. UK unemployment fell to 4.1% last quarter\nB. The government should raise the minimum wage\nC. A rise in interest rates tends to reduce borrowing\nD. Inflation exceeded the Bank of England\'s target in 2023',
        ...mc(['A','B','C','D'], 1, 'A normative statement contains a value judgement (signalled by "should") about what ought to happen. The others are positive, testable statements of fact.'),
        answerStructureAdvice: 'Marked right or wrong - look for the word that signals an opinion rather than a testable fact.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain, using an example, the difference between a positive and a normative economic statement.',
        ...points([{ name: 'Correct example of a positive statement', marks: 1 }, { name: 'Correct example of a normative statement', marks: 1 }]),
        answerStructureAdvice: 'One clear, genuinely testable example and one clear value-judgement example is all that\'s needed.' },
      { markTariff: 9, requiresDiagram: false,
        questionText: 'Explain why economists often disagree on the appropriate policy response to a given economic problem, even when they agree on the underlying facts.',
        ...levels([
          { level: 3, marks: '7-9', descriptor: 'Well organised, develops one or more relevant issues (e.g. differing value judgements, differing weight given to competing objectives) with sound knowledge and understanding, good application, and a clear, well-focused chain of reasoning.' },
          { level: 2, marks: '4-6', descriptor: 'Includes one or more relevant issues with reasonable knowledge and application, but the analysis may not be fully developed or becomes confused in places.' },
          { level: 1, marks: '1-3', descriptor: 'A brief or weak response with limited knowledge, very limited application, and analysis that lacks focus.' },
        ]),
        answerStructureAdvice: 'This is a pure "explain" question at this tariff - no evaluation is needed, just a well-developed chain of reasoning about why normative judgements can differ even when the positive facts are agreed.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'A newspaper article states that "unemployment rose by 50,000 last month" and separately argues that "the government must cut interest rates immediately". Explain which of these two statements is normative and which is positive.',
        ...band4(
          'Correctly identifies both statements and precisely explains why one is a testable fact (positive) and the other a value judgement (normative).',
          'Correctly identifies both statements with a reasonably clear explanation of the distinction.',
          'Correctly identifies one of the two statements, or gives an unclear explanation of the distinction.',
          'Makes only a very vague reference to the statements with little real explanation.'
        ),
        answerStructureAdvice: 'Classify BOTH statements explicitly and justify each classification separately.' },
    ],
  },
  {
    subtopic: T411, concept: 'The nature and purpose of economic activity',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'The fundamental purpose of economic activity is best described as:\nA. Maximising government tax revenue\nB. Using scarce resources to produce goods and services that satisfy needs and wants\nC. Eliminating all forms of competition\nD. Fixing prices at a level set by the state',
        ...mc(['A','B','C','D'], 1, 'Economic activity exists to convert scarce resources into goods and services that satisfy the needs and wants of consumers - the basic starting point of the whole subject.'),
        answerStructureAdvice: 'Focus on the core PURPOSE of economic activity, not any one policy tool.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Distinguish between a need and a want in economics.',
        ...points([{ name: 'Correct definition of a need (essential for survival/basic functioning)', marks: 1 }, { name: 'Correct definition of a want (a desire that is not essential for survival)', marks: 1 }]),
        answerStructureAdvice: 'Keep the two definitions genuinely distinct - a want is not essential, a need is.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'A small island economy relies on fishing and tourism. Explain how the purpose of economic activity applies to this economy.',
        ...band4(
          'Clearly identifies that scarce resources (labour, boats, land) are being used to produce goods/services (fish, tourism experiences) to satisfy wants, with a well-developed, precise explanation.',
          'Identifies the link between scarce resources and satisfying wants in this economy, with a reasonably clear explanation.',
          'Identifies a relevant point about resources or wants in this economy, but the explanation is limited or unclear.',
          'Makes only a very limited or vague reference to the economy\'s activity, with little real explanation.'
        ),
        answerStructureAdvice: 'Name the SPECIFIC scarce resources and specific wants being satisfied in this economy, not just a generic definition.' },
      { markTariff: 15, requiresDiagram: false,
        questionText: 'Explain the extent to which the purpose of economic activity differs between a market economy and a command economy.',
        ...levels([
          { level: 3, marks: '11-15', descriptor: 'Well organised, develops a selection of relevant issues (e.g. who decides what is produced, the role of prices vs planning) with sound knowledge, good application to both economy types, and clear, well-focused chains of reasoning.' },
          { level: 2, marks: '6-10', descriptor: 'Focuses on relevant issues with satisfactory knowledge and reasonable application to both economy types, but analysis may not be fully developed.' },
          { level: 1, marks: '1-5', descriptor: 'Has identified one or more relevant issues with limited knowledge and very limited application, and analysis that may lack focus.' },
        ]),
        answerStructureAdvice: 'No evaluation needed here - focus on a well-developed comparison of HOW each system pursues the same basic purpose differently.' },
    ],
  },
  {
    subtopic: T411, concept: 'Economic resources and factors of production',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'Which of the following is classified as \'capital\' as a factor of production?\nA. A farmer\'s knowledge of crop rotation\nB. A factory\'s machinery\nC. A plot of agricultural land\nD. The wages paid to workers',
        ...mc(['A','B','C','D'], 1, 'Capital refers to man-made resources used in production, such as machinery, tools, and buildings - not land, labour skill, or wage payments themselves.'),
        answerStructureAdvice: 'Learn the four factors precisely: land, labour, capital, enterprise - and what belongs in each category.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'State two of the four factors of production.',
        ...points([{ name: 'Correctly named factor of production', marks: 1 }, { name: 'A second, different correctly named factor of production', marks: 1 }]),
        answerStructureAdvice: 'One mark per correctly named factor from land, labour, capital, enterprise - no explanation needed.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'A bakery invests in a new industrial oven. Explain how this represents an increase in capital as a factor of production.',
        ...band4(
          'Clearly identifies the oven as a man-made resource used in production and precisely explains why this counts as capital rather than another factor.',
          'Identifies the oven as capital with a reasonably clear explanation.',
          'Makes a limited or unclear attempt to link the oven to the concept of capital.',
          'Makes only a very vague reference to the oven or capital with little real explanation.'
        ),
        answerStructureAdvice: 'Be precise about WHY a man-made tool used in production counts as capital, not land or labour.' },
      { markTariff: 9, requiresDiagram: false,
        questionText: 'Explain how the quality, as opposed to the quantity, of a country\'s factors of production can affect its ability to produce goods and services.',
        ...levels([
          { level: 3, marks: '7-9', descriptor: 'Well organised, develops one or more relevant issues (e.g. worker training raising labour productivity, more advanced capital raising output per unit) with sound knowledge, good application, and a clear, well-focused chain of reasoning.' },
          { level: 2, marks: '4-6', descriptor: 'Includes a relevant issue with reasonable knowledge and application, but the analysis may not be fully developed.' },
          { level: 1, marks: '1-3', descriptor: 'A brief or weak response with limited knowledge and very limited application.' },
        ]),
        answerStructureAdvice: 'Distinguish clearly between quantity (how much) and quality (how productive) of a factor, and follow the chain through to output.' },
    ],
  },
  {
    subtopic: T411, concept: 'Scarcity, choice and the allocation of resources',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'The basic economic problem arises because:\nA. Governments intervene too heavily in markets\nB. Human wants are unlimited but resources to satisfy them are finite\nC. Firms always aim to maximise profit\nD. Prices are determined by supply and demand',
        ...mc(['A','B','C','D'], 1, 'The economic problem is the fundamental mismatch between unlimited wants and the finite resources available to satisfy them - the starting point for the whole subject.'),
        answerStructureAdvice: 'Focus on what the economic problem fundamentally IS, not on any one actor\'s behaviour.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by the term \'opportunity cost\'.',
        ...points([{ name: 'Reference to the value of the next best alternative', marks: 1 }, { name: 'Reference to it arising because a choice has been made / resources are scarce', marks: 1 }]),
        answerStructureAdvice: 'A precise, textbook-accurate definition is enough for full marks here.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'A government decides to spend an extra £2 billion on the NHS rather than on new schools. Explain the opportunity cost of this decision.',
        ...band4(
          'Clearly identifies the extra school spending foregone as the opportunity cost, with a precise, well-developed explanation of why this is the relevant "next best alternative".',
          'Identifies the foregone school spending as the opportunity cost with a reasonably clear explanation.',
          'Makes a limited or unclear attempt to identify what is given up.',
          'Makes only a very vague reference to cost or spending with little real explanation.'
        ),
        answerStructureAdvice: 'Name the SPECIFIC alternative given up (school spending) rather than a vague "other things".' },
      { markTariff: 25, requiresDiagram: true,
        questionText: 'Assess the extent to which the concept of scarcity remains relevant in a modern, technologically advanced economy.',
        ...levels([
          { level: 5, marks: '21-25', descriptor: 'Sound, focused analysis and well-supported evaluation: well organised, sound knowledge and understanding with few if any errors, good application to a modern economy, well-focused analysis with clear chains of reasoning, and supported evaluation throughout leading to a final conclusion.' },
          { level: 4, marks: '16-20', descriptor: 'Sound, focused analysis and some supported evaluation, well organised with sound knowledge, good application, and some reasonable, supported evaluation.' },
          { level: 3, marks: '11-15', descriptor: 'Some reasonable analysis but generally unsupported evaluation; satisfactory knowledge and reasonable application, but evaluation is fairly superficial.' },
          { level: 2, marks: '6-10', descriptor: 'A fairly weak response with some understanding; limited knowledge and application, limited and unsupported evaluation.' },
          { level: 1, marks: '1-5', descriptor: 'A very weak response with little relevant knowledge, weak application, and weak, unsupported attempted analysis.' },
        ]),
        answerStructureAdvice: 'This is the evaluation-heavy 25-mark tariff - a PPF diagram is expected, and your final judgement must directly weigh whether technology has genuinely eliminated scarcity or merely shifted where it binds (e.g. digital goods vs. genuinely finite resources like land or time).' },
    ],
  },
  {
    subtopic: T411, concept: 'Production possibility diagrams',
    questions: [
      { markTariff: 1, requiresDiagram: true,
        questionText: 'A point inside a country\'s production possibility frontier (PPF) represents:\nA. An unattainable combination of output\nB. Productive efficiency\nC. Unemployed or underused resources\nD. Economic growth',
        ...mc(['A','B','C','D'], 2, 'A point inside the PPF shows the economy has spare capacity - it could produce more of at least one good without sacrificing any of the other.'),
        answerStructureAdvice: 'Inside the curve = spare capacity, on the curve = full/efficient use, outside = currently unattainable.' },
      { markTariff: 2, requiresDiagram: true,
        questionText: 'Explain what an outward shift of a country\'s PPF represents.',
        ...points([{ name: 'Reference to an increase in the economy\'s productive capacity/potential output', marks: 1 }, { name: 'Reference to a cause such as more/better resources or improved technology', marks: 1 }]),
        answerStructureAdvice: 'State what the shift MEANS and give a brief reason it could happen.' },
      { markTariff: 4, requiresDiagram: true,
        questionText: 'A country invests heavily in new infrastructure and worker training. Explain how this is likely to affect its PPF.',
        ...band4(
          'Clearly identifies an outward shift of the whole PPF and precisely explains the link between improved infrastructure/training and greater productive capacity.',
          'Identifies an outward shift with a reasonably clear explanation of the link to capacity.',
          'Makes a limited or unclear attempt to link the investment to a change in the PPF.',
          'Makes only a very vague reference to the PPF or investment with little real explanation.'
        ),
        answerStructureAdvice: 'Be specific: investment and training raise capital and labour productivity, shifting the WHOLE curve outward, not just moving along it.' },
      { markTariff: 9, requiresDiagram: true,
        questionText: 'Using a production possibility diagram, explain the concept of opportunity cost when an economy is already producing on its PPF.',
        ...levels([
          { level: 3, marks: '7-9', descriptor: 'Well organised, develops the key issue with sound knowledge and understanding, good application, well-focused analysis with a clear chain of reasoning, and an accurate, appropriately-used diagram.' },
          { level: 2, marks: '4-6', descriptor: 'Reasonable knowledge and application with some analysis that might not be fully developed; may include a relevant diagram.' },
          { level: 1, marks: '1-3', descriptor: 'Limited knowledge and very limited application; a diagram, if included, is not used well or is inaccurate.' },
        ]),
        answerStructureAdvice: 'A diagram is expected at the top of this level - show movement ALONG the curve and explain that the amount of one good given up IS the opportunity cost.' },
    ],
  },
  // ───────────────────────── 4.1.2 Individual economic decision making ─────────────────────────
  {
    subtopic: T412, concept: 'Consumer behaviour and rational decision making',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'The traditional (neoclassical) assumption of rational consumer behaviour is that individuals:\nA. Always follow the behaviour of others\nB. Act to maximise their own utility given the information available to them\nC. Never respond to changes in price\nD. Always choose the cheapest available option regardless of preference',
        ...mc(['A','B','C','D'], 1, 'The rational choice model assumes individuals weigh up costs and benefits to maximise their own utility (satisfaction), based on the information they have.'),
        answerStructureAdvice: 'Rational behaviour means utility-maximising, not simply "cheapest" or "same as everyone else".' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by \'utility\' in economics.',
        ...points([{ name: 'Reference to the satisfaction or benefit gained from consuming a good/service', marks: 1 }, { name: 'Reference to it being the basis on which rational consumers are assumed to make choices', marks: 1 }]),
        answerStructureAdvice: 'Define utility precisely as satisfaction/benefit, and link it to consumer decision-making.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'A student chooses to buy a cheaper brand of coffee after comparing prices at several shops. Explain how this illustrates rational decision making.',
        ...band4(
          'Clearly identifies the weighing of costs and benefits/utility maximisation and precisely links it to the student\'s specific behaviour.',
          'Identifies the link between the behaviour and utility maximisation with a reasonably clear explanation.',
          'Makes a limited or unclear attempt to link the behaviour to rational decision making.',
          'Makes only a very vague reference to the scenario or rationality with little real explanation.'
        ),
        answerStructureAdvice: 'Explicitly name utility maximisation and connect it to the specific comparison-shopping behaviour described.' },
      { markTariff: 9, requiresDiagram: false,
        questionText: 'Explain why the assumption of perfectly rational consumer behaviour may not always reflect how people actually make decisions.',
        ...levels([
          { level: 3, marks: '7-9', descriptor: 'Well organised, develops one or more relevant issues (e.g. bounded rationality, incomplete information, habitual behaviour) with sound knowledge, good application, and a clear, well-focused chain of reasoning.' },
          { level: 2, marks: '4-6', descriptor: 'Includes a relevant issue with reasonable knowledge and application, but analysis may not be fully developed.' },
          { level: 1, marks: '1-3', descriptor: 'A brief or weak response with limited knowledge and very limited application.' },
        ]),
        answerStructureAdvice: 'No evaluation needed - just develop one or two genuine reasons real behaviour can deviate from the rational model.' },
    ],
  },
  {
    subtopic: T412, concept: 'Imperfect information',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'Asymmetric information exists in a market when:\nA. Both buyers and sellers have identical information\nB. One party to a transaction has more or better information than the other\nC. The government sets the price by law\nD. A good is non-excludable and non-rivalrous',
        ...mc(['A','B','C','D'], 1, 'Asymmetric information means one side of a transaction - often the seller - knows something relevant the other side doesn\'t, which can distort decision making.'),
        answerStructureAdvice: 'Focus on the IMBALANCE of knowledge, not on the good\'s other properties.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by \'imperfect information\' as a source of market failure.',
        ...points([{ name: 'Reference to consumers/producers lacking full/accurate information to make optimal decisions', marks: 1 }, { name: 'Reference to this leading to a misallocation of resources', marks: 1 }]),
        answerStructureAdvice: 'State what is missing (full/accurate information) and the CONSEQUENCE (a misallocation).' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'A used car buyer cannot tell whether a car has hidden mechanical faults before purchasing it. Explain how this is an example of imperfect information.',
        ...band4(
          'Clearly identifies the buyer\'s lack of relevant information relative to the seller and precisely explains the resulting risk of a poor decision.',
          'Identifies the information gap with a reasonably clear explanation of its effect.',
          'Makes a limited or unclear attempt to link the scenario to imperfect information.',
          'Makes only a very vague reference to the scenario or information with little real explanation.'
        ),
        answerStructureAdvice: 'Name WHO has more information (the seller) and the specific risk this creates for the buyer.' },
      { markTariff: 15, requiresDiagram: false,
        questionText: 'Explain the impact of imperfect information on the efficient allocation of resources in a market economy.',
        ...levels([
          { level: 3, marks: '11-15', descriptor: 'Well organised, develops a selection of relevant issues (e.g. under-consumption of merit goods, adverse selection) with sound knowledge, good application, and clear, well-focused chains of reasoning.' },
          { level: 2, marks: '6-10', descriptor: 'Focuses on relevant issues with satisfactory knowledge and reasonable application, but analysis may not be fully developed.' },
          { level: 1, marks: '1-5', descriptor: 'Has identified one or more relevant issues with limited knowledge and very limited application.' },
        ]),
        answerStructureAdvice: 'No evaluation required at this tariff - develop more than one distinct consequence of imperfect information (e.g. under-consumption of merit goods AND adverse selection) for a top-band answer.' },
    ],
  },
  {
    subtopic: T412, concept: 'Aspects of behavioural economic theory',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: '\'Anchoring\' in behavioural economics describes the tendency to:\nA. Always choose the cheapest available option\nB. Rely too heavily on the first piece of information encountered when making a decision\nC. Ignore all information and choose randomly\nD. Always follow the behaviour of the majority',
        ...mc(['A','B','C','D'], 1, 'Anchoring means an initial piece of information (e.g. an original price) disproportionately influences a later judgement or decision, even if it isn\'t especially relevant.'),
        answerStructureAdvice: 'Anchoring is specifically about over-weighting the FIRST piece of information seen.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by \'loss aversion\'.',
        ...points([{ name: 'Reference to people feeling the pain of a loss more strongly than the pleasure of an equivalent gain', marks: 1 }, { name: 'Reference to this affecting decisions (e.g. avoiding risk, holding onto losing investments)', marks: 1 }]),
        answerStructureAdvice: 'State the asymmetry (losses feel worse than equivalent gains feel good) and a behavioural consequence.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'A retailer displays a "was £100, now £60" price tag. Explain how this uses anchoring to influence consumer behaviour.',
        ...band4(
          'Clearly identifies the original price as an anchor and precisely explains how it makes £60 seem like better value than if shown alone.',
          'Identifies the anchoring effect with a reasonably clear explanation.',
          'Makes a limited or unclear attempt to link the pricing to anchoring.',
          'Makes only a very vague reference to the price tag or behaviour with little real explanation.'
        ),
        answerStructureAdvice: 'Name anchoring explicitly and explain the specific psychological effect the "was" price creates.' },
      { markTariff: 9, requiresDiagram: false,
        questionText: 'Explain how the concept of "herd behaviour" can affect decision making in financial markets.',
        ...levels([
          { level: 3, marks: '7-9', descriptor: 'Well organised, develops the issue with sound knowledge and understanding, good application to a financial market, and a clear, well-focused chain of reasoning.' },
          { level: 2, marks: '4-6', descriptor: 'Reasonable knowledge and application, but the analysis may not be fully developed or becomes confused in places.' },
          { level: 1, marks: '1-3', descriptor: 'Limited knowledge and very limited application, with analysis that lacks focus.' },
        ]),
        answerStructureAdvice: 'Follow the chain through: individuals copy others\' actions rather than independently weighing information, which can amplify price movements (e.g. asset bubbles).' },
    ],
  },
  {
    subtopic: T412, concept: 'Behavioural economics and economic policy',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'A \'nudge\' in behavioural economic policy refers to:\nA. A legal ban on a harmful good\nB. A subtle change to how choices are presented that encourages a particular decision without restricting choice\nC. A direct cash subsidy paid to consumers\nD. A tax imposed on a demerit good',
        ...mc(['A','B','C','D'], 2, 'A nudge changes the "choice architecture" (e.g. default options, framing) to steer behaviour in a desired direction while still allowing people to choose freely - unlike a ban, tax, or subsidy.'),
        answerStructureAdvice: 'The defining feature of a nudge is that choice is preserved - nothing is banned, taxed, or subsidised directly.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'State two examples of a behavioural "nudge" policy.',
        ...points([{ name: 'Correctly described nudge policy (e.g. automatic pension enrolment)', marks: 1 }, { name: 'A second, different correctly described nudge policy (e.g. placing healthy food at eye level)', marks: 1 }]),
        answerStructureAdvice: 'One mark per genuine example of choice architecture being changed, not a tax, ban, or subsidy.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'A workplace pension scheme automatically enrols employees, who can opt out if they choose. Explain how this is an example of a behavioural nudge.',
        ...band4(
          'Clearly identifies the change in the default option and precisely explains how it exploits inertia/present bias to increase pension saving, while preserving free choice.',
          'Identifies the default-option change with a reasonably clear explanation of its effect.',
          'Makes a limited or unclear attempt to link the scenario to a nudge.',
          'Makes only a very vague reference to the scheme or behaviour with little real explanation.'
        ),
        answerStructureAdvice: 'Explain WHY changing the default (rather than banning or paying people) still works - most people stick with defaults due to inertia.' },
      { markTariff: 25, requiresDiagram: false,
        questionText: 'Evaluate the view that behavioural "nudge" policies are more effective than traditional economic policies, such as taxes and subsidies, in changing consumer behaviour.',
        ...levels([
          { level: 5, marks: '21-25', descriptor: 'Sound, focused analysis and well-supported evaluation: well organised, sound knowledge with few if any errors, good application to real policy examples, well-focused analysis with clear chains of reasoning, and supported evaluation throughout leading to a final conclusion.' },
          { level: 4, marks: '16-20', descriptor: 'Sound, focused analysis and some supported evaluation, with good application and some reasonable, supported evaluation.' },
          { level: 3, marks: '11-15', descriptor: 'Some reasonable analysis but generally unsupported evaluation; satisfactory knowledge and reasonable application, but evaluation is fairly superficial.' },
          { level: 2, marks: '6-10', descriptor: 'A fairly weak response with some understanding; limited knowledge and application, limited and unsupported evaluation.' },
          { level: 1, marks: '1-5', descriptor: 'A very weak response with little relevant knowledge, weak application, and weak, unsupported attempted analysis.' },
        ]),
        answerStructureAdvice: 'Weigh genuine strengths of nudges (low cost, no enforcement needed, preserves choice) against genuine limits (can be reversed easily, may not work on strongly-held preferences, ethical concerns about manipulation) before reaching a supported judgement.' },
    ],
  },
  // ───────────────────────── 4.1.3 Price determination in a competitive market ─────────────────────────
  {
    subtopic: T413, concept: 'The determinants of demand',
    questions: [
      { markTariff: 1, requiresDiagram: true,
        questionText: 'A rise in the price of tea (a substitute for coffee) is likely to cause:\nA. A movement up along the demand curve for coffee\nB. A rightward shift of the demand curve for coffee\nC. A leftward shift of the demand curve for coffee\nD. No change to the demand for coffee',
        ...mc(['A','B','C','D'], 2, 'A rise in the price of a substitute (tea) makes coffee relatively more attractive, increasing demand for coffee at every price - a rightward shift of the demand curve.'),
        answerStructureAdvice: 'A change in the price of a RELATED good shifts the curve; a change in the good\'s OWN price moves along it.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'State two non-price determinants of demand for a good.',
        ...points([{ name: 'Correctly named determinant (e.g. income, tastes, price of substitutes/complements, population)', marks: 1 }, { name: 'A second, different correctly named determinant', marks: 1 }]),
        answerStructureAdvice: 'One mark per correctly named non-price factor - no explanation needed.' },
      { markTariff: 4, requiresDiagram: true,
        questionText: 'Average household incomes rise significantly. Explain how this is likely to affect the demand for a normal good.',
        ...band4(
          'Clearly identifies a rightward shift of the demand curve and precisely explains the link between rising income and normal goods.',
          'Identifies the rightward shift with a reasonably clear explanation.',
          'Makes a limited or unclear attempt to link income change to demand.',
          'Makes only a very vague reference to income or demand with little real explanation.'
        ),
        answerStructureAdvice: 'Be precise: a NORMAL good sees demand rise with income - contrast this (even briefly) with an inferior good to show real understanding.' },
      { markTariff: 9, requiresDiagram: true,
        questionText: 'Using a diagram, explain how a change in consumer tastes and preferences can affect the market for a good.',
        ...levels([
          { level: 3, marks: '7-9', descriptor: 'Well organised, develops the issue with sound knowledge and understanding, good application, well-focused analysis with a clear chain of reasoning, and an accurate, appropriately-used diagram.' },
          { level: 2, marks: '4-6', descriptor: 'Reasonable knowledge and application with some analysis that might not be fully developed; may include a relevant diagram.' },
          { level: 1, marks: '1-3', descriptor: 'Limited knowledge and very limited application; a diagram, if included, is not used well or is inaccurate.' },
        ]),
        answerStructureAdvice: 'A demand/supply diagram showing the demand curve shifting is expected - follow through to the new equilibrium price and quantity.' },
    ],
  },
  {
    subtopic: T413, concept: 'Price, income and cross elasticities of demand',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'If the price elasticity of demand for a good is -0.4, demand for the good is:\nA. Perfectly elastic\nB. Relatively elastic\nC. Relatively inelastic\nD. Perfectly inelastic',
        ...mc(['A','B','C','D'], 2, 'A PED value between 0 and -1 (ignoring sign, between 0 and 1) means demand is relatively inelastic - quantity demanded changes proportionally less than price.'),
        answerStructureAdvice: 'PED between 0 and 1 (ignoring the negative sign) = inelastic; greater than 1 = elastic.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Calculate the price elasticity of demand for a good if a 10% rise in price leads to a 4% fall in quantity demanded.',
        ...points([{ name: 'Correct PED value of -0.4 (or 0.4) shown', marks: 2 }]),
        answerStructureAdvice: 'PED = % change in quantity demanded ÷ % change in price = -4% ÷ 10% = -0.4.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'A rise in household income of 5% leads to a 15% rise in demand for foreign holidays. Explain what this shows about the income elasticity of demand for foreign holidays.',
        ...band4(
          'Correctly calculates YED as 3 and precisely explains that this makes foreign holidays a normal, income-elastic (luxury) good.',
          'Identifies foreign holidays as a normal, income-elastic good with a reasonably clear explanation, even if the exact YED value is not shown.',
          'Makes a limited or unclear attempt to link the data to income elasticity.',
          'Makes only a very vague reference to income or demand with little real explanation.'
        ),
        answerStructureAdvice: 'Calculate YED (15% ÷ 5% = 3) and use the positive, greater-than-1 value to correctly classify the good as a luxury/normal income-elastic good.' },
      { markTariff: 9, requiresDiagram: true,
        questionText: 'Using a diagram, explain why a firm selling a good with relatively price inelastic demand might choose to raise its price.',
        ...levels([
          { level: 3, marks: '7-9', descriptor: 'Well organised, develops the issue with sound knowledge and understanding, good application, well-focused analysis with a clear chain of reasoning, and an accurate, appropriately-used diagram.' },
          { level: 2, marks: '4-6', descriptor: 'Reasonable knowledge and application with some analysis that might not be fully developed; may include a relevant diagram.' },
          { level: 1, marks: '1-3', descriptor: 'Limited knowledge and very limited application; a diagram, if included, is not used well or is inaccurate.' },
        ]),
        answerStructureAdvice: 'A steep (inelastic) demand curve diagram is expected - follow the chain to show total revenue rises when price rises and demand is inelastic.' },
    ],
  },
  {
    subtopic: T413, concept: 'The determinants of supply and price elasticity of supply',
    questions: [
      { markTariff: 1, requiresDiagram: true,
        questionText: 'A fall in the cost of raw materials used to produce a good is likely to cause:\nA. A movement down along the supply curve\nB. A leftward shift of the supply curve\nC. A rightward shift of the supply curve\nD. No change to supply',
        ...mc(['A','B','C','D'], 3, 'Lower production costs make it more profitable to supply the good at every price, shifting the whole supply curve to the right.'),
        answerStructureAdvice: 'A change in a good\'s OWN price moves along the curve; a change in costs of production shifts the whole curve.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'State two non-price determinants of the supply of a good.',
        ...points([{ name: 'Correctly named determinant (e.g. costs of production, technology, taxes/subsidies, number of firms)', marks: 1 }, { name: 'A second, different correctly named determinant', marks: 1 }]),
        answerStructureAdvice: 'One mark per correctly named non-price factor - no explanation needed.' },
      { markTariff: 4, requiresDiagram: true,
        questionText: 'A farm has plenty of unused land and machinery available. Explain why the price elasticity of supply of its crops is likely to be relatively elastic in this situation.',
        ...band4(
          'Clearly identifies the spare capacity as the reason output can be increased quickly and by a large proportion in response to a price rise, with a precise explanation.',
          'Identifies spare capacity as relevant to elastic supply with a reasonably clear explanation.',
          'Makes a limited or unclear attempt to link spare capacity to elasticity of supply.',
          'Makes only a very vague reference to supply or elasticity with little real explanation.'
        ),
        answerStructureAdvice: 'Link spare capacity directly to the FIRM\'S ABILITY to respond quickly to a price change - that responsiveness is what makes supply elastic.' },
      { markTariff: 15, requiresDiagram: true,
        questionText: 'Explain the factors that determine whether the supply of a good is likely to be price elastic or price inelastic.',
        ...levels([
          { level: 3, marks: '11-15', descriptor: 'Well organised, develops a selection of relevant issues (e.g. spare capacity, time period, ease of storage) with sound knowledge, good application, and clear, well-focused chains of reasoning.' },
          { level: 2, marks: '6-10', descriptor: 'Focuses on relevant issues with satisfactory knowledge and reasonable application, but analysis may not be fully developed.' },
          { level: 1, marks: '1-5', descriptor: 'Has identified one or more relevant issues with limited knowledge and very limited application.' },
        ]),
        answerStructureAdvice: 'Cover more than one genuine determinant (e.g. spare capacity AND time period) for a top-band answer - no evaluation is required at this tariff.' },
    ],
  },
  {
    subtopic: T413, concept: 'The determination of equilibrium market prices',
    questions: [
      { markTariff: 1, requiresDiagram: true,
        questionText: 'A market is in equilibrium when:\nA. Quantity demanded exceeds quantity supplied\nB. Quantity supplied exceeds quantity demanded\nC. Quantity demanded equals quantity supplied\nD. The government sets a legal minimum price',
        ...mc(['A','B','C','D'], 3, 'Equilibrium occurs where the demand and supply curves intersect - the price at which quantity demanded exactly equals quantity supplied, with no tendency for price to change.'),
        answerStructureAdvice: 'Equilibrium = quantity demanded EQUALS quantity supplied, at the price where the curves cross.' },
      { markTariff: 2, requiresDiagram: true,
        questionText: 'Explain what happens in a market if the price is initially set above the equilibrium level.',
        ...points([{ name: 'Reference to quantity supplied exceeding quantity demanded (a surplus)', marks: 1 }, { name: 'Reference to price falling back towards equilibrium as a result', marks: 1 }]),
        answerStructureAdvice: 'State the imbalance (surplus) and the resulting PRESSURE on price to move back towards equilibrium.' },
      { markTariff: 4, requiresDiagram: true,
        questionText: 'A sudden increase in demand for a good occurs while supply stays constant. Explain the effect on the market\'s equilibrium price and quantity.',
        ...band4(
          'Clearly identifies a rightward shift of the demand curve leading to both a higher equilibrium price AND a higher equilibrium quantity, with a precise explanation.',
          'Identifies the direction of change in price and quantity with a reasonably clear explanation.',
          'Makes a limited or unclear attempt to explain the effect on the market.',
          'Makes only a very vague reference to demand or price with little real explanation.'
        ),
        answerStructureAdvice: 'State the effect on BOTH price and quantity, not just one of them.' },
      { markTariff: 9, requiresDiagram: true,
        questionText: 'Using a diagram, explain how the price mechanism allocates resources in a competitive market following a change in consumer demand.',
        ...levels([
          { level: 3, marks: '7-9', descriptor: 'Well organised, develops the issue with sound knowledge and understanding, good application, well-focused analysis with a clear chain of reasoning, and an accurate, appropriately-used diagram.' },
          { level: 2, marks: '4-6', descriptor: 'Reasonable knowledge and application with some analysis that might not be fully developed; may include a relevant diagram.' },
          { level: 1, marks: '1-3', descriptor: 'Limited knowledge and very limited application; a diagram, if included, is not used well or is inaccurate.' },
        ]),
        answerStructureAdvice: 'Show the shift and new equilibrium on the diagram, then explain how the resulting price signal encourages firms to reallocate resources towards (or away from) producing this good.' },
    ],
  },
  {
    subtopic: T413, concept: 'The interrelationship between markets',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'Butter and margarine are substitute goods. A rise in the price of butter is likely to cause:\nA. A fall in demand for margarine\nB. A rise in demand for margarine\nC. A fall in the price of margarine\nD. No change in the market for margarine',
        ...mc(['A','B','C','D'], 2, 'As butter becomes relatively more expensive, some consumers switch to the substitute, margarine, increasing demand for it.'),
        answerStructureAdvice: 'For substitutes, a price rise in one good increases demand for the other.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by two goods being \'complements\' in consumption.',
        ...points([{ name: 'Reference to goods that are consumed together / jointly demanded', marks: 1 }, { name: 'Reference to a rise in the price of one reducing demand for the other', marks: 1 }]),
        answerStructureAdvice: 'Define complements and state the direction of the cross-price effect.' },
      { markTariff: 4, requiresDiagram: true,
        questionText: 'The price of crude oil rises sharply. Explain how this is likely to affect the market for cars, given that petrol is a complement to car ownership.',
        ...band4(
          'Clearly identifies a leftward shift of demand for cars via the rising cost of a complement (petrol) and precisely explains the chain of reasoning.',
          'Identifies the leftward shift with a reasonably clear explanation of the complement relationship.',
          'Makes a limited or unclear attempt to link oil prices to the car market.',
          'Makes only a very vague reference to oil or cars with little real explanation.'
        ),
        answerStructureAdvice: 'Trace the FULL chain: oil price rises → petrol prices rise → running a car becomes more expensive → demand for cars themselves falls.' },
      { markTariff: 9, requiresDiagram: true,
        questionText: 'Using a diagram, explain how a shortage in the market for a key raw material can affect the market for a good that uses it as an input.',
        ...levels([
          { level: 3, marks: '7-9', descriptor: 'Well organised, develops the issue with sound knowledge and understanding, good application, well-focused analysis with a clear chain of reasoning, and an accurate, appropriately-used diagram.' },
          { level: 2, marks: '4-6', descriptor: 'Reasonable knowledge and application with some analysis that might not be fully developed; may include a relevant diagram.' },
          { level: 1, marks: '1-3', descriptor: 'Limited knowledge and very limited application; a diagram, if included, is not used well or is inaccurate.' },
        ]),
        answerStructureAdvice: 'Show a leftward shift of SUPPLY in the finished-good market (higher input costs), with a rise in price and fall in quantity as a result.' },
    ],
  },
  // ───────────────────────── 4.1.4 Production, costs and revenue ─────────────────────────
  {
    subtopic: T414, concept: 'Production and productivity',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'Labour productivity is best measured as:\nA. Total output produced by a firm\nB. Output per worker (or per worker-hour)\nC. Total number of workers employed\nD. Total wages paid by a firm',
        ...mc(['A','B','C','D'], 1, 'Labour productivity measures output per unit of labour input (e.g. per worker or per hour worked), not total output or total employment.'),
        answerStructureAdvice: 'Productivity is always a RATIO (output per input), not a total.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain the difference between production and productivity.',
        ...points([{ name: 'Definition of production (the total quantity of output made)', marks: 1 }, { name: 'Definition of productivity (output per unit of input, e.g. per worker)', marks: 1 }]),
        answerStructureAdvice: 'Production is a total; productivity is a ratio - keep the two distinct.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'A factory installs new automated machinery and output per worker rises by 20%. Explain how this represents an increase in productivity.',
        ...band4(
          'Clearly identifies the rise in output per worker as a productivity increase and precisely explains the role of the new machinery/capital.',
          'Identifies the productivity increase with a reasonably clear explanation.',
          'Makes a limited or unclear attempt to link the scenario to productivity.',
          'Makes only a very vague reference to output or machinery with little real explanation.'
        ),
        answerStructureAdvice: 'Be precise that productivity is about output PER WORKER, and link the specific cause (new machinery) to that rise.' },
      { markTariff: 9, requiresDiagram: false,
        questionText: 'Explain how an improvement in labour productivity can affect a firm\'s costs of production.',
        ...levels([
          { level: 3, marks: '7-9', descriptor: 'Well organised, develops the issue with sound knowledge and understanding, good application, and a clear, well-focused chain of reasoning.' },
          { level: 2, marks: '4-6', descriptor: 'Reasonable knowledge and application, but the analysis may not be fully developed or becomes confused in places.' },
          { level: 1, marks: '1-3', descriptor: 'Limited knowledge and very limited application, with analysis that lacks focus.' },
        ]),
        answerStructureAdvice: 'Follow the chain from higher output per worker to lower average (unit) cost of production, holding wages constant.' },
    ],
  },
  {
    subtopic: T414, concept: 'Specialisation, division of labour and exchange',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'The \'division of labour\' refers to:\nA. Splitting a production process into separate tasks, with different workers specialising in each\nB. Dividing a firm\'s profits equally among workers\nC. Splitting a market between several competing firms\nD. Dividing government spending between different departments',
        ...mc(['A','B','C','D'], 1, 'Division of labour means breaking a production process into distinct tasks so that individual workers can specialise in one part of it, typically raising overall productivity.'),
        answerStructureAdvice: 'Division of labour is about SPECIALISING IN TASKS within production, not dividing money or markets.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'State two benefits of specialisation and the division of labour for a firm.',
        ...points([{ name: 'Correctly identified benefit (e.g. higher output/productivity through practice, less time lost switching tasks)', marks: 1 }, { name: 'A second, different correctly identified benefit', marks: 1 }]),
        answerStructureAdvice: 'One mark per genuine, distinct benefit named.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'A car factory assigns each worker to a single stage of the assembly line rather than having each worker build a whole car. Explain how this is likely to affect output.',
        ...band4(
          'Clearly identifies the division of labour and precisely explains how repeated practice on one task raises output per worker.',
          'Identifies the division of labour with a reasonably clear explanation of the effect on output.',
          'Makes a limited or unclear attempt to link the scenario to specialisation.',
          'Makes only a very vague reference to the factory or output with little real explanation.'
        ),
        answerStructureAdvice: 'Explain the MECHANISM (practice/focus on one task) that leads specifically to higher output, not just that output rises.' },
      { markTariff: 9, requiresDiagram: false,
        questionText: 'Explain the limitations of specialisation and the division of labour for workers and firms.',
        ...levels([
          { level: 3, marks: '7-9', descriptor: 'Well organised, develops one or more relevant issues (e.g. worker alienation, over-dependence on one skill, risk of monotony reducing quality) with sound knowledge, good application, and a clear chain of reasoning.' },
          { level: 2, marks: '4-6', descriptor: 'Includes a relevant issue with reasonable knowledge and application, but analysis may not be fully developed.' },
          { level: 1, marks: '1-3', descriptor: 'A brief or weak response with limited knowledge and very limited application.' },
        ]),
        answerStructureAdvice: 'Develop a genuine limitation (e.g. monotonous work reducing motivation/quality, or a worker\'s narrow skillset becoming a risk if that task is automated) rather than just restating the benefits in reverse.' },
    ],
  },
  {
    subtopic: T414, concept: 'The law of diminishing returns and returns to scale',
    questions: [
      { markTariff: 1, requiresDiagram: true,
        questionText: 'The law of diminishing marginal returns states that, in the short run, as extra units of a variable factor are added to a fixed factor:\nA. Total output will eventually fall\nB. The extra output from each additional unit will eventually fall\nC. Average cost will always fall\nD. The firm will always make a loss',
        ...mc(['A','B','C','D'], 2, 'Diminishing returns means the MARGINAL (extra) output from each additional unit of the variable factor eventually declines, not that total output itself must fall.'),
        answerStructureAdvice: 'This law is about the MARGINAL product falling, not total output falling.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by \'increasing returns to scale\'.',
        ...points([{ name: 'Reference to a proportionate increase in ALL factors of production', marks: 1 }, { name: 'Reference to output rising by a greater proportion than the increase in inputs', marks: 1 }]),
        answerStructureAdvice: 'Returns to scale is a LONG-RUN concept where all factors change together - distinguish this from diminishing returns (a short-run, single-factor concept).' },
      { markTariff: 4, requiresDiagram: true,
        questionText: 'A farm keeps adding more workers to a fixed plot of land. Explain why the extra output from each additional worker is likely to eventually fall.',
        ...band4(
          'Clearly identifies the fixed factor (land) and precisely explains how each extra worker has proportionally less of it to work with, reducing marginal product.',
          'Identifies the fixed factor as relevant with a reasonably clear explanation of falling marginal returns.',
          'Makes a limited or unclear attempt to link the scenario to diminishing returns.',
          'Makes only a very vague reference to workers or output with little real explanation.'
        ),
        answerStructureAdvice: 'Name the FIXED factor (land) explicitly and explain why adding more of the variable factor (labour) to it eventually yields less extra output each time.' },
      { markTariff: 9, requiresDiagram: true,
        questionText: 'Using a diagram, explain the relationship between the law of diminishing marginal returns and a firm\'s short-run marginal cost curve.',
        ...levels([
          { level: 3, marks: '7-9', descriptor: 'Well organised, develops the issue with sound knowledge and understanding, good application, well-focused analysis with a clear chain of reasoning, and an accurate, appropriately-used diagram.' },
          { level: 2, marks: '4-6', descriptor: 'Reasonable knowledge and application with some analysis that might not be fully developed; may include a relevant diagram.' },
          { level: 1, marks: '1-3', descriptor: 'Limited knowledge and very limited application; a diagram, if included, is not used well or is inaccurate.' },
        ]),
        answerStructureAdvice: 'Explain that falling marginal product means each extra unit of output costs more to produce, so marginal cost eventually rises - the mirror image of diminishing returns.' },
    ],
  },
  {
    subtopic: T414, concept: 'Costs of production and economies of scale',
    questions: [
      { markTariff: 1, requiresDiagram: true,
        questionText: 'Economies of scale refer to:\nA. A rise in a firm\'s total costs as it produces more\nB. A fall in a firm\'s long-run average cost as it increases its scale of production\nC. A rise in a firm\'s average cost as it increases its scale of production\nD. A fixed cost that never changes',
        ...mc(['A','B','C','D'], 2, 'Economies of scale mean long-run average cost per unit falls as a firm increases its scale of production, due to factors like bulk buying or specialisation.'),
        answerStructureAdvice: 'Economies of scale = FALLING long-run average cost as scale increases.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by a \'diseconomy of scale\'.',
        ...points([{ name: 'Reference to long-run average cost rising as output increases', marks: 1 }, { name: 'Reference to this occurring beyond a certain (too-large) scale of production', marks: 1 }]),
        answerStructureAdvice: 'State WHAT happens to average cost and WHEN (beyond a certain scale).' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'A large supermarket chain is able to negotiate lower prices per unit from its suppliers than a small independent shop. Explain how this is an example of economies of scale.',
        ...band4(
          'Clearly identifies this as a purchasing (bulk-buying) economy of scale and precisely explains the resulting fall in average cost for the supermarket.',
          'Identifies the purchasing economy of scale with a reasonably clear explanation.',
          'Makes a limited or unclear attempt to link the scenario to economies of scale.',
          'Makes only a very vague reference to the supermarket or costs with little real explanation.'
        ),
        answerStructureAdvice: 'Name the SPECIFIC type of economy of scale (purchasing/bulk-buying) rather than a vague "economies of scale" reference.' },
      { markTariff: 15, requiresDiagram: true,
        questionText: 'Explain the internal economies and diseconomies of scale that a large manufacturing firm might experience as it grows.',
        ...levels([
          { level: 3, marks: '11-15', descriptor: 'Well organised, develops a selection of relevant issues (e.g. technical, purchasing, and managerial economies; communication diseconomies) with sound knowledge, good application, and clear, well-focused chains of reasoning.' },
          { level: 2, marks: '6-10', descriptor: 'Focuses on relevant issues with satisfactory knowledge and reasonable application, but analysis may not be fully developed.' },
          { level: 1, marks: '1-5', descriptor: 'Has identified one or more relevant issues with limited knowledge and very limited application.' },
        ]),
        answerStructureAdvice: 'Cover BOTH economies (e.g. technical or purchasing) AND diseconomies (e.g. communication/coordination problems) with named types for a top-band answer - no evaluation required at this tariff.' },
    ],
  },
  {
    subtopic: T414, concept: 'Revenue and profit',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'Normal profit is best described as:\nA. Any profit above zero\nB. The minimum reward needed to keep a firm\'s resources in their current use, including the opportunity cost of capital\nC. Profit made only by monopolies\nD. The total revenue of a firm',
        ...mc(['A','B','C','D'], 2, 'Normal profit is the minimum return needed to keep an entrepreneur\'s resources in their current use - an economic COST, not a bonus, since it includes the opportunity cost of capital.'),
        answerStructureAdvice: 'Normal profit is an economic COST, not extra profit - it\'s the minimum needed to keep a firm in the industry.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Calculate a firm\'s total revenue if it sells 500 units at a price of £8 each.',
        ...points([{ name: 'Correct total revenue of £4,000 shown, with correct method (price × quantity)', marks: 2 }]),
        answerStructureAdvice: 'Total revenue = price × quantity sold = £8 × 500 = £4,000.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'A firm\'s total revenue exceeds its total costs, including the opportunity cost of the owner\'s capital. Explain what this shows about the firm\'s profit.',
        ...band4(
          'Clearly identifies that the firm is earning supernormal (abnormal) profit and precisely explains why this is above normal profit.',
          'Identifies supernormal profit with a reasonably clear explanation.',
          'Makes a limited or unclear attempt to classify the type of profit.',
          'Makes only a very vague reference to profit or revenue with little real explanation.'
        ),
        answerStructureAdvice: 'Name the profit type precisely (supernormal/abnormal profit) and relate it back to the definition of normal profit.' },
      { markTariff: 9, requiresDiagram: false,
        questionText: 'Explain why a firm might continue to operate in the short run even while making a loss.',
        ...levels([
          { level: 3, marks: '7-9', descriptor: 'Well organised, develops the issue with sound knowledge and understanding (e.g. the shutdown point, covering variable costs), good application, and a clear chain of reasoning.' },
          { level: 2, marks: '4-6', descriptor: 'Reasonable knowledge and application, but the analysis may not be fully developed or becomes confused in places.' },
          { level: 1, marks: '1-3', descriptor: 'Limited knowledge and very limited application, with analysis that lacks focus.' },
        ]),
        answerStructureAdvice: 'The key rule: a firm stays open in the short run as long as price covers average variable cost, even if it doesn\'t cover fixed costs too.' },
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

  console.log(`Inserting ${rows.length} practice questions (AQA batch A: 4.1.1-4.1.4) across ${byConcept.size} concepts...`);
  const { error } = await supabase.from('practice_questions').insert(rows);
  if (error) { console.error('Insert failed:', JSON.stringify(error)); process.exit(1); }
  console.log('Done.');
}

main();
