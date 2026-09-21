'use strict';
// The 11 stages the generator could not get past the checker, written by hand to the same rules. node hand_fix.js
const { write } = require('./handlib');
const A = (term, q, right, wrong, hint, pre, diagram) => ({ type: 'ask', term, q, right, wrong, hint, pre, ...(diagram ? { diagram } : {}) });
const O = (...t) => ({ type: 'order', terms: t, prompt: `Drag and drop the ${t.length} key terms in the order they build on each other.` });
const D = { type: 'derive' };
const L = (label) => ({ label });
const stage = (name, sub, steps) => ({ name, title: name, sub, steps });

const D_CURVE = { label: 'D', pts: [[0.08, 0.88], [0.9, 0.14]] };
const S_CURVE = { label: 'S', pts: [[0.08, 0.14], [0.9, 0.86]] };
const AX = { x: 'Quantity', y: 'Price' };

// #45 Aggregate demand: influences on consumption and investment
write(45, {
  terms: { borrowcost: L('Cost of borrowing'), savingreward: L('Reward for saving'), INTEREST_RATES_CONSUMPTION: L('Interest rates and consumption'), CONSUMER_CONFIDENCE: L('Consumer confidence'), depreciation: L('Depreciation'),
    INTEREST_RATES_INVESTMENT: L('Interest rates and investment'), BUSINESS_CONFIDENCE: L('Business confidence'), GROSS_NET_INVESTMENT: L('Gross vs net investment') },
  extraEdges: [['INTEREST_RATES_DEF', 'borrowcost'], ['INTEREST_RATES_DEF', 'savingreward'], ['borrowcost', 'INTEREST_RATES_CONSUMPTION'], ['savingreward', 'INTEREST_RATES_CONSUMPTION'], ['borrowcost', 'INTEREST_RATES_INVESTMENT'], ['depreciation', 'GROSS_NET_INVESTMENT']],
  dropEdges: [['INTEREST_RATES_DEF', 'INTEREST_RATES_CONSUMPTION'], ['INTEREST_RATES_DEF', 'INTEREST_RATES_INVESTMENT']],
  stage: stage('Aggregate demand: influences on C and I', 'What makes households and firms spend more or less, and how investment is counted.', [
    A('borrowcost', 'You borrowed £1,000 and the interest rate rises from 4% to 8%. What happens to what you pay for the loan?', 'You pay more for the same loan', 'You pay less for the same loan', 'The rate is the price of the loan. What happens when the price doubles?', 'So a higher rate raises the'),
    A('savingreward', 'The same rise in interest rates applies to the money you keep in the bank. What happens to what you earn from saving?', 'You earn more from keeping money in', 'You earn less from keeping money in', 'Interest is paid on savings as well as charged on loans.', 'So a higher rate also raises the'),
    A('INTEREST_RATES_CONSUMPTION', 'Borrowing now costs more and saving pays more. What happens to household spending?', 'It falls, as saving looks more attractive', 'It rises, as saving looks less attractive', 'Would you spend a pound now or earn more by keeping it?', 'So higher rates reduce spending. This is the link between'),
    A('CONSUMER_CONFIDENCE', 'Households read that jobs are secure and wages will rise, and interest rates have not changed. Will they spend more or less?', 'More, as they feel secure about the future', 'Less, as they save against future risks', 'Spending depends on more than the rate: how do they feel about tomorrow?', 'How secure households feel about their finances is'),
    O('borrowcost', 'savingreward', 'INTEREST_RATES_CONSUMPTION', 'CONSUMER_CONFIDENCE'),
    A('INTEREST_RATES_INVESTMENT', 'A firm plans a £1m factory paid for by a loan, and interest rates double. Is the factory more or less worth building?', 'Less worth building, as the loan costs more', 'More worth building, as the loan is bigger', 'The firm compares what the factory earns with what the loan costs.', 'So higher rates discourage firms from building. This is the link between'),
    A('BUSINESS_CONFIDENCE', 'Firms expect customers to buy much more next year. Do they build extra capacity now, or hold back?', 'Build more, expecting sales to grow', 'Hold back, expecting sales to fall', 'Firms invest for the sales they expect, not the sales they have.', 'Firms\' expectations about future sales make up'),
    A('depreciation', 'A machine loses some of its value every year through wear and age. What is that loss of value?', 'The fall in its value from wear and age', 'The rise in its price from scarcity', 'Think of a car that is worth less each year you use it.', 'This loss of value through use is'),
    A('GROSS_NET_INVESTMENT', 'A bakery spends £50,000 on new ovens, but its old ovens lost £20,000 of value this year. By how much has its stock of ovens really grown?', 'By £30,000, once the wear is allowed for', 'By £50,000, which is all it spent', 'Some of the spending only replaced what wore out.', 'Total spending against spending after wear is the distinction between'),
    O('INTEREST_RATES_INVESTMENT', 'BUSINESS_CONFIDENCE', 'depreciation', 'GROSS_NET_INVESTMENT'),
    D]),
});

