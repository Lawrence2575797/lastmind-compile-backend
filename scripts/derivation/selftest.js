// Checks that the worked examples inside the generation prompt themselves pass the validator. node selftest.js
const { validate } = require('./build');
const { SYSTEM } = require('./prompt');
const ex = (n) => JSON.parse(SYSTEM.split('WORKED EXAMPLE ' + n)[1].split('\n')[1]);
const mk = (o, edges, given, nodes) => {
  const drop = o.dropEdges || [];
  const st = { ...o.stage, given, nodes, dropped: drop, edges: edges.filter(([a, b]) => !drop.some(([x, y]) => x === a && y === b)).concat(o.extraEdges || []) };
  return { terms: { ...o.terms, SCARCITY: o.terms.SCARCITY || { label: 'Scarcity' } }, stages: [st] };
};
const r = [
  validate(mk(ex(1), [['FINITE_RESOURCES', 'SCARCITY'], ['UNLIMITED_WANTS', 'SCARCITY']], [], ['FINITE_RESOURCES', 'UNLIMITED_WANTS', 'SCARCITY'])),
  validate(mk(ex(2), [], ['SCARCITY'], ['OPPORTUNITY_COST']), ['SCARCITY']),
  validate((() => { const o = ex(3), m = { ...o }; return { terms: o.terms, stages: [{ ...o.stage, given: [], nodes: Object.keys(o.terms), edges: require('./specs/economics_markets_sample.json').stages[0].edges }] }; })()),
];
console.log(JSON.stringify(r), `prompt ~${Math.round(SYSTEM.length / 3.5)} tokens`);
