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

const T31 = '3.1 Business growth';
const T32 = '3.2 Business objectives';
const T33 = '3.3 Revenues, costs and profits';
const T34 = '3.4 Market structures';
const T35 = '3.5 Labour market';
const T36 = '3.6 Government intervention in business/labour markets';

const QUESTIONS = [
  // ───────────────────────── 3.1 Business growth ─────────────────────────
  {
    subtopic: T31, concept: 'Sizes and types of firms',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'A firm that grows by opening more branches of exactly the same type of shop is an example of growth measured by:\nA. Market capitalisation only\nB. Number of outlets\nC. Number of countries taxed in\nD. Rate of interest paid',
        ...mc(['A','B','C','D'], 1, 'Number of outlets/branches is a common, simple measure of firm size for retail-type businesses, alongside measures like revenue, market share, or number of employees.'),
        answerStructureAdvice: 'Marked right or wrong - the question is testing which of several possible SIZE MEASURES fits the scenario given.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'State two ways in which the size of a firm can be measured.',
        ...points([{ name: 'Naming any two of: revenue/turnover, number of employees, market share, market capitalisation, number of outlets', marks: 2 }]),
        answerStructureAdvice: 'One mark per correctly named measure - no explanation needed.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Examine why most firms in an economy are small, even though large firms often produce most of an industry\'s output.',
        ...points([{ name: 'Knowledge of barriers to growth (e.g. limited access to finance, small market size)', marks: 2 }, { name: 'Application to a real or plausible small firm/industry', marks: 2 }, { name: 'Analysis - a chain of reasoning from the barrier to firms staying small', marks: 2 }, { name: 'Evaluation - weighing how significant this barrier is across different industries', marks: 2 }]),
        answerStructureAdvice: 'Develop ONE barrier (e.g. difficulty accessing finance) fully rather than briefly listing several.' },
      { markTariff: 12, requiresDiagram: false,
        questionText: 'Discuss the extent to which small firms remain important in a modern, globalised economy.',
        ...levels([
          { level: 1, marks: '1-4', descriptor: 'Basic description of small firms with little real discussion of importance.' },
          { level: 2, marks: '5-8', descriptor: 'Developed points on the role of small firms with some evaluation.' },
          { level: 3, marks: '9-12', descriptor: 'Sustained, well-developed discussion of small firms\' role (innovation, competition, employment) against the pressures of globalisation favouring large firms, with a clear judgement.' },
        ]),
        answerStructureAdvice: 'Weigh genuine advantages of small firms (flexibility, innovation, niche markets) against the real pressure large multinational firms place on them, before concluding.' },
    ],
  },
  {
    subtopic: T31, concept: 'How businesses grow',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'A horizontal merger occurs when two firms merge that are:\nA. At different stages of the same production process\nB. In the same industry, producing similar/competing products\nC. In completely unrelated industries\nD. Located in different countries only',
        ...mc(['A','B','C','D'], 1, 'A horizontal merger is between two firms at the same stage of production, in the same industry, often direct competitors - the most common way this term is tested.'),
        answerStructureAdvice: 'Horizontal = same industry/stage; vertical = different stages of the SAME supply chain; conglomerate = unrelated industries.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'Using an example, distinguish between organic (internal) growth and inorganic (external) growth.',
        ...points([{ name: 'Knowledge of organic growth (expanding using the firm\'s own resources/reinvested profit)', marks: 1 }, { name: 'Knowledge of inorganic growth (merger or takeover with another firm)', marks: 1 }, { name: 'Application - a genuine example of each', marks: 2 }]),
        answerStructureAdvice: 'One clear example of each (e.g. a firm building a new factory vs. a firm acquiring a rival) makes the distinction concrete.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Examine the possible benefits to a firm of vertical integration.',
        ...points([{ name: 'Knowledge of vertical integration (forwards or backwards)', marks: 2 }, { name: 'Application to a real or plausible supply chain', marks: 2 }, { name: 'Analysis - a chain of reasoning to a specific benefit (e.g. securing supply, cutting out a middleman\'s margin)', marks: 2 }, { name: 'Evaluation - weighing how significant this benefit is against the cost/risk of integrating', marks: 2 }]),
        answerStructureAdvice: 'Specify forwards (towards the consumer) or backwards (towards raw materials) integration and follow through to a concrete benefit.' },
      { markTariff: 10, requiresDiagram: false,
        questionText: 'Assess the view that mergers are usually beneficial to consumers.',
        ...levels([
          { level: 1, marks: '1-3', descriptor: 'Isolated, undeveloped knowledge of mergers.' },
          { level: 2, marks: '4-7', descriptor: 'Developed, applied points on benefits and/or drawbacks with some analysis and a simple assessment.' },
          { level: 3, marks: '8-10', descriptor: 'Sustained, well-applied analysis weighing consumer benefits (e.g. economies of scale passed on) against risks (e.g. reduced competition, higher prices) with a substantiated judgement.' },
        ]),
        answerStructureAdvice: 'Directly weigh cost savings potentially passed on to consumers against the risk that reduced competition raises prices instead.' },
    ],
  },
  {
    subtopic: T31, concept: 'Demergers',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'A demerger occurs when:\nA. Two firms combine to form one larger firm\nB. A firm splits into two or more separate, independent parts\nC. A firm goes bankrupt\nD. A firm relocates production overseas',
        ...mc(['A','B','C','D'], 1, 'A demerger is the reverse of a merger - a single firm is split into separate businesses, often to focus each part on its core activities.'),
        answerStructureAdvice: 'Demerger = SPLITTING a firm apart, the opposite process to a merger.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain one reason why a firm might choose to demerge.',
        ...points([{ name: 'Naming a genuine reason (e.g. removing diseconomies of scale, refocusing on core business)', marks: 1 }, { name: 'Brief development of that reason', marks: 1 }]),
        answerStructureAdvice: 'Name the reason clearly, then add one sentence of development to secure the second mark.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Examine why a large conglomerate firm might decide to demerge one of its divisions.',
        ...points([{ name: 'Knowledge of diseconomies of scale/loss of focus', marks: 2 }, { name: 'Application to a real or plausible conglomerate scenario', marks: 2 }, { name: 'Analysis - a chain of reasoning from the problem to the decision to demerge', marks: 2 }, { name: 'Evaluation - weighing whether demerging actually solves the problem', marks: 2 }]),
        answerStructureAdvice: 'Link a specific diseconomy of scale (e.g. poor communication across divisions) directly to why splitting up would reduce it.' },
      { markTariff: 12, requiresDiagram: false,
        questionText: 'Discuss the extent to which a demerger is likely to improve a firm\'s efficiency.',
        ...levels([
          { level: 1, marks: '1-4', descriptor: 'Basic description of demergers with little real discussion of efficiency.' },
          { level: 2, marks: '5-8', descriptor: 'Developed points on efficiency gains and/or losses with some evaluation.' },
          { level: 3, marks: '9-12', descriptor: 'Sustained, well-developed discussion weighing efficiency gains (sharper focus, reduced diseconomies) against losses (lost economies of scale/scope), with a clear judgement.' },
        ]),
        answerStructureAdvice: 'A demerger can cut diseconomies of scale but also loses any genuine economies of scale/scope the combined firm had - weigh both sides explicitly.' },
    ],
  },
  // ───────────────────────── 3.2 Business objectives ─────────────────────────
  {
    subtopic: T32, concept: 'Profit maximisation',
    questions: [
      { markTariff: 1, requiresDiagram: true,
        questionText: 'A profit-maximising firm produces at the output level where:\nA. Total revenue is at its maximum\nB. Marginal cost equals marginal revenue (MC=MR)\nC. Average cost is at its minimum\nD. Price equals average cost',
        ...mc(['A','B','C','D'], 1, 'Profit is maximised where marginal cost equals marginal revenue (MC=MR) - producing one more unit beyond this point would cost more than it earns.'),
        answerStructureAdvice: 'Learn MC=MR as the profit-maximising rule - it applies across every market structure.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain why a profit-maximising firm produces where MC=MR.',
        ...points([{ name: 'Reference to producing an extra unit adding more to revenue than cost while MR>MC', marks: 1 }, { name: 'Reference to it no longer being worth producing once MC exceeds MR', marks: 1 }]),
        answerStructureAdvice: 'Explain the logic from BOTH sides of the MC=MR point - why it\'s worth producing up to it, and not worth going beyond it.' },
      { markTariff: 8, requiresDiagram: true,
        questionText: 'Examine why a firm might choose not to profit maximise in the short run.',
        ...points([{ name: 'Knowledge of an alternative objective (e.g. sales/revenue maximisation, satisficing)', marks: 2 }, { name: 'Application to a real or plausible firm', marks: 2 }, { name: 'Analysis - a chain of reasoning to why this alternative might be pursued instead', marks: 2 }, { name: 'Evaluation - weighing how sustainable this is in the long run', marks: 2 }]),
        answerStructureAdvice: 'Develop ONE alternative objective (e.g. sales maximisation to build market share) into a full chain, then evaluate its long-run sustainability.' },
      { markTariff: 15, requiresDiagram: true,
        questionText: 'Discuss the extent to which real-world firms actually pursue profit maximisation.',
        ...levels([
          { level: 1, marks: '1-5', descriptor: 'Basic, undeveloped points on profit maximisation with little discussion of alternatives.' },
          { level: 2, marks: '6-10', descriptor: 'Developed knowledge and application of at least one alternative objective with some analysis and a simple judgement.' },
          { level: 3, marks: '11-15', descriptor: 'Sustained chains of reasoning across more than one alternative objective (e.g. managerial theories, satisficing, social/environmental objectives), leading to a balanced, well-supported judgement.' },
        ]),
        answerStructureAdvice: 'Cover more than one genuine alternative objective and consider the divorce of ownership from control (managers vs. shareholders) as a driving reason firms may deviate from pure profit maximisation.' },
    ],
  },
  {
    subtopic: T32, concept: 'Alternative business objectives',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: '\'Satisficing\' behaviour describes a firm that aims to:\nA. Maximise profit at all costs\nB. Achieve a satisfactory, rather than maximum, level of profit alongside other goals\nC. Minimise total revenue\nD. Always minimise costs regardless of quality',
        ...mc(['A','B','C','D'], 1, 'Satisficing means a firm settles for an acceptable (satisfactory) level of profit rather than pursuing the theoretical maximum, often because it is balancing the interests of several stakeholders.'),
        answerStructureAdvice: 'Satisficing = "good enough", not maximum - the key contrast with pure profit maximisation.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by the \'principal-agent problem\' in relation to business objectives.',
        ...points([{ name: 'Reference to a separation between owners (principals) and managers (agents)', marks: 1 }, { name: 'Reference to managers pursuing their own objectives rather than the owners\' (e.g. profit maximisation)', marks: 1 }]),
        answerStructureAdvice: 'Both halves matter: WHO the two parties are, and WHY their goals might diverge.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Examine why a manager might pursue sales revenue maximisation rather than profit maximisation.',
        ...points([{ name: 'Knowledge of the principal-agent problem/managerial objectives', marks: 2 }, { name: 'Application to a real or plausible firm/manager', marks: 2 }, { name: 'Analysis - a chain of reasoning linking managerial pay/status/job security to higher sales revenue', marks: 2 }, { name: 'Evaluation - weighing whether shareholders can effectively constrain this behaviour', marks: 2 }]),
        answerStructureAdvice: 'Link the manager\'s personal incentive (e.g. bonus tied to revenue, status from running a bigger firm) directly to why sales, not profit, becomes the target.' },
      { markTariff: 12, requiresDiagram: false,
        questionText: 'Discuss the extent to which corporate social responsibility (CSR) is compatible with a firm\'s pursuit of profit.',
        ...levels([
          { level: 1, marks: '1-4', descriptor: 'Basic description of CSR with little real discussion of compatibility with profit.' },
          { level: 2, marks: '5-8', descriptor: 'Developed points on both compatibility and conflict with some evaluation.' },
          { level: 3, marks: '9-12', descriptor: 'Sustained, well-developed discussion of how CSR can build brand loyalty/reduce risk (supporting profit) versus adding direct costs (reducing it), with a clear judgement.' },
        ]),
        answerStructureAdvice: 'A nuanced answer shows CSR can be BOTH a cost (reducing short-run profit) and an investment (building reputation/loyalty that supports long-run profit) - weigh the timeframe explicitly.' },
    ],
  },
  // ───────────────────────── 3.3 Revenues, costs and profits ─────────────────────────
  {
    subtopic: T33, concept: 'Revenue',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'Total revenue is calculated as:\nA. Price minus average cost\nB. Price multiplied by quantity sold\nC. Total cost minus profit\nD. Average revenue divided by quantity',
        ...mc(['A','B','C','D'], 1, 'Total revenue (TR) = price (P) × quantity sold (Q) - the most basic revenue formula, from which average and marginal revenue are derived.'),
        answerStructureAdvice: 'TR = P × Q - learn this formula precisely, it underlies every other revenue calculation.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain the relationship between price elasticity of demand and a firm\'s total revenue when it raises its price.',
        ...points([{ name: 'Reference to inelastic demand meaning total revenue rises when price rises', marks: 1 }, { name: 'Reference to elastic demand meaning total revenue falls when price rises', marks: 1 }]),
        answerStructureAdvice: 'Both cases (elastic and inelastic) need stating - one alone only earns half the marks.' },
      { markTariff: 8, requiresDiagram: true,
        questionText: 'Examine how a firm might use knowledge of price elasticity of demand to set a revenue-maximising price.',
        ...points([{ name: 'Knowledge of PED and total revenue', marks: 2 }, { name: 'Application to a real or plausible firm/product', marks: 2 }, { name: 'Analysis - a chain of reasoning to the revenue-maximising price (where PED=1)', marks: 2 }, { name: 'Evaluation - weighing how easy it is for a firm to know its true PED in practice', marks: 2 }]),
        answerStructureAdvice: 'State the theoretical rule (revenue is maximised where PED=1, i.e. unit elastic) then evaluate the practical difficulty of measuring PED precisely.' },
      { markTariff: 10, requiresDiagram: true,
        questionText: 'Assess the factors that determine whether a cut in price will increase a firm\'s total revenue.',
        ...levels([
          { level: 1, marks: '1-3', descriptor: 'Isolated, undeveloped knowledge of PED and revenue.' },
          { level: 2, marks: '4-7', descriptor: 'Developed, applied points on PED with some analysis and a simple assessment.' },
          { level: 3, marks: '8-10', descriptor: 'Sustained, well-applied analysis of PED alongside a genuine second factor (e.g. competitor reactions, brand loyalty) with a substantiated judgement.' },
        ]),
        answerStructureAdvice: 'PED is the headline factor, but a top answer adds a second, genuine factor (how rivals might respond to the price cut) to properly "assess" rather than just describe.' },
    ],
  },
  {
    subtopic: T33, concept: 'Costs',
    questions: [
      { markTariff: 1, requiresDiagram: true,
        questionText: 'A fixed cost is a cost that:\nA. Varies directly with output\nB. Does not change with the level of output in the short run\nC. Only occurs in the long run\nD. Falls to zero when output is zero',
        ...mc(['A','B','C','D'], 1, 'Fixed costs (e.g. rent) must be paid regardless of how much is produced in the short run - they don\'t vary with output, unlike variable costs.'),
        answerStructureAdvice: 'Fixed = unchanged by output level in the SHORT RUN specifically (in the long run, all costs become variable).' },
      { markTariff: 4, requiresDiagram: true,
        questionText: 'Using an example, explain why average total cost is often U-shaped in the short run.',
        ...points([{ name: 'Knowledge of average fixed cost falling as output rises', marks: 1 }, { name: 'Knowledge of the law of diminishing marginal returns eventually raising average variable cost', marks: 1 }, { name: 'Application/analysis - combining both to explain the U-shape', marks: 2 }]),
        answerStructureAdvice: 'A full answer needs BOTH forces: falling average fixed cost initially, then rising average variable cost from diminishing returns later.' },
      { markTariff: 8, requiresDiagram: true,
        questionText: 'Examine the law of diminishing marginal returns and its effect on a firm\'s short-run costs.',
        ...points([{ name: 'Knowledge of the law of diminishing marginal returns', marks: 2 }, { name: 'Application to a real or plausible production process', marks: 2 }, { name: 'Analysis - a chain of reasoning from falling marginal product to rising marginal cost', marks: 2 }, { name: 'Evaluation - weighing when/whether this law actually applies in practice', marks: 2 }]),
        answerStructureAdvice: 'Trace the full chain: adding more of a variable factor to a fixed factor → marginal product eventually falls → marginal cost eventually rises.' },
      { markTariff: 12, requiresDiagram: true,
        questionText: 'Discuss the extent to which economies of scale allow large firms to always have lower costs than small firms.',
        ...levels([
          { level: 1, marks: '1-4', descriptor: 'Basic description of economies of scale with little real discussion of limits.' },
          { level: 2, marks: '5-8', descriptor: 'Developed points on economies of scale with some evaluation.' },
          { level: 3, marks: '9-12', descriptor: 'Sustained, well-developed discussion weighing economies of scale against diseconomies of scale/the minimum efficient scale, with a clear judgement on the word "always".' },
        ]),
        answerStructureAdvice: 'Directly challenge "always" using diseconomies of scale (e.g. poor communication in very large firms) as the counter-argument.' },
    ],
  },
  {
    subtopic: T33, concept: 'Economies and diseconomies of scale',
    questions: [
      { markTariff: 1, requiresDiagram: true,
        questionText: 'Purchasing (bulk-buying) economies of scale arise because a large firm can:\nA. Borrow money more cheaply than a small firm\nB. Negotiate lower prices per unit from suppliers when buying in large quantities\nC. Avoid paying corporation tax\nD. Advertise more effectively than a small firm',
        ...mc(['A','B','C','D'], 1, 'Purchasing economies come specifically from bulk-buying discounts negotiated with suppliers - a distinct type of internal economy of scale from financial or marketing economies.'),
        answerStructureAdvice: 'Learn the NAMED types of internal economies (purchasing, technical, financial, managerial, marketing, risk-bearing) so you can identify which is being described.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by a \'diseconomy of scale\'.',
        ...points([{ name: 'Reference to average (long-run) cost per unit rising as output increases', marks: 1 }, { name: 'Reference to this occurring beyond a certain (too-large) scale of production', marks: 1 }]),
        answerStructureAdvice: 'Both parts needed: WHAT happens to average cost, and WHEN (beyond a certain scale).' },
      { markTariff: 8, requiresDiagram: true,
        questionText: 'Examine the internal economies of scale a large manufacturing firm might benefit from.',
        ...points([{ name: 'Knowledge of a named type of internal economy of scale', marks: 2 }, { name: 'Application to a real or plausible manufacturing firm', marks: 2 }, { name: 'Analysis - a chain of reasoning from the economy to a lower long-run average cost', marks: 2 }, { name: 'Evaluation - weighing how significant this economy is compared to others', marks: 2 }]),
        answerStructureAdvice: 'Develop ONE named economy of scale (e.g. technical economies from specialised machinery) into a full chain to lower LRAC.' },
      { markTariff: 25, requiresDiagram: true,
        questionText: 'Evaluate the view that growing larger always benefits a firm through economies of scale.',
        ...levels([
          { level: 1, marks: '1-6', descriptor: 'Generic knowledge of economies of scale with little application.' },
          { level: 2, marks: '7-12', descriptor: 'Developed application to at least one economy of scale with some analysis.' },
          { level: 3, marks: '13-18', descriptor: 'Sustained analysis of both economies and diseconomies of scale with clear chains of reasoning.' },
          { level: 4, marks: '19-25', descriptor: 'Consistently well-developed, applied analysis of the minimum efficient scale and the risk of diseconomies of scale beyond it, with a fully justified conclusion directly challenging the word "always".' },
        ]),
        answerStructureAdvice: 'A top answer explicitly introduces the minimum efficient scale and diseconomies of scale to reject "always", rather than only describing the benefits of size.' },
    ],
  },
  {
    subtopic: T33, concept: 'Normal profit, supernormal profit and losses',
    questions: [
      { markTariff: 1, requiresDiagram: true,
        questionText: 'Normal profit occurs where:\nA. Total revenue exceeds total cost (including opportunity cost)\nB. Total revenue equals total cost (including the opportunity cost of capital)\nC. Total revenue is below total variable cost\nD. A firm is making a loss',
        ...mc(['A','B','C','D'], 1, 'Normal profit is earned when total revenue just covers total cost, INCLUDING the opportunity cost of the entrepreneur\'s capital/time - just enough to keep them in the industry.'),
        answerStructureAdvice: 'Normal profit is an economic COST, not a bonus - it\'s the minimum needed to keep a firm in the industry.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by \'supernormal profit\'.',
        ...points([{ name: 'Reference to profit above normal profit', marks: 1 }, { name: 'Reference to total revenue exceeding total cost (including the opportunity cost of capital)', marks: 1 }]),
        answerStructureAdvice: 'Define it relative to normal profit specifically, not just as "high profit".' },
      { markTariff: 8, requiresDiagram: true,
        questionText: 'Examine why a firm might continue to produce in the short run even while making a loss.',
        ...points([{ name: 'Knowledge of the shutdown point (price covering average variable cost)', marks: 2 }, { name: 'Application to a real or plausible firm', marks: 2 }, { name: 'Analysis - a chain of reasoning showing it is still covering variable costs and contributing to fixed costs', marks: 2 }, { name: 'Evaluation - weighing how long a firm could sustain this in practice', marks: 2 }]),
        answerStructureAdvice: 'The key rule: a firm stays open in the short run as long as price covers average VARIABLE cost, even if it doesn\'t cover fixed cost too.' },
      { markTariff: 12, requiresDiagram: true,
        questionText: 'Discuss the extent to which supernormal profit is likely to persist in the long run.',
        ...levels([
          { level: 1, marks: '1-4', descriptor: 'Basic description of supernormal profit with little real discussion of persistence.' },
          { level: 2, marks: '5-8', descriptor: 'Developed points on entry of new firms competing away profit with some evaluation.' },
          { level: 3, marks: '9-12', descriptor: 'Sustained, well-developed discussion contrasting markets with low barriers to entry (profit competed away) against those with high barriers (profit can persist), with a clear judgement.' },
        ]),
        answerStructureAdvice: 'The market structure (barriers to entry) is the key variable - contrast a contestable market (profit erodes) against one with high barriers (profit can persist) explicitly.' },
    ],
  },
  // ───────────────────────── 3.4 Market structures ─────────────────────────
  {
    subtopic: T34, concept: 'Efficiency',
    questions: [
      { markTariff: 1, requiresDiagram: true,
        questionText: 'Productive efficiency occurs where a firm produces at:\nA. The profit-maximising output (MC=MR)\nB. The minimum point of its average total cost curve\nC. The output where price equals marginal cost\nD. Zero output',
        ...mc(['A','B','C','D'], 2, 'Productive efficiency means producing at the lowest possible average total cost - using resources with no waste. Allocative efficiency (P=MC) and profit-maximisation (MC=MR) are different, related concepts.'),
        answerStructureAdvice: 'Keep the different efficiency concepts separate: productive (min ATC), allocative (P=MC), dynamic (long-run innovation).' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by \'allocative efficiency\'.',
        ...points([{ name: 'Reference to price equalling marginal cost (P=MC)', marks: 1 }, { name: 'Reference to resources being allocated according to consumer wants/maximising social welfare', marks: 1 }]),
        answerStructureAdvice: 'State the condition (P=MC) AND what it means in plain terms (resources matching what consumers actually want).' },
      { markTariff: 8, requiresDiagram: true,
        questionText: 'Examine why perfectly competitive markets are considered both productively and allocatively efficient in the long run.',
        ...points([{ name: 'Knowledge of productive and allocative efficiency conditions', marks: 2 }, { name: 'Application to the perfectly competitive model', marks: 2 }, { name: 'Analysis - a chain of reasoning from free entry/exit to normal profit at the minimum ATC, where P=MC', marks: 2 }, { name: 'Evaluation - weighing how realistic this model is in practice', marks: 2 }]),
        answerStructureAdvice: 'Trace the mechanism: free entry competes away supernormal profit → firms settle at minimum ATC (productive efficiency) where P=MC (allocative efficiency).' },
      { markTariff: 15, requiresDiagram: true,
        questionText: 'Discuss the extent to which dynamic efficiency is more important than static (productive and allocative) efficiency for consumers in the long run.',
        ...levels([
          { level: 1, marks: '1-5', descriptor: 'Basic, undeveloped description of efficiency types with little real comparison.' },
          { level: 2, marks: '6-10', descriptor: 'Developed knowledge and application of dynamic efficiency with some analysis and a simple judgement.' },
          { level: 3, marks: '11-15', descriptor: 'Sustained chains of reasoning comparing dynamic efficiency (innovation, new products) against static efficiency (low prices, no waste now), leading to a balanced, well-supported judgement.' },
        ]),
        answerStructureAdvice: 'Use a real trade-off: a monopolist may be statically inefficient but use supernormal profit to fund innovation (dynamic efficiency) - weigh short-run against long-run consumer benefit.' },
    ],
  },
  {
    subtopic: T34, concept: 'Perfect competition',
    questions: [
      { markTariff: 1, requiresDiagram: true,
        questionText: 'In perfect competition, an individual firm is a \'price taker\' because:\nA. It sets its own price above the market price\nB. It is too small to influence the market price and faces a perfectly elastic demand curve\nC. The government sets the price by law\nD. It has significant market power',
        ...mc(['A','B','C','D'], 1, 'With many small firms selling an identical product, no single firm can influence the market price - each faces a perfectly (horizontally) elastic demand curve at the ruling market price.'),
        answerStructureAdvice: 'Price taker = faces a horizontal (perfectly elastic) demand curve at the market price, due to being one of many small firms.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'State two assumptions of the perfectly competitive market structure.',
        ...points([{ name: 'Naming any two of: many buyers and sellers, homogeneous product, free entry and exit, perfect information', marks: 2 }]),
        answerStructureAdvice: 'One mark per correctly named assumption - no explanation needed.' },
      { markTariff: 8, requiresDiagram: true,
        questionText: 'Examine why supernormal profit cannot persist in the long run under perfect competition.',
        ...points([{ name: 'Knowledge of free entry and exit', marks: 2 }, { name: 'Application to the perfectly competitive model', marks: 2 }, { name: 'Analysis - a chain of reasoning from new entrants to increased supply and falling price/profit', marks: 2 }, { name: 'Evaluation - weighing how quickly this process would happen in reality', marks: 2 }]),
        answerStructureAdvice: 'Trace the full chain: supernormal profit attracts new entrants → market supply rises → price falls → profit returns to normal.' },
      { markTariff: 12, requiresDiagram: true,
        questionText: 'Discuss the extent to which perfect competition is a realistic model of how real markets actually work.',
        ...levels([
          { level: 1, marks: '1-4', descriptor: 'Basic description of the model\'s assumptions with little real discussion of realism.' },
          { level: 2, marks: '5-8', descriptor: 'Developed points on unrealistic assumptions with some evaluation.' },
          { level: 3, marks: '9-12', descriptor: 'Sustained, well-developed discussion of the model\'s value as a benchmark despite unrealistic assumptions (homogeneous products, perfect information), with a clear judgement.' },
        ]),
        answerStructureAdvice: 'Name the assumptions that are unrealistic (perfect information, homogeneous products) but argue the model is still USEFUL as a theoretical benchmark to compare real markets against.' },
    ],
  },
  {
    subtopic: T34, concept: 'Monopolistic competition',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'A key feature that distinguishes monopolistic competition from perfect competition is:\nA. A very large number of firms\nB. Product differentiation, giving each firm some price-setting power\nC. A single seller controlling the whole market\nD. No barriers to entry',
        ...mc(['A','B','C','D'], 1, 'In monopolistic competition, firms sell differentiated (not identical) products, giving each some limited price-setting power - unlike perfect competition\'s homogeneous product.'),
        answerStructureAdvice: 'The differentiated product (branding, quality, features) is THE key distinguishing feature from perfect competition.' },
      { markTariff: 4, requiresDiagram: true,
        questionText: 'Using a diagram, explain why a monopolistically competitive firm earns only normal profit in the long run.',
        ...points([{ name: 'Knowledge of free entry and exit', marks: 1 }, { name: 'Application - describing the demand curve shifting left as new firms enter', marks: 1 }, { name: 'Analysis - a chain of reasoning to the demand curve becoming tangent to average cost (normal profit)', marks: 2 }]),
        answerStructureAdvice: 'Even in words, describe the demand curve SHIFTING as new firms enter, ending where it just touches (is tangent to) the average cost curve.' },
      { markTariff: 8, requiresDiagram: true,
        questionText: 'Examine the role of non-price competition for firms operating under monopolistic competition.',
        ...points([{ name: 'Knowledge of non-price competition (e.g. branding, advertising, quality)', marks: 2 }, { name: 'Application to a real or plausible industry', marks: 2 }, { name: 'Analysis - a chain of reasoning from differentiation to reduced price competition/brand loyalty', marks: 2 }, { name: 'Evaluation - weighing how effective this is at sustaining profit', marks: 2 }]),
        answerStructureAdvice: 'Name a specific form of non-price competition (advertising, packaging, customer service) and follow through to its effect on demand/loyalty.' },
      { markTariff: 10, requiresDiagram: true,
        questionText: 'Assess whether monopolistic competition leads to a worse outcome for consumers than perfect competition.',
        ...levels([
          { level: 1, marks: '1-3', descriptor: 'Isolated, undeveloped knowledge of monopolistic competition.' },
          { level: 2, marks: '4-7', descriptor: 'Developed, applied points comparing the two structures with some analysis and a simple assessment.' },
          { level: 3, marks: '8-10', descriptor: 'Sustained, well-applied analysis weighing higher prices/excess capacity against the benefit of product variety/choice, with a substantiated judgement.' },
        ]),
        answerStructureAdvice: 'The genuine trade-off is: slightly higher prices and excess capacity, VERSUS the real benefit to consumers of product variety and choice.' },
    ],
  },
  {
    subtopic: T34, concept: 'Oligopoly',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'Interdependence between firms is a defining feature of which market structure?\nA. Perfect competition\nB. Oligopoly\nC. Monopolistic competition\nD. A market with a single, unregulated monopolist',
        ...mc(['A','B','C','D'], 1, 'In an oligopoly, a small number of large firms dominate the market, so each firm\'s decisions (on price, output, advertising) directly affect - and are affected by - its rivals\' likely reactions.'),
        answerStructureAdvice: 'Interdependence = firms must consider how RIVALS will react to their decisions - unique to oligopoly among the standard market structures.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by \'collusion\' between oligopolistic firms.',
        ...points([{ name: 'Reference to firms agreeing to cooperate rather than compete (e.g. on price or output)', marks: 1 }, { name: 'Reference to this reducing competition/raising joint profits', marks: 1 }]),
        answerStructureAdvice: 'State WHAT firms agree to do, and WHY it benefits them (higher joint profit at consumers\' expense).' },
      { markTariff: 8, requiresDiagram: true,
        questionText: 'Examine why price wars are relatively rare in oligopolistic markets, despite the potential for intense competition.',
        ...points([{ name: 'Knowledge of the kinked demand curve model (or tacit collusion)', marks: 2 }, { name: 'Application to a real or plausible oligopolistic industry', marks: 2 }, { name: 'Analysis - a chain of reasoning showing why cutting price is unattractive (rivals match cuts but not rises)', marks: 2 }, { name: 'Evaluation - weighing how well this theory explains real firm behaviour', marks: 2 }]),
        answerStructureAdvice: 'The kinked demand curve model is the classic explanation - rivals match price cuts (elastic demand loss if you don\'t cut) but ignore price rises (elastic demand loss if you do raise alone).' },
      { markTariff: 25, requiresDiagram: true,
        questionText: 'Evaluate the view that collusion between firms in an oligopoly always harms consumers.',
        ...levels([
          { level: 1, marks: '1-6', descriptor: 'Generic knowledge of collusion with little application.' },
          { level: 2, marks: '7-12', descriptor: 'Developed application to at least one form of collusion with some analysis.' },
          { level: 3, marks: '13-18', descriptor: 'Sustained analysis of both harms (higher prices, reduced choice) and any genuine benefits (e.g. joint R&D, price stability), with clear chains of reasoning.' },
          { level: 4, marks: '19-25', descriptor: 'Consistently well-developed, applied analysis distinguishing harmful cartel-type collusion from potentially beneficial cooperation, with a fully justified conclusion directly addressing "always".' },
        ]),
        answerStructureAdvice: 'Directly reject "always" - some legal, cooperative agreements (e.g. joint investment in R&D or infrastructure) can genuinely benefit consumers, unlike a price-fixing cartel.' },
    ],
  },
  {
    subtopic: T34, concept: 'Monopoly',
    questions: [
      { markTariff: 1, requiresDiagram: true,
        questionText: 'A profit-maximising monopolist will generally set:\nA. Price equal to marginal cost\nB. Price above marginal cost, restricting output below the competitive level\nC. Price below average variable cost\nD. Output at the allocatively efficient level',
        ...mc(['A','B','C','D'], 1, 'A monopolist restricts output below the competitive/allocatively efficient level and charges a price above marginal cost, exploiting its market power to maximise profit.'),
        answerStructureAdvice: 'Monopoly outcome: LOWER output and HIGHER price than the competitive (P=MC) benchmark - this is the source of the welfare loss.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'State two barriers to entry that might help a firm maintain a monopoly position.',
        ...points([{ name: 'Naming any two of: economies of scale, legal barriers/patents, control of a key resource, high sunk costs, brand loyalty', marks: 2 }]),
        answerStructureAdvice: 'One mark per correctly named barrier - no explanation needed.' },
      { markTariff: 8, requiresDiagram: true,
        questionText: 'Examine the welfare loss created by a firm operating as a monopoly rather than under perfect competition.',
        ...points([{ name: 'Knowledge of the monopoly restricting output and raising price', marks: 2 }, { name: 'Application to a real or plausible monopolised market', marks: 2 }, { name: 'Analysis - a chain of reasoning to the deadweight welfare loss', marks: 2 }, { name: 'Evaluation - weighing whether any efficiency gains (e.g. economies of scale) offset this loss', marks: 2 }]),
        answerStructureAdvice: 'A strong evaluation point is that a monopolist\'s economies of scale might partially offset the deadweight loss by lowering costs, even if price is still above marginal cost.' },
      { markTariff: 12, requiresDiagram: true,
        questionText: 'Discuss the extent to which a monopoly always acts against the interests of consumers.',
        ...levels([
          { level: 1, marks: '1-4', descriptor: 'Basic description of monopoly with little real discussion of possible benefits.' },
          { level: 2, marks: '5-8', descriptor: 'Developed points on harms and/or benefits with some evaluation.' },
          { level: 3, marks: '9-12', descriptor: 'Sustained, well-developed discussion weighing consumer harm (higher prices, restricted output) against potential benefits (economies of scale, funded innovation/dynamic efficiency), with a clear judgement on "always".' },
        ]),
        answerStructureAdvice: 'Directly challenge "always" using economies of scale or innovation funded by supernormal profit as genuine counter-examples.' },
    ],
  },
  {
    subtopic: T34, concept: 'Monopsony',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'A monopsony is a market structure characterised by:\nA. A single seller and many buyers\nB. A single (or dominant) buyer facing many sellers\nC. Many buyers and many sellers\nD. Perfect information for all participants',
        ...mc(['A','B','C','D'], 1, 'A monopsony is the "buyer-side" equivalent of a monopoly - one dominant buyer (e.g. a large supermarket buying from many small farmers, or a single major employer in a local labour market) facing many sellers.'),
        answerStructureAdvice: 'Monopoly = one dominant SELLER; monopsony = one dominant BUYER - easy to mix up under exam pressure.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by monopsony power in a labour market.',
        ...points([{ name: 'Reference to a single (or dominant) employer facing many workers/little competition for labour', marks: 1 }, { name: 'Reference to this giving the employer the power to set wages below the competitive level', marks: 1 }]),
        answerStructureAdvice: 'State WHO has the power (a dominant employer) and WHAT it lets them do (push wages below the competitive rate).' },
      { markTariff: 8, requiresDiagram: true,
        questionText: 'Examine the impact of monopsony power on the wages and employment of workers in a local labour market.',
        ...points([{ name: 'Knowledge of monopsony power', marks: 2 }, { name: 'Application to a real or plausible local labour market', marks: 2 }, { name: 'Analysis - a chain of reasoning to lower wages and lower employment than the competitive outcome', marks: 2 }, { name: 'Evaluation - weighing whether workers have any counterbalancing power (e.g. a trade union)', marks: 2 }]),
        answerStructureAdvice: 'A key evaluation point: a trade union acting as a "countervailing power" can potentially push wages back up towards (or above) the competitive level, even against a monopsony employer.' },
      { markTariff: 25, requiresDiagram: true,
        questionText: 'Evaluate the effectiveness of a national minimum wage in correcting the effects of monopsony power in a labour market.',
        ...levels([
          { level: 1, marks: '1-6', descriptor: 'Generic knowledge of monopsony and the minimum wage with little application.' },
          { level: 2, marks: '7-12', descriptor: 'Developed application with some analysis of the diagrammatic effect.' },
          { level: 3, marks: '13-18', descriptor: 'Sustained analysis showing how a correctly set minimum wage can raise both wages AND employment under monopsony, with clear chains of reasoning.' },
          { level: 4, marks: '19-25', descriptor: 'Consistently well-developed, applied analysis including the risk of setting the minimum wage too high (causing unemployment even under monopsony), with a fully justified, balanced conclusion.' },
        ]),
        answerStructureAdvice: 'This is a genuinely different result from the competitive labour market case - under monopsony, a minimum wage set at the RIGHT level can raise wages AND employment simultaneously; only setting it too high causes job losses.' },
    ],
  },
  {
    subtopic: T34, concept: 'Contestability',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'A perfectly contestable market is characterised by:\nA. High barriers to entry and exit\nB. No barriers to entry and exit (including zero sunk costs)\nC. A single dominant firm\nD. Government price controls',
        ...mc(['A','B','C','D'], 1, 'A perfectly contestable market has no barriers to entry OR exit - crucially, no sunk costs - so firms can enter freely if profit is available and leave without loss ("hit and run" entry).'),
        answerStructureAdvice: 'The absence of SUNK costs specifically (not just entry barriers generally) is what makes a market truly contestable.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by a \'sunk cost\'.',
        ...points([{ name: 'Reference to a cost that cannot be recovered once spent', marks: 1 }, { name: 'Reference to it being a barrier to exit (and therefore to entry, via contestability theory)', marks: 1 }]),
        answerStructureAdvice: 'Both facts matter: what makes a cost "sunk", and why that discourages entry in the first place.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Examine how the threat of \'hit and run\' entry might affect the behaviour of an existing firm in a contestable market.',
        ...points([{ name: 'Knowledge of hit-and-run entry', marks: 2 }, { name: 'Application to a real or plausible contestable industry', marks: 2 }, { name: 'Analysis - a chain of reasoning from the threat of entry to the incumbent limiting price/profit', marks: 2 }, { name: 'Evaluation - weighing how contestable real markets actually are', marks: 2 }]),
        answerStructureAdvice: 'The key insight: even a monopolist may behave AS IF competitive if the market is contestable, because supernormal profit would attract instant entry.' },
      { markTariff: 12, requiresDiagram: false,
        questionText: 'Discuss the extent to which increasing the contestability of a market benefits consumers.',
        ...levels([
          { level: 1, marks: '1-4', descriptor: 'Basic description of contestability with little real discussion of consumer impact.' },
          { level: 2, marks: '5-8', descriptor: 'Developed points on consumer benefits with some evaluation.' },
          { level: 3, marks: '9-12', descriptor: 'Sustained, well-developed discussion of lower prices/improved efficiency from contestability, weighed against genuine limits (few markets have truly zero sunk costs), with a clear judgement.' },
        ]),
        answerStructureAdvice: 'Acknowledge that few real markets are PERFECTLY contestable - the theory\'s benefits depend on how close to zero sunk costs actually are.' },
    ],
  },
  // ───────────────────────── 3.5 Labour market ─────────────────────────
  {
    subtopic: T35, concept: 'Demand for labour',
    questions: [
      { markTariff: 1, requiresDiagram: true,
        questionText: 'The demand for labour is described as a \'derived demand\' because:\nA. It is set directly by the government\nB. It depends on the demand for the goods/services labour is used to produce\nC. It never changes over time\nD. It is unaffected by wages',
        ...mc(['A','B','C','D'], 2, 'Labour isn\'t wanted for its own sake - firms demand it because of the demand for the final goods/services it helps produce, so labour demand is "derived" from that final product demand.'),
        answerStructureAdvice: 'Derived demand = demand for labour comes FROM demand for the product it helps make - a core, often-tested idea.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by the \'marginal revenue product\' (MRP) of labour.',
        ...points([{ name: 'Reference to the extra revenue generated by employing one more unit of labour', marks: 1 }, { name: 'Reference to it being calculated as marginal physical product × marginal revenue', marks: 1 }]),
        answerStructureAdvice: 'State both the plain-English meaning AND the formula (MPP × MR) for full marks.' },
      { markTariff: 8, requiresDiagram: true,
        questionText: 'Examine the factors that might cause a firm\'s demand for labour to increase.',
        ...points([{ name: 'Knowledge of a determinant of labour demand (e.g. rising demand for the final product, higher labour productivity)', marks: 2 }, { name: 'Application to a real or plausible firm/industry', marks: 2 }, { name: 'Analysis - a chain of reasoning from the determinant to a rightward shift in labour demand', marks: 2 }, { name: 'Evaluation - weighing how significant this factor is relative to others', marks: 2 }]),
        answerStructureAdvice: 'Develop ONE determinant (e.g. rising demand for the firm\'s product, via derived demand) fully into a chain reaching a shift in labour demand.' },
      { markTariff: 10, requiresDiagram: true,
        questionText: 'Assess the view that rising automation will reduce the demand for labour in most industries.',
        ...levels([
          { level: 1, marks: '1-3', descriptor: 'Isolated, undeveloped knowledge of automation and labour demand.' },
          { level: 2, marks: '4-7', descriptor: 'Developed, applied points on automation reducing demand for some labour, with some analysis and a simple assessment.' },
          { level: 3, marks: '8-10', descriptor: 'Sustained, well-applied analysis distinguishing labour substituted by automation from labour complementary to it (whose demand may rise), with a substantiated judgement.' },
        ]),
        answerStructureAdvice: 'A top answer separates SUBSTITUTE labour (replaced by machines, demand falls) from COMPLEMENTARY labour (works alongside new technology, demand may rise) rather than treating "labour" as one uniform group.' },
    ],
  },
  {
    subtopic: T35, concept: 'Supply of labour',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'An increase in the supply of labour to a particular occupation could be caused by:\nA. A fall in the wage rate paid in that occupation\nB. An increase in the qualifications required to enter that occupation\nC. A relaxation of immigration rules allowing more qualified workers to enter the country\nD. A fall in the demand for the good the occupation helps produce',
        ...mc(['A','B','C','D'], 2, 'Relaxed immigration rules directly increase the pool of workers available for an occupation - a genuine rightward shift in labour supply. A lower wage would cause a movement ALONG the supply curve, not a shift.'),
        answerStructureAdvice: 'Keep a SHIFT of the labour supply curve (e.g. immigration, training) separate from a MOVEMENT along it (caused by the wage itself).' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'Using an example, explain how occupational immobility of labour can limit the supply of labour to a particular industry.',
        ...points([{ name: 'Knowledge of occupational immobility (workers lacking the skills/qualifications to switch industries)', marks: 1 }, { name: 'Application to a real or plausible industry', marks: 1 }, { name: 'Analysis - a chain of reasoning to a restricted/inelastic labour supply for that industry', marks: 2 }]),
        answerStructureAdvice: 'Follow through to the CONSEQUENCE for labour supply (it stays low/inelastic even if wages rise) not just the cause of the immobility.' },
      { markTariff: 8, requiresDiagram: true,
        questionText: 'Examine the factors that determine the wage elasticity of supply of labour to a particular occupation.',
        ...points([{ name: 'Knowledge of a determinant (e.g. length/cost of training, qualifications required)', marks: 2 }, { name: 'Application to a real or plausible occupation', marks: 2 }, { name: 'Analysis - a chain of reasoning from the determinant to a more/less elastic supply', marks: 2 }, { name: 'Evaluation - weighing how this compares across different occupations', marks: 2 }]),
        answerStructureAdvice: 'Compare a low-skill occupation (many substitutes, elastic supply) against a highly specialised one (long training, inelastic supply) to earn genuine evaluation credit.' },
      { markTariff: 12, requiresDiagram: true,
        questionText: 'Discuss the extent to which government policy can effectively increase the supply of labour to occupations facing skills shortages.',
        ...levels([
          { level: 1, marks: '1-4', descriptor: 'Basic description of skills shortages with little real discussion of policy.' },
          { level: 2, marks: '5-8', descriptor: 'Developed points on at least one policy (e.g. subsidised training) with some evaluation.' },
          { level: 3, marks: '9-12', descriptor: 'Sustained, well-developed discussion of more than one policy (training subsidies, immigration policy) with a clear judgement on time lags and effectiveness.' },
        ]),
        answerStructureAdvice: 'Bring in the TIME LAG problem explicitly - training new workers for a skills shortage can take years, unlike relaxing immigration rules, which acts faster.' },
    ],
  },
  {
    subtopic: T35, concept: 'Wage determination in competitive labour markets',
    questions: [
      { markTariff: 1, requiresDiagram: true,
        questionText: 'In a perfectly competitive labour market, the equilibrium wage is determined where:\nA. The firm\'s marginal revenue product of labour curve is at its maximum\nB. The market demand for labour equals the market supply of labour\nC. The government sets a legal minimum wage\nD. A trade union negotiates a fixed wage',
        ...mc(['A','B','C','D'], 1, 'Just like a competitive goods market, the equilibrium wage in a competitive labour market is set where market demand for labour equals market supply of labour.'),
        answerStructureAdvice: 'Labour market equilibrium works exactly like a goods market: demand meets supply, just with wage instead of price on the axis.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain why a firm in a perfectly competitive labour market is a \'wage taker\'.',
        ...points([{ name: 'Reference to the firm being too small to influence the market wage', marks: 1 }, { name: 'Reference to it facing a perfectly (horizontally) elastic supply of labour at the market wage', marks: 1 }]),
        answerStructureAdvice: 'Mirror the "price taker" logic from perfect competition in the goods market, applied to wages instead.' },
      { markTariff: 8, requiresDiagram: true,
        questionText: 'Examine why doctors are typically paid a higher wage than cleaners in a competitive labour market.',
        ...points([{ name: 'Knowledge of demand and supply of labour', marks: 2 }, { name: 'Application - relating high MRP/skill requirements for doctors, low barriers for cleaners', marks: 2 }, { name: 'Analysis - a chain of reasoning from high demand/low supply (doctors) versus low demand/high supply (cleaners) to the wage gap', marks: 2 }, { name: 'Evaluation - weighing whether this fully explains the wage difference (e.g. non-competitive factors)', marks: 2 }]),
        answerStructureAdvice: 'Use BOTH sides of the market for each occupation - high MRP and restricted supply (training/qualifications) for doctors; low MRP and abundant supply for cleaners.' },
      { markTariff: 25, requiresDiagram: true,
        questionText: 'Evaluate the extent to which demand and supply analysis fully explains differences in wages between occupations.',
        ...levels([
          { level: 1, marks: '1-6', descriptor: 'Generic knowledge of demand and supply of labour with little application.' },
          { level: 2, marks: '7-12', descriptor: 'Developed application to at least one occupational comparison with some analysis.' },
          { level: 3, marks: '13-18', descriptor: 'Sustained analysis of demand/supply factors alongside at least one non-competitive factor (e.g. trade unions, monopsony, discrimination), with clear chains of reasoning.' },
          { level: 4, marks: '19-25', descriptor: 'Consistently well-developed, applied analysis across multiple genuine factors (competitive AND non-competitive) with a fully justified, balanced conclusion on how complete demand-supply analysis really is.' },
        ]),
        answerStructureAdvice: 'A top answer moves beyond demand/supply to non-competitive factors (trade union bargaining power, monopsony employers, discrimination) to properly evaluate how COMPLETE the basic model is.' },
    ],
  },
  {
    subtopic: T35, concept: 'Wage determination in non-competitive labour markets',
    questions: [
      { markTariff: 1, requiresDiagram: true,
        questionText: 'A trade union operating in an otherwise competitive labour market is most likely to cause:\nA. A fall in both the wage rate and the level of employment\nB. A rise in the wage rate, potentially at the cost of some employment\nC. No change to either wages or employment\nD. A fall in the wage rate but a rise in employment',
        ...mc(['A','B','C','D'], 2, 'A trade union bargaining above the competitive wage typically raises the wage rate, but - in an otherwise competitive market - this can come at the cost of reduced employment, since firms demand less labour at a higher wage.'),
        answerStructureAdvice: 'The standard union effect: HIGHER wage, but a RISK of lower employment, in an otherwise competitive market.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by \'bilateral monopoly\' in a labour market.',
        ...points([{ name: 'Reference to a single dominant employer (monopsonist) facing a single trade union', marks: 1 }, { name: 'Reference to the eventual wage depending on relative bargaining power/negotiation between the two', marks: 1 }]),
        answerStructureAdvice: 'State WHO the two powerful parties are, and that the OUTCOME is genuinely uncertain, depending on bargaining strength.' },
      { markTariff: 8, requiresDiagram: true,
        questionText: 'Examine the impact of a trade union successfully negotiating a higher wage in a monopsonistic labour market.',
        ...points([{ name: 'Knowledge of monopsony power and trade unions', marks: 2 }, { name: 'Application to a real or plausible monopsonistic labour market', marks: 2 }, { name: 'Analysis - a chain of reasoning showing wages AND employment can both rise (up to the competitive level)', marks: 2 }, { name: 'Evaluation - weighing what happens if the union pushes the wage too far above this point', marks: 2 }]),
        answerStructureAdvice: 'This mirrors the minimum-wage-under-monopsony case: up to a point, both wages and employment can rise together, but pushing the wage further can eventually reduce employment.' },
      { markTariff: 12, requiresDiagram: true,
        questionText: 'Discuss the extent to which trade unions reduce the level of employment in the UK economy.',
        ...levels([
          { level: 1, marks: '1-4', descriptor: 'Basic description of trade union effects with little real discussion of context.' },
          { level: 2, marks: '5-8', descriptor: 'Developed points on the competitive-market case (falling employment) with some evaluation.' },
          { level: 3, marks: '9-12', descriptor: 'Sustained, well-developed discussion contrasting the competitive-market outcome (employment likely falls) with the monopsony case (employment can rise), with a clear judgement.' },
        ]),
        answerStructureAdvice: 'The market structure matters enormously here - genuinely different outcomes in a competitive market versus a monopsony market are the heart of a strong discussion.' },
    ],
  },
  // ───────────────────────── 3.6 Government intervention in business/labour markets ─────────────────────────
  {
    subtopic: T36, concept: 'Intervention to promote competition and protect consumers/suppliers',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'A regulatory body that investigates and can block a proposed merger on competition grounds in the UK is:\nA. The Bank of England\nB. HM Treasury\nC. The Competition and Markets Authority (CMA)\nD. Ofgem alone',
        ...mc(['A','B','C','D'], 2, 'The Competition and Markets Authority (CMA) is the UK\'s main competition regulator, responsible for investigating mergers and anti-competitive behaviour and can block deals that would substantially reduce competition.'),
        answerStructureAdvice: 'Know the CMA by name as the main UK competition authority - a common, simple fact question.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by \'price capping\' as a method of regulating a monopoly.',
        ...points([{ name: 'Reference to a regulator setting a maximum price (or price formula) a firm can charge', marks: 1 }, { name: 'Reference to the aim being to prevent the firm exploiting monopoly power/protect consumers', marks: 1 }]),
        answerStructureAdvice: 'State WHAT the regulator does (sets a maximum price/formula) and WHY (to stop monopoly exploitation).' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Examine the methods a government might use to regulate a natural monopoly, such as a water company.',
        ...points([{ name: 'Knowledge of a named regulatory method (e.g. price capping, profit regulation, quality standards)', marks: 2 }, { name: 'Application to a real or plausible natural monopoly (e.g. water)', marks: 2 }, { name: 'Analysis - a chain of reasoning from the method to protecting consumers', marks: 2 }, { name: 'Evaluation - weighing any drawback (e.g. reduced incentive to cut costs/invest)', marks: 2 }]),
        answerStructureAdvice: 'Develop ONE method (e.g. RPI-X price capping) in depth, and use regulatory capture or reduced investment incentives as your evaluation.' },
      { markTariff: 15, requiresDiagram: false,
        questionText: 'Discuss the extent to which competition policy is effective at protecting consumers from the abuse of monopoly power.',
        ...levels([
          { level: 1, marks: '1-5', descriptor: 'Basic, undeveloped points on competition policy with little discussion of limits.' },
          { level: 2, marks: '6-10', descriptor: 'Developed knowledge and application of at least one policy with some analysis and a simple judgement.' },
          { level: 3, marks: '11-15', descriptor: 'Sustained chains of reasoning across more than one policy (merger control, price regulation), leading to a balanced, well-supported judgement including genuine limits like regulatory capture or information asymmetry between regulator and firm.' },
        ]),
        answerStructureAdvice: 'Cover more than one policy tool and weigh a genuine limitation (regulatory capture, or the regulator knowing less about true costs than the firm) to reach real depth.' },
    ],
  },
  {
    subtopic: T36, concept: 'The impact of government intervention',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: '\'Regulatory capture\' occurs when:\nA. A regulator successfully forces a firm to lower its prices\nB. A regulator starts acting in the interests of the industry it regulates, rather than consumers\nC. A firm is nationalised by the government\nD. Two regulators merge into one',
        ...mc(['A','B','C','D'], 2, 'Regulatory capture describes a regulator gradually coming to serve the interests of the firms/industry it oversees rather than the public it was set up to protect - a key criticism of regulation.'),
        answerStructureAdvice: 'Regulatory capture is about WHO the regulator ends up serving - the industry, not consumers.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'Using an example, explain one unintended consequence of government intervention in a labour market.',
        ...points([{ name: 'Knowledge of a named intervention (e.g. minimum wage, employment protection legislation)', marks: 1 }, { name: 'Application to a real or plausible scenario', marks: 1 }, { name: 'Analysis - a chain of reasoning to an unintended consequence (e.g. reduced hiring, informal employment)', marks: 2 }]),
        answerStructureAdvice: 'Follow through to the SPECIFIC unintended effect (e.g. firms cutting hours instead of headcount) rather than stopping at the policy itself.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Examine the concept of government failure in the context of regulating business and labour markets.',
        ...points([{ name: 'Knowledge of government failure (e.g. regulatory capture, administrative cost, unintended consequences)', marks: 2 }, { name: 'Application to a real or plausible regulatory scenario', marks: 2 }, { name: 'Analysis - a chain of reasoning from the cause to a net welfare loss', marks: 2 }, { name: 'Evaluation - weighing how likely this risk is in practice', marks: 2 }]),
        answerStructureAdvice: 'This links back to the general 1.4 government failure concept - apply it specifically to a business or labour market regulation example.' },
      { markTariff: 25, requiresDiagram: false,
        questionText: 'Evaluate the view that government intervention in business and labour markets always improves economic welfare.',
        ...levels([
          { level: 1, marks: '1-6', descriptor: 'Generic knowledge of intervention with little application.' },
          { level: 2, marks: '7-12', descriptor: 'Developed application to at least one intervention with some analysis.' },
          { level: 3, marks: '13-18', descriptor: 'Sustained analysis of both successful intervention and genuine government failure, with clear chains of reasoning.' },
          { level: 4, marks: '19-25', descriptor: 'Consistently well-developed, applied analysis across multiple examples of both success and failure, with a fully justified conclusion directly rejecting or qualifying the word "always".' },
        ]),
        answerStructureAdvice: 'Directly reject "always" with at least one genuine example of government failure (e.g. a poorly designed regulation with unintended consequences) alongside a genuine success.' },
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

  console.log(`Inserting ${rows.length} practice questions (Theme 3) across ${byConcept.size} concepts...`);
  const { error } = await supabase.from('practice_questions').insert(rows);
  if (error) { console.error('Insert failed:', JSON.stringify(error)); process.exit(1); }
  console.log('Done.');
}

main();
