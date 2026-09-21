// Finds questions whose wording already contains a term that is only supposed to be revealed later (or by this very answer).
const fs = require('fs'); const path = require('path');
const dir = process.argv[2] || 'out3';
const norm = (s) => ' ' + String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
let total = 0, stagesHit = new Set(); const out = [];
fs.readdirSync(dir).filter((f) => /^\d+\.json$/.test(f)).sort().forEach((f) => {
  const spec = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); const st = spec.stages[0];
  const steps = st.steps.filter((s) => s.type === 'ask' || s.type === 'read');
  steps.forEach((s, i) => {
    const later = steps.slice(i).map((x) => x.term);
    const fields = s.type === 'ask' ? { q: s.q, right: s.right, wrong: s.wrong, hint: s.hint } : { text: s.text };
    later.forEach((t) => {
      const label = (spec.terms[t] || {}).label; if (!label) return;
      const l = norm(label); if (l.trim().length < 5) return;
      Object.entries(fields).forEach(([k, v]) => { if (norm(v).includes(l)) { total++; stagesHit.add(f); out.push(`${f} step ${i + 1} ${k} shows "${label}"${t === s.term ? ' (its own answer)' : ' (a later term)'}: ${String(v).slice(0, 90)}`); } });
    });
  });
});
console.log(total, 'leaks in', stagesHit.size, 'stages'); out.slice(0, +process.argv[3] || 12).forEach((l) => console.log(' ', l));
