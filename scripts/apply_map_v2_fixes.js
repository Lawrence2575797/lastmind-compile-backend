// Applies the atomicity/prerequisite audit fixes to the Economics A-Level
// map (all hand-authored by direct reasoning in-conversation - zero API
// calls). Run BEFORE replace_live_economics_map.js + ingest_knowledge_map.js.
const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, 'knowledge_map_economics_alevel.json');
const d = JSON.parse(fs.readFileSync(FILE, 'utf8'));

const DELETE_NODES = [
  'externality_impact_agents', 'min_wage_adv', 'max_wage_adv', 'public_sector_adv',
  'public_sector_disadv', 'DRAW_AD_CURVE', 'hdi_advantages', 'trade_lib_adv',
  'trade_lib_dis', 'profit_max_adv', 'non_economic_factors', 'pd_costs_benefits',
  'monopsony_costs_benefits_employees', 'current_issues', 'issue_demographics_migration',
  'DRAW_DEMAND', 'DRAW_SUPPLY',
];

const RELABELS = {
  ECON_MODEL: 'Developing economic models',
  demand_def: 'Definition of demand',
  supply_def: 'Definition of supply',
  COST_GOVT_SPENDING: 'Cost of growth: extra government spending on infrastructure and regulation',
};

const NEW_NODES = [
  { id: 'SOCSCI', label: 'Economics as a social science', difficulty: 0.2, subtopic: '1.1 Nature of economics' },
  { id: 'UTILITY_DEF', label: 'Utility: definition as the satisfaction a consumer gains from consuming a good or service', difficulty: 0.25, subtopic: '1.2 How markets work' },
  { id: 'COST_CURRENT_ACCOUNT_DEFICIT', label: 'Cost of growth: risk of a current account deficit from rising import demand', difficulty: 0.4, subtopic: '2.5 Economic growth' },
  { id: 'issue_ageing_workforce', label: 'Current issue: an ageing workforce reducing the size of the labour supply', difficulty: 0.3, subtopic: '3.5 Labour market' },
  { id: 'issue_migration_labour_supply', label: 'Current issue: migration affecting the size and skill composition of labour supply', difficulty: 0.3, subtopic: '3.5 Labour market' },
];

const EDGE_REMOVALS = [
  ['ECON_MODEL', 'NO_EXPERIMENTS'],
  ['util_max', 'rationality_assumption'],
  ['profit_max', 'rationality_assumption'],
  ['rationality_assumption', 'demand_def'],
  ['BOOM_TRADEBALANCE', 'COST_GOVT_SPENDING'],
];

const EDGE_ADDITIONS = [
  // 1.1/1.2 flagship fix
  ['SOCSCI', 'NO_EXPERIMENTS'], ['NO_EXPERIMENTS', 'ECON_MODEL'],
  ['UTILITY_DEF', 'util_max'], ['rationality_assumption', 'util_max'], ['rationality_assumption', 'profit_max'],
  ['util_max', 'demand_def'], ['ASSUMPTIONS', 'rationality_assumption'],
  // diagram-skill duplication cleanup
  ['draw_demand_curve', 'DRAW_EQUIL'], ['draw_supply_curve', 'DRAW_EQUIL'],
  ['sras_definition', 'SRAS_CURVE'], ['TRADE_SPECIALISATION', 'TRADE_SPEC_GROWTH'],
  ['demand_def', 'DEMAND_LABOUR_DEF'], ['supply_def', 'SUPPLY_LABOUR_DEF'],
  ['DEMAND_LABOUR_DEF', 'DRAW_LABOUR_DEMAND_CURVE'], ['draw_demand_curve', 'DRAW_LABOUR_DEMAND_CURVE'],
  ['SUPPLY_LABOUR_DEF', 'DRAW_LABOUR_SUPPLY_CURVE'], ['draw_supply_curve', 'DRAW_LABOUR_SUPPLY_CURVE'],
  // functions of money, motivated by trade/specialisation
  ['TRADE_SPECIALISATION', 'MONEY_MEDIUM_EXCHANGE'], ['TRADE_SPECIALISATION', 'MONEY_MEASURE_VALUE'],
  ['TRADE_SPECIALISATION', 'MONEY_STORE_VALUE'], ['TRADE_SPECIALISATION', 'MONEY_DEFERRED_PAYMENT'],
  // other disconnected-node wiring
  ['cs_ps_diagram', 'cs_ps_change'], ['GDP_LIVING_STANDARDS_LIMITS', 'WELLBEING_DIMENSIONS'],
  ['TAX_INDIRECT', 'PROT_REASONS_REVENUE'], ['NATIONALISATION_ADV2', 'PROT_REASONS_STRATEGIC'],
  ['EXRATE_FLOATING', 'TRADE_PATTERN_EXRATE'],
  // new split-node wiring
  ['BOOM_TRADEBALANCE', 'COST_CURRENT_ACCOUNT_DEFICIT'],
  ['factor_population', 'issue_ageing_workforce'], ['factor_population', 'issue_migration_labour_supply'],
  // cross-subtopic/cross-topic general-before-specific links (Tier 2 audit)
  ['ECON_MODEL', 'AD_AS_MODEL'], ['draw_demand_curve', 'LABOUR_MARKET_DIAGRAM'], ['draw_supply_curve', 'LABOUR_MARKET_DIAGRAM'],
  ['C_COMP', 'FACTOR_C'], ['G_COMP', 'FACTOR_G'], ['I_COMP', 'FACTOR_I'], ['NX_COMP', 'FACTOR_NX'],
  ['INTEREST_RATES_DEF', 'MON_INT_RATE'], ['G_COMP', 'FISC_GOV_SPEND'],
  ['UNEMPLOYMENT_DEF', 'OBJ_UNEMP'], ['INFLATION_DEF', 'OBJ_INFLATION_LOW'], ['BOP_STRUCTURE', 'OBJ_BOP'],
  ['short_run_long_run', 'LR_DEF'], ['TR', 'revenue_curves'], ['asymmetric_info_agency', 'ASYM_INFO_DEF'],
  ['BOP_STRUCTURE', 'BOP_CURRENT_TRADE'], ['GDP_DEF', 'MEDIAN_INCOME_CONCEPT'],
  ['UNEMPLOYMENT_DEF', 'UNEMPLOYMENT_CAUSE'], ['INFLATION_DEF', 'INFLATION_CAUSE'],
  ['G_COMP', 'GOV_SPEND_TYPES'], ['BOP_STRUCTURE', 'TRADE_BALANCE_DEF'],
];

