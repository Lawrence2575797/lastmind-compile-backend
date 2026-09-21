  var feed = document.getElementById('feed'), tray = document.getElementById('tray'), pipEls = Array.prototype.slice.call(document.querySelectorAll('.pips i'));
  var pipText = document.getElementById('pipText'), stageTitle = document.getElementById('stageTitle');
  var stageIdx = 0, idx = -1, held = 0, collected = [], completed = 0;

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function termHtml(k, extra) { return '<span class="term ' + (extra || '') + '" style="--tc:' + TERMS[k].c + '">' + TERMS[k].t + '</span>'; }
  function shuffle(a) { var b = a.slice(); for (var i = b.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = b[i]; b[i] = b[j]; b[j] = t; } if (b.join() === a.join() && b.length > 2) b.push(b.shift()); return b; }
  function script() { return STAGES[stageIdx].script; }

  function setHeld(n) {
    held = Math.max(0, n);
    pipEls.forEach(function (p, i) { p.classList.toggle('on', i < held); });
    pipText.textContent = held + ' of ' + CAP;
  }
  function collect(k) {
    if (collected.indexOf(k) > -1) return;
    collected.push(k);
    var empty = document.getElementById('trayEmpty'); if (empty) empty.remove();
    var last = tray.lastElementChild;
    if (last && last.tagName !== 'B' && !last.classList.contains('stagemark')) tray.appendChild(el('span', 'sep', '→'));
    var w = el('span', '', termHtml(k)); tray.appendChild(w); w.firstChild.classList.add('pop');
    tray.scrollLeft = tray.scrollWidth;
  }
  function chunk(k) { collect(k); setHeld(held + 1); }
  function scrollToLast() { var s = feed.lastElementChild; if (s) setTimeout(function () { s.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 700); }
  function slide(inner) { var s = el('section', 'slide'); var c = el('div', 'card'); c.appendChild(inner); s.appendChild(c); feed.appendChild(s); return s; }
  function stack(html) { var w = el('div', '', html); w.style.display = 'grid'; w.style.gap = '20px'; return w; }

  /* ---- the engine: build the next step only when the last is done, so nothing can be skipped ---- */
  function next(scrollTo) {
    idx++;
    var step = script()[idx]; if (!step) return;
    ({ title: buildTitle, read: buildRead, ask: buildAsk, order: buildOrder, chains: buildChains, show: buildShow, derive: buildDerive, done: buildDone })[step.type](step);
    if (scrollTo) scrollToLast();
  }

  function buildTitle() {
    var st = STAGES[stageIdx], count = script().filter(function (s) { return (s.type === 'read' || s.type === 'ask') && s.term; }).length;
    var builds = st.builds.length ? st.builds.map(function (k) { return termHtml(k); }).join(' ') : '<span class="hint">nothing: this is where the course starts</span>';
    var wrap = stack('<span class="milestone">Lesson ' + (stageIdx + 1) + ' of ' + STAGES.length + '</span><h2 class="title">' + st.title + '</h2><p class="big sub">' + st.sub + '</p>' +
      '<div class="facts"><div><span class="eyebrow">Builds on</span><div class="chips">' + builds + '</div></div><div><span class="eyebrow">You will derive</span><div class="hint">' + count + ' key terms, in chunks of no more than four</div></div></div><div class="down">Scroll ↓</div>');
    var s = slide(wrap), done = false;
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting && e.intersectionRatio > 0.6 && !done) { done = true; io.disconnect(); next(false); } }); }, { root: feed, threshold: [0.6] });
    io.observe(s);
  }

  function buildRead(step) {
    var wrap = stack('<div class="eyebrow">Read</div><p class="big">' + step.text + termHtml(step.term, 'pop') + '.</p><div class="down">Scroll ↓</div>');
    var s = slide(wrap), done = false;
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting && e.intersectionRatio > 0.6 && !done) { done = true; io.disconnect(); chunk(step.term); next(false); } });
    }, { root: feed, threshold: [0.6] });
    io.observe(s);
  }

  function buildAsk(step) {
    var wrap = stack('<div class="eyebrow">What follows?</div><p class="big">' + step.q + '</p>');
    var opts = el('div', 'opts'), note = el('div', 'note'), out = el('div', 'reveal'); out.hidden = true;
    (Math.random() < 0.5 ? [0, 1] : [1, 0]).forEach(function (i) {
      var b = el('button', 'opt', step.opts[i]); b.type = 'button';
      b.addEventListener('click', function () {
        if (i !== step.ok) { b.classList.add('wrong'); note.textContent = step.hint; setTimeout(function () { b.classList.remove('wrong'); }, 500); return; }
        b.classList.add('right'); note.textContent = '';
        Array.prototype.forEach.call(opts.children, function (o) { o.disabled = true; });
        out.hidden = false; out.innerHTML = '<span>' + step.pre + '</span>' + termHtml(step.term, 'pop');
        chunk(step.term);
        setTimeout(function () { next(true); }, 1500);
      });
      opts.appendChild(b);
    });
    wrap.appendChild(opts); wrap.appendChild(note); wrap.appendChild(out);
    slide(wrap);
  }

  /* ---- a shared board: tap a term then a box, or drag it across; every box knows what it expects ---- */
  function board(cfg) {
    var placed = {}, locked = {}, sel = null, chips = {};
    cfg.bank.forEach(function (k) {
      var c = el('button', 'chip', TERMS[k].t); c.type = 'button'; c.draggable = true; c.style.setProperty('--tc', TERMS[k].c);
      c.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/plain', k); sel = k; });
      c.addEventListener('click', function () {
        if (cfg.auto) { var free = cfg.slots.filter(function (s) { return !placed[s.id]; })[0]; if (free) return put(k, free.id); }
        sel = sel === k ? null : k; render();
      });
      chips[k] = c; cfg.bankEl.appendChild(c);
    });
    function render() {
      cfg.slots.forEach(function (s) { var k = placed[s.id]; s.paint(k || null, locked[s.id] ? 'good' : ''); });
      Object.keys(chips).forEach(function (k) { var used = Object.keys(placed).some(function (id) { return placed[id] === k; }); chips[k].hidden = used; chips[k].classList.toggle('sel', sel === k); });
      cfg.btn.disabled = cfg.slots.some(function (s) { return !placed[s.id]; });
    }
    function put(k, sid) {
      if (locked[sid]) return;
      Object.keys(placed).forEach(function (id) { if (placed[id] === k && !locked[id]) delete placed[id]; });
      placed[sid] = k; sel = null; render();
    }
    cfg.slots.forEach(function (s) {
      s.el.addEventListener('click', function () { if (sel) put(sel, s.id); else if (placed[s.id] && !locked[s.id]) { delete placed[s.id]; render(); } });
      s.el.addEventListener('dragover', function (e) { e.preventDefault(); s.el.classList.add('over'); });
      s.el.addEventListener('dragleave', function () { s.el.classList.remove('over'); });
      s.el.addEventListener('drop', function (e) { e.preventDefault(); s.el.classList.remove('over'); var k = e.dataTransfer.getData('text/plain'); if (chips[k]) put(k, s.id); });
    });
    cfg.btn.addEventListener('click', function () {
      var allOk = true;
      var verdict = cfg.judge ? cfg.judge(placed) : null;
      cfg.slots.forEach(function (s) {
        if (verdict ? verdict[s.id] : placed[s.id] === s.expect) { locked[s.id] = true; }
        else { allOk = false; s.paint(placed[s.id], 'bad'); (function (id) { setTimeout(function () { if (!locked[id]) delete placed[id]; render(); }, 650); })(s.id); }
      });
      render();
      if (allOk) { cfg.btn.disabled = true; cfg.note.textContent = ''; cfg.onSolved(); }
      else cfg.note.textContent = 'Some are in the wrong place. The right ones stay put; rework the others.';
    });
    render();
  }

  function slotHtml(container, k, state, label) {
    container.className = container.className.replace(/\b(good|bad)\b/g, '').replace(/\s+/g, ' ').trim() + (state ? ' ' + state : '');
    container.innerHTML = (label ? '<span class="n">' + label + '</span>' : '') + (k ? termHtml(k) : '<span>drop here</span>');
  }
  function milestoneDone(note, msg) { note.style.color = 'var(--good)'; note.textContent = msg; setHeld(0); setTimeout(function () { next(true); }, 1400); }

  function buildOrder(step) {
    var wrap = stack('<span class="milestone">' + step.title + '</span><p class="big">' + step.prompt + '</p>');
    var slots = el('div', 'slots'), bank = el('div', 'bank'), btn = el('button', 'btn', 'Check the order'), note = el('div', 'note'); btn.type = 'button';
    var defs = step.order.map(function (k, i) {
      var s = el('div', 'slot'); s.tabIndex = 0; slots.appendChild(s);
      return { id: 's' + i, expect: k, el: s, paint: function (t, st) { slotHtml(s, t, st, String(i + 1)); } };
    });
    wrap.appendChild(slots); wrap.appendChild(bank); wrap.appendChild(btn); wrap.appendChild(note);
    slide(wrap);
    board({ slots: defs, bank: shuffle(step.order), bankEl: bank, btn: btn, note: note, auto: true, onSolved: function () { milestoneDone(note, step.done); } });
  }

  function buildPrereq(step) {
    var wrap = stack('<span class="milestone">' + step.title + '</span><p class="big">' + step.prompt + '</p>');
    var slots = el('div', 'slots'), bank = el('div', 'bank'), btn = el('button', 'btn', 'Check scarcity'), note = el('div', 'note'); btn.type = 'button';
    var defs = step.slots.map(function (sl) {
      var s = el('div', 'slot'); s.tabIndex = 0; slots.appendChild(s);
      return { id: sl.id, expect: sl.expect, el: s, paint: function (t, st) { slotHtml(s, t, st, sl.label); } };
    });
    wrap.appendChild(slots); wrap.appendChild(bank); wrap.appendChild(btn); wrap.appendChild(note);
    slide(wrap);
    board({ slots: defs, bank: shuffle(step.bank), bankEl: bank, btn: btn, note: note, onSolved: function () { milestoneDone(note, step.done); } });
  }

  function buildChains(step) {
    var wrap = stack('<span class="milestone">' + step.title + '</span><p class="big">' + step.prompt + '</p>');
    var lanes = el('div', 'lanes'), left = el('div', 'l'), join = el('div', 'join'), defs = [];
    step.lanes.forEach(function (ln) {
      var l = el('div', 'lane'); l.appendChild(el('span', 'hint', ln.label));
      if (ln.start) l.insertAdjacentHTML('beforeend', termHtml(ln.start) + '<span class="arrow">→</span>');
      ln.slots.forEach(function (sl, i) {
        if (i) l.appendChild(el('span', 'arrow', '→'));
        var s = el('div', 'slot'); s.tabIndex = 0; l.appendChild(s);
        defs.push({ id: sl.id, el: s, expect: sl.expect, paint: function (t, st) { slotHtml(s, t, st, ''); } });
      });
      l.appendChild(el('span', 'arrow', '→')); left.appendChild(l);
    });
    join.appendChild(el('div', 'locked', '?')); join.appendChild(el('span', 'hint', 'the concept both chains lead to'));
    lanes.appendChild(left); lanes.appendChild(join);
    var bank = el('div', 'bank'), btn = el('button', 'btn', 'Check the chains'), note = el('div', 'note'); btn.type = 'button';
    wrap.appendChild(lanes); wrap.appendChild(bank); wrap.appendChild(btn); wrap.appendChild(note);
    slide(wrap);
    /* two lanes of the same shape (same start, same length) are interchangeable: it does not matter which one is on top */
    var laneIds = step.lanes.map(function (ln, li) { return { start: ln.start || '', ids: ln.slots.map(function (sl) { return sl.id; }), exp: ln.slots.map(function (sl) { return sl.expect; }) }; });
    function judge(placed) {
      var v = {};
      defs.forEach(function (d) { v[d.id] = placed[d.id] === d.expect; });
      var groups = {};
      laneIds.forEach(function (l, i) { var key = l.start + '|' + l.ids.length; (groups[key] = groups[key] || []).push(i); });
      Object.keys(groups).forEach(function (key) {
        var g = groups[key]; if (g.length < 2) return;
        var used = {}, ok = true;
        g.forEach(function (i) {
          var seq = laneIds[i].ids.map(function (id) { return placed[id]; }), hit = -1;
          g.forEach(function (j) { if (hit < 0 && !used[j] && seq.every(function (t, n) { return t === laneIds[j].exp[n]; })) hit = j; });
          if (hit < 0) ok = false; else used[hit] = true;
        });
        if (ok) g.forEach(function (i) { laneIds[i].ids.forEach(function (id) { v[id] = true; }); });
      });
      return v;
    }
    board({ slots: defs, bank: shuffle(step.bank), bankEl: bank, btn: btn, note: note, judge: judge, onSolved: function () { milestoneDone(note, step.done); } });
  }

  /* ---- a derivation drawn as a graph ---- */
  var NS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs, parent) { var e = document.createElementNS(NS, tag); Object.keys(attrs || {}).forEach(function (a) { e.setAttribute(a, attrs[a]); }); if (parent) parent.appendChild(e); return e; }
  function wrapLabel(text) { if (text.length <= 15) return [text]; var cut = text.lastIndexOf(' ', 14); if (cut < 1) cut = 12; return [text.slice(0, cut), text.slice(cut).trim()]; }
  function setLabel(t, n, text) {
    t.textContent = ''; var lines = wrapLabel(text);
    lines.forEach(function (w, j) { var ts = svgEl('tspan', { x: n[0] + n[2] / 2, dy: j === 0 ? (lines.length > 1 ? -8 : 0) : 22 }, t); ts.textContent = w; });
  }
  function graph(svg, g, opts) {
    svg.setAttribute('viewBox', '0 0 1040 ' + (opts.h || g.h));
    var defs = svgEl('defs', {}, svg), m = svgEl('marker', { id: 'ar' + opts.uid, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, defs);
    svgEl('path', { d: 'M0,0 L10,5 L0,10 z', fill: 'var(--edge)' }, m);
    g.edges.forEach(function (pts, i) {
      var p = svgEl('polyline', { points: pts.map(function (q) { return q.join(','); }).join(' '), class: 'edge' + (opts.animate ? ' draw' : ''), 'marker-end': 'url(#ar' + opts.uid + ')' }, svg);
      if (opts.animate) p.style.animationDelay = (i * 0.35) + 's';
    });
    var slots = {};
    Object.keys(g.nodes).forEach(function (k, i) {
      var n = g.nodes[k], filled = opts.filled || g.given.indexOf(k) > -1;
      var grp = svgEl('g', { class: 'node' + (filled ? ' filled' : ''), tabindex: filled ? '-1' : '0' }, svg);
      var r = svgEl('rect', { x: n[0], y: n[1], width: n[2], height: n[3], rx: 12, class: 'nrect' }, grp);
      if (filled) { r.style.fill = TERMS[k].c; if (opts.animate) { r.style.opacity = 0; r.style.transition = 'opacity .5s ' + (i * 0.3) + 's'; requestAnimationFrame(function () { r.style.opacity = 1; }); } }
      var t = svgEl('text', { class: 'ntext' + (filled ? '' : ' q'), x: n[0] + n[2] / 2, y: n[1] + n[3] / 2 + 7 }, grp);
      setLabel(t, n, filled ? TERMS[k].t : '?');
      slots[k] = { g: grp, r: r, t: t, n: n };
    });
    return slots;
  }

  function buildDerive(step) {
    var st = STAGES[stageIdx], g = st.graph;
    var wrap = stack('<span class="milestone">' + step.title + '</span><p class="big">' + step.prompt + '</p>');
    var sw = el('div', 'svgwrap'), svg = document.createElementNS(NS, 'svg'); sw.appendChild(svg);
    var bank = el('div', 'bank'), btn = el('button', 'btn', 'Check the derivation'), note = el('div', 'note'); btn.type = 'button';
    wrap.appendChild(sw); wrap.appendChild(bank); wrap.appendChild(btn); wrap.appendChild(note);
    slide(wrap);
    var nodes = graph(svg, g, { uid: 'd' + stageIdx });
    var open = Object.keys(g.nodes).filter(function (k) { return g.given.indexOf(k) < 0; });
    var defs = open.map(function (k) {
      var nd = nodes[k];
      return { id: k, expect: k, el: nd.g, paint: function (t, s2) {
        nd.g.setAttribute('class', 'node' + (t ? ' filled' : '') + (s2 ? ' ' + s2 : ''));
        nd.r.style.fill = t ? TERMS[t].c : 'transparent';
        nd.t.setAttribute('class', 'ntext' + (t ? '' : ' q')); setLabel(nd.t, nd.n, t ? TERMS[t].t : '?');
      } };
    });
    /* a placement is right when it fits the shape of the graph: every link in the graph is a link between the terms placed there, so two
       identical branches can be filled either way round */
    function judge(placed) {
      var v = {}, phi = {}, seen = {}, fits = true;
      defs.forEach(function (d) { v[d.id] = placed[d.id] === d.expect; });
      g.given.forEach(function (k) { phi[k] = k; });
      open.forEach(function (k) { phi[k] = placed[k]; if (!placed[k] || seen[placed[k]]) fits = false; seen[placed[k]] = true; });
      var edgeSet = {}; (g.pairs || []).forEach(function (p) { edgeSet[p[0] + '>' + p[1]] = true; });
      if (fits && g.pairs) g.pairs.forEach(function (p) { if (!edgeSet[phi[p[0]] + '>' + phi[p[1]]]) fits = false; });
      if (fits && g.pairs) defs.forEach(function (d) { v[d.id] = true; });
      return v;
    }
    board({ slots: defs, bank: shuffle(open), bankEl: bank, btn: btn, note: note, judge: judge, onSolved: function () {
      note.style.color = 'var(--good)'; setHeld(0); completed = stageIdx + 1;
      if (step.bridge && stageIdx < STAGES.length - 1) { note.textContent = step.bridge; setTimeout(function () { startStage(stageIdx + 1); }, 3200); }
      else { note.textContent = 'Every term, in every chain. That is the whole derivation.'; setTimeout(function () { next(true); }, 1600); }
    } });
  }