// #55 Aggregate supply: what shifts long-run aggregate supply
write(55, {
  terms: { labourquality: L('Quality of labour'), education_skills_lras: L('Education and skills'), laboursize: L('Size of labour force'), demographic_migration_lras: L('Demographics and migration'),
    compliance: L('Cost of compliance'), government_regulations_lras: L('Government regulations'), rivalpressure: L('Pressure from rivals'), competition_policy_lras: L('Competition policy') },
  extraEdges: [['lras_definition', 'labourquality'], ['labourquality', 'education_skills_lras'], ['lras_definition', 'laboursize'], ['laboursize', 'demographic_migration_lras'], ['lras_definition', 'compliance'], ['compliance', 'government_regulations_lras'], ['lras_definition', 'rivalpressure'], ['rivalpressure', 'competition_policy_lras']],
  dropEdges: [['lras_definition', 'education_skills_lras'], ['lras_definition', 'demographic_migration_lras'], ['lras_definition', 'government_regulations_lras'], ['lras_definition', 'competition_policy_lras']],
  stage: stage('What shifts long-run aggregate supply', 'Four things that change how much an economy can produce in the long run.', [
    A('labourquality', 'Two factories employ the same number of workers, but one factory\'s workers are far better trained. Which can produce more?', 'The one with better trained workers', 'The one with more untrained workers', 'Same numbers, so what else could make output differ?', 'How skilled and trained workers are is the'),
    A('education_skills_lras', 'A country invests heavily in schools and training for twenty years. What happens to the most it can produce in the long run?', 'It rises, and long-run supply shifts right', 'It stays the same, as only spending matters', 'Better trained workers can produce more from the same resources.', 'So better schooling shifts long-run supply. This is'),
    A('laboursize', 'Many people of working age move to a country to take jobs. What happens to the number of workers its firms can use?', 'There are more workers available', 'There are fewer workers available', 'Think about how many people are now able to work there.', 'The number of workers available is the'),
    A('demographic_migration_lras', 'The newcomers are young and have a wide mix of skills. What happens to the country\'s long-run productive potential?', 'It rises, as more workers can produce more', 'It stays the same, as workers cannot add output', 'More people at work means more can be made in the long run.', 'So changes in population and migration shift long-run supply. This is the effect of'),
    O('labourquality', 'education_skills_lras', 'laboursize', 'demographic_migration_lras'),
    A('compliance', 'A firm must hire extra staff and fill in pages of forms to meet every new rule. What happens to its costs?', 'They rise, using money that could make goods', 'They fall, as the rules give clear guidance', 'The staff and forms have to be paid for.', 'The cost of meeting rules is the'),
    A('government_regulations_lras', 'A government cuts red tape so firms spend less time on paperwork. What happens to what the economy can produce in the long run?', 'It rises, as firms spend more on production', 'It falls, as firms are less closely controlled', 'Time and money freed from paperwork can go into making goods.', 'So less regulation raises long-run supply. This is the effect of'),
    A('rivalpressure', 'A shop faces new rivals selling the same goods more cheaply. What must it do to keep its customers?', 'Cut its costs and improve how it works', 'Ignore them and put up its own prices', 'A shop that stands still loses customers to cheaper rivals.', 'The push to keep up with rivals is the'),
    A('competition_policy_lras', 'A government breaks up a monopoly so that many firms compete. What happens to efficiency across the industry?', 'It improves, so more is made from the same resources', 'It worsens, as firms waste effort fighting each other', 'Firms that must compete cannot afford to waste resources.', 'So more competition raises long-run supply. This is'),
    O('compliance', 'government_regulations_lras', 'rivalpressure', 'competition_policy_lras'),
    D]),
});

