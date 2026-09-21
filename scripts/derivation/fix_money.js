'use strict';
// "Functions of money", rewritten by hand: the four functions follow from the failure of barter, and specialisation is not part of the
// mechanism at all (the map's prerequisite stays in "needs" for the schedule, but is not drawn). node fix_money.js [dir]
const fs = require('fs');
const path = require('path');
const { validate } = require('./build');
const dir = process.argv[2] || path.join(__dirname, 'out3');
const file = path.join(dir, '009.json');
const spec = JSON.parse(fs.readFileSync(file, 'utf8'));
const st = spec.stages[0];
const old = (t) => st.steps.find((s) => s.type === 'ask' && s.term === t);
const medium = old('MONEY_MEDIUM_EXCHANGE'), measure = old('MONEY_MEASURE_VALUE'), store = old('MONEY_STORE_VALUE'), defer = old('MONEY_DEFERRED_PAYMENT');

spec.terms = {
  nomatch: { label: 'Need for matching wants' },
  barter: { label: 'Barter problem' },
  MONEY_MEDIUM_EXCHANGE: { label: 'Medium of exchange' },
  MONEY_MEASURE_VALUE: { label: 'Measure of value' },
  MONEY_STORE_VALUE: { label: 'Store of value' },
  MONEY_DEFERRED_PAYMENT: { label: 'Method of deferred payment' },
  TRADE_SPECIALISATION: spec.terms.TRADE_SPECIALISATION,
};
st.given = [];
st.builds = [];
st.needs = ['TRADE_SPECIALISATION'];
st.edges = [['nomatch', 'barter'], ['barter', 'MONEY_MEDIUM_EXCHANGE'], ['barter', 'MONEY_MEASURE_VALUE'], ['barter', 'MONEY_STORE_VALUE'], ['barter', 'MONEY_DEFERRED_PAYMENT']];
st.name = st.title = 'The functions of money';
st.sub = 'Why swapping goods breaks down, and the four jobs money does to fix it.';

const nomatch = { type: 'ask', term: 'nomatch', q: 'A farmer who grows only wheat wants a pair of shoes. The shoemaker does not want any wheat, only fish. Can they swap directly?', right: 'No, each would need to want the other\'s goods', wrong: 'Yes, any two goods can always be swapped', hint: 'A swap only works if each side wants exactly what the other has.', pre: 'Swapping only works when each side wants what the other has. This need is the' };
const barter = { type: 'ask', term: 'barter', q: 'Without money, most people cannot find someone who wants what they have and has what they want. What happens to trade?', right: 'It shrinks, as most swaps keep failing', wrong: 'It grows, as swaps become easier', hint: 'How often would you find a perfect match every time you wanted something?', pre: 'Trade by swapping breaks down. That failure is the' };
st.steps = [
  nomatch, barter,
  { ...medium, q: 'To get round the failed swaps, the farmer and the shoemaker each need something they can hand over that any seller will accept. What would that be?', right: 'Something everyone accepts as payment', wrong: 'Only fish, since most people want fish', hint: 'It must not be tied to any one person\'s wants.', pre: 'Something both sides will accept for goods and services is acting as a' },
  measure,
  { type: 'order', terms: ['nomatch', 'barter', 'MONEY_MEDIUM_EXCHANGE', 'MONEY_MEASURE_VALUE'], prompt: 'Drag and drop the 4 key terms in the order they build on each other.' },
  store, defer, { type: 'derive' },
];
fs.writeFileSync(file, JSON.stringify(spec, null, 1));
const errs = validate({ ...spec, noLeakCheck: false }, ['TRADE_SPECIALISATION']);
console.log(errs.length ? errs : 'functions of money: passes the checker');
