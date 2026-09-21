'use strict';
// Hand rewrites of questions whose answer was a new term (the option simply named what the student was about to be taught), and the
// positive/normative stage rebuilt as two separate chains. Run after the generated specs exist. node fix_questions.js [dir]
const fs = require('fs');
const path = require('path');
const { validate } = require('./build');

const dir = process.argv[2] || path.join(__dirname, 'out3');
const fixes = {
  '022': [{ term: 'pctprice', q: 'Now compare that to a tax set at 20% of the price, so a £2 packet and a £10 packet both go up by 20%, not by the same fixed amount. Is the extra tax on the £10 packet the same as on the £2 packet?', right: 'No, the £10 packet\'s tax is bigger', wrong: 'Yes, both get the same tax added', hint: 'If both packets rise by 20%, is the extra charge the same number of pence, or does it depend on the starting price?' }],
  '028': [{ term: 'GROWTH_COMPARISON', right: 'Yes, B is growing faster, at 5% against 2%', wrong: 'No, their differing sizes make that impossible' }],
  '033': [{ term: 'basket_diff', q: 'One household spends heavily on rail fares, another barely uses trains at all. If RPI and CPI include somewhat different households and items in their surveys, will the two measures weigh exactly the same items?', right: 'No, they weigh different items', wrong: 'Yes, they weigh identical items' }],
  '034': [{ term: 'output_q', q: 'A country\'s prices double in a year, but its factories, shops and farms produce exactly the same amount of goods and services as before. Has the country really produced more?', right: 'No, only the money value has risen', wrong: 'Yes, it has produced twice as much', hint: 'Doubled prices with unchanged goods: is anything more actually being made?', pre: 'The amount of goods and services actually produced, ignoring price changes, is' }],
  '044': [{ term: 'SAVINGS_DEF', q: 'You have £1,600 left after tax this month. You spend £1,200 on goods and services and put the rest aside untouched. What have you done with the £400?', right: 'Kept it unspent for later', wrong: 'Spent it on extra goods', hint: 'You did not buy anything with it. You just set it aside.' }],
  '046': [{ term: 'spare_capacity', right: 'No, idle machines soon run out', wrong: 'Yes, existing machines easily cope' }],
  '064': [{ term: 'AS_CURVE', q: 'An AD curve shows how much buyers want to spend at each price level. To compare it with what the economy is capable of producing, which side of the economy must the second curve show?', right: 'The producing side: what firms supply', wrong: 'The spending side: what buyers demand', hint: 'You already have the buying side. What is on the other side of the whole economy?' }],
  '068': [{ term: 'boomslump', q: 'When actual growth rises well above trend, output and spending surge; when it falls well below trend, they shrink. What do these two extremes look like on the cycle?', right: 'A high point and a low point', wrong: 'A permanent rise and a fall', hint: 'Think of the two extreme points growth can reach, one high and one low.' }],
  '080': [{ term: 'FISC_GOV_SPEND', wrong: 'Monetary policy, run by the central bank' }],
  '117': [
    { term: 'TFC', q: 'The bakery pays £500 rent whether it bakes 0 loaves or 1000 loaves this week. How does the rent bill change as the bakery bakes more?', right: 'It stays at £500 whatever is baked', wrong: 'It rises with every extra loaf baked', hint: 'The rent is due whatever the oven does.', pre: 'That weekly rent bill is the' },
    { term: 'TVC', q: 'The bakery spends £2 of flour per loaf and bakes 1000 loaves this week, so £2000. What happens to the flour bill if it bakes 2000 loaves instead?', right: 'It doubles, to £4000', wrong: 'It stays at £2000', hint: 'Does the flour bill depend on how many loaves are baked?', pre: 'That flour bill is the' },
  ],
  '144': [{ term: 'MERGER_POLICY', q: 'After investigating, this body can approve a merger, approve it with conditions attached, or stop it going ahead entirely, using set thresholds. What do the thresholds, the investigation and the possible outcomes make up together?', right: 'A set framework guiding every decision', wrong: 'A one-off decision for each merger', hint: 'Think about the overall set of rules and decisions used to manage mergers, not one single decision.' }],
  '151': [{ term: 'PRIVATISATION_DEF', q: 'A national rail company is owned and run by the government. The government now sells the whole company to a private investor. What happens to who owns it?', right: 'The state hands ownership to a buyer', wrong: 'The state takes ownership from a buyer', hint: 'Think about who signs the cheque to buy the company.' }],
  '171': [{ term: 'TRADE_PATTERN_COMPADV', q: 'Countries tend to export the goods they produce at low opportunity cost, and import the goods other countries produce more cheaply in opportunity-cost terms. If every country does this, what does world trade look like?', right: 'Each country\'s exports are its cheapest goods', wrong: 'Each country exports and imports at random', hint: 'Think about the big picture that all the specialising, exporting and importing adds up to.' }],
  '173': [{ term: 'netexp', q: 'Export prices have risen and import prices have not changed. For the same quantities of goods traded, what happens to the balance between money earned from selling abroad and money spent buying from abroad?', right: 'It tips in the country\'s favour', wrong: 'It stays exactly as it was', hint: 'You are selling the same amount abroad, but each unit now earns more. Buying the same amount from abroad still costs what it did.' }],
  '176': [{ term: 'policy_setting', q: 'Before joining a currency union, a country sets its own interest rates and its own trade rules to suit its own economy. Once it joins a deep trade agreement, can it still set all of these entirely alone?', right: 'No, some choices are now made together', wrong: 'Yes, every choice is still its own' }],
  '209': [
    { term: 'private_own', right: 'The person who owns it', wrong: 'A government planning board' },
    { term: 'CAPITALISM_DEF', q: 'A country has private ownership of capital, firms chasing profit, and prices set by free markets rather than the state. Who mainly decides what gets produced in such an economy?', right: 'Private owners and buyers, through markets', wrong: 'A central planning board, through orders', hint: 'Put ownership, profit-seeking and free markets together: who is left making the decisions?' },
  ],
  '291': [{ term: 'ped_interpret', q: 'A café raises the price of coffee by 10% and the quantity sold falls by 40%. Compared with the size of the rise in price, is the fall in quantity bigger or smaller?' }],
  '304': [{ term: 'SUB_DIS1', q: 'The money paid out on this subsidy could instead have built new hospital wards. Beyond the payment itself, what does the subsidy cost?', right: 'The hospital wards that were given up', wrong: 'The extra paperwork of paying it out', hint: 'Think about what the same government money could have been spent on instead.' }],
  '321': [{ term: 'fairtrade', q: 'Farmers in a poor country sell coffee beans to a buyer who promises to pay at least a fixed minimum, however low the world price falls, plus an extra sum for the farmers to invest in their community. What does this arrangement protect the farmers from?', right: 'A collapse in the world price', wrong: 'A rise in the world price', hint: 'The buyer is guaranteeing a floor price and an extra premium, not simply letting the free market set the price.' }],
};