// #95 Business growth: motives for growing and reasons to stay small
write(95, {
  terms: { unitcost: L('Cost per unit'), stay_small_dis_scale: L('Higher costs when small'), custneeds: L('Customer needs'), stay_small_adv_flexibility: L('Flexibility of small firms'), revenue: L('Revenue'), profit_motive_growth: L('Profit motive for growth'), risk_diversification: L('Risk diversification') },
  extraEdges: [['econ_scale', 'unitcost'], ['unitcost', 'stay_small_dis_scale'], ['niche_market', 'custneeds'], ['custneeds', 'stay_small_adv_flexibility'], ['revenue', 'profit_motive_growth']],
  dropEdges: [['econ_scale', 'stay_small_dis_scale'], ['niche_market', 'stay_small_adv_flexibility']],
  stage: stage('Growing or staying small', 'Why a firm might want to grow, and why it might choose to stay small.', [
    A('unitcost', 'A bakery makes 100 loaves for £200 in total, and another makes 1,000 loaves for £1,500. Which pays less to make each loaf?', 'The bigger one, at £1.50 a loaf', 'The smaller one, at £2 a loaf', 'Divide each total cost by the number of loaves made.', 'Total cost divided by output is the'),
    A('stay_small_dis_scale', 'A small firm stays small while a large rival makes the same product. What happens to the small firm\'s cost per unit compared with the rival\'s?', 'Its cost per unit is higher', 'Its cost per unit is lower', 'The rival spreads its costs over far more units.', 'So staying small means giving up big-output savings. This is the'),
    A('custneeds', 'A small shop knows each of its regulars by name. What does it understand better than a large chain?', 'What each customer wants', 'What each product costs to make', 'Think about what knowing customers personally tells you.', 'What buyers actually want is'),
    A('stay_small_adv_flexibility', 'A tiny cafe can change its menu tomorrow to suit its regulars, while a chain needs head office approval. Which can respond faster?', 'The tiny cafe', 'The chain', 'Who has fewer people to persuade before a change?', 'Being able to adapt quickly to customers is the'),
    O('unitcost', 'stay_small_dis_scale', 'custneeds', 'stay_small_adv_flexibility'),
    A('revenue', 'A firm sells 200 units at £5 each. How much money comes in from these sales?', '£1,000, from price times units', '£205, from price plus units', 'Each unit brings in the price, and there are 200 of them.', 'The money coming in from sales is'),
    A('profit_motive_growth', 'A firm\'s owners want more profit. Selling to more customers brings in more money, and larger output also cuts cost per unit. What does this give them a reason to do?', 'Grow the business', 'Shrink the business', 'What would help them earn more and pay less per unit?', 'So wanting more profit is a reason to expand. This is the'),
    A('risk_diversification', 'A firm sells only umbrellas and a dry summer arrives. How would selling in several different markets help?', 'A bad year in one market is offset by the others', 'A bad year in one market is repeated in all', 'If one market fails, do the others necessarily fail too?', 'Spreading sales across markets to lower risk is'),
    D]),
});