const deleteSet = new Set(DELETE_NODES);
const before = { nodes: d.nodes.length, edges: d.edges.length };

d.nodes = d.nodes.filter(n => !deleteSet.has(n.id));
d.edges = d.edges.filter(e => !deleteSet.has(e.from) && !deleteSet.has(e.to));

for (const [id, label] of Object.entries(RELABELS)) {
  const n = d.nodes.find(x => x.id === id);
  if (!n) throw new Error(`relabel target missing: ${id}`);
  n.label = label;
}

const nodeIds = new Set(d.nodes.map(n => n.id));
for (const n of NEW_NODES) {
  if (nodeIds.has(n.id)) throw new Error(`new node id collides: ${n.id}`);
  d.nodes.push(n); nodeIds.add(n.id);
}

for (const [from, to] of EDGE_REMOVALS) {
  const idx = d.edges.findIndex(e => e.from === from && e.to === to);
  if (idx === -1) throw new Error(`edge removal target missing: ${from} -> ${to}`);
  d.edges.splice(idx, 1);
}

const edgeSet = new Set(d.edges.map(e => `${e.from}->${e.to}`));
for (const [from, to] of EDGE_ADDITIONS) {
  if (!nodeIds.has(from)) throw new Error(`edge addition: unknown from node ${from}`);
  if (!nodeIds.has(to)) throw new Error(`edge addition: unknown to node ${to}`);
  const key = `${from}->${to}`;
  if (edgeSet.has(key)) { console.warn('  skip (already exists):', key); continue; }
  d.edges.push({ from, to, difficulty: 0.3 });
  edgeSet.add(key);
}

// Validate: DAG (Kahn's algorithm) + duplicate ID check
const dupCheck = new Set();
for (const n of d.nodes) { if (dupCheck.has(n.id)) throw new Error(`duplicate node id: ${n.id}`); dupCheck.add(n.id); }
const indeg = new Map(d.nodes.map(n => [n.id, 0]));
const adj = new Map(d.nodes.map(n => [n.id, []]));
for (const e of d.edges) {
  if (!adj.has(e.from) || !indeg.has(e.to)) throw new Error(`edge references missing node: ${e.from} -> ${e.to}`);
  adj.get(e.from).push(e.to);
  indeg.set(e.to, indeg.get(e.to) + 1);
}
const queue = [...indeg.entries()].filter(([, deg]) => deg === 0).map(([id]) => id);
let visited = 0;
while (queue.length) {
  const id = queue.shift(); visited++;
  for (const next of adj.get(id)) {
    indeg.set(next, indeg.get(next) - 1);
    if (indeg.get(next) === 0) queue.push(next);
  }
}
if (visited !== d.nodes.length) throw new Error(`NOT a valid DAG - ${d.nodes.length - visited} nodes in a cycle`);

fs.writeFileSync(FILE, JSON.stringify(d, null, 2));
console.log(`Deleted ${DELETE_NODES.length} nodes, added ${NEW_NODES.length} nodes, relabeled ${Object.keys(RELABELS).length}.`);
console.log(`Removed ${EDGE_REMOVALS.length} edges, added up to ${EDGE_ADDITIONS.length} edges.`);
console.log(`Before: ${before.nodes} nodes / ${before.edges} edges. After: ${d.nodes.length} nodes / ${d.edges.length} edges.`);
console.log('Valid DAG confirmed.');
