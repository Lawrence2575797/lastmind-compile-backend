'use strict';
// Builds a scrolling derivation lesson (single HTML file) from a spec, offline. No API calls.
//   node scripts/derivation/build.js specs/economics_scarcity.json [out.html]
// The spec holds only what a person or a generator has to write: terms, edges, and the read/ask steps.
// Everything else is derived here: title slide, milestones, prompts, graph layout, schedule, and the
// rules are enforced (chunks of at most 4, every term introduced once, edges only between known terms).
const fs = require('fs');
const path = require('path');
const { layout } = require('./layout');

const CAP = 4;
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const PALETTE = ['#cfe8c8', '#cfe3f6', '#f6ecb9', '#f8d9c4', '#cfd9e8', '#dccff0', '#f8d3d3', '#f4a9a8', '#d5e8d0', '#f2dcc0', '#e9d0d8', '#f3b8a0', '#d0d6ee', '#e8e0b8', '#c9e5da', '#e6cfe0', '#e2e6b9', '#f5d0a9', '#f0a7b8', '#e6cfe0'];

function diagramErrors(d) {
  const e = [];
  const okPt = (p) => Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === 'number' && v >= 0 && v <= 1);
  if (typeof d.x !== 'string' || typeof d.y !== 'string') e.push('needs axis labels x and y');
  if (!Array.isArray(d.curves) || !d.curves.length || d.curves.length > 3) e.push('needs 1 to 3 curves');
  (d.curves || []).forEach((c, i) => {
    if (!c.label) e.push(`curve ${i + 1} has no label`);
    if (!Array.isArray(c.pts) || c.pts.length < 2 || c.pts.length > 8 || !c.pts.every(okPt)) e.push(`curve ${i + 1} needs 2 to 8 points, each [x, y] between 0 and 1`);
  });
  (d.points || []).forEach((p, i) => { if (!p.label || !okPt([p.x, p.y])) e.push(`point ${i + 1} needs a label and x, y between 0 and 1`); });
  if ((d.points || []).length > 5) e.push('at most 5 points');
  return e;
}

