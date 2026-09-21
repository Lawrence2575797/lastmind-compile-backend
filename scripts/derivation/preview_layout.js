// Draws each stage's auto-laid-out graph as static SVG, for reviewing layouts. node preview_layout.js spec.json out.html
const fs = require('fs'); const { build } = require('./build');
const spec = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); const { stages } = build(spec);
const T = {}; Object.keys(spec.terms).forEach((k) => { T[k] = spec.terms[k].label; });
const body = stages.map((s) => { const g = s.graph;
  const ed = g.edges.map((p) => `<polyline points="${p.map((q) => q.join(',')).join(' ')}" fill="none" stroke="#333" stroke-width="2" marker-end="url(#a)"/>`).join('');
  const nd = Object.keys(g.nodes).map((k) => { const n = g.nodes[k]; return `<rect x="${n[0]}" y="${n[1]}" width="${n[2]}" height="${n[3]}" rx="12" fill="${g.given.includes(k) ? '#ddd' : '#fff'}" stroke="#333"/><text x="${n[0] + n[2] / 2}" y="${n[1] + n[3] / 2 + 5}" text-anchor="middle" font-size="15" font-family="sans-serif">${T[k]}</text>`; }).join('');
  return `<h3>${s.hud}</h3><svg viewBox="0 0 1040 ${g.h}" style="width:100%"><defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0L10,5L0,10z"/></marker></defs>${ed}${nd}</svg>`; }).join('');
fs.writeFileSync(process.argv[3], `<meta charset=utf-8><body style="background:#fff;margin:4px">${body}</body>`);