// #101 Organic growth: advantages and disadvantages
write(101, {
  terms: { retained: L('Retained profit'), organic_adv_finance: L('Funded from own profit'), organic_adv_control: L('Full control'), organic_adv_culture: L('Preserved culture'), organic_dis_slow: L('Slow growth'), organic_dis_marketlimit: L('Limited by market size') },
  extraEdges: [['organic_growth_def', 'retained'], ['retained', 'organic_adv_finance']],
  dropEdges: [['organic_growth_def', 'organic_adv_finance']],
  stage: stage('Organic growth: pros and cons', 'What a firm gains and gives up by growing from its own resources.', [
    A('retained', 'A firm keeps some of this year\'s profit instead of paying it all out. What can it do with the money?', 'Pay for new equipment and premises', 'Nothing, because it cannot be used for growth', 'The money is the firm\'s own, sitting in the business.', 'Profit a firm keeps inside the business is'),
    A('organic_adv_finance', 'A firm grows using only the profit it has kept. Does it need to borrow from outsiders?', 'No, it can pay for growth itself', 'Yes, it must borrow to grow at all', 'Where is the money for growth coming from?', 'So it needs little outside money. This is'),
    A('organic_adv_control', 'A founder grows the firm using only their own funds and effort. Who still makes every decision?', 'The founder', 'New outside investors', 'Nobody outside has put money in.', 'So the owner keeps every decision and takes fewer risks. This is'),
    A('organic_adv_culture', 'A firm grows by hiring and training its own new staff in its usual way. Compared with two firms joining, is there a clash of working styles?', 'No, everyone learns the same way of working', 'Yes, the two ways of working clash', 'Who has been taught how things are done here?', 'So the way of working stays as it was. This is'),
    O('retained', 'organic_adv_finance', 'organic_adv_control', 'organic_adv_culture'),
    A('organic_dis_slow', 'Building a new plant and hiring and training staff takes years. What might a fast-moving rival do meanwhile?', 'Take the opportunity before the firm can', 'Slow down to match the firm\'s pace', 'Does the rival have to wait for the firm to finish?', 'So growing from within can miss chances. It is'),
    A('organic_dis_marketlimit', 'A village shop already sells to almost everyone in the village. How much can it grow by selling more in the village?', 'Very little, as the market is small', 'A great deal, as the market is endless', 'How many more customers are left to win?', 'So the size of the existing market caps growth. It is'),
    D]),
});

// #111 Revenue, costs and profit
write(111, {
  terms: { demand_curve: L('Demand curve'), tr: L('Total revenue'), revenue_concepts: L('TR, AR and MR'), fixedvar: L('Fixed and variable costs'), cost_curves: L('Cost curves'), profit_definition: L('Profit') },
  extraEdges: [['demand_curve', 'tr'], ['tr', 'revenue_concepts'], ['fixedvar', 'cost_curves']],
  dropEdges: [['demand_curve', 'revenue_concepts']],
  stage: stage('Revenue, costs and profit', 'How a firm\'s sales and costs add up to profit.', [
    A('demand_curve', 'This line shows how many pizzas sell at each price. What does one point on it tell you?', 'How many pizzas sell at that price', 'How much it costs to make that many', 'One point gives a price and a quantity.', 'That line is the', { ...AX, x: 'Pizzas sold', y: 'Price (£)', curves: [D_CURVE], points: [{ label: 'A', x: 0.4, y: 0.58, guides: true }] }),
    A('tr', 'At £10 each, 30 pizzas sell. How much money comes in from sales?', '£300, from price times quantity', '£40, from price plus quantity', 'Each of the 30 pizzas brings in the price.', 'The money coming in from all sales is'),
    A('revenue_concepts', 'Total revenue is £300 for 30 pizzas. What is the average revenue for each pizza?', '£10, the price at that quantity', '£300, the total of all sales', 'Divide the total by the number sold.', 'So average and marginal revenue, alongside total revenue, are'),
    A('fixedvar', 'A pizza shop pays rent whatever it sells, but pays for flour only when it bakes. Which cost changes with output?', 'The flour', 'The rent', 'Which of the two goes up when it bakes more?', 'Costs that stay put and costs that change with output are'),
    O('demand_curve', 'tr', 'revenue_concepts', 'fixedvar'),
    A('cost_curves', 'Plotting cost against output, do a firm\'s average costs keep falling for ever, or fall and then rise?', 'They fall, and then rise', 'They fall for ever', 'Would a small kitchen cope with unlimited orders?', 'The lines showing total, average and marginal cost are'),
    A('profit_definition', 'Total revenue is £300 and total cost is £220. What is left for the firm?', '£80, the revenue less the cost', '£520, the revenue plus the cost', 'What remains after the costs are paid?', 'Revenue minus cost is'),
    D]),
});

