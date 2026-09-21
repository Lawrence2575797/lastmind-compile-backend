// Options that simply name a term the student has not been given yet (the answer would be new vocabulary, not something they reasoned out).
const fs = require('fs'); const path = require('path');
const dir = process.argv[2] || 'out3';
const stems = (s) => String(s).toLowerCase().replace(/[^a-z ]+/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !['the','and','for','from','with','are','its','that'].includes(w)).map((w) => w.slice(0, 6));
let n = 0; const hit = new Set(); const rows = [];
fs.readdirSync(dir).filter((f) => /^\d+\.json$/.test(f)).sort().forEach((f) => {
  const spec = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); const st = spec.stages[0];
  const all = st.steps.filter((s) => s.type === 'ask' || s.type === 'read');
  st.steps.filter((s) => s.type === 'ask').forEach((s) => {
    const later = all.slice(all.indexOf(s)).map((x) => x.term);
    later.forEach((t) => {
      const ls = stems((spec.terms[t] || {}).label || ''); if (!ls.length) return;
      ['right', 'wrong'].forEach((k) => {
        const os = stems(s[k]);
        if (os.length <= ls.length + 2 && ls.every((w) => os.includes(w))) { n++; hit.add(f); rows.push(`${f} ${k} "${s[k]}" names "${spec.terms[t].label}"${t === s.term ? ' (this answer)' : ' (later)'}`); }
      });
    });
  });
});
console.log(n, 'options in', hit.size, 'stages'); rows.slice(0, +process.argv[3] || 12).forEach((r) => console.log(' ', r));