function validate(spec, known) {
  const errs = [];
  const err = (m) => errs.push(m);
  const seen = new Set(known || []);
  spec.stages.forEach((st, si) => {
    const where = `stage ${si + 1} (${st.name})`;
    const given = st.given || [];
    if (given.length > 5) err(`${where}: more than 5 given terms; put the rest in "needs"`);
    [...given, ...(st.needs || [])].forEach((g) => { if (!seen.has(g)) err(`${where}: given term "${g}" was not introduced by an earlier stage`); });
    const intro = new Set();
    let chunk = 0, lastMilestone = -1, ended = false, asked = false;
    st.steps.forEach((s, i) => {
      const at = `${where}, step ${i + 1}`;
      if (s.type === 'read' || s.type === 'ask') {
        if (!spec.terms[s.term]) err(`${at}: unknown term "${s.term}"`);
        if (intro.has(s.term) || given.includes(s.term)) err(`${at}: term "${s.term}" is introduced twice or is already given`);
        intro.add(s.term); chunk++;
        if (chunk > CAP) err(`${at}: more than ${CAP} new terms since the last milestone`);
        if (s.type === 'read' && asked) err(`${at}: a read step after the first question; every later term must be introduced by a question`);
        if (s.type === 'ask') {
          asked = true;
          ['q', 'right', 'wrong', 'hint', 'pre'].forEach((f) => { if (!s[f]) err(`${at}: ask is missing "${f}"`); });
          if (s.right && s.wrong && s.right === s.wrong) err(`${at}: right and wrong options are identical`);
          if (s.diagram) diagramErrors(s.diagram).forEach((m) => err(`${at}: diagram: ${m}`));
          const label = (spec.terms[s.term] || {}).label;
          if (label) [['q', s.q], ['right', s.right], ['wrong', s.wrong], ['hint', s.hint]].forEach(([f, v]) => {
            if (v && v.toLowerCase().includes(label.toLowerCase())) err(`${at}: "${f}" contains the term "${label}" it is about to reveal`);
          });
          if (s.right && s.wrong && Math.abs(s.right.length - s.wrong.length) > 20 && Math.max(s.right.length, s.wrong.length) / Math.min(s.right.length, s.wrong.length) > 1.5) err(`${at}: right and wrong options differ too much in length, which gives the answer away`);
        } else if (!s.text) err(`${at}: read is missing "text"`);
      } else if (s.type === 'order') {
        const n = s.terms.length;
        if (n > CAP) err(`${at}: order milestone has ${n} terms (max ${CAP})`);
        if (n !== chunk) err(`${at}: order covers ${n} terms but ${chunk} were introduced since the last milestone`);
        s.terms.forEach((t) => { if (!intro.has(t)) err(`${at}: "${t}" not introduced yet`); });
        if (!(s.prompt || '').startsWith(`Drag and drop the ${n} key terms`)) err(`${at}: prompt must start "Drag and drop the ${n} key terms"`);
        chunk = 0; lastMilestone = i;
      } else if (s.type === 'chains') {
        const all = s.lanes.flatMap((l) => l.terms);
        if (all.length > CAP) err(`${at}: chains milestone has ${all.length} terms (max ${CAP})`);
        if (all.length !== chunk) err(`${at}: chains cover ${all.length} terms but ${chunk} were introduced since the last milestone`);
        all.forEach((t) => { if (!intro.has(t)) err(`${at}: "${t}" not introduced yet`); });
        if (!(s.prompt || '').startsWith(`Drag and drop the ${all.length} key terms`)) err(`${at}: prompt must start "Drag and drop the ${all.length} key terms"`);
        chunk = 0; lastMilestone = i;
      } else if (s.type === 'derive') {
        if (i !== st.steps.length - 1 && st.steps[i + 1].type !== 'done') err(`${at}: derive must be the last step`);
        ended = true;
      }
    });
    if (!ended) err(`${where}: no final derive step`);
    const all = new Set([...given, ...intro]);
    (st.edges || []).forEach(([a, b]) => {
      if (!all.has(a) || !all.has(b)) err(`${where}: edge ${a} -> ${b} uses a term that is not in this stage`);
    });
    const introOrder = [...intro];
    (st.edges || []).forEach(([a, b]) => {
      if (introOrder.includes(a) && introOrder.includes(b) && introOrder.indexOf(a) > introOrder.indexOf(b)) err(`${where}: "${b}" is taught before "${a}", but the map says "${a}" comes first`);
    });
    // ---- atomicity: only for generated stages (they carry the map node ids); hand-written specs are exempt
    if (st.nodes) {
      const support = [...intro].filter((t) => !st.nodes.includes(t));
      if (intro.size < 4) err(`${where}: not atomic: only ${intro.size} new terms. A lesson needs at least 4 (map nodes plus the building blocks they rest on)`);
      if (support.length > 5) err(`${where}: ${support.length} support terms (max 5)`);
      st.nodes.forEach((n) => { if (!intro.has(n)) err(`${where}: map node "${n}" is never introduced`); });
      const adj = {};
      (st.edges || []).forEach(([x, y]) => { (adj[x] = adj[x] || []).push(y); });
      let cyclic = false;
      const memo = {}, onPath = new Set();
      const f = (n) => {
        if (memo[n] != null) return memo[n];
        if (onPath.has(n)) { cyclic = true; return 0; }
        onPath.add(n);
        const d = (adj[n] || []).length ? 1 + Math.max(...adj[n].map(f)) : 0;
        onPath.delete(n);
        return (memo[n] = d);
      };
      const longest = Math.max(0, ...[...all].map(f));
      if (cyclic) err(`${where}: the links between terms form a loop; every link must point from an earlier idea to a later one`);
      if (longest < 2) err(`${where}: not atomic: the longest chain of ideas is ${longest} link(s); a concept must be built up from at least 2 steps`);
    }
    // parallel members taught as a leading run of reads must not chain into each other: each links straight into the concept they build
    const lead = [];
    for (const s of st.steps) { if (s.type === 'read') lead.push(s.term); else break; }
    if (lead.length >= 2) {
      const es = st.edges || [];
      if (es.some(([x, y]) => lead.includes(x) && lead.includes(y))) err(`${where}: the parallel terms ${lead.join(', ')} are linked to each other; each must link directly into the concept they build`);
      const targets = lead.map((t) => new Set(es.filter(([x]) => x === t).map(([, y]) => y)));
      if (!([...targets[0]].some((c) => targets.every((ts) => ts.has(c))))) err(`${where}: the parallel terms ${lead.join(', ')} do not all link into one common concept`);
    }
    // edges the generator replaced must still be implied by a longer path
    (st.dropped || []).forEach(([x, y]) => {
      const adj2 = {}; (st.edges || []).forEach(([p, q]) => { (adj2[p] = adj2[p] || []).push(q); });
      const seenN = new Set(); const stack = [x]; let hit = false;
      while (stack.length) { const n = stack.pop(); if (seenN.has(n)) continue; seenN.add(n); (adj2[n] || []).forEach((m) => { if (m === y) hit = true; stack.push(m); }); }
      if (!hit) err(`${where}: dropped edge ${x} -> ${y} is not implied by a path through the added terms`);
    });
    intro.forEach((t) => seen.add(t));
  });
  return errs;
}