// #124 Sources of external economies of scale
write(124, {
  terms: { cluster: L('Industry cluster'), INFRA_ECON: L('Shared infrastructure'), LABOUR_ECON: L('Specialised labour pool'), SUPPLIER_ECON: L('Clustered suppliers') },
  extraEdges: [['EXT_ECON', 'cluster'], ['cluster', 'INFRA_ECON'], ['cluster', 'LABOUR_ECON'], ['cluster', 'SUPPLIER_ECON']],
  dropEdges: [['EXT_ECON', 'INFRA_ECON'], ['EXT_ECON', 'LABOUR_ECON'], ['EXT_ECON', 'SUPPLIER_ECON']],
  stage: stage('Where external economies come from', 'Why firms in the same industry get cheaper when they sit side by side.', [
    A('cluster', 'Many car-parts firms set up next to each other in one region. What is that grouping of related firms?', 'Related firms grouped in one place', 'One firm spread across many places', 'Think about a set of similar firms in the same area.', 'Related firms grouped in one place form an'),
    A('INFRA_ECON', 'All the firms in the region share one motorway, one port and one power grid. What happens to each firm\'s costs?', 'They fall, as many firms share the upkeep', 'They rise, as many firms use the roads', 'Who pays for each road and port when many firms share it?', 'Sharing roads, ports and power brings'),
    A('LABOUR_ECON', 'Many engineering firms in one town means many trained engineers live there. How easy is it for a new firm to hire one?', 'Easy, as skilled workers are nearby', 'Hard, as skilled workers are scarce', 'Where do the skilled workers already live?', 'A ready supply of skilled local workers is a'),
    A('SUPPLIER_ECON', 'Parts makers set up beside the car plants. What happens to delivery times and prices for the plants?', 'Both fall, as suppliers are close and compete', 'Both rise, as suppliers are crowded together', 'Nearby suppliers deliver faster and compete for orders.', 'Suppliers gathering around the industry are'),
    O('cluster', 'INFRA_ECON', 'LABOUR_ECON', 'SUPPLIER_ECON'),
    D]),
});

// #180 Protection for strategic reasons
write(180, {
  terms: { essential: L('Essential goods'), importdependence: L('Import dependence'), natsecurity: L('National security'), PROT_REASONS_STRATEGIC: L('Strategic protection') },
  extraEdges: [['NATIONALISATION_ADV2', 'essential'], ['essential', 'importdependence'], ['importdependence', 'natsecurity'], ['natsecurity', 'PROT_REASONS_STRATEGIC']],
  dropEdges: [['NATIONALISATION_ADV2', 'PROT_REASONS_STRATEGIC']],
  stage: stage('Trade restrictions for strategic reasons', 'Why a government might limit imports to keep some industries at home.', [
    A('essential', 'In a war, which goods must a country be able to get whatever happens?', 'Food, fuel and weapons', 'Luxury watches and jewellery', 'Which goods can a country not do without?', 'Goods a country must always be able to get are'),
    A('importdependence', 'A country buys all its fuel from one foreign supplier. What happens if that supplier cuts it off?', 'It has no fuel and cannot quickly replace it', 'It makes its own fuel at once instead', 'Can it switch supplier overnight?', 'Relying on other countries for what it needs is'),
    A('natsecurity', 'A government worries that relying on a possible enemy could leave it unable to defend itself. What is it worried about?', 'Its safety and ability to defend itself', 'Its trade surplus and exchange rate', 'The worry is about defence, not money.', 'Being safe and able to defend itself is'),
    A('PROT_REASONS_STRATEGIC', 'To keep its own steel and arms industries alive, what might the government do to imports of steel?', 'Restrict them, to protect home producers', 'Encourage them, to replace home producers', 'How do you keep a home industry going against cheap imports?', 'So countries limit trade to keep vital industries at home. This is'),
    O('essential', 'importdependence', 'natsecurity', 'PROT_REASONS_STRATEGIC'),
    D]),
});

