// Helpers for hand-written stages: same checks and same file format as generate.js output.
const fs = require('fs'); const path = require('path');
const { plan } = require('./plan_stages'); const { validate } = require('./build');
const map = require('../knowledge_map_economics_alevel.json'); const { stages, byId } = plan(map);
const dict = {};
fs.readdirSync(path.join(__dirname, 'out3')).filter((f) => /^\d+\.json$/.test(f)).forEach((f) => {
  const s = JSON.parse(fs.readFileSync(path.join(__dirname, 'out3', f), 'utf8'));
  Object.entries(s.terms).forEach(([k, v]) => { if (!(s.stages[0].given || []).includes(k)) dict[k] = v.label; });
});
function write(i, out) {
  const st = stages[i], given = st.given.slice(0, 4);
  const terms = { ...out.terms };
  st.given.forEach((g) => { terms[g] = terms[g] || { label: dict[g] || byId[g].label }; });
  const drop = out.dropEdges || [];
  const spec = { id: 'gen', subject: 'Economics', title: out.stage.title, terms, stages: [{ ...out.stage, given, needs: st.given, builds: given, nodes: st.nodes, dropped: drop,
    edges: st.edges.concat(st.givenEdges).filter(([a, b]) => !drop.some(([x, y]) => x === a && y === b)).concat(out.extraEdges || []) }] };
  const errs = validate(spec, st.given);
  if (errs.length) { console.log('#' + i, 'REJECTED', errs); return false; }
  fs.writeFileSync(path.join(__dirname, 'out3', String(i).padStart(3, '0') + '.json'), JSON.stringify(spec, null, 1));
  const f = path.join(__dirname, 'out3', 'failed', String(i).padStart(3, '0') + '.json'); if (fs.existsSync(f)) fs.unlinkSync(f);
  console.log('#' + i, 'ok'); return true;
}
module.exports = { write, stages, byId, dict };