function build(spec) {
  const errs = validate(spec, spec.known);
  if (errs.length) { const e = new Error('Spec invalid:\n - ' + errs.join('\n - ')); e.errs = errs; throw e; }
  const keys = Object.keys(spec.terms);
  const TERMS = {};
  keys.forEach((k, i) => { TERMS[k] = { t: spec.terms[k].label, c: spec.terms[k].colour || PALETTE[i % PALETTE.length] }; });
  const labels = {};
  keys.forEach((k) => { labels[k] = TERMS[k].t; });

  const nStages = spec.stages.length;
  const stages = spec.stages.map((st, si) => {
    const intro = st.steps.filter((s) => s.type === 'read' || s.type === 'ask').map((s) => s.term);
    const given = st.given || [];
    const nodeKeys = [...given, ...intro];
    const g = layout(nodeKeys, st.edges, labels, st.layout);
    const graph = { h: g.h, nodes: g.nodes, edges: g.edges, given };
    const final = st.steps.findIndex((s) => s.type === 'derive');
    const steps = [{ type: 'title' }];
    st.steps.forEach((s, i) => {
      if (s.type === 'read') steps.push({ type: 'read', term: s.term, text: s.text });
      else if (s.type === 'ask') {
        const o = { type: 'ask', q: s.q, opts: [s.right, s.wrong], ok: 0, hint: s.hint, pre: s.pre, term: s.term };
        if (s.fig) o.fig = s.fig; if (s.diagram) o.diagram = s.diagram; steps.push(o);
      } else if (s.type === 'order') {
        steps.push({ type: 'order', title: `Milestone: ${WORDS[s.terms.length]} chunks`, prompt: s.prompt, order: s.terms, done: 'Four chunks locked in. Your head is clear for the next ones.'.replace('Four', WORDS[s.terms.length][0].toUpperCase() + WORDS[s.terms.length].slice(1)) });
      } else if (s.type === 'chains') {
        let n = 0; const lanes = s.lanes.map((l, li) => ({ label: l.label || 'Chain ' + (li + 1), start: l.start, slots: l.terms.map((t) => ({ id: 'c' + (n++), expect: t })) }));
        const chainTerms = s.lanes.flatMap((l) => l.terms);
        steps.push({ type: 'chains', title: `Milestone: ${WORDS[s.lanes.length]} chains`, prompt: s.prompt, lanes, bank: chainTerms, done: `${WORDS[s.lanes.length][0].toUpperCase() + WORDS[s.lanes.length].slice(1)} chains, one destination. Now: ${s.then || 'what do they lead to?'}` });
      } else if (s.type === 'derive') {
        const open = intro.length;
        const gNames = given.map((k) => TERMS[k].t);
        const opener = given.length ? `${gNames.join(' and ')} ${given.length > 1 ? 'are' : 'is'} already on your map. ` : '';
        const rest = given.length ? 'the rest of this branch' : 'the whole derivation';
        const nextSt = spec.stages[si + 1], lastT = TERMS[intro[intro.length - 1]].t;
        const o = { type: 'derive', title: 'Final test: the whole derivation', prompt: `${opener}Drag and drop the ${open} key term${open === 1 ? '' : 's'} into the boxes to rebuild ${rest} from memory. Chains meet at the concept.` };
        if (nextSt) o.bridge = `${lastT} is on your map. Next on the schedule: ${nextSt.name}. Every prerequisite it needs is met, so it starts now.`;
        steps.push(o);
      } else steps.push(s);
    });
    if (si === nStages - 1) steps.push({ type: 'done' });
    return { name: st.name, hud: `Stage ${si + 1} · ${st.hudName || st.name}`, title: st.title || st.name, sub: st.sub || '', builds: st.builds || given, graph, script: steps, given };
  });
  const PLAN = stages.map((s, i) => ({ name: s.name, needs: spec.stages[i].needs || s.given }));

  const here = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
  let engine = here('engine.js');
  engine = engine.replace(/\(\{ title: buildTitle[^\n]*\)\[step\.type\]\(step\);/, 'BUILDERS[step.type](step);');
  if (!engine.includes('BUILDERS[step.type]')) throw new Error('engine hook missing');
  engine = engine.replace("    var wrap = stack('<div class=\"eyebrow\">What follows?</div><p class=\"big\">' + step.q + '</p>');\n", "    var wrap = stack('<div class=\"eyebrow\">What follows?</div><p class=\"big\">' + step.q + '</p>');\n    if (step.fig && typeof miniFigure === 'function') wrap.appendChild(miniFigure(step.fig));\n    if (step.diagram) wrap.appendChild(diagramEl(step.diagram));\n");

  const widgets = ['diagram'].concat(spec.widgets || []).map((w) => here(path.join('widgets', w + '.js'))).join('\n');
  const done = `
  /* the whole map at the end: a box per stage, linked by the concept that unlocked the next */
  function overview(svg) {
    var n = STAGES.length, gap = 30, bw = Math.floor((1040 - 40 - gap * (n - 1)) / n);
    svg.setAttribute('viewBox', '0 0 1040 330');
    var defs = svgEl('defs', {}, svg), m = svgEl('marker', { id: 'arov', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, defs);
    svgEl('path', { d: 'M0,0 L10,5 L0,10 z', fill: 'var(--edge)' }, m);
    STAGES.forEach(function (st, i) {
      var x = 20 + i * (bw + gap);
      if (i) svgEl('polyline', { points: (x - gap) + ',150 ' + x + ',150', class: 'edge', 'marker-end': 'url(#arov)' }, svg);
      var g = svgEl('g', { class: 'node filled' }, svg);
      var r = svgEl('rect', { x: x, y: 10, width: bw, height: 310, rx: 14, class: 'nrect' }, g); r.style.fill = 'var(--panel)'; r.style.stroke = 'var(--line)';
      var h = svgEl('text', { x: x + 18, y: 40, style: 'font: 600 15px var(--sans); fill: var(--accent); letter-spacing: .06em;' }, g); h.textContent = st.hud.toUpperCase();
      var terms = Object.keys(st.graph.nodes).filter(function (k) { return st.graph.given.indexOf(k) < 0; });
      var w = Math.floor((bw - 34) / 2);
      terms.slice(0, 10).forEach(function (k, j) {
        var col = j % 2, row = Math.floor(j / 2), cx = x + 12 + col * (w + 10), cy = 56 + row * 52;
        var cr = svgEl('rect', { x: cx, y: cy, width: w, height: 44, rx: 10 }, g); cr.style.fill = TERMS[k].c;
        var ct = svgEl('text', { class: 'ntext', x: cx + w / 2, y: cy + 27 }, g); ct.style.fontSize = '12px'; ct.style.fontFamily = 'var(--sans)'; ct.textContent = TERMS[k].t.length > 20 ? TERMS[k].t.slice(0, 19) + '…' : TERMS[k].t;
      });
    });
  }
  function buildDone() {
    completed = STAGES.length;
    var wrap = stack('<span class="milestone">' + STAGES.length + ' lessons, one branch</span><p class="big">' + SUMMARY + '</p>');
    var sw = el('div', 'svgwrap'), svg = document.createElementNS(NS, 'svg'); sw.appendChild(svg); wrap.appendChild(sw);
    wrap.appendChild(el('div', '', scheduleHtml()));
    var actions = el('div', 'actions');
    var again = el('button', 'btn', 'Do it all again from the start'); again.type = 'button'; again.addEventListener('click', restart); actions.appendChild(again);
    wrap.appendChild(actions);
    slide(wrap);
    overview(svg);
  }
`;
  const first = stages[0], lastKeyOf = (s) => Object.keys(s.graph.nodes).pop();
  const summary = stages.map((s) => s.title).join(' → ');
  const head = `(function () {
  'use strict';
  /* ${spec.subject}: ${spec.title}. Built offline from ${spec.id}. */
  var TERMS = ${JSON.stringify(TERMS)};
  var CAP = 4, DAY = 86400000;
  var STAGES = ${JSON.stringify(stages, null, 1)};
  var PLAN = ${JSON.stringify(PLAN)};
  var SUMMARY = ${JSON.stringify(summary)};
`;
  const title = `
  function buildTitle() {
    var st = STAGES[stageIdx], count = Object.keys(st.graph.nodes).length - st.graph.given.length;
    var builds = st.builds.length ? st.builds.map(function (k) { return termHtml(k); }).join(' ') : '<span class="hint">nothing: this is where the course starts</span>';
    var wrap = stack('<span class="milestone">Lesson ' + (stageIdx + 1) + ' of ' + STAGES.length + '</span><h2 class="title">' + st.title + '</h2><p class="big sub">' + st.sub + '</p>' +
      '<div class="facts"><div><span class="eyebrow">Builds on</span><div class="chips">' + builds + '</div></div><div><span class="eyebrow">You will derive</span><div class="hint">' + count + ' key terms, in chunks of no more than four</div></div></div><div class="down">Scroll ↓</div>');
    var s = slide(wrap), done = false;
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting && e.intersectionRatio > 0.6 && !done) { done = true; io.disconnect(); next(false); } }); }, { root: feed, threshold: [0.6] });
    io.observe(s);
  }
`;
  const map = `
  var BUILDERS = { title: buildTitle, read: buildRead, ask: buildAsk, order: buildOrder, chains: buildChains, derive: buildDerive, done: buildDone };
  if (typeof buildShow === 'function') BUILDERS.show = buildShow;
  if (typeof buildDraw === 'function') BUILDERS.draw = buildDraw;
`;
  const js = head + engine + title + widgets + here('schedule.js') + done + map + here('tail.js');
  let html = here('shell.html').replace('/*SCRIPT*/', () => js);
  html = html.replace('<title>Derivation Feed</title>', `<title>${spec.pageTitle || spec.title}</title>`);
  html = html.replace('<h1 id="stageTitle">Stage 1 · Scarcity</h1>', `<h1 id="stageTitle">${first.hud}</h1>`);
  html = html.replace('</style>', () => fs.readFileSync(path.join(__dirname, 'extra.css'), 'utf8') + '</style>');
  return { html, js, stages };
}

if (require.main === module) {
  const specPath = process.argv[2], out = process.argv[3] || specPath.replace(/\.json$/, '.html');
  const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  try {
    const { html, js } = build(spec);
    fs.writeFileSync(out, html);
    new Function(js); // syntax check
    console.log('built', out, `${(html.length / 1024).toFixed(0)} KB`);
  } catch (e) { console.error(e.message); process.exit(1); }
}

module.exports = { build, validate };
