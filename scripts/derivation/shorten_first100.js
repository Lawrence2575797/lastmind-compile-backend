'use strict';
// The first 100 questions, shortened by hand to about 20 words each. The scene and the answer are unchanged; only the wording is tighter.
// node shorten_first100.js [dir]
const fs = require('fs');
const path = require('path');
const { validate } = require('./build');
const dir = process.argv[2] || path.join(__dirname, 'out3');

const R = {
  '000|NORMATIVE_STATEMENT': 'Take the claim about cutting benefits. It says what ought to happen. Could facts alone show it is right or wrong?',
  '000|POS_NORM_DISTINCTION': 'Compare "Raising the minimum wage will reduce jobs" with "Raising the minimum wage is right". Which could evidence settle?',
  '000|VALUE_JUDGEMENTS': 'Two governments see the same evidence about a policy, yet one bans it and the other allows it. What explains the difference?',
  '001|SCARCITY': 'There are limited loaves, ovens and workers, but people always want more. Can everyone have all they want?',
  '002|finite_stock': 'Fish, timber and oil are scarce. Does that mean more can never be produced, or just that supply is limited right now?',
  '002|RENEWABLE_RESOURCES': 'A forest is cut for timber, but new trees are planted and grow back. Managed well, can it keep supplying timber for ever?',
  '002|NONRENEWABLE_RESOURCES': 'An oil field is drilled dry and the oil burned. Can that same oil field ever supply oil again?',
  '002|RENEW_NONRENEW_DISTINCTION': 'One country fuels itself from planted forests, another from coal mines. Fifty years on, whose supply is more likely to last?',
  '003|ECONOMIC_AGENTS': 'A shopper budgets, a bakery picks bread or cakes, a government picks hospitals or roads. Do all three face the same problem?',
  '003|OPP_COST_IMPORTANCE': 'A government builds a hospital instead of a road. If it ignores what the road would have given, might it decide badly?',
  '004|produced_good': 'Both an oven and a loaf come out of factories, made from flour, metal and labour. Do both come from production?',
  '004|CAPITAL_GOODS': 'A bakery buys an oven. Is the oven eaten by a customer, or kept in use baking more bread?',
  '004|used_directly': 'A customer buys a loaf. Do they use it to make something else, or does eating it satisfy a want at once?',
  '004|CONSUMER_GOODS': 'A household eats a loaf within a day, satisfying its want directly. Is the loaf treated like the oven, or differently?',
  '004|CAP_CONS_DISTINCTION': 'The oven serves a bakery for years, the loaf is eaten in a day. Group them as one kind of good, or split them?',
  '005|SPECIALISATION_DIVISION_LABOUR': 'One worker makes a whole pin, or ten workers each do one step. Which way makes more pins a day?',
  '005|repeated_task': 'Tasks are now split up. What does each worker end up doing all day?',
  '005|ADV_SPEC_TIME': 'A worker doing every step walks between benches and swaps tools. Does a worker who stays at one bench lose that time?',
  '005|ADV_SPEC_MACHINERY': 'A costly machine does just one step of making a pin. Is it worth buying if that step is done all day?',
  '005|ADV_SPEC_PRODUCTIVITY': 'One worker repeats a single step thousands of times; another does all ten steps alone. Who makes more pins an hour?',
  '005|ADV_SPEC_SKILL': 'After months of doing only one step, does a worker get better and faster at it than someone rotating through all ten?',
  '006|TRADE_SPECIALISATION': 'A country that grows coffee well makes only coffee and swaps it for phones, cars and clothes. Does it make everything itself?',
  '006|ADV_TRADE_EFFICIENCY': 'A country puts all its land and workers into coffee and trades for phones and clothes. What happens to total output?',
  '006|DIS_SPEC_MONOTONY': 'A factory worker tightens the same bolt all day, every day, for years. How does their motivation change?',
  '006|DIS_SPEC_UNEMPLOYMENT': 'Workers who spent 20 years learning only to mine coal lose their jobs when the mine closes. Can they move straight into software?',
  '006|DIS_SPEC_INTERDEPENDENCE': 'A country relies on one partner for all its food. That partner\'s harvest fails. What happens to the country\'s food supply?',
  '007|repcheap': 'A shoe-line worker only glues soles, all day, every day. Is their job varied, or the same task over and over?',
  '007|pridecare': 'A worker who repeats one small motion never sees the finished shoe. Would they spot and fix a flaw out of pride?',
  '008|ADV_TRADE_CHOICE': 'Vietnam specialises in trainers, Italy in coffee machines, and they trade. What can shoppers in both countries now buy?',
  '008|ADV_TRADE_LOWER_PRICES': 'Vietnam makes trainers on a huge scale for the world, with factories competing for orders. What tends to happen to their price?',
  '008|DIS_TRADE_DEPENDENCE': 'Italy buys almost all its trainers from Vietnam and makes none. If Vietnam stopped exporting, could Italy quickly supply its own?',
  '008|DIS_TRADE_STRUCTURAL_UNEMPLOYMENT': 'A country closes its trainer factories to specialise in coffee machines. What happens to workers whose only skill was making trainers?',
  '008|DIS_TRADE_VULNERABILITY': 'Italy buys trainers priced in Vietnamese dong. If the dong suddenly becomes much dearer against the euro, what happens to Italy\'s cost?',
  '009|MONEY_MEDIUM_EXCHANGE': 'To get round failed swaps, the farmer and shoemaker need something any seller will accept. What would that be?',
  '009|MONEY_MEASURE_VALUE': 'Shoes cost £40 and a loaf costs £2. What does that tell you about their worth compared with each other?',
  '009|MONEY_STORE_VALUE': 'You earn £500 and don\'t spend it all. Can you still buy things with the rest in six months, if prices barely change?',
  '009|MONEY_DEFERRED_PAYMENT': 'You buy a sofa today and pay in three monthly instalments. Can money settle a debt for something bought now, paid later?',
  '010|priceSignal': 'A baker has 10 loaves and 30 buyers. If the price rises until only 10 still want one, who gets the bread?',
  '010|govPlan': 'Instead, a ministry decides in advance how many loaves each bakery makes and who receives them. Who now decides who gets bread?',
  '010|FREE_MARKET_ECONOMY': 'Bakers, farmers and shoppers set their own prices, and no ministry directs them. Who decides what gets made?',
  '010|COMMAND_ECONOMY': 'The state owns the farms and factories and plans what is made and at what price. Who decides what gets made?',
  '010|MIXED_ECONOMY': 'Shops set most prices freely, but the government runs hospitals, schools and roads. Is one system used, or both together?',
  '011|ADV_FM_EFFICIENCY': 'A bakery selling stale bread loses money to rivals with fresher loaves. With no planner, what pushes it to improve?',
  '011|ADV_FM_CHOICE': 'Coffee shops compete for customers who want oat milk, low prices or speed. Who decides which shops survive?',
  '011|DIS_FM_INEQUALITY': 'With no redistribution, a surgeon earns far more than a cleaner, and their children inherit the gap. What happens to inequality over time?',
  '011|DIS_FM_MONOPOLY_POWER': 'The phone firm buys every rival and becomes the only seller. With nobody to switch to, what can it do to prices?',
  '012|ADV_CMD_EQUALITY': 'Where the government owns resources and decides how they are shared, is a rich family guaranteed a bigger slice than a poor one?',
  '012|ADV_CMD_PUBLIC_GOODS': 'A private hospital may close in a poor rural area for lack of paying patients. Could a planning government keep it open?',
  '012|duplication': 'In a market, three rival firms might each build a railway on the same route. Does that use materials and labour efficiently?',
  '012|ADV_CMD_PLANNING': 'If one planner controls all production and knows two lines are already being built, would it order a third on that route?',
  '012|DIS_CMD_INCENTIVE': 'A state factory manager earns the same salary whether the factory innovates or repeats last year\'s output. Are they driven to innovate?',
  '012|DIS_CMD_CHOICE': 'A planner decides the country makes one style of shoe in three sizes. Can shoppers pick between brands as in a market?',
  '013|fixed_factor': 'A bakery gets a rush of orders. Staff can be hired fast, but a new oven takes months. Can it add ovens this week?',
  '013|long_run': 'A year later, the bakery has built a new kitchen with extra ovens. Is anything still stuck at its old level?',
  '013|short_run_long_run': 'This week a furniture firm can add overtime but not workshop space; next year it could build another. What separates the two situations?',
  '014|allocative_eff': 'If the field switches from barley to wheat and people\'s overall satisfaction rises with no extra resources, has the allocation improved?',
  '014|market_failure_def': 'Farmers keep growing barley for years though almost everyone would rather have wheat, and nothing changes. Has the market found what people want?',
  '015|totalcost': 'A bakery has already spent £200 on flour, ovens and staff today. Does that £200 help decide whether to bake another batch?',
  '015|totalbenefit': 'The bakery sold 100 loaves today and pleased customers each time. Does that total satisfaction tell you if loaf 101 is worth baking?',
  '015|onemore': 'To decide whether to bake loaf 101, what matters: the £200 already spent, or the extra loaf\'s cost and revenue?',
  '015|marginal_analysis': 'Loaf 101 costs 50p to make and sells for £1.20. Should the bakery bake it, even though earlier loaves earned less?',
  '016|third_party': 'The factory\'s smoke gives a nearby family coughs, though they never bought or sold anything to it. Were they part of the deal?',
  '016|social_costs': 'To find the true cost to society of making the cars, count only what the factory pays, or that plus the family\'s harm?',
  '017|external_benefits': 'A neighbour plants flowers purely for themselves. You enjoy the view daily but never paid. Are you part of the transaction?',
  '017|social_benefits': 'Counting the neighbour\'s enjoyment of their flowers and yours as a passer-by, what is the total benefit created?',
  '017|externalities_def': 'The factory\'s owner breaks even, but its smoke harms residents who are never compensated. Does the market price include that harm?',
  '018|non_rivalry': 'A street light shines for one passer-by. Does that use up light for the next person who walks by?',
  '018|non_excludability': 'A council puts up a street light on a public road. Can it stop someone who won\'t pay council tax from benefiting?',
  '018|public_vs_private_goods': 'An ice cream is used up, and the shop can withhold it until you pay. Does a street light share both features?',
  '018|free_rider_problem': 'Nobody can be stopped from enjoying the street light, paying or not. Would a rational person pay towards it, or wait for others?',
  '018|public_goods_underprovision': 'If a private firm knows almost nobody will pay for the street lights it builds, will it have any reason to build them?',
  '019|DIS_FM_MARKET_FAILURE': 'A firm would build a lighthouse only by charging ships, but they can\'t be stopped from using the light. Will any firm build it?',
  '019|ADV_MIXED_SAFETY_NET': 'A jobless worker would have no income until new work. If the state pays benefit meanwhile, is the worst outcome limited?',
  '019|DIS_MIXED_GOVFAIL': 'A pollution regulator is slow and poorly informed; its rules cost firms more than the pollution prevented. Has it beaten the market?',
  '019|DIS_MIXED_TAX_BURDEN': 'Higher income tax means £100 of overtime pay now leaves a worker with £70. Are they as keen to work it?',
  '020|symmetric_information': 'You\'re buying a second-hand car. You and the seller see the same service history and mechanic\'s report. Does either know more about its condition?',
};

const words = (s) => s.trim().split(/\s+/).length;
let changed = 0, before = 0, after = 0, bad = 0;
const byFile = {};
Object.entries(R).forEach(([key, q]) => { const [f, t] = key.split('|'); (byFile[f] = byFile[f] || []).push([t, q]); });
Object.entries(byFile).forEach(([f, list]) => {
  const file = path.join(dir, f + '.json');
  const spec = JSON.parse(fs.readFileSync(file, 'utf8')); const st = spec.stages[0];
  list.forEach(([t, q]) => {
    const step = st.steps.find((s) => s.type === 'ask' && s.term === t);
    if (!step) throw new Error(`${f}: no question for ${t}`);
    before += words(step.q); after += words(q); step.q = q; changed++;
  });
  fs.writeFileSync(file, JSON.stringify(spec, null, 1));
  const errs = validate({ ...spec, noLeakCheck: false }, [...new Set([...(st.given || []), ...(st.needs || [])])]);
  if (errs.length) { bad++; console.log(f, errs.slice(0, 3)); }
});
console.log(`${changed} questions shortened: ${before} words -> ${after} (${Math.round(100 - (100 * after) / before)}% fewer); ${bad} stages failing the checker`);
