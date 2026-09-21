const fs = require('fs'); const path = require('path');
const dir = process.argv[2] || 'out3';
const STOP = new Set(['statements','statement','economic','economics','effects','effect','impact','market','markets','change','changes','price','prices','demand','supply','output','income','growth','policy','government','concept','definition','factors','between','through','choice','labour','business','economy','resources','because','without','whether','should','average','marginal','total','level','rates','value']);
const words = (s) => String(s).toLowerCase().replace(/[^a-z ]+/g, ' ').split(/\s+/).filter((w) => w.length >= 7 && !STOP.has(w));
let n = 0; const hit = new Set(); const rows = [];
fs.readdirSync(dir).filter((f) => /^\d+\.json$/.test(f)).sort().forEach((f) => {
  const spec = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); const st = spec.stages[0];
  const known = new Set((st.given || []).flatMap((g) => words((spec.terms[g] || {}).label || '')));
  const steps = st.steps.filter((s) => s.type === 'ask');
  const all = st.steps.filter((s) => s.type === 'ask' || s.type === 'read');
  steps.forEach((s) => {
    const idx = all.indexOf(s); const later = all.slice(idx);
    const kw = new Set(later.flatMap((x) => words((spec.terms[x.term] || {}).label || '')).filter((w) => !known.has(w)));
    const shown = words([s.q, s.right, s.wrong, s.hint].join(' ')).filter((w) => kw.has(w));
    if (shown.length) { n++; hit.add(f); rows.push(`${f}: ${shown.join(',')} | ${s.q.slice(0, 80)} | + ${s.right.slice(0, 40)} / - ${s.wrong.slice(0, 40)}`); }
  });
});
console.log(n, 'questions in', hit.size, 'stages'); rows.slice(0, +process.argv[3] || 10).forEach((r) => console.log(' ', r));
