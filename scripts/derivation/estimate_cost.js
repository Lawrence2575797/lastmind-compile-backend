'use strict';
// Estimates the API cost of generating a whole map. Token counts are estimated from character counts (about 3.5 chars per token
// for JSON and prose), output size is measured from the hand-checked specs, prices come from src/constants/modelPricing.ts.
//   node estimate_cost.js ../knowledge_map_economics_alevel.json
const fs = require('fs');
const path = require('path');
const { plan } = require('./plan_stages');
const { SYSTEM, user } = require('./prompt');
const CPT = 3.5;
const PRICE = { sonnet5: { in: 2, out: 10 }, haiku45: { in: 1, out: 5 } };

const map = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const { stages, byId } = plan(map);
stages.forEach((s) => { s.subject = map.subject; });

// measured output: the two checked stages, as the model would return them (terms + stage JSON)
const ex = JSON.parse(fs.readFileSync(path.join(__dirname, 'specs', 'economics_markets_sample.json'), 'utf8'));
const perStage = ex.stages.map((st) => {
  const ids = new Set(st.steps.filter((x) => x.term).map((x) => x.term));
  const out = JSON.stringify({ terms: Object.fromEntries([...ids].map((k) => [k, ex.terms[k]])), stage: { name: st.name, title: st.title, sub: st.sub, steps: st.steps } });
  return { chars: out.length, terms: ids.size };
});
const charsPerTerm = perStage.reduce((s, x) => s + x.chars, 0) / perStage.reduce((s, x) => s + x.terms, 0);

const sysTok = SYSTEM.length / CPT;
let inTok = 0, outTok = 0, terms = 0;
stages.forEach((s) => {
  inTok += user(s, byId, {}).length / CPT;
  outTok += (s.nodes.length * charsPerTerm + 60) / CPT;
  terms += s.nodes.length;
});
const n = stages.length;
const RETRY = 0.3; // share of stages needing one corrected second attempt (each resends the exchange)
const attempts = n * (1 + RETRY);
const usd = (p, cached) => {
  const sysRead = attempts * sysTok * (cached ? 0.1 : 1) * p.in / 1e6 + (cached ? sysTok * 1.25 * p.in / 1e6 * Math.ceil(n / 20) : 0);
  const perIn = (inTok * (1 + RETRY) + attempts * 0) * p.in / 1e6 + RETRY * inTok * 0 + RETRY * outTok * p.in / 1e6; // retry resends the first answer
  const perOut = outTok * (1 + RETRY) * p.out / 1e6;
  return sysRead + perIn + perOut;
};
console.log(`${map.nodes.length} nodes -> ${n} stages, ${terms} terms`);
console.log(`system prompt ~${Math.round(sysTok)} tokens; user prompt ~${Math.round(inTok / n)} per stage; output ~${Math.round(outTok / n)} per stage (${Math.round(charsPerTerm)} chars per term measured)`);
console.log(`totals incl. ${RETRY * 100}% retries: input ~${Math.round(inTok * (1 + RETRY) / 1000)}k, output ~${Math.round(outTok * (1 + RETRY) / 1000)}k (+ system prompt cached per call)`);
Object.entries(PRICE).forEach(([k, p]) => console.log(`${k}: $${usd(p, true).toFixed(2)} with prompt caching, $${(usd(p, true) / 2).toFixed(2)} via the batch API (50% off), $${usd(p, false).toFixed(2)} without caching`));