// #301 Tax diagrams
const TAXED = { label: 'S + tax', pts: [[0.08, 0.29], [0.9, 1.0]], dashed: true };
const PIVOT = { label: 'S + tax', pts: [[0.08, 0.17], [0.9, 1.0]], dashed: true };
write(301, {
  terms: { DRAW_EQUIL: L('Equilibrium diagram'), TAX_DIAG_SPECIFIC: L('Specific tax diagram'), TAX_DIAG_ADVAL: L('Ad valorem tax diagram'), TAX_PQ: L('Price and quantity effects') },
  extraEdges: [],
  stage: stage('Drawing the effect of a tax', 'Show a tax on a supply and demand diagram and read the result.', [
    A('DRAW_EQUIL', 'Demand and supply cross at one point on this diagram. What is special about that point?', 'Quantity demanded equals quantity supplied', 'Quantity demanded is above quantity supplied', 'At the crossing, is buyers\' demand or sellers\' supply bigger?', 'Drawing where the two curves cross gives the', { ...AX, curves: [D_CURVE, S_CURVE], points: [{ label: 'E', x: 0.5, y: 0.5, guides: true }] }),
    A('TAX_DIAG_SPECIFIC', 'A £2 tax is charged on every unit sold. How does the supply curve move on the diagram?', 'It shifts up by the same amount at every quantity', 'It swings round, rising more at high quantities', 'A fixed amount per unit adds the same to every unit\'s price.', 'A fixed tax per unit shifts supply parallel. This is the', { ...AX, curves: [D_CURVE, S_CURVE, TAXED] }),
    A('TAX_DIAG_ADVAL', 'The tax is now 20% of the price, so higher-priced units pay more tax. How does the supply curve move?', 'It pivots, getting steeper as the price rises', 'It shifts up by the same amount everywhere', 'A percentage of a bigger price is a bigger tax.', 'A percentage tax pivots supply. This is the', { ...AX, curves: [D_CURVE, S_CURVE, PIVOT] }),
    A('TAX_PQ', 'Compare the new crossing with the old one. What has happened to price and quantity?', 'Price is higher and quantity is lower', 'Price is lower and quantity is higher', 'The tax pushes supply up and to the left.', 'Reading the new crossing gives the', { ...AX, curves: [D_CURVE, S_CURVE, TAXED], points: [{ label: 'E1', x: 0.5, y: 0.5, guides: true }, { label: 'E2', x: 0.41, y: 0.58, guides: true }] }),
    O('DRAW_EQUIL', 'TAX_DIAG_SPECIFIC', 'TAX_DIAG_ADVAL', 'TAX_PQ'),
    D]),
});

// #307 Minimum price: a disadvantage and an advantage
write(307, {
  terms: { burden: L('Burden on income'), MINP_DIS3: L('Regressive effect on buyers'), stable: L('Predictable income'), invest: L('Farm investment'), MINP_ADV4: L('Stable incomes and supply') },
  extraEdges: [['TAX_REGRESSIVE', 'burden'], ['burden', 'MINP_DIS3'], ['MINP_ADV1', 'stable'], ['stable', 'invest'], ['invest', 'MINP_ADV4']],
  dropEdges: [['TAX_REGRESSIVE', 'MINP_DIS3'], ['MINP_ADV1', 'MINP_ADV4']],
  stage: stage('Minimum price: who loses, who gains', 'A cost to the poorest buyers and a benefit to producers, side by side.', [
    A('burden', 'The price of a basic food rises by £10. Who feels it more: someone earning £15,000 or someone earning £150,000?', 'The £15,000 earner, as it takes a bigger share', 'The £150,000 earner, as they buy far more', 'Compare the £10 with each person\'s income.', 'The share of income taken by a price rise is the'),
    A('MINP_DIS3', 'A minimum price raises the price of basic food for everyone. Which buyers does that hit hardest?', 'Low-income buyers', 'High-income buyers', 'Who spends more of their income on basic food?', 'So it takes a bigger share from the poor. This is the'),
    A('stable', 'Farmers know they will always get at least a set price for their crops. What can they now say about next year\'s income?', 'They can be fairly sure of it', 'They cannot know anything about it', 'A guaranteed floor removes some of the guesswork.', 'Income a farmer can count on is'),
    A('invest', 'A farmer feels sure of their income. Do they buy better equipment now?', 'Yes, they can afford the risk of investing', 'No, they save every pound they earn', 'Certain income makes a big purchase less risky.', 'Spending on better equipment is'),
    O('burden', 'MINP_DIS3', 'stable', 'invest'),
    A('MINP_ADV4', 'With better equipment, what happens to the farm\'s future harvests?', 'Future supply grows', 'Future supply shrinks', 'Better tools help farmers produce more later.', 'So a minimum price can stabilise incomes and grow supply. This is'),
    D]),
});

