  /* ---- the economics drawing tool: axes, an animated example, and a curve the student draws ---- */
  var PX = { ox: 70, oy: 340, W: 430, H: 290 };
  function ppfPoint(t, u) { return [PX.ox + PX.W * t, PX.oy - PX.H * u]; }
  function ppfY(t) { return Math.sqrt(Math.max(0, 1 - t * t)); }
  function ppfPath() { var d = ''; for (var i = 0; i <= 60; i++) { var t = i / 60, p = ppfPoint(t, ppfY(t)); d += (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1); } return d; }
  function axes(svg) {
    svg.setAttribute('viewBox', '0 0 560 400'); svg.setAttribute('class', 'dia');
    for (var i = 1; i <= 4; i++) {
      svgEl('line', { x1: PX.ox, x2: PX.ox + PX.W + 20, y1: PX.oy - (PX.H / 4) * i, y2: PX.oy - (PX.H / 4) * i, class: 'dgrid' }, svg);
      svgEl('line', { y1: PX.oy, y2: PX.oy - PX.H - 20, x1: PX.ox + (PX.W / 4) * i, x2: PX.ox + (PX.W / 4) * i, class: 'dgrid' }, svg);
    }
    svgEl('line', { x1: PX.ox, y1: PX.oy, x2: PX.ox + PX.W + 34, y2: PX.oy, class: 'dax' }, svg);
    svgEl('line', { x1: PX.ox, y1: PX.oy, x2: PX.ox, y2: PX.oy - PX.H - 34, class: 'dax' }, svg);
    var xl = svgEl('text', { x: PX.ox + PX.W / 2, y: PX.oy + 44, class: 'dlab', 'text-anchor': 'middle' }, svg); xl.textContent = 'Bottled water (units)';
    var yl = svgEl('text', { x: 22, y: PX.oy - PX.H / 2, class: 'dlab', 'text-anchor': 'middle', transform: 'rotate(-90 22 ' + (PX.oy - PX.H / 2) + ')' }, svg); yl.textContent = 'Phones (units)';
    var o = svgEl('text', { x: PX.ox - 12, y: PX.oy + 18, class: 'dlab', 'text-anchor': 'end' }, svg); o.textContent = '0';
  }
  function dot(svg, t, u, label, cls) {
    var p = ppfPoint(t, u), g = svgEl('g', { class: 'dpt ' + (cls || '') }, svg);
    svgEl('circle', { cx: p[0], cy: p[1], r: 8 }, g);
    if (label) { var tx = svgEl('text', { x: p[0] + 14, y: p[1] - 10, class: 'dlab' }, g); tx.textContent = label; }
    return g;
  }
  /* a small figure inside a question: the frontier as dots, or a point beyond or inside it */
  function miniFigure(kind) {
    var box = el('div', 'svgwrap fig'), svg = document.createElementNS(NS, 'svg'); box.appendChild(svg); axes(svg);
    if (kind === 'dots') { for (var i = 0; i <= 8; i++) { var t = i / 8; dot(svg, t, ppfY(t), '', 'plain'); } }
    else { svgEl('path', { d: ppfPath(), class: 'dcurve' }, svg); if (kind === 'beyond') dot(svg, 0.8, 0.82, 'D', 'out'); else dot(svg, 0.45, 0.5, 'C', 'in'); }
    return box;
  }

  function buildShow() {
    var wrap = stack('<span class="milestone">Example</span><p class="big">Here is a production possibility frontier, drawn.</p>');
    var box = el('div', 'svgwrap'), svg = document.createElementNS(NS, 'svg'); box.appendChild(svg); axes(svg);
    var cap = el('div', 'cap', 'Watch the line appear.'), again = el('button', 'btn ghostbtn', 'Replay'); again.type = 'button';
    wrap.appendChild(box); wrap.appendChild(cap); wrap.appendChild(again);
    var s = slide(wrap), timers = [], started = false, curve = null, extras = [];
    function clear() { timers.forEach(clearTimeout); timers = []; extras.forEach(function (e) { e.remove(); }); extras = []; if (curve) curve.remove(); }
    function play() {
      clear();
      curve = svgEl('path', { d: ppfPath(), class: 'dcurve draw' }, svg);
      var len = curve.getTotalLength ? curve.getTotalLength() : 700; curve.style.strokeDasharray = len; curve.style.strokeDashoffset = len;
      curve.getBoundingClientRect(); curve.style.transition = 'stroke-dashoffset 1.6s ease'; curve.style.strokeDashoffset = 0;
      cap.textContent = 'The line shows the most the country can make of one good for each amount of the other.';
      function at(ms, fn) { timers.push(setTimeout(fn, ms)); }
      at(2000, function () { extras.push(dot(svg, 0.3, ppfY(0.3), 'A', 'on')); extras.push(dot(svg, 0.8, ppfY(0.8), 'B', 'on')); cap.textContent = 'A and B: every resource is in use. Moving from A to B gives more water and fewer phones. What is given up is the opportunity cost.'; });
      at(4600, function () { extras.push(dot(svg, 0.45, 0.5, 'C', 'in')); cap.textContent = 'C is inside the line: some resources are unused or wasted.'; });
      at(6800, function () { extras.push(dot(svg, 0.8, 0.82, 'D', 'out')); cap.textContent = 'D is beyond the line: unattainable with the resources the country has.'; });
    }
    again.addEventListener('click', play);
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting && e.intersectionRatio > 0.6 && !started) { started = true; play(); next(false); } }); }, { root: feed, threshold: [0.6] });
    io.observe(s);
  }

  function smoothPath(pts) {
    if (pts.length < 2) return '';
    var d = 'M' + pts[0][0] + ',' + pts[0][1];
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      d += 'C' + (p1[0] + (p2[0] - p0[0]) / 6) + ',' + (p1[1] + (p2[1] - p0[1]) / 6) + ' ' + (p2[0] - (p3[0] - p1[0]) / 6) + ',' + (p2[1] - (p3[1] - p1[1]) / 6) + ' ' + p2[0] + ',' + p2[1];
    }
    return d;
  }
  function gradeCurve(pts) {
    if (pts.length < 4) return 'Place at least 4 points along the curve.';
    var p = pts.slice().sort(function (a, b) { return a[0] - b[0]; }).map(function (q) { return { x: (q[0] - PX.ox) / PX.W, y: (PX.oy - q[1]) / PX.H }; });
    var first = p[0], last = p[p.length - 1];
    if (first.x > 0.15 || first.y < 0.6) return 'Start on the phones axis, high up on the left. That is the most phones, with no water.';
    if (last.y > 0.15 || last.x < 0.6) return 'End on the water axis, far to the right. That is the most water, with no phones.';
    for (var i = 1; i < p.length; i++) if (p[i].y > p[i - 1].y + 0.03) return 'The line must slope downwards: more water means fewer phones.';
    for (var j = 1; j < p.length - 1; j++) { var chord = first.y + (last.y - first.y) * (p[j].x - first.x) / (last.x - first.x); if (p[j].y < chord + 0.02) return 'Bow the curve outwards, away from the corner. Shifting the first resources costs little; the last ones cost a lot.'; }
    return '';
  }
  function buildDraw(step) {
    var wrap = stack('<span class="milestone">' + step.title + '</span><p class="big">' + step.prompt + '</p>');
    var box = el('div', 'svgwrap tool'), svg = document.createElementNS(NS, 'svg'); box.appendChild(svg); axes(svg);
    var bar = el('div', 'toolbar'), undo = el('button', 'hbtn', 'Undo point'), clr = el('button', 'hbtn', 'Clear'), count = el('span', 'hint', '0 points');
    undo.type = 'button'; clr.type = 'button'; bar.appendChild(undo); bar.appendChild(clr); bar.appendChild(count);
    var btn = el('button', 'btn', 'Check my curve'), note = el('div', 'note'); btn.type = 'button'; btn.disabled = true;
    wrap.appendChild(bar); wrap.appendChild(box); wrap.appendChild(btn); wrap.appendChild(note);
    slide(wrap);
    var pts = [], path = svgEl('path', { class: 'dcurve mine' }, svg), dots = svgEl('g', {}, svg), drag = -1, locked = false;
    function draw() {
      var sorted = pts.slice().sort(function (a, b) { return a[0] - b[0]; });
      path.setAttribute('d', smoothPath(sorted));
      dots.innerHTML = '';
      pts.forEach(function (p, i) { var c = svgEl('circle', { cx: p[0], cy: p[1], r: 8, class: 'handle' }, dots); c.dataset.i = i; });
      count.textContent = pts.length + (pts.length === 1 ? ' point' : ' points'); btn.disabled = pts.length < 4 || locked;
    }
    function spot(e) { var r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal; return [Math.max(PX.ox - 4, Math.min(PX.ox + PX.W + 20, (e.clientX - r.left) * vb.width / r.width)), Math.max(PX.oy - PX.H - 20, Math.min(PX.oy + 4, (e.clientY - r.top) * vb.height / r.height))]; }
    svg.addEventListener('pointerdown', function (e) {
      if (locked) return; e.preventDefault();
      var p = spot(e), near = -1;
      pts.forEach(function (q, i) { if (Math.hypot(q[0] - p[0], q[1] - p[1]) < 16) near = i; });
      if (near > -1) { drag = near; svg.setPointerCapture(e.pointerId); }
      else if (pts.length < 7) { pts.push(p); note.textContent = ''; draw(); }
    });
    svg.addEventListener('pointermove', function (e) { if (drag > -1) { pts[drag] = spot(e); draw(); } });
    svg.addEventListener('pointerup', function () { drag = -1; });
    undo.addEventListener('click', function () { if (!locked) { pts.pop(); draw(); } });
    clr.addEventListener('click', function () { if (!locked) { pts = []; note.textContent = ''; draw(); } });
    btn.addEventListener('click', function () {
      var msg = gradeCurve(pts);
      if (msg) { note.style.color = 'var(--bad)'; note.textContent = msg; path.classList.add('bad'); setTimeout(function () { path.classList.remove('bad'); }, 600); return; }
      locked = true; btn.disabled = true; path.classList.add('good'); note.style.color = 'var(--good)';
      note.textContent = 'That is a production possibility frontier: downhill, and bowed outwards. Now use it.';
      setTimeout(function () { next(true); }, 2200);
    });
    draw();
  }