let changed = 0;
Object.entries(fixes).forEach(([id, list]) => {
  const file = path.join(dir, id + '.json');
  const spec = JSON.parse(fs.readFileSync(file, 'utf8'));
  list.forEach((f) => {
    const step = spec.stages[0].steps.find((s) => s.type === 'ask' && s.term === f.term);
    if (!step) throw new Error(`${id}: no step for ${f.term}`);
    ['q', 'right', 'wrong', 'hint', 'pre'].forEach((k) => { if (f[k] !== undefined) step[k] = f[k]; });
    changed++;
  });
  fs.writeFileSync(file, JSON.stringify(spec, null, 1));
});

// 000: two separate chains (what can be checked -> positive, what is believed -> normative), both feeding the distinction; the milestone
// is a chains milestone, so it no longer treats the four terms as one sequence.
{
  const file = path.join(dir, '000.json');
  const spec = JSON.parse(fs.readFileSync(file, 'utf8')); const st = spec.stages[0];
  const by = (t) => st.steps.find((s) => s.type === 'ask' && s.term === t);
  const testable = by('testable'), opinion = by('opinionbased'), dist = by('POS_NORM_DISTINCTION'), value = by('VALUE_JUDGEMENTS');
  const positive = { type: 'ask', term: 'POSITIVE_STATEMENT', q: 'Take the claim about unemployment. Whoever is asked, does the data make it true or false, whatever anyone feels about it?', right: 'Yes, the facts decide it', wrong: 'No, it is true if enough agree', hint: 'A number either matches the claim or it does not.', pre: 'A claim about how things are, which evidence can settle, is a' };
  const normative = { type: 'ask', term: 'NORMATIVE_STATEMENT', q: 'Take the claim about cutting benefits. It says what ought to happen, not what is. Could facts alone show that it is right or wrong?', right: 'No, it rests on views about what is fair', wrong: 'Yes, the facts prove it right or wrong', hint: 'Two people with the same facts can still disagree about what ought to be done.', pre: 'A claim about what ought to happen is a' };
  st.steps = [
    testable, positive, opinion, normative,
    { type: 'chains', lanes: [{ label: 'Chain 1', terms: ['testable', 'POSITIVE_STATEMENT'] }, { label: 'Chain 2', terms: ['opinionbased', 'NORMATIVE_STATEMENT'] }],
      prompt: 'Drag and drop the 4 key terms into the two chains that lead to one concept. Chain 1 is what evidence can settle. Chain 2 is what people believe should happen.', then: 'what does telling the two apart give you?' },
    dist, value, { type: 'derive' },
  ];
  st.edges = [['testable', 'POSITIVE_STATEMENT'], ['opinionbased', 'NORMATIVE_STATEMENT'], ['POSITIVE_STATEMENT', 'POS_NORM_DISTINCTION'], ['NORMATIVE_STATEMENT', 'POS_NORM_DISTINCTION'], ['NORMATIVE_STATEMENT', 'VALUE_JUDGEMENTS']];
  fs.writeFileSync(file, JSON.stringify(spec, null, 1));
  changed++;
}

// every touched stage still has to pass the checker
let bad = 0;
[...Object.keys(fixes), '000'].forEach((id) => {
  const spec = JSON.parse(fs.readFileSync(path.join(dir, id + '.json'), 'utf8')); const st = spec.stages[0];
  const errs = validate({ ...spec, noLeakCheck: false }, [...new Set([...(st.given || []), ...(st.needs || [])])]);
  if (errs.length) { bad++; console.log(id, errs.slice(0, 3)); }
});
console.log(`${changed} questions rewritten, ${bad} stages failing the checker`);
