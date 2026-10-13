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
// Edexcel A-Level Economics A conventions (same ones used for 1.1/1.2),
// but the level/criterion descriptor wording is written independently,
// not quoted from any Pearson document.

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

const SUBTOPIC_1_3 = '1.3 Market failure';
const SUBTOPIC_1_4 = '1.4 Government intervention';

const QUESTIONS = [
  // ───────────────────────── 1.3 Market failure ─────────────────────────
  {
    subtopic: SUBTOPIC_1_3,
    concept: 'Types of market failure',
    questions: [
      {
        markTariff: 1, requiresDiagram: false,
        questionText: 'Market failure occurs when:\nA. The government sets a legal minimum price\nB. The free market allocates resources in a way that fails to maximise social welfare\nC. A firm earns supernormal profit\nD. Supply and demand are equal at the market price',
        ...mc(['A', 'B', 'C', 'D'], 1, 'Market failure means the price mechanism, left alone, leads to a misallocation of resources - marginal social benefit and marginal social cost diverge, so welfare isn\'t maximised. The others describe normal, working market outcomes.'),
        answerStructureAdvice: 'Marked right or wrong - focus on the general DEFINITION of market failure, not on any one specific cause of it.',
      },
      {
        markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what economists mean by the term \'market failure\'.',
        ...points([
          { name: 'Reference to the free market misallocating resources', marks: 1 },
          { name: 'Reference to social welfare not being maximised (marginal social benefit ≠ marginal social cost)', marks: 1 },
        ]),
        answerStructureAdvice: 'Knowledge only - a precise definition referencing MSB/MSC or social welfare is enough for full marks.',
      },
      {
        markTariff: 8, requiresDiagram: false,
        questionText: 'Examine why a free, unregulated market might fail to allocate resources efficiently.',
        ...points([
          { name: 'Knowledge of a cause of market failure', marks: 2 },
          { name: 'Application to a real market/example', marks: 2 },
          { name: 'Analysis - a developed chain of reasoning showing the resulting misallocation', marks: 2 },
          { name: 'Evaluation - weighing how significant the resulting misallocation is', marks: 2 },
        ]),
        answerStructureAdvice: 'Pick ONE cause (e.g. externalities, public goods, information gaps) and follow it through in depth, rather than briefly listing several.',
      },
      {
        markTariff: 15, requiresDiagram: false,
        questionText: 'Discuss the extent to which market failure justifies government intervention in a market economy.',
        ...levels([
          { level: 1, marks: '1-5', descriptor: 'Basic, undeveloped points on market failure with little application or discussion of intervention.' },
          { level: 2, marks: '6-10', descriptor: 'Developed knowledge and application of at least one type of market failure, with some analysis and a simple judgement on intervention.' },
          { level: 3, marks: '11-15', descriptor: 'Sustained chains of reasoning across more than one type of market failure, applied throughout, leading to a balanced, well-supported judgement on when intervention is (and isn\'t) justified.' },
        ]),
        answerStructureAdvice: 'Cover more than one distinct type of market failure (e.g. externalities AND public goods) so your final judgement can genuinely compare cases where intervention is more or less justified.',
      },
    ],
  },
  {
    subtopic: SUBTOPIC_1_3,
    concept: 'Externalities',
    questions: [
      {
        markTariff: 1, requiresDiagram: false,
        questionText: 'A negative production externality exists when:\nA. Marginal private cost equals marginal social cost\nB. Marginal social cost exceeds marginal private cost\nC. Marginal private benefit exceeds marginal social benefit\nD. A good is non-excludable and non-rivalrous',
        ...mc(['A', 'B', 'C', 'D'], 1, 'A negative production externality means the wider social cost of production (e.g. pollution) exceeds the private cost the firm actually pays, so MSC > MPC.'),
        answerStructureAdvice: 'Keep private cost/benefit and social cost/benefit clearly separate in your head - the externality IS the gap between them.',
      },
      {
        markTariff: 4, requiresDiagram: true,
        questionText: 'Using a diagram, explain how a negative production externality leads to overproduction in a free market.',
        ...points([
          { name: 'Knowledge of MPC/MSC divergence', marks: 1 },
          { name: 'Application - identifying the free market (MPC=MPB) and social optimum (MSC=MSB) output levels', marks: 1 },
          { name: 'Analysis - a chain of reasoning explaining why the free market output exceeds the social optimum', marks: 2 },
        ]),
        answerStructureAdvice: 'Even described in words, name both output levels (free market Q and socially optimal Q) and explain why the gap between them represents a welfare loss.',
      },
      {
        markTariff: 10, requiresDiagram: true,
        questionText: 'Assess the view that a carbon tax is the most effective way to correct the negative externality from pollution.',
        ...levels([
          { level: 1, marks: '1-3', descriptor: 'Isolated, undeveloped knowledge of how a carbon tax works.' },
          { level: 2, marks: '4-7', descriptor: 'Developed, applied points on the tax with some analysis and a simple assessment against at least one alternative.' },
          { level: 3, marks: '8-10', descriptor: 'Sustained, well-applied analysis comparing the tax against a genuine alternative policy, with a substantiated judgement on effectiveness.' },
        ]),
        answerStructureAdvice: 'A tax alone doesn\'t reach "assess" - explicitly compare it against at least one alternative (e.g. tradable permits or regulation) before judging which is more effective.',
      },
      {
        markTariff: 25, requiresDiagram: true,
        questionText: 'Evaluate the effectiveness of government policies in correcting externalities in the market for private motoring.',
        ...levels([
          { level: 1, marks: '1-6', descriptor: 'Generic knowledge of externalities with little application to private motoring.' },
          { level: 2, marks: '7-12', descriptor: 'Developed application to at least one named policy with some analysis.' },
          { level: 3, marks: '13-18', descriptor: 'Sustained analysis across more than one policy with clear chains of reasoning on their effectiveness.' },
          { level: 4, marks: '19-25', descriptor: 'Consistently well-developed, applied analysis across multiple policies (e.g. fuel duty, congestion charging, subsidies for public transport) with a fully justified, balanced conclusion.' },
        ]),
        answerStructureAdvice: 'Cover at least two genuinely different policy types (e.g. a tax AND a subsidy for an alternative) so your evaluation can weigh their relative strengths, not just describe one in isolation.',
      },
    ],
  },
  {
    subtopic: SUBTOPIC_1_3,
    concept: 'Public goods',
    questions: [
      {
        markTariff: 1, requiresDiagram: false,
        questionText: 'Which characteristic makes national defence a pure public good?\nA. Excludability and rivalry\nB. Non-excludability and non-rivalry\nC. High price elasticity of demand\nD. Diminishing marginal utility',
        ...mc(['A', 'B', 'C', 'D'], 1, 'A pure public good is both non-excludable (you can\'t stop someone benefiting without paying) and non-rivalrous (one person\'s use doesn\'t reduce what\'s available to others) - national defence protects everyone in the country regardless of whether they\'ve paid.'),
        answerStructureAdvice: 'Marked right or wrong - the two defining properties (non-excludable, non-rivalrous) are the whole answer.',
      },
      {
        markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by the \'free-rider problem\'.',
        ...points([
          { name: 'Reference to non-excludability allowing consumption without payment', marks: 1 },
          { name: 'Reference to the resulting under-provision (or non-provision) by the free market', marks: 1 },
        ]),
        answerStructureAdvice: 'Both halves matter: WHY people can avoid paying, and WHAT that does to provision.',
      },
      {
        markTariff: 8, requiresDiagram: false,
        questionText: 'Examine why the free market is unlikely to provide public goods.',
        ...points([
          { name: 'Knowledge of non-excludability/non-rivalry', marks: 2 },
          { name: 'Application to a real public good', marks: 2 },
          { name: 'Analysis - a chain of reasoning from the free-rider problem to zero private provision', marks: 2 },
          { name: 'Evaluation - weighing whether any private provision is realistically possible', marks: 2 },
        ]),
        answerStructureAdvice: 'Name a specific public good (e.g. street lighting, flood defences) rather than discussing public goods only in the abstract.',
      },
      {
        markTariff: 12, requiresDiagram: false,
        questionText: 'Discuss whether government provision is the only solution to the problem of public goods.',
        ...levels([
          { level: 1, marks: '1-4', descriptor: 'Basic description of the public goods problem with little real discussion of alternatives.' },
          { level: 2, marks: '5-8', descriptor: 'Developed points on government provision and at least one alternative, with some evaluation.' },
          { level: 3, marks: '9-12', descriptor: 'Sustained, well-developed discussion of government provision against genuine alternatives (e.g. voluntary/charitable provision, quasi-public good models) with a clear judgement.' },
        ]),
        answerStructureAdvice: 'Government provision isn\'t the only option in real life - mention at least one genuine alternative (charities, private clubs bundling the good with an excludable one) before concluding.',
      },
    ],
  },
  {
    subtopic: SUBTOPIC_1_3,
    concept: 'Information gaps',
    questions: [
      {
        markTariff: 1, requiresDiagram: false,
        questionText: 'Asymmetric information exists when:\nA. Both buyer and seller have perfect knowledge\nB. One party in a transaction has more or better information than the other\nC. A good is a public good\nD. A negative externality is present',
        ...mc(['A', 'B', 'C', 'D'], 1, 'Asymmetric (or imperfect) information means one side of a transaction - often the seller - knows something relevant the other side doesn\'t, which can distort the choices made.'),
        answerStructureAdvice: 'Focus on the IMBALANCE of knowledge between the two parties, not on the good or externality itself.',
      },
      {
        markTariff: 4, requiresDiagram: false,
        questionText: 'Using an example, explain how information gaps can lead to market failure in the market for second-hand cars.',
        ...points([
          { name: 'Knowledge of asymmetric information', marks: 1 },
          { name: 'Application - sellers knowing more about a car\'s true condition than buyers', marks: 1 },
          { name: 'Analysis - a chain of reasoning to adverse selection/a fall in the quality traded (or buyers exiting the market)', marks: 2 },
        ]),
        answerStructureAdvice: 'Follow the logic all the way through: buyers can\'t tell good cars from bad, so they offer an average price, which pushes good-quality sellers out of the market.',
      },
      {
        markTariff: 8, requiresDiagram: false,
        questionText: 'Examine the impact of asymmetric information in the market for private health insurance.',
        ...points([
          { name: 'Knowledge of asymmetric information', marks: 2 },
          { name: 'Application to private health insurance', marks: 2 },
          { name: 'Analysis - a chain of reasoning on adverse selection and/or moral hazard', marks: 2 },
          { name: 'Evaluation - weighing how serious the resulting market failure is', marks: 2 },
        ]),
        answerStructureAdvice: 'Health insurance is a strong example because it can show BOTH adverse selection (insurers not knowing who\'s high-risk) and moral hazard (insured people taking more risks) - developing either one fully is enough.',
      },
      {
        markTariff: 15, requiresDiagram: false,
        questionText: 'Discuss the extent to which government intervention can correct information gaps in a market.',
        ...levels([
          { level: 1, marks: '1-5', descriptor: 'Basic, undeveloped points on information gaps with little discussion of intervention.' },
          { level: 2, marks: '6-10', descriptor: 'Developed knowledge and application of at least one intervention (e.g. regulation, compulsory information provision), with some analysis and a simple judgement.' },
          { level: 3, marks: '11-15', descriptor: 'Sustained chains of reasoning across more than one intervention, applied throughout, leading to a balanced, well-supported judgement on the limits of correcting information gaps.' },
        ]),
        answerStructureAdvice: 'Cover more than one intervention (e.g. compulsory labelling AND regulation of professional advice) and be honest about their limits - information gaps are often only partly closed, not eliminated.',
      },
    ],
  },
  // ───────────────────────── 1.4 Government intervention ─────────────────────────
  {
    subtopic: SUBTOPIC_1_4,
    concept: 'Government intervention in markets',
    questions: [
      {
        markTariff: 1, requiresDiagram: false,
        questionText: 'A maximum price (price ceiling) set below the free market equilibrium price is likely to cause:\nA. A surplus\nB. A shortage\nC. Productive efficiency\nD. An increase in supply',
        ...mc(['A', 'B', 'C', 'D'], 1, 'Setting a maximum price below equilibrium means quantity demanded exceeds quantity supplied at that price - a shortage. A price above equilibrium (a minimum price) would instead cause a surplus.'),
        answerStructureAdvice: 'Sketch the diagram mentally: a maximum price BELOW equilibrium cuts into the supply curve, creating excess demand.',
      },
      {
        markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by a \'minimum price\' (price floor) in a market.',
        ...points([
          { name: 'Reference to a legally set price above the free market equilibrium', marks: 1 },
          { name: 'Reference to it being illegal to trade below this price', marks: 1 },
        ]),
        answerStructureAdvice: 'Two distinct facts are needed: where it\'s set (above equilibrium) and what it legally prevents (trading below it).',
      },
      {
        markTariff: 8, requiresDiagram: true,
        questionText: 'Examine the impact of a legally imposed minimum price on the market for agricultural products.',
        ...points([
          { name: 'Knowledge of how a minimum price works', marks: 2 },
          { name: 'Application to agricultural products', marks: 2 },
          { name: 'Analysis - a chain of reasoning to the resulting surplus and its consequences', marks: 2 },
          { name: 'Evaluation - weighing the impact on different stakeholders (farmers, consumers, government)', marks: 2 },
        ]),
        answerStructureAdvice: 'Follow through to what happens to the surplus (e.g. government buying and storing it) and name at least one stakeholder who gains and one who loses.',
      },
      {
        markTariff: 25, requiresDiagram: false,
        questionText: 'Evaluate the effectiveness of different government policies in reducing traffic congestion in a major city.',
        ...levels([
          { level: 1, marks: '1-6', descriptor: 'Generic knowledge of congestion as a problem with little application to specific policies.' },
          { level: 2, marks: '7-12', descriptor: 'Developed application to at least one named policy (e.g. a congestion charge) with some analysis.' },
          { level: 3, marks: '13-18', descriptor: 'Sustained analysis across more than one policy type with clear chains of reasoning on effectiveness.' },
          { level: 4, marks: '19-25', descriptor: 'Consistently well-developed, applied analysis across multiple distinct policy types (e.g. congestion charging, subsidised public transport, regulation) with a fully justified, balanced conclusion.' },
        ]),
        answerStructureAdvice: 'Bring in at least three distinct policy types (a tax/charge, a subsidy, and regulation) so the final evaluation can genuinely rank them rather than just describing one at length.',
      },
    ],
  },
  {
    subtopic: SUBTOPIC_1_4,
    concept: 'Government failure',
    questions: [
      {
        markTariff: 1, requiresDiagram: false,
        questionText: 'Government failure occurs when:\nA. A firm fails to maximise profit\nB. Government intervention leads to a net welfare loss or a worse misallocation of resources\nC. The government successfully corrects a market failure\nD. A market clears at its equilibrium price',
        ...mc(['A', 'B', 'C', 'D'], 1, 'Government failure means intervention makes the allocation of resources WORSE rather than better - a net loss of welfare, not just an imperfect fix.'),
        answerStructureAdvice: 'The key word is NET - some benefit can still occur, but government failure means the overall effect is a worsening, not a full success.',
      },
      {
        markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by \'government failure\'.',
        ...points([
          { name: 'Reference to government intervention causing a net welfare loss', marks: 1 },
          { name: 'Reference to a worse (or no better) allocation of resources than before intervention', marks: 1 },
        ]),
        answerStructureAdvice: 'Knowledge only - state clearly that the intervention itself is the cause of the new, worse outcome.',
      },
      {
        markTariff: 8, requiresDiagram: false,
        questionText: 'Examine why government intervention to correct a market failure might itself lead to government failure.',
        ...points([
          { name: 'Knowledge of a cause of government failure (e.g. imperfect information, administrative cost, unintended consequences, regulatory capture)', marks: 2 },
          { name: 'Application to a real or plausible policy example', marks: 2 },
          { name: 'Analysis - a chain of reasoning from the cause to a net welfare loss', marks: 2 },
          { name: 'Evaluation - weighing how likely or serious this risk is', marks: 2 },
        ]),
        answerStructureAdvice: 'Pick ONE cause of government failure and follow it through with a specific example, rather than briefly listing several causes.',
      },
      {
        markTariff: 12, requiresDiagram: false,
        questionText: 'Discuss the view that the costs of government failure always outweigh the benefits of correcting market failure.',
        ...levels([
          { level: 1, marks: '1-4', descriptor: 'Basic description of government failure with little real discussion of the "always" claim.' },
          { level: 2, marks: '5-8', descriptor: 'Developed points on both the costs of government failure and the benefits of correcting market failure, with some evaluation.' },
          { level: 3, marks: '9-12', descriptor: 'Sustained, well-developed discussion directly weighing costs against benefits across more than one policy example, with a clear, justified judgement on the word "always".' },
        ]),
        answerStructureAdvice: 'The word "always" in the question is your opening - a good answer explicitly finds at least one case where intervention clearly succeeds, to reject the absolute claim before reaching a balanced judgement.',
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

  // Sanity check before writing anything: every concept from the lesson
  // plan needs at least 4 questions, same bar as 1.1/1.2.
  const byConcept = new Map();
  for (const r of rows) {
    byConcept.set(r.concept, (byConcept.get(r.concept) || 0) + 1);
  }
  let shortfall = false;
  for (const [concept, count] of byConcept) {
    if (count < 4) { console.error(`SHORTFALL: "${concept}" only has ${count} questions`); shortfall = true; }
  }
  if (shortfall) process.exit(1);

  console.log(`Inserting ${rows.length} practice questions (1.3 + 1.4) across ${byConcept.size} concepts...`);
  const { error } = await supabase.from('practice_questions').insert(rows);
  if (error) {
    console.error('Insert failed:', JSON.stringify(error));
    process.exit(1);
  }
  console.log('Done.');
}

main();
