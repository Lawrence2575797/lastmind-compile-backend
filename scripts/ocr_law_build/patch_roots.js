// Deterministic (no API cost) fix for the last unlinked tort evaluation/defence nodes.
const fs = require('fs');
const path = require('path');
const { validate } = require('../build_aqa_biology_map');
const file = path.join(__dirname, '../../src/data/ocrLawALevel.json');
const map = JSON.parse(fs.readFileSync(file, 'utf8'));
const ids = new Set(map.nodes.map((n) => n.id));
const links = [
  ['TA_CAPARO_TEST', 'TB_EVAL_NEG_DUTY'], ['TA_CAPARO_FJR', 'TB_EVAL_NEG_DUTY'],
  ['TA_REASONABLE_MAN', 'TB_EVAL_NEG_BREACH'],
  ['TA_FACTUAL_CAUSATION', 'TB_EVAL_NEG_CAUSATION'], ['TA_MULTIPLE_CAUSES', 'TB_EVAL_NEG_CAUSATION'],
  ['TA_REMOTENESS', 'TB_EVAL_NEG_REMOTENESS'],
  ['TA_DAMAGE_TYPES', 'TB_EVAL_NEG_PSYCHIATRIC'], ['TA_CAPARO_TEST', 'TB_EVAL_NEG_PSYCHIATRIC'],
  ['TA_DAMAGE_TYPES', 'TB_EVAL_NEG_ECONOMICLOSS'], ['TA_CAPARO_FJR', 'TB_EVAL_NEG_ECONOMICLOSS'],
  ['TA_OLA57_S2_COMMON_DUTY', 'TB_EVAL_OL_1957'],
  ['TA_OLA84_S1_4_DUTY_CONTENT', 'TB_EVAL_OL_1984'],
  ['TA_PRIV_NUISANCE_DEF', 'TB_EVAL_NUISANCE_UNCERTAINTY'],
  ['TA_RYLANDS_RULE', 'TB_EVAL_RF_SCOPE'], ['TA_RYLANDS_ELEM_NONNATURAL', 'TB_EVAL_RF_SCOPE'],
  ['TA_BREACH_DEF', 'TB_CN_DEF'], ['TA_DAMAGE_TYPES', 'TB_CN_DEF'],
  ['TA_BREACH_DEF', 'TB_VNFI_DEF'],
  ['TA_PRIV_NUISANCE_DEF', 'TB_NUISANCE_DEF_LINK'], ['TA_RYLANDS_RULE', 'TB_NUISANCE_DEF_LINK'],
];
const have = new Set(map.edges.map((e) => `${e.from}>${e.to}`));
const adj = new Map(map.nodes.map((n) => [n.id, []]));
map.edges.forEach((e) => adj.get(e.from).push(e.to));
const reaches = (a, b) => { const seen = new Set(), st = [a]; while (st.length) { const x = st.pop(); if (x === b) return true; if (seen.has(x)) continue; seen.add(x); (adj.get(x) || []).forEach((y) => st.push(y)); } return false; };
let added = 0;
for (const [from, to] of links) {
  if (!ids.has(from) || !ids.has(to)) { console.warn('missing', from, to); continue; }
  if (have.has(`${from}>${to}`) || reaches(to, from)) continue;
  map.edges.push({ from, to, difficulty: 0.35 }); adj.get(from).push(to); have.add(`${from}>${to}`); added++;
}
const report = validate(map);
const rank = new Map(report.order.map((id, i) => [id, i]));
map.nodes.sort((a, b) => rank.get(a.id) - rank.get(b.id));
fs.writeFileSync(file, JSON.stringify(map, null, 2));
console.log(`added ${added} edges; ${map.nodes.length} nodes, ${map.edges.length} edges, ${report.roots.length} roots`);
