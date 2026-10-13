require('dotenv/config');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SUBJECT = 'Economics';
const QUALIFICATION = 'A-Level';
const EXAM_BOARD = 'AQA';

function clean(s) { return (s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_'); }
function conceptId(subtopic, concept) { return `${clean(SUBJECT)}:${clean(subtopic)}:${clean(concept)}`; }

// Original content written for LastMind - no question copied from any
// real AQA past paper. Mark scheme structure matches the REAL, researched
// AQA convention (see batchA.js header for full detail): holistic
// blended levels (no named AO splits), 9/15-mark "explain" questions
// need no evaluation, only 25-mark essays are evaluation-led.

const mc = (options, correctIndex, explanation) => ({ markSchemeType: 'multiple_choice', markSchemeJson: { options, correctIndex, explanation } });
const points = (criteria) => ({ markSchemeType: 'points', markSchemeJson: { criteria } });
const levels = (levelsArr) => ({ markSchemeType: 'levels', markSchemeJson: { levels: levelsArr } });
const band4 = (t4, t3, t2, t1) => levels([
  { level: 4, marks: '4', descriptor: t4 },
  { level: 3, marks: '3', descriptor: t3 },
  { level: 2, marks: '2', descriptor: t2 },
  { level: 1, marks: '1', descriptor: t1 },
]);

const T415 = '4.1.5 Perfect competition, imperfectly competitive markets and monopoly';
const T416 = '4.1.6 The labour market';
const T417 = '4.1.7 The distribution of income and wealth: poverty and inequality';
const T418 = '4.1.8 The market mechanism, market failure and government intervention';

const QUESTIONS = [
  // ───────────────────────── 4.1.5 Perfect competition, imperfectly competitive markets and monopoly ─────────────────────────
  {
    subtopic: T415, concept: 'Market structures and the objectives of firms',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'Which market structure is characterised by a very large number of small firms selling an identical product, with no single firm able to influence the market price?\nA. Monopoly\nB. Oligopoly\nC. Perfect competition\nD. Monopolistic competition',
        ...mc(['A','B','C','D'], 2, 'Perfect competition assumes many small firms, a homogeneous product, and free entry/exit - no single firm is large enough to affect the market price.'),
        answerStructureAdvice: 'Learn the spectrum of market structures from perfect competition to monopoly by their key defining features.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'State two objectives a firm might pursue other than profit maximisation.',
        ...points([{ name: 'Correctly named alternative objective (e.g. sales/revenue maximisation, satisficing, growth)', marks: 1 }, { name: 'A second, different correctly named alternative objective', marks: 1 }]),
        answerStructureAdvice: 'One mark per genuine, named alternative objective.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'A manager is paid a bonus based on the firm\'s total sales revenue rather than its profit. Explain why this manager might pursue revenue maximisation rather than profit maximisation.',
        ...band4(
          'Clearly identifies the principal-agent problem/misaligned incentives and precisely explains why the manager\'s personal reward structure favours revenue over profit.',
          'Identifies the link between the bonus structure and revenue maximisation with a reasonably clear explanation.',
          'Makes a limited or unclear attempt to link the scenario to an alternative objective.',
          'Makes only a very vague reference to the manager or objectives with little real explanation.'
        ),
        answerStructureAdvice: 'Name the principal-agent problem (or the specific incentive misalignment) and link it directly to the manager\'s own behaviour.' },
      { markTariff: 9, requiresDiagram: false,
        questionText: 'Explain why the objectives of a firm\'s managers might differ from the objectives of its shareholders.',
        ...levels([
          { level: 3, marks: '7-9', descriptor: 'Well organised, develops the issue (e.g. the divorce of ownership from control) with sound knowledge, good application, and a clear, well-focused chain of reasoning.' },
          { level: 2, marks: '4-6', descriptor: 'Reasonable knowledge and application, but the analysis may not be fully developed or becomes confused in places.' },
          { level: 1, marks: '1-3', descriptor: 'Limited knowledge and very limited application, with analysis that lacks focus.' },
        ]),
        answerStructureAdvice: 'The divorce of ownership from control is the key concept - managers control day-to-day decisions but shareholders own the firm and want profit maximised.' },
    ],
  },
  {
    subtopic: T415, concept: 'Perfect competition',
    questions: [
      { markTariff: 1, requiresDiagram: true,
        questionText: 'In the long run, firms in perfect competition earn:\nA. Supernormal profit\nB. A loss\nC. Normal profit only\nD. Zero revenue',
        ...mc(['A','B','C','D'], 2, 'Free entry and exit in perfect competition means any supernormal profit attracts new entrants, driving price down until only normal profit remains in the long run.'),
        answerStructureAdvice: 'Free entry/exit is the mechanism that competes away supernormal profit in the long run.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'State two assumptions of the perfectly competitive market structure.',
        ...points([{ name: 'Naming any two of: many buyers/sellers, homogeneous product, free entry and exit, perfect information', marks: 2 }]),
        answerStructureAdvice: 'One mark per correctly named assumption.' },
      { markTariff: 4, requiresDiagram: true,
        questionText: 'A firm in a perfectly competitive market is currently earning supernormal profit. Explain what is likely to happen to this profit in the long run.',
        ...band4(
          'Clearly identifies new entrants attracted by the supernormal profit and precisely explains how this drives price/profit back to normal in the long run.',
          'Identifies the entry of new firms and the resulting fall in profit with a reasonably clear explanation.',
          'Makes a limited or unclear attempt to explain the process.',
          'Makes only a very vague reference to profit or competition with little real explanation.'
        ),
        answerStructureAdvice: 'Trace the full chain: supernormal profit → new entrants → market supply rises → price falls → profit returns to normal.' },
      { markTariff: 15, requiresDiagram: true,
        questionText: 'Explain the extent to which perfect competition is an efficient market structure.',
        ...levels([
          { level: 3, marks: '11-15', descriptor: 'Well organised, develops a selection of relevant issues (e.g. productive efficiency at minimum ATC, allocative efficiency where P=MC) with sound knowledge, good application, and clear, well-focused chains of reasoning.' },
          { level: 2, marks: '6-10', descriptor: 'Focuses on relevant issues with satisfactory knowledge and reasonable application, but analysis may not be fully developed.' },
          { level: 1, marks: '1-5', descriptor: 'Has identified one or more relevant issues with limited knowledge and very limited application.' },
        ]),
        answerStructureAdvice: 'Cover both productive efficiency (minimum ATC) AND allocative efficiency (P=MC) with named definitions - no evaluation required at this tariff.' },
    ],
  },
  {
    subtopic: T415, concept: 'Monopolistic competition',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'A key feature that distinguishes monopolistic competition from perfect competition is:\nA. A single firm dominates the market\nB. Firms sell differentiated products, giving each some price-setting power\nC. There are significant barriers to entry\nD. Firms always make supernormal profit in the long run',
        ...mc(['A','B','C','D'], 2, 'In monopolistic competition, firms sell differentiated (not identical) products, giving each some limited price-setting power - unlike perfect competition\'s homogeneous product.'),
        answerStructureAdvice: 'Product differentiation is THE key distinguishing feature from perfect competition.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'State two examples of non-price competition used by firms in monopolistically competitive markets.',
        ...points([{ name: 'Correctly named form of non-price competition (e.g. branding, advertising, quality, packaging)', marks: 1 }, { name: 'A second, different correctly named form', marks: 1 }]),
        answerStructureAdvice: 'One mark per genuine, distinct form of non-price competition.' },
      { markTariff: 4, requiresDiagram: true,
        questionText: 'A local coffee shop invests heavily in unique branding and interior design to distinguish itself from competitors. Explain how this affects the price elasticity of demand it faces.',
        ...band4(
          'Clearly identifies that product differentiation makes demand less price elastic and precisely explains the mechanism (reduced substitutability/greater brand loyalty).',
          'Identifies that demand becomes less elastic with a reasonably clear explanation.',
          'Makes a limited or unclear attempt to link differentiation to elasticity.',
          'Makes only a very vague reference to branding or demand with little real explanation.'
        ),
        answerStructureAdvice: 'Explain WHY differentiation reduces the availability of close substitutes, which is what makes demand less elastic.' },
      { markTariff: 9, requiresDiagram: true,
        questionText: 'Using a diagram, explain why firms in monopolistic competition tend to earn only normal profit in the long run.',
        ...levels([
          { level: 3, marks: '7-9', descriptor: 'Well organised, develops the issue with sound knowledge and understanding, good application, well-focused analysis with a clear chain of reasoning, and an accurate, appropriately-used diagram.' },
          { level: 2, marks: '4-6', descriptor: 'Reasonable knowledge and application with some analysis that might not be fully developed; may include a relevant diagram.' },
          { level: 1, marks: '1-3', descriptor: 'Limited knowledge and very limited application; a diagram, if included, is not used well or is inaccurate.' },
        ]),
        answerStructureAdvice: 'Show the demand curve shifting left as new firms enter, ending where it is tangent to the average cost curve (normal profit).' },
    ],
  },
  {
    subtopic: T415, concept: 'Oligopoly',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'Interdependence between firms is a defining feature of which market structure?\nA. Perfect competition\nB. Monopolistic competition\nC. Oligopoly\nD. A market with a single unregulated monopolist',
        ...mc(['A','B','C','D'], 3, 'In an oligopoly, a small number of large firms dominate the market, so each firm\'s decisions directly affect - and are affected by - its rivals\' likely reactions.'),
        answerStructureAdvice: 'Interdependence is unique to oligopoly among the standard market structures.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by \'tacit collusion\' between oligopolistic firms.',
        ...points([{ name: 'Reference to firms coordinating behaviour (e.g. on price) without an explicit agreement', marks: 1 }, { name: 'Reference to this being done to avoid detection/legal penalties for cartels', marks: 1 }]),
        answerStructureAdvice: 'State what firms do (coordinate without formal agreement) and WHY (to avoid being caught colluding illegally).' },
      { markTariff: 4, requiresDiagram: true,
        questionText: 'A firm in an oligopolistic market decides not to cut its price, fearing rivals would simply match the cut. Explain how this illustrates interdependence.',
        ...band4(
          'Clearly identifies the firm\'s pricing decision as directly dependent on its expectation of rivals\' reactions, with a precise explanation linked to the kinked demand curve idea.',
          'Identifies interdependence as relevant with a reasonably clear explanation.',
          'Makes a limited or unclear attempt to link the scenario to interdependence.',
          'Makes only a very vague reference to the firm or rivals with little real explanation.'
        ),
        answerStructureAdvice: 'Link this directly to the idea that rivals are expected to match price cuts (making them unattractive) but not price rises.' },
      { markTariff: 25, requiresDiagram: true,
        questionText: 'Evaluate the view that price competition is rare in oligopolistic markets, and that non-price competition is a more effective strategy for firms.',
        ...levels([
          { level: 5, marks: '21-25', descriptor: 'Sound, focused analysis and well-supported evaluation: well organised, sound knowledge with few if any errors, good application to real oligopolistic markets, well-focused analysis with clear chains of reasoning, and supported evaluation throughout leading to a final conclusion.' },
          { level: 4, marks: '16-20', descriptor: 'Sound, focused analysis and some supported evaluation, with good application and some reasonable, supported evaluation.' },
          { level: 3, marks: '11-15', descriptor: 'Some reasonable analysis but generally unsupported evaluation; satisfactory knowledge and reasonable application, but evaluation is fairly superficial.' },
          { level: 2, marks: '6-10', descriptor: 'A fairly weak response with some understanding; limited knowledge and application, limited and unsupported evaluation.' },
          { level: 1, marks: '1-5', descriptor: 'A very weak response with little relevant knowledge, weak application, and weak, unsupported attempted analysis.' },
        ]),
        answerStructureAdvice: 'Weigh the kinked demand curve\'s explanation for price rigidity against genuine cases of price wars, and weigh non-price competition\'s benefits (sustainable differentiation) against its costs (expensive advertising) before a supported judgement.' },
    ],
  },
  {
    subtopic: T415, concept: 'Monopoly and monopoly power',
    questions: [
      { markTariff: 1, requiresDiagram: true,
        questionText: 'A profit-maximising monopolist will generally:\nA. Set price equal to marginal cost\nB. Restrict output and set price above marginal cost\nC. Set output at the allocatively efficient level\nD. Make only normal profit in the long run',
        ...mc(['A','B','C','D'], 2, 'A monopolist restricts output below the competitive level and charges a price above marginal cost, exploiting its market power to maximise profit.'),
        answerStructureAdvice: 'Monopoly outcome: LOWER output and HIGHER price than the competitive benchmark.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'State two barriers to entry that might help a firm maintain monopoly power.',
        ...points([{ name: 'Naming any two of: economies of scale, legal barriers/patents, control of a key resource, high sunk costs, brand loyalty', marks: 2 }]),
        answerStructureAdvice: 'One mark per correctly named barrier.' },
      { markTariff: 4, requiresDiagram: true,
        questionText: 'A pharmaceutical firm holds a patent on a new drug, preventing rivals from producing it. Explain how this gives the firm monopoly power.',
        ...band4(
          'Clearly identifies the patent as a legal barrier to entry and precisely explains how it prevents competition, giving the firm price-setting power.',
          'Identifies the patent as a barrier to entry with a reasonably clear explanation.',
          'Makes a limited or unclear attempt to link the patent to monopoly power.',
          'Makes only a very vague reference to the firm or patent with little real explanation.'
        ),
        answerStructureAdvice: 'Name the barrier type (legal/patent) explicitly and link it to the ABSENCE of competitors, which is what creates the pricing power.' },
      { markTariff: 9, requiresDiagram: true,
        questionText: 'Using a diagram, explain the welfare loss that can result from a firm operating as a monopoly rather than under perfect competition.',
        ...levels([
          { level: 3, marks: '7-9', descriptor: 'Well organised, develops the issue with sound knowledge and understanding, good application, well-focused analysis with a clear chain of reasoning, and an accurate, appropriately-used diagram.' },
          { level: 2, marks: '4-6', descriptor: 'Reasonable knowledge and application with some analysis that might not be fully developed; may include a relevant diagram.' },
          { level: 1, marks: '1-3', descriptor: 'Limited knowledge and very limited application; a diagram, if included, is not used well or is inaccurate.' },
        ]),
        answerStructureAdvice: 'A monopoly welfare-loss diagram is expected, showing the deadweight loss triangle between the monopoly and competitive outcomes.' },
    ],
  },
  {
    subtopic: T415, concept: 'Price discrimination',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'Price discrimination requires a firm to be able to:\nA. Sell an identical product at the same price to everyone\nB. Separate markets and prevent resale between consumer groups\nC. Operate in a perfectly competitive market\nD. Set price equal to marginal cost',
        ...mc(['A','B','C','D'], 2, 'For price discrimination to work, a firm must be able to identify different consumer groups with different price elasticities and prevent resale between them (e.g. a cheap ticket being resold to someone who\'d pay more).'),
        answerStructureAdvice: 'The two conditions for price discrimination: different elasticities between groups, and the ability to prevent resale.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain why price discrimination requires groups of consumers with different price elasticities of demand.',
        ...points([{ name: 'Reference to charging a higher price to the less elastic (less price-sensitive) group', marks: 1 }, { name: 'Reference to charging a lower price to the more elastic (more price-sensitive) group', marks: 1 }]),
        answerStructureAdvice: 'State the pricing rule for BOTH groups - higher price to the inelastic group, lower to the elastic group.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'A train operator charges a higher price for peak-time tickets (used mainly by commuters) than for off-peak tickets. Explain why this is an example of price discrimination.',
        ...band4(
          'Clearly identifies the two separate markets (peak/off-peak) with different elasticities and precisely explains how the pricing exploits this to raise revenue.',
          'Identifies the two markets and different pricing with a reasonably clear explanation.',
          'Makes a limited or unclear attempt to link the scenario to price discrimination.',
          'Makes only a very vague reference to train tickets or pricing with little real explanation.'
        ),
        answerStructureAdvice: 'Explain WHY commuters (peak) are less price-elastic than off-peak travellers, and how the firm exploits this gap.' },
      { markTariff: 25, requiresDiagram: true,
        questionText: 'Evaluate the view that price discrimination is harmful to consumers.',
        ...levels([
          { level: 5, marks: '21-25', descriptor: 'Sound, focused analysis and well-supported evaluation: well organised, sound knowledge with few if any errors, good application to real examples, well-focused analysis with clear chains of reasoning, and supported evaluation throughout leading to a final conclusion.' },
          { level: 4, marks: '16-20', descriptor: 'Sound, focused analysis and some supported evaluation, with good application and some reasonable, supported evaluation.' },
          { level: 3, marks: '11-15', descriptor: 'Some reasonable analysis but generally unsupported evaluation; satisfactory knowledge and reasonable application, but evaluation is fairly superficial.' },
          { level: 2, marks: '6-10', descriptor: 'A fairly weak response with some understanding; limited knowledge and application, limited and unsupported evaluation.' },
          { level: 1, marks: '1-5', descriptor: 'A very weak response with little relevant knowledge, weak application, and weak, unsupported attempted analysis.' },
        ]),
        answerStructureAdvice: 'Weigh the harm (some consumers pay more than under a single price) against genuine benefits (some consumers gain access at a lower price, cross-subsidy of loss-making services, better capacity utilisation) before a supported judgement.' },
    ],
  },
  {
    subtopic: T415, concept: 'Contestable and non-contestable markets',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'A perfectly contestable market is characterised by:\nA. High barriers to entry and exit\nB. No barriers to entry or exit, including zero sunk costs\nC. A single dominant firm\nD. Government price controls',
        ...mc(['A','B','C','D'], 1, 'A perfectly contestable market has no barriers to entry OR exit - crucially, no sunk costs - allowing "hit and run" entry whenever profit is available.'),
        answerStructureAdvice: 'The absence of SUNK costs specifically is what makes a market truly contestable.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by a \'sunk cost\'.',
        ...points([{ name: 'Reference to a cost that cannot be recovered once spent', marks: 1 }, { name: 'Reference to it acting as a barrier to entry/exit', marks: 1 }]),
        answerStructureAdvice: 'State what makes a cost "sunk" and why it discourages entry.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'A firm considering entering an industry realises that most of the required investment (e.g. specialist equipment) could not be resold if it later left. Explain how this affects the contestability of the market.',
        ...band4(
          'Clearly identifies the investment as a sunk cost and precisely explains how this discourages entry, reducing contestability.',
          'Identifies the sunk cost as relevant with a reasonably clear explanation of reduced contestability.',
          'Makes a limited or unclear attempt to link the scenario to contestability.',
          'Makes only a very vague reference to the investment or market with little real explanation.'
        ),
        answerStructureAdvice: 'Name the concept (sunk cost) explicitly and follow the chain to reduced contestability, not just "higher costs".' },
      { markTariff: 9, requiresDiagram: false,
        questionText: 'Explain how the threat of "hit and run" entry might affect the pricing behaviour of an existing firm in a contestable market.',
        ...levels([
          { level: 3, marks: '7-9', descriptor: 'Well organised, develops the issue with sound knowledge and understanding, good application, and a clear, well-focused chain of reasoning.' },
          { level: 2, marks: '4-6', descriptor: 'Reasonable knowledge and application, but the analysis may not be fully developed or becomes confused in places.' },
          { level: 1, marks: '1-3', descriptor: 'Limited knowledge and very limited application, with analysis that lacks focus.' },
        ]),
        answerStructureAdvice: 'The key insight: even a monopolist may behave AS IF competitive if the market is highly contestable, since supernormal profit would attract instant entry.' },
    ],
  },
  {
    subtopic: T415, concept: 'Static efficiency, dynamic efficiency and resource allocation',
    questions: [
      { markTariff: 1, requiresDiagram: true,
        questionText: 'Productive efficiency occurs where a firm produces at:\nA. The profit-maximising output\nB. The minimum point of its average total cost curve\nC. The output where price equals marginal cost\nD. Zero output',
        ...mc(['A','B','C','D'], 2, 'Productive efficiency means producing at the lowest possible average total cost - using resources with no waste.'),
        answerStructureAdvice: 'Keep productive efficiency (min ATC) and allocative efficiency (P=MC) clearly separate.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by \'dynamic efficiency\'.',
        ...points([{ name: 'Reference to efficiency in innovation/investment over time', marks: 1 }, { name: 'Reference to it requiring resources (e.g. supernormal profit funding R&D) not needed for static efficiency', marks: 1 }]),
        answerStructureAdvice: 'Dynamic efficiency is about improvement OVER TIME, unlike the static (one-moment-in-time) efficiency concepts.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'A monopoly uses its supernormal profit to fund research into a new production technology. Explain how this relates to dynamic efficiency.',
        ...band4(
          'Clearly identifies the funding of innovation from supernormal profit as an example of pursuing dynamic efficiency, with a precise explanation.',
          'Identifies the link between the profit and innovation with a reasonably clear explanation.',
          'Makes a limited or unclear attempt to link the scenario to dynamic efficiency.',
          'Makes only a very vague reference to the monopoly or research with little real explanation.'
        ),
        answerStructureAdvice: 'Name dynamic efficiency explicitly and explain why ONLY a firm able to retain supernormal profit (unlike perfect competition) can typically afford this.' },
      { markTariff: 15, requiresDiagram: true,
        questionText: 'Explain the extent to which a trade-off exists between static efficiency and dynamic efficiency across different market structures.',
        ...levels([
          { level: 3, marks: '11-15', descriptor: 'Well organised, develops a selection of relevant issues (e.g. perfect competition\'s static efficiency vs. its inability to fund innovation, monopoly\'s dynamic efficiency vs. its static inefficiency) with sound knowledge, good application, and clear, well-focused chains of reasoning.' },
          { level: 2, marks: '6-10', descriptor: 'Focuses on relevant issues with satisfactory knowledge and reasonable application, but analysis may not be fully developed.' },
          { level: 1, marks: '1-5', descriptor: 'Has identified one or more relevant issues with limited knowledge and very limited application.' },
        ]),
        answerStructureAdvice: 'Directly compare two market structures (e.g. perfect competition vs. monopoly) on BOTH efficiency types for a top-band answer - no evaluation required at this tariff.' },
    ],
  },
  // ───────────────────────── 4.1.6 The labour market ─────────────────────────
  {
    subtopic: T416, concept: 'The demand for labour and marginal productivity theory',
    questions: [
      { markTariff: 1, requiresDiagram: true,
        questionText: 'The demand for labour is described as a \'derived demand\' because:\nA. It is set directly by the government\nB. It depends on the demand for the good/service labour is used to produce\nC. It never changes over time\nD. It is unaffected by wages',
        ...mc(['A','B','C','D'], 2, 'Labour is demanded because of the demand for the final goods/services it helps produce, so labour demand is "derived" from that final product demand.'),
        answerStructureAdvice: 'Derived demand = demand for labour comes FROM demand for the product it helps make.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by the \'marginal revenue product\' of labour.',
        ...points([{ name: 'Reference to the extra revenue generated by employing one more unit of labour', marks: 1 }, { name: 'Reference to it being calculated as marginal physical product × marginal revenue', marks: 1 }]),
        answerStructureAdvice: 'State both the meaning AND the formula (MPP × MR).' },
      { markTariff: 4, requiresDiagram: true,
        questionText: 'A firm finds that hiring an additional worker adds less extra output than the previous worker hired. Explain how this affects the firm\'s demand for labour under marginal productivity theory.',
        ...band4(
          'Clearly identifies diminishing marginal returns reducing the marginal revenue product of labour and precisely explains why this lowers the firm\'s willingness to hire further workers at the going wage.',
          'Identifies the falling marginal product as relevant with a reasonably clear explanation.',
          'Makes a limited or unclear attempt to link the scenario to labour demand.',
          'Makes only a very vague reference to workers or output with little real explanation.'
        ),
        answerStructureAdvice: 'Link diminishing marginal returns explicitly to falling MRP, and MRP to the firm\'s hiring decision.' },
      { markTariff: 9, requiresDiagram: true,
        questionText: 'Using a diagram, explain how a rise in demand for a firm\'s product is likely to affect its demand for labour.',
        ...levels([
          { level: 3, marks: '7-9', descriptor: 'Well organised, develops the issue with sound knowledge and understanding, good application, well-focused analysis with a clear chain of reasoning, and an accurate, appropriately-used diagram.' },
          { level: 2, marks: '4-6', descriptor: 'Reasonable knowledge and application with some analysis that might not be fully developed; may include a relevant diagram.' },
          { level: 1, marks: '1-3', descriptor: 'Limited knowledge and very limited application; a diagram, if included, is not used well or is inaccurate.' },
        ]),
        answerStructureAdvice: 'Show a rightward shift of the labour demand curve, and link it back to derived demand.' },
    ],
  },
  {
    subtopic: T416, concept: 'The supply of labour',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'An increase in the supply of labour to a particular occupation could be caused by:\nA. A fall in the wage rate paid in that occupation\nB. A relaxation of immigration rules allowing more qualified workers to enter the country\nC. A fall in demand for the good the occupation helps produce\nD. An increase in the qualifications required to enter that occupation',
        ...mc(['A','B','C','D'], 2, 'Relaxed immigration rules directly increase the pool of available workers - a genuine rightward SHIFT in labour supply, unlike a wage change (which causes a movement along the curve).'),
        answerStructureAdvice: 'Keep a SHIFT of labour supply separate from a MOVEMENT along it (caused by the wage itself).' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'State two factors that might increase the supply of labour to a particular occupation.',
        ...points([{ name: 'Correctly named factor (e.g. relaxed immigration, more training places, higher relative wages, improved working conditions)', marks: 1 }, { name: 'A second, different correctly named factor', marks: 1 }]),
        answerStructureAdvice: 'One mark per genuine, distinct factor.' },
      { markTariff: 4, requiresDiagram: true,
        questionText: 'Training to become a qualified surgeon takes many years and requires rare academic ability. Explain why the supply of labour to this occupation is likely to be relatively inelastic.',
        ...band4(
          'Clearly identifies the long training period and restricted entry requirements and precisely explains why this limits how quickly supply can respond to a wage change.',
          'Identifies the barriers to entry as relevant with a reasonably clear explanation of inelastic supply.',
          'Makes a limited or unclear attempt to link the scenario to elasticity of supply.',
          'Makes only a very vague reference to surgeons or supply with little real explanation.'
        ),
        answerStructureAdvice: 'Link the SPECIFIC barriers (training length, ability requirements) directly to the inability of supply to respond quickly.' },
      { markTariff: 9, requiresDiagram: true,
        questionText: 'Explain the factors that determine the wage elasticity of supply of labour to a particular occupation.',
        ...levels([
          { level: 3, marks: '7-9', descriptor: 'Well organised, develops one or more relevant issues (e.g. length of training, qualifications required) with sound knowledge, good application, and a clear chain of reasoning.' },
          { level: 2, marks: '4-6', descriptor: 'Includes a relevant issue with reasonable knowledge and application, but analysis may not be fully developed.' },
          { level: 1, marks: '1-3', descriptor: 'A brief or weak response with limited knowledge and very limited application.' },
        ]),
        answerStructureAdvice: 'Compare a low-skill occupation (elastic supply) against a highly specialised one (inelastic supply) to develop this fully.' },
    ],
  },
  {
    subtopic: T416, concept: 'Wage determination in competitive labour markets',
    questions: [
      { markTariff: 1, requiresDiagram: true,
        questionText: 'In a perfectly competitive labour market, the equilibrium wage is determined where:\nA. The government sets a legal minimum wage\nB. Market demand for labour equals market supply of labour\nC. A trade union negotiates a fixed wage\nD. A single firm sets the wage unilaterally',
        ...mc(['A','B','C','D'], 2, 'Just like a competitive goods market, the equilibrium wage in a competitive labour market is set where market demand for labour equals market supply of labour.'),
        answerStructureAdvice: 'Labour market equilibrium works exactly like a goods market: demand meets supply, with wage on the vertical axis.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain why a firm in a perfectly competitive labour market is described as a \'wage taker\'.',
        ...points([{ name: 'Reference to the firm being too small to influence the market wage', marks: 1 }, { name: 'Reference to it facing a perfectly elastic supply of labour at the market wage', marks: 1 }]),
        answerStructureAdvice: 'Mirror the "price taker" logic from perfect competition, applied to wages.' },
      { markTariff: 4, requiresDiagram: true,
        questionText: 'Explain why doctors typically earn a higher wage than shop assistants in a competitive labour market.',
        ...band4(
          'Clearly identifies both higher marginal revenue product AND more restricted supply for doctors, with a precise explanation of the resulting wage gap.',
          'Identifies at least one relevant factor (demand or supply) with a reasonably clear explanation.',
          'Makes a limited or unclear attempt to explain the wage gap.',
          'Makes only a very vague reference to doctors or wages with little real explanation.'
        ),
        answerStructureAdvice: 'Use BOTH sides of the market - higher MRP (skill/training) AND restricted supply (barriers to entry) for doctors.' },
      { markTariff: 25, requiresDiagram: true,
        questionText: 'Evaluate the extent to which demand and supply analysis fully explains differences in wages between occupations.',
        ...levels([
          { level: 5, marks: '21-25', descriptor: 'Sound, focused analysis and well-supported evaluation: well organised, sound knowledge with few if any errors, good application to real occupations, well-focused analysis with clear chains of reasoning, and supported evaluation throughout leading to a final conclusion.' },
          { level: 4, marks: '16-20', descriptor: 'Sound, focused analysis and some supported evaluation, with good application and some reasonable, supported evaluation.' },
          { level: 3, marks: '11-15', descriptor: 'Some reasonable analysis but generally unsupported evaluation; satisfactory knowledge and reasonable application, but evaluation is fairly superficial.' },
          { level: 2, marks: '6-10', descriptor: 'A fairly weak response with some understanding; limited knowledge and application, limited and unsupported evaluation.' },
          { level: 1, marks: '1-5', descriptor: 'A very weak response with little relevant knowledge, weak application, and weak, unsupported attempted analysis.' },
        ]),
        answerStructureAdvice: 'Move beyond demand/supply to non-competitive factors (trade unions, monopsony, discrimination) to properly evaluate how COMPLETE the basic model really is.' },
    ],
  },
  {
    subtopic: T416, concept: 'Wage determination in imperfectly competitive labour markets',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'A monopsony employer in a labour market is:\nA. A single seller facing many buyers\nB. A single (or dominant) buyer of labour facing many sellers\nC. A market with many equally-sized employers\nD. A market with perfect information for all workers',
        ...mc(['A','B','C','D'], 2, 'A monopsony is the "buyer-side" equivalent of a monopoly - one dominant employer facing many workers, giving it power to set wages below the competitive level.'),
        answerStructureAdvice: 'Monopoly = one dominant SELLER; monopsony = one dominant BUYER (here, of labour).' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by monopsony power in a local labour market.',
        ...points([{ name: 'Reference to a single (or dominant) employer facing many workers with little competition for labour', marks: 1 }, { name: 'Reference to this giving the employer power to set wages below the competitive level', marks: 1 }]),
        answerStructureAdvice: 'State WHO has the power and WHAT it lets them do (push wages below the competitive rate).' },
      { markTariff: 4, requiresDiagram: true,
        questionText: 'A large factory is the only major employer in a small town. Explain how this gives the factory monopsony power over local wages.',
        ...band4(
          'Clearly identifies the lack of alternative local employers and precisely explains how this allows the factory to pay below the competitive wage.',
          'Identifies the lack of competition for labour with a reasonably clear explanation.',
          'Makes a limited or unclear attempt to link the scenario to monopsony power.',
          'Makes only a very vague reference to the factory or wages with little real explanation.'
        ),
        answerStructureAdvice: 'Explain WHY workers have few alternatives (only one major local employer), which is what creates the employer\'s power.' },
      { markTariff: 25, requiresDiagram: true,
        questionText: 'Evaluate the effectiveness of a national minimum wage in correcting the effects of monopsony power in a labour market.',
        ...levels([
          { level: 5, marks: '21-25', descriptor: 'Sound, focused analysis and well-supported evaluation: well organised, sound knowledge with few if any errors, good application including the diagrammatic effect on monopsony, well-focused analysis with clear chains of reasoning, and supported evaluation throughout leading to a final conclusion.' },
          { level: 4, marks: '16-20', descriptor: 'Sound, focused analysis and some supported evaluation, with good application and some reasonable, supported evaluation.' },
          { level: 3, marks: '11-15', descriptor: 'Some reasonable analysis but generally unsupported evaluation; satisfactory knowledge and reasonable application, but evaluation is fairly superficial.' },
          { level: 2, marks: '6-10', descriptor: 'A fairly weak response with some understanding; limited knowledge and application, limited and unsupported evaluation.' },
          { level: 1, marks: '1-5', descriptor: 'A very weak response with little relevant knowledge, weak application, and weak, unsupported attempted analysis.' },
        ]),
        answerStructureAdvice: 'A correctly-set minimum wage can raise BOTH wages and employment under monopsony - but if set too high, it risks reducing employment even here. Weigh this genuinely different result against the risk before your judgement.' },
    ],
  },
  {
    subtopic: T416, concept: 'Trade unions and the National Minimum Wage',
    questions: [
      { markTariff: 1, requiresDiagram: true,
        questionText: 'A trade union operating in an otherwise competitive labour market is most likely to cause:\nA. A fall in both the wage rate and the level of employment\nB. A rise in the wage rate, potentially at the cost of some employment\nC. No change to either wages or employment\nD. A fall in the wage rate but a rise in employment',
        ...mc(['A','B','C','D'], 2, 'A trade union bargaining above the competitive wage typically raises the wage rate, but in an otherwise competitive market this can come at the cost of reduced employment.'),
        answerStructureAdvice: 'The standard union effect in a competitive market: HIGHER wage, but a RISK of lower employment.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by \'bilateral monopoly\' in a labour market.',
        ...points([{ name: 'Reference to a single dominant employer (monopsonist) facing a single trade union', marks: 1 }, { name: 'Reference to the eventual wage depending on relative bargaining power between the two', marks: 1 }]),
        answerStructureAdvice: 'State WHO the two powerful parties are, and that the OUTCOME is genuinely uncertain, depending on bargaining strength.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'The government raises the National Minimum Wage above the current market equilibrium wage in a competitive labour market. Explain the likely effect on employment.',
        ...band4(
          'Clearly identifies the resulting excess supply of labour (unemployment) and precisely explains why a wage set above equilibrium causes this in a competitive market.',
          'Identifies a fall in employment/excess supply with a reasonably clear explanation.',
          'Makes a limited or unclear attempt to explain the effect on employment.',
          'Makes only a very vague reference to wages or employment with little real explanation.'
        ),
        answerStructureAdvice: 'In a COMPETITIVE market, a wage floor above equilibrium causes an excess supply of labour (unemployment) - explain this mechanism precisely.' },
      { markTariff: 9, requiresDiagram: true,
        questionText: 'Using a diagram, explain the impact of a trade union successfully negotiating a higher wage in a monopsonistic labour market.',
        ...levels([
          { level: 3, marks: '7-9', descriptor: 'Well organised, develops the issue with sound knowledge and understanding, good application, well-focused analysis with a clear chain of reasoning, and an accurate, appropriately-used diagram.' },
          { level: 2, marks: '4-6', descriptor: 'Reasonable knowledge and application with some analysis that might not be fully developed; may include a relevant diagram.' },
          { level: 1, marks: '1-3', descriptor: 'Limited knowledge and very limited application; a diagram, if included, is not used well or is inaccurate.' },
        ]),
        answerStructureAdvice: 'Show that under monopsony, wages AND employment can both rise together up to the competitive level - a genuinely different result from the competitive-market case.' },
    ],
  },
  {
    subtopic: T416, concept: 'Discrimination in the labour market',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'Labour market discrimination occurs when:\nA. Workers are paid according to their marginal revenue product\nB. Workers with identical productivity are treated differently (e.g. paid differently) based on a characteristic unrelated to productivity\nC. A firm pays the market equilibrium wage\nD. A trade union negotiates on behalf of all workers equally',
        ...mc(['A','B','C','D'], 2, 'Discrimination means equally productive workers are treated unequally (e.g. in pay or hiring) based on characteristics like gender or ethnicity, not on genuine productivity differences.'),
        answerStructureAdvice: 'The key word is EQUALLY PRODUCTIVE workers being treated differently - if productivity genuinely differs, that is not discrimination.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by the \'gender pay gap\'.',
        ...points([{ name: 'Reference to a difference in average earnings between men and women', marks: 1 }, { name: 'Reference to it potentially being caused by factors including discrimination, occupational segregation, or career breaks', marks: 1 }]),
        answerStructureAdvice: 'Define the gap itself, then note it can have multiple causes, not only discrimination.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'Two equally qualified and productive job candidates apply for the same role, but the employer, holding an unconscious bias, offers a lower starting salary to one of them. Explain how this is an example of labour market discrimination.',
        ...band4(
          'Clearly identifies that productivity is equal but pay differs due to an unrelated characteristic, precisely explaining why this fits the definition of discrimination.',
          'Identifies the pay difference as discrimination with a reasonably clear explanation.',
          'Makes a limited or unclear attempt to link the scenario to discrimination.',
          'Makes only a very vague reference to pay or bias with little real explanation.'
        ),
        answerStructureAdvice: 'Emphasise that PRODUCTIVITY IS EQUAL in this scenario - that\'s precisely what makes the pay difference discrimination rather than a fair market outcome.' },
      { markTariff: 9, requiresDiagram: true,
        questionText: 'Using a diagram, explain how discrimination against a group of workers could lead to them being paid a lower wage than an equally productive group.',
        ...levels([
          { level: 3, marks: '7-9', descriptor: 'Well organised, develops the issue with sound knowledge and understanding, good application, well-focused analysis with a clear chain of reasoning, and an accurate, appropriately-used diagram.' },
          { level: 2, marks: '4-6', descriptor: 'Reasonable knowledge and application with some analysis that might not be fully developed; may include a relevant diagram.' },
          { level: 1, marks: '1-3', descriptor: 'Limited knowledge and very limited application; a diagram, if included, is not used well or is inaccurate.' },
        ]),
        answerStructureAdvice: 'Show demand for the discriminated-against group\'s labour shifting left (employers undervalue their true MRP), lowering their equilibrium wage relative to the other group.' },
    ],
  },
  // ───────────────────────── 4.1.7 The distribution of income and wealth: poverty and inequality ─────────────────────────
  {
    subtopic: T417, concept: 'The distribution of income and wealth',
    questions: [
      { markTariff: 1, requiresDiagram: true,
        questionText: 'The Gini coefficient measures:\nA. The absolute level of poverty in a country\nB. The degree of income (or wealth) inequality in a country, from 0 to 1\nC. The rate of economic growth\nD. The unemployment rate',
        ...mc(['A','B','C','D'], 2, 'The Gini coefficient is a summary statistic of inequality, derived from the Lorenz curve, ranging from 0 (perfect equality) to 1 (maximum inequality).'),
        answerStructureAdvice: 'Remember the scale: 0 = perfect equality, 1 = maximum inequality.' },
      { markTariff: 2, requiresDiagram: true,
        questionText: 'Explain what the Lorenz curve shows.',
        ...points([{ name: 'Reference to the cumulative % of income/wealth held by the cumulative % of the population', marks: 1 }, { name: 'Reference to the distance from the line of perfect equality showing the degree of inequality', marks: 1 }]),
        answerStructureAdvice: 'State WHAT is plotted, and HOW its shape reveals inequality.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'Explain the difference between income inequality and wealth inequality.',
        ...band4(
          'Precisely defines income as a flow (earned over a period) and wealth as a stock (accumulated assets at a point in time), with a clear, accurate explanation of the distinction.',
          'Correctly identifies the flow/stock distinction with a reasonably clear explanation.',
          'Makes a limited or unclear attempt at the distinction.',
          'Makes only a very vague reference to income or wealth with little real explanation.'
        ),
        answerStructureAdvice: 'The flow/stock distinction is key: income is earned over a period, wealth is accumulated assets held at one point in time.' },
      { markTariff: 15, requiresDiagram: true,
        questionText: 'Explain the causes of income inequality within a country such as the UK.',
        ...levels([
          { level: 3, marks: '11-15', descriptor: 'Well organised, develops a selection of relevant issues (e.g. differences in skills/education, differences in wealth ownership, labour market discrimination) with sound knowledge, good application, and clear, well-focused chains of reasoning.' },
          { level: 2, marks: '6-10', descriptor: 'Focuses on relevant issues with satisfactory knowledge and reasonable application, but analysis may not be fully developed.' },
          { level: 1, marks: '1-5', descriptor: 'Has identified one or more relevant issues with limited knowledge and very limited application.' },
        ]),
        answerStructureAdvice: 'Cover more than one genuine, distinct cause (e.g. differences in education/skills AND differences in wealth ownership) - no evaluation required at this tariff.' },
    ],
  },
  {
    subtopic: T417, concept: 'The problem of poverty',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'Absolute poverty is best defined as:\nA. Having an income below 60% of the median income\nB. Lacking the minimum income needed to meet basic needs such as food, clean water, and shelter\nC. Owning less wealth than the average household\nD. Living in a country with a low GDP per capita',
        ...mc(['A','B','C','D'], 2, 'Absolute poverty is a fixed, minimum standard - not having enough income/resources to meet basic survival needs - unlike relative poverty, which compares income to others in society.'),
        answerStructureAdvice: 'Absolute = a fixed minimum needs threshold; relative = compared to others (e.g. below 60% of median income).' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain the difference between absolute and relative poverty.',
        ...points([{ name: 'Definition of absolute poverty (below a fixed minimum needed for basic needs)', marks: 1 }, { name: 'Definition of relative poverty (income significantly below the average/median in that society)', marks: 1 }]),
        answerStructureAdvice: 'A precise definition of each earns full marks - no examples required.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'Explain how economic growth might reduce absolute poverty without necessarily reducing relative poverty.',
        ...band4(
          'Clearly identifies that growth can raise everyone\'s income (cutting absolute poverty) while leaving relative gaps unchanged if gains are unevenly distributed, with a precise explanation.',
          'Identifies the distinction with a reasonably clear explanation.',
          'Makes a limited or unclear attempt at the distinction.',
          'Makes only a very vague reference to growth or poverty with little real explanation.'
        ),
        answerStructureAdvice: 'The key insight: growth raising everyone\'s income cuts absolute poverty, but relative poverty only falls if the POOREST share proportionally in the gains.' },
      { markTariff: 9, requiresDiagram: false,
        questionText: 'Explain the possible causes of relative poverty in a developed economy such as the UK.',
        ...levels([
          { level: 3, marks: '7-9', descriptor: 'Well organised, develops one or more relevant issues (e.g. unemployment, low pay, lack of skills) with sound knowledge, good application, and a clear chain of reasoning.' },
          { level: 2, marks: '4-6', descriptor: 'Includes a relevant issue with reasonable knowledge and application, but analysis may not be fully developed.' },
          { level: 1, marks: '1-3', descriptor: 'A brief or weak response with limited knowledge and very limited application.' },
        ]),
        answerStructureAdvice: 'Develop one cause (e.g. structural unemployment in a declining industry) into a full chain reaching low relative income.' },
    ],
  },
  {
    subtopic: T417, concept: 'Government policies to alleviate poverty and inequality',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'A progressive tax system is one where:\nA. The proportion of income paid in tax falls as income rises\nB. The proportion of income paid in tax rises as income rises\nC. Everyone pays exactly the same amount of tax\nD. Only businesses pay tax\'',
        ...mc(['A','B','C','D'], 2, 'A progressive tax takes a larger PROPORTION of income from higher earners than lower earners - a common tool for reducing income inequality.'),
        answerStructureAdvice: 'Progressive = higher % as income rises; regressive = lower % as income rises.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'State two government policies that could be used to reduce poverty.',
        ...points([{ name: 'Correctly named policy (e.g. welfare benefits, minimum wage, progressive taxation, education spending)', marks: 1 }, { name: 'A second, different correctly named policy', marks: 1 }]),
        answerStructureAdvice: 'One mark per genuine, named policy.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'A government increases the National Minimum Wage. Explain how this could help to reduce poverty.',
        ...band4(
          'Clearly identifies the direct rise in income for low-paid workers and precisely explains the link to reduced poverty, while implicitly recognising this only helps the employed.',
          'Identifies the link between higher minimum wage and reduced poverty with a reasonably clear explanation.',
          'Makes a limited or unclear attempt to explain the effect.',
          'Makes only a very vague reference to wages or poverty with little real explanation.'
        ),
        answerStructureAdvice: 'Trace the direct chain: higher minimum wage → higher income for low-paid workers → reduced poverty for that group.' },
      { markTariff: 25, requiresDiagram: false,
        questionText: 'Evaluate the effectiveness of government policies aimed at reducing income inequality.',
        ...levels([
          { level: 5, marks: '21-25', descriptor: 'Sound, focused analysis and well-supported evaluation: well organised, sound knowledge with few if any errors, good application to real policies, well-focused analysis with clear chains of reasoning, and supported evaluation throughout leading to a final conclusion.' },
          { level: 4, marks: '16-20', descriptor: 'Sound, focused analysis and some supported evaluation, with good application and some reasonable, supported evaluation.' },
          { level: 3, marks: '11-15', descriptor: 'Some reasonable analysis but generally unsupported evaluation; satisfactory knowledge and reasonable application, but evaluation is fairly superficial.' },
          { level: 2, marks: '6-10', descriptor: 'A fairly weak response with some understanding; limited knowledge and application, limited and unsupported evaluation.' },
          { level: 1, marks: '1-5', descriptor: 'A very weak response with little relevant knowledge, weak application, and weak, unsupported attempted analysis.' },
        ]),
        answerStructureAdvice: 'Bring in at least three distinct policy types (a tax policy, a benefits policy, a labour-market policy) so your evaluation can genuinely compare their relative effectiveness.' },
    ],
  },
  // ───────────────────────── 4.1.8 The market mechanism, market failure and government intervention ─────────────────────────
  {
    subtopic: T418, concept: 'How markets allocate resources and the meaning of market failure',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'Market failure occurs when:\nA. The government sets a legal minimum price\nB. The price mechanism allocates resources in a way that fails to maximise social welfare\nC. A firm makes a loss\nD. A market clears at its equilibrium price',
        ...mc(['A','B','C','D'], 2, 'Market failure means the free market, left alone, leads to a misallocation of resources such that social welfare is not maximised.'),
        answerStructureAdvice: 'Focus on the general DEFINITION of market failure, not on any one specific cause.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what economists mean by the term \'market failure\'.',
        ...points([{ name: 'Reference to the free market misallocating resources', marks: 1 }, { name: 'Reference to social welfare not being maximised', marks: 1 }]),
        answerStructureAdvice: 'A precise definition referencing social welfare/misallocation is enough for full marks.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'Explain how the price mechanism normally allocates resources efficiently in a free market.',
        ...band4(
          'Clearly identifies rising/falling prices as signals that incentivise producers and consumers to reallocate resources towards where they are most valued, with a precise explanation.',
          'Identifies the signalling/incentive function of prices with a reasonably clear explanation.',
          'Makes a limited or unclear attempt to explain the price mechanism.',
          'Makes only a very vague reference to prices or markets with little real explanation.'
        ),
        answerStructureAdvice: 'Explain the signalling AND incentive functions of prices together, not just that "prices go up and down".' },
      { markTariff: 9, requiresDiagram: false,
        questionText: 'Explain why a free, unregulated market might fail to allocate resources efficiently.',
        ...levels([
          { level: 3, marks: '7-9', descriptor: 'Well organised, develops one or more relevant issues (e.g. externalities, public goods, information gaps) with sound knowledge, good application, and a clear chain of reasoning.' },
          { level: 2, marks: '4-6', descriptor: 'Includes a relevant issue with reasonable knowledge and application, but analysis may not be fully developed.' },
          { level: 1, marks: '1-3', descriptor: 'A brief or weak response with limited knowledge and very limited application.' },
        ]),
        answerStructureAdvice: 'Pick ONE cause of market failure and follow it through in depth, rather than briefly listing several.' },
    ],
  },
  {
    subtopic: T418, concept: 'Public goods, private goods and quasi-public goods',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'Which characteristic makes national defence a pure public good?\nA. Excludability and rivalry\nB. Non-excludability and non-rivalry\nC. High price elasticity of demand\nD. Diminishing marginal utility',
        ...mc(['A','B','C','D'], 2, 'A pure public good is both non-excludable and non-rivalrous - national defence protects everyone regardless of whether they\'ve paid, and one person\'s protection doesn\'t reduce another\'s.'),
        answerStructureAdvice: 'The two defining properties (non-excludable, non-rivalrous) are the whole answer.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by the \'free-rider problem\'.',
        ...points([{ name: 'Reference to non-excludability allowing consumption without payment', marks: 1 }, { name: 'Reference to the resulting under-provision by the free market', marks: 1 }]),
        answerStructureAdvice: 'State WHY people can avoid paying, and WHAT that does to provision.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'Explain what is meant by a \'quasi-public good\', using an example.',
        ...band4(
          'Correctly identifies a good with SOME but not full public-good characteristics (e.g. partially excludable/rivalrous) and gives a genuine, precise example (e.g. a quiet road, before it becomes congested).',
          'Correctly identifies the concept with a reasonably clear example.',
          'Makes a limited or unclear attempt to explain the concept.',
          'Makes only a very vague reference to public goods with little real explanation.'
        ),
        answerStructureAdvice: 'Name a good that has public-good properties only PARTIALLY or only up to a point (e.g. an uncongested road, a beach before it gets crowded).' },
      { markTariff: 9, requiresDiagram: false,
        questionText: 'Explain why the free market is unlikely to provide pure public goods.',
        ...levels([
          { level: 3, marks: '7-9', descriptor: 'Well organised, develops the issue with sound knowledge and understanding, good application to a real public good, and a clear chain of reasoning.' },
          { level: 2, marks: '4-6', descriptor: 'Reasonable knowledge and application, but the analysis may not be fully developed or becomes confused in places.' },
          { level: 1, marks: '1-3', descriptor: 'Limited knowledge and very limited application, with analysis that lacks focus.' },
        ]),
        answerStructureAdvice: 'Name a specific public good (e.g. street lighting) and trace the free-rider problem through to zero private provision.' },
    ],
  },
  {
    subtopic: T418, concept: 'Externalities in consumption and production',
    questions: [
      { markTariff: 1, requiresDiagram: true,
        questionText: 'A negative production externality exists when:\nA. Marginal private cost equals marginal social cost\nB. Marginal social cost exceeds marginal private cost\nC. Marginal private benefit exceeds marginal social benefit\nD. A good is non-excludable and non-rivalrous',
        ...mc(['A','B','C','D'], 2, 'A negative production externality means the wider social cost of production (e.g. pollution) exceeds the private cost the firm pays, so MSC > MPC.'),
        answerStructureAdvice: 'Keep private cost/benefit and social cost/benefit clearly separate - the externality IS the gap between them.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by a \'positive consumption externality\', using an example.',
        ...points([{ name: 'Reference to a benefit from consumption spilling over to third parties not involved in the transaction', marks: 1 }, { name: 'A genuine example (e.g. education raising the productivity of others in society)', marks: 1 }]),
        answerStructureAdvice: 'State the definition AND give a genuine, specific example.' },
      { markTariff: 4, requiresDiagram: true,
        questionText: 'A factory produces goods but releases pollution into a nearby river, harming local fishing businesses. Explain how this is an example of a negative production externality.',
        ...band4(
          'Clearly identifies the harm to third parties (fishing businesses) not reflected in the factory\'s private costs, precisely explaining the resulting divergence between MPC and MSC.',
          'Identifies the externality with a reasonably clear explanation.',
          'Makes a limited or unclear attempt to link the scenario to externalities.',
          'Makes only a very vague reference to the factory or pollution with little real explanation.'
        ),
        answerStructureAdvice: 'Name the THIRD PARTY affected (fishing businesses) explicitly, since that\'s the defining feature of an externality.' },
      { markTariff: 9, requiresDiagram: true,
        questionText: 'Using a diagram, explain how a negative production externality leads to overproduction in a free market.',
        ...levels([
          { level: 3, marks: '7-9', descriptor: 'Well organised, develops the issue with sound knowledge and understanding, good application, well-focused analysis with a clear chain of reasoning, and an accurate, appropriately-used diagram.' },
          { level: 2, marks: '4-6', descriptor: 'Reasonable knowledge and application with some analysis that might not be fully developed; may include a relevant diagram.' },
          { level: 1, marks: '1-3', descriptor: 'Limited knowledge and very limited application; a diagram, if included, is not used well or is inaccurate.' },
        ]),
        answerStructureAdvice: 'Show both the free-market output (where MPC=MPB) and the socially optimal output (where MSC=MSB), and explain why the free-market output exceeds the social optimum.' },
    ],
  },
  {
    subtopic: T418, concept: 'Merit and demerit goods',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'A merit good is one which:\nA. Is over-consumed in a free market relative to the social optimum\nB. Is under-consumed in a free market relative to the social optimum, often due to imperfect information about its benefits\nC. Is non-excludable and non-rivalrous\nD. Can only be provided by the government',
        ...mc(['A','B','C','D'], 2, 'A merit good (e.g. education, healthcare) provides benefits that consumers tend to underestimate, leading to under-consumption relative to the socially optimal level in a free market.'),
        answerStructureAdvice: 'Merit good = under-consumed, usually due to imperfect information about its true benefits.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by a \'demerit good\', using an example.',
        ...points([{ name: 'Reference to a good over-consumed relative to the social optimum, often due to imperfect information about its harms', marks: 1 }, { name: 'A genuine example (e.g. tobacco, alcohol)', marks: 1 }]),
        answerStructureAdvice: 'State the definition AND give a genuine, specific example.' },
      { markTariff: 4, requiresDiagram: true,
        questionText: 'Explain why consumers might under-consume education relative to the socially optimal level, even though it is not a public good.',
        ...band4(
          'Clearly identifies imperfect information about the long-run benefits of education and precisely explains why this causes under-consumption relative to the social optimum.',
          'Identifies imperfect information as relevant with a reasonably clear explanation.',
          'Makes a limited or unclear attempt to explain the under-consumption.',
          'Makes only a very vague reference to education or consumption with little real explanation.'
        ),
        answerStructureAdvice: 'Focus on WHY people undervalue education\'s benefits (imperfect information about long-run returns), not on excludability/rivalry, which is a separate concept.' },
      { markTariff: 15, requiresDiagram: true,
        questionText: 'Explain the case for government intervention in the market for demerit goods such as tobacco.',
        ...levels([
          { level: 3, marks: '11-15', descriptor: 'Well organised, develops a selection of relevant issues (e.g. negative externalities, imperfect information, over-consumption) with sound knowledge, good application, and clear, well-focused chains of reasoning.' },
          { level: 2, marks: '6-10', descriptor: 'Focuses on relevant issues with satisfactory knowledge and reasonable application, but analysis may not be fully developed.' },
          { level: 1, marks: '1-5', descriptor: 'Has identified one or more relevant issues with limited knowledge and very limited application.' },
        ]),
        answerStructureAdvice: 'Cover both the externality argument (harm to third parties) AND the information-failure argument (consumers underestimate harm to themselves) for a top-band answer.' },
    ],
  },
  {
    subtopic: T418, concept: 'Market imperfections and competition policy',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'Which of the following is an example of a market imperfection that can cause market failure?\nA. Perfect information among all consumers\nB. Significant monopoly power held by one firm\nC. Free entry and exit for all firms\nD. Homogeneous products across an industry',
        ...mc(['A','B','C','D'], 2, 'Significant monopoly power is a market imperfection - it allows a firm to restrict output and raise price above the competitive level, causing a misallocation of resources.'),
        answerStructureAdvice: 'Look for the option describing a genuine DEPARTURE from the competitive ideal, not a feature of it.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'State two aims of UK competition policy.',
        ...points([{ name: 'Correctly named aim (e.g. preventing anti-competitive mergers, preventing cartels/collusion, protecting consumers from monopoly abuse)', marks: 1 }, { name: 'A second, different correctly named aim', marks: 1 }]),
        answerStructureAdvice: 'One mark per genuine, named aim of competition policy.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'The Competition and Markets Authority (CMA) blocks a proposed merger between two large supermarket chains. Explain why the CMA might take this action.',
        ...band4(
          'Clearly identifies the risk of reduced competition/increased market power from the merger and precisely explains the resulting harm to consumers (e.g. higher prices).',
          'Identifies the competition concern with a reasonably clear explanation.',
          'Makes a limited or unclear attempt to explain the CMA\'s action.',
          'Makes only a very vague reference to the merger or CMA with little real explanation.'
        ),
        answerStructureAdvice: 'Link the merger directly to a SPECIFIC consumer harm (e.g. higher prices, reduced choice) that increased market power would create.' },
      { markTariff: 9, requiresDiagram: false,
        questionText: 'Explain the methods a government might use to regulate the market power of a firm with a dominant market position.',
        ...levels([
          { level: 3, marks: '7-9', descriptor: 'Well organised, develops one or more relevant issues (e.g. price capping, merger control, breaking up a firm) with sound knowledge, good application, and a clear chain of reasoning.' },
          { level: 2, marks: '4-6', descriptor: 'Includes a relevant issue with reasonable knowledge and application, but analysis may not be fully developed.' },
          { level: 1, marks: '1-3', descriptor: 'A brief or weak response with limited knowledge and very limited application.' },
        ]),
        answerStructureAdvice: 'Develop ONE method (e.g. price capping) fully rather than briefly listing several.' },
    ],
  },
  {
    subtopic: T418, concept: 'Government intervention in markets',
    questions: [
      { markTariff: 1, requiresDiagram: true,
        questionText: 'A maximum price (price ceiling) set below the free market equilibrium price is likely to cause:\nA. A surplus\nB. A shortage\nC. Productive efficiency\nD. An increase in supply',
        ...mc(['A','B','C','D'], 2, 'Setting a maximum price below equilibrium means quantity demanded exceeds quantity supplied at that price - a shortage.'),
        answerStructureAdvice: 'A maximum price BELOW equilibrium cuts into supply, creating excess demand.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by a \'minimum price\' (price floor) in a market.',
        ...points([{ name: 'Reference to a legally set price above the free market equilibrium', marks: 1 }, { name: 'Reference to it being illegal to trade below this price', marks: 1 }]),
        answerStructureAdvice: 'State where it\'s set (above equilibrium) and what it legally prevents.' },
      { markTariff: 4, requiresDiagram: true,
        questionText: 'The government imposes a per-unit tax on a good with a negative production externality. Explain how this is intended to correct the market failure.',
        ...band4(
          'Clearly identifies the tax raising the firm\'s private cost towards the social cost (internalising the externality) and precisely explains the resulting fall in output towards the social optimum.',
          'Identifies the tax\'s aim of raising private cost with a reasonably clear explanation.',
          'Makes a limited or unclear attempt to explain the tax\'s effect.',
          'Makes only a very vague reference to the tax or externality with little real explanation.'
        ),
        answerStructureAdvice: 'Use the term "internalising the externality" and explain how it shifts the firm\'s output decision closer to the social optimum.' },
      { markTariff: 25, requiresDiagram: true,
        questionText: 'Evaluate the effectiveness of indirect taxation as a method of correcting a negative externality of consumption.',
        ...levels([
          { level: 5, marks: '21-25', descriptor: 'Sound, focused analysis and well-supported evaluation: well organised, sound knowledge with few if any errors, good application to a real example, well-focused analysis with clear chains of reasoning, and supported evaluation throughout leading to a final conclusion.' },
          { level: 4, marks: '16-20', descriptor: 'Sound, focused analysis and some supported evaluation, with good application and some reasonable, supported evaluation.' },
          { level: 3, marks: '11-15', descriptor: 'Some reasonable analysis but generally unsupported evaluation; satisfactory knowledge and reasonable application, but evaluation is fairly superficial.' },
          { level: 2, marks: '6-10', descriptor: 'A fairly weak response with some understanding; limited knowledge and application, limited and unsupported evaluation.' },
          { level: 1, marks: '1-5', descriptor: 'A very weak response with little relevant knowledge, weak application, and weak, unsupported attempted analysis.' },
        ]),
        answerStructureAdvice: 'Weigh the theoretical case (internalising the externality) against practical difficulties (measuring the true external cost, inelastic demand limiting the effect on quantity, the risk of the tax being regressive) before your judgement.' },
    ],
  },
  {
    subtopic: T418, concept: 'Government failure',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'Government failure occurs when:\nA. A firm fails to maximise profit\nB. Government intervention leads to a net welfare loss or a worse misallocation of resources\nC. The government successfully corrects a market failure\nD. A market clears at its equilibrium price',
        ...mc(['A','B','C','D'], 2, 'Government failure means intervention makes the allocation of resources WORSE rather than better - a net loss of welfare, not just an imperfect fix.'),
        answerStructureAdvice: 'The key word is NET - some benefit can still occur, but government failure means the overall effect is a worsening.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Explain what is meant by \'government failure\'.',
        ...points([{ name: 'Reference to government intervention causing a net welfare loss', marks: 1 }, { name: 'Reference to a worse (or no better) allocation of resources than before intervention', marks: 1 }]),
        answerStructureAdvice: 'State clearly that the intervention itself is the cause of the new, worse outcome.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'A government subsidy intended to support a struggling industry instead leads that industry to become permanently reliant on state support and less innovative. Explain how this illustrates government failure.',
        ...band4(
          'Clearly identifies the reduced incentive to innovate/improve efficiency caused by the subsidy and precisely explains why this represents a net welfare loss.',
          'Identifies the subsidy\'s unintended consequence with a reasonably clear explanation.',
          'Makes a limited or unclear attempt to link the scenario to government failure.',
          'Makes only a very vague reference to the subsidy or industry with little real explanation.'
        ),
        answerStructureAdvice: 'Link the SPECIFIC unintended consequence (reduced innovation/dependency) to a net welfare loss, not just "the subsidy didn\'t work perfectly".' },
      { markTariff: 9, requiresDiagram: false,
        questionText: 'Explain why government intervention to correct a market failure might itself lead to government failure.',
        ...levels([
          { level: 3, marks: '7-9', descriptor: 'Well organised, develops one or more relevant issues (e.g. imperfect information, administrative cost, unintended consequences, regulatory capture) with sound knowledge, good application, and a clear chain of reasoning.' },
          { level: 2, marks: '4-6', descriptor: 'Includes a relevant issue with reasonable knowledge and application, but analysis may not be fully developed.' },
          { level: 1, marks: '1-3', descriptor: 'A brief or weak response with limited knowledge and very limited application.' },
        ]),
        answerStructureAdvice: 'Pick ONE cause of government failure and follow it through with a specific example, rather than briefly listing several causes.' },
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

  console.log(`Inserting ${rows.length} practice questions (AQA batch B: 4.1.5-4.1.8) across ${byConcept.size} concepts...`);
  const { error } = await supabase.from('practice_questions').insert(rows);
  if (error) { console.error('Insert failed:', JSON.stringify(error)); process.exit(1); }
  console.log('Done.');
}

main();