// #316 Maximum wage
write(316, {
  terms: { payprod: L('Pay above productivity'), max_wage_adv_excess: L('Limiting unjustified pay'), max_wage_disadv_shortage: L('Labour shortage'), abroad: L('Pay elsewhere'), max_wage_disadv_migration: L('Brain drain') },
  extraEdges: [['reasons_intervene_wages', 'payprod'], ['payprod', 'max_wage_adv_excess'], ['max_wage_disadv_shortage', 'abroad'], ['abroad', 'max_wage_disadv_migration']],
  dropEdges: [['reasons_intervene_wages', 'max_wage_adv_excess'], ['max_wage_disadv_shortage', 'max_wage_disadv_migration']],
  stage: stage('Maximum wage: pros and cons', 'What a wage cap is meant to do and what it can cost.', [
    A('payprod', 'A footballer is paid a hundred times a nurse\'s wage. Is pay always matched to what the worker adds to output?', 'No, some pay is far above what output justifies', 'Yes, every wage exactly matches output', 'Does anyone earn more than their work adds?', 'Pay that goes beyond what a worker\'s output justifies is'),
    A('max_wage_adv_excess', 'A cap stops chief executives being paid far above their contribution. What does it limit?', 'Pay that output does not justify', 'Pay that output fully justifies', 'Which pay is the cap aimed at?', 'So a cap can limit pay that is not earned. This is'),
    A('max_wage_disadv_shortage', 'The cap is set below the wage at which enough surgeons want to work. What happens to the number of surgeons willing to work?', 'Fewer are willing, so posts go unfilled', 'More are willing, so posts overflow', 'A lower wage makes the job less attractive.', 'So a cap can leave jobs empty. This is a'),
    A('abroad', 'A country abroad pays surgeons twice as much. What might a capped surgeon do?', 'Move to work there', 'Take a pay cut to stay', 'Who wants to earn half as much as they could?', 'Better wages in another country are'),
    O('payprod', 'max_wage_adv_excess', 'max_wage_disadv_shortage', 'abroad'),
    A('max_wage_disadv_migration', 'Many of the country\'s best-trained workers leave to earn more elsewhere. What happens to its stock of skills?', 'It shrinks as trained people leave', 'It grows as trained people leave', 'Who is left behind when trained people go?', 'That loss of skilled workers is the'),
    D]),
});

// #334 Public sector wage setting: disadvantages
write(334, {
  terms: { paygap: L('Pay gap with private sector'), public_sector_disadv_retention: L('Recruitment and retention'), payaward: L('National pay awards'), public_sector_disadv_action: L('Industrial action'), public_sector_disadv_inflexible: L('Inflexible pay') },
  extraEdges: [['public_sector_wage_def', 'paygap'], ['paygap', 'public_sector_disadv_retention'], ['public_sector_wage_def', 'payaward'], ['payaward', 'public_sector_disadv_action']],
  dropEdges: [['public_sector_wage_def', 'public_sector_disadv_retention'], ['public_sector_wage_def', 'public_sector_disadv_action']],
  stage: stage('Public sector pay: the drawbacks', 'How centrally set pay can cause problems for public services.', [
    A('paygap', 'Private firms raise wages for scarce skills quickly, but a public pay scale rises slowly by decision. Over time, who ends up paying more for skilled roles?', 'Private firms', 'The public sector', 'One side responds to the market, the other waits for a decision.', 'The difference between the two is the'),
    A('public_sector_disadv_retention', 'With that pay gap, what do skilled public workers do, and how easy is it to fill their posts?', 'They leave, and posts are hard to fill', 'They stay, and posts are easy to fill', 'Skilled people can earn more elsewhere.', 'So lagging pay causes'),
    A('payaward', 'Each year the government decides one pay rise for a whole group of public workers. Who decides the size of the rise?', 'The government, for everyone in the group', 'Each employer, for each worker separately', 'One decision covers the whole group.', 'A single rise set centrally for a group is a'),
    A('public_sector_disadv_action', 'The rise is 2% while prices rise 5%. What might workers do together to get more?', 'Stop work together until pay improves', 'Accept it quietly, as pay is fixed', 'Workers can withhold the one thing they offer.', 'Workers stopping work over pay is'),
    O('paygap', 'public_sector_disadv_retention', 'payaward', 'public_sector_disadv_action'),
    A('public_sector_disadv_inflexible', 'One national pay scale pays a nurse in London the same as a nurse in a cheap northern town. Where is it harder to recruit?', 'London, where living costs are much higher', 'The northern town, where living costs are lower', 'The same pay buys less where costs are higher.', 'So one scale cannot fit every local market. It is'),
    D]),
});
