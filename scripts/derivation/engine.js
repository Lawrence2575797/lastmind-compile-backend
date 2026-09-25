  var feed = document.getElementById('feed'), tray = document.getElementById('tray'), pipEls = Array.prototype.slice.call(document.querySelectorAll('.pips i'));
  var pipText = document.getElementById('pipText'), stageTitle = document.getElementById('stageTitle');
  var stageIdx = 0, idx = -1, held = 0, collected = [], completed = 0;

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function termHtml(k, extra) { return '<span class="term ' + (extra || '') + '" style="--tc:' + TERMS[k].c + '">' + TERMS[k].t + '</span>'; }
  /* typesets the plain-text maths conventions authored content uses (K^0.5, dQ/dK, lambda, sqrt(4), px) into real
     superscripts, a stacked fraction and proper symbols, so a question reads like real maths, not source code. */
  function mathify(s) {
    if (!s) return s;
    return String(s)
      .replace(/\bd([A-Za-zπΔλ][A-Za-z0-9]*)\s*\/\s*d([A-Za-zπΔλ][A-Za-z0-9]*)\b/g,
        '<span class="mfrac"><span class="n">d$1</span><span class="d">d$2</span></span>')
      .replace(/\^\((-?[0-9.]+)\)/g, '<sup>$1</sup>')
      .replace(/\^(-?[0-9.]+)/g, '<sup>$1</sup>')
      .replace(/\blambda\*/gi, 'λ*').replace(/\blambda\b/gi, 'λ')
      .replace(/\bDelta\s*([A-Za-z])/g, 'Δ$1')
      .replace(/\bpi\b(?=\s*[\(\s])/gi, 'π')
      .replace(/\bsqrt\(([^)]+)\)/gi, '√($1)')
      .replace(/\bp([xy])\b/g, 'p<sub>$1</sub>');
  }
  function shuffle(a) { var b = a.slice(); for (var i = b.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = b[i]; b[i] = b[j]; b[j] = t; } if (b.join() === a.join() && b.length > 2) b.push(b.shift()); return b; }
  function script() { return STAGES[stageIdx].script; }

  function setHeld(n) {
    held = Math.max(0, n);
    pipEls.forEach(function (p, i) { p.classList.toggle('on', i < held); });
    pipText.textContent = Math.min(held, CAP) + ' of ' + CAP;
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
    var st = STAGES[stageIdx], count = script().filter(function (s) { return (s.type === 'read' || s.type === 'ask' || s.type === 'calc') && s.term; }).length;
    var builds = st.builds.length ? st.builds.map(function (k) { return termHtml(k); }).join(' ') : '<span class="hint">nothing: this is where the course starts</span>';
    var wrap = stack('<span class="milestone">Lesson ' + (stageIdx + 1) + ' of ' + STAGES.length + '</span><h2 class="title">' + st.title + '</h2><p class="big sub">' + st.sub + '</p>' +
      '<div class="facts"><div><span class="eyebrow">Builds on</span><div class="chips">' + builds + '</div></div><div><span class="eyebrow">You will derive</span><div class="hint">' + count + ' key terms, in chunks of no more than four</div></div></div><div class="down">Scroll ↓</div>');
    var s = slide(wrap), done = false;
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting && e.intersectionRatio > 0.6 && !done) { done = true; io.disconnect(); next(false); } }); }, { root: feed, threshold: [0.6] });
    io.observe(s);
  }

  function buildRead(step) {
    var wrap = stack('<div class="eyebrow">Read</div><p class="big">' + mathify(step.text) + termHtml(step.term, 'pop') + '.</p><div class="down">Scroll ↓</div>');
    var s = slide(wrap), done = false;
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting && e.intersectionRatio > 0.6 && !done) { done = true; io.disconnect(); chunk(step.term); next(false); } });
    }, { root: feed, threshold: [0.6] });
    io.observe(s);
  }

  function buildAsk(step) {
    var wrap = stack('<div class="eyebrow">What follows?</div><p class="big">' + mathify(step.q) + '</p>');
    var opts = el('div', 'opts'), note = el('div', 'note'), out = el('div', 'reveal'); out.hidden = true;
    (Math.random() < 0.5 ? [0, 1] : [1, 0]).forEach(function (i) {
      var b = el('button', 'opt', mathify(step.opts[i])); b.type = 'button';
      b.addEventListener('click', function () {
        if (i !== step.ok) { b.classList.add('wrong'); note.textContent = step.hint; setTimeout(function () { b.classList.remove('wrong'); }, 500); return; }
        b.classList.add('right'); note.textContent = '';
        Array.prototype.forEach.call(opts.children, function (o) { o.disabled = true; });
        out.hidden = false; out.innerHTML = '<span>' + mathify(step.pre) + '</span>' + termHtml(step.term, 'pop');
        chunk(step.term);
        setTimeout(function () { next(true); }, 1500);
      });
      opts.appendChild(b);
    });
    wrap.appendChild(opts); wrap.appendChild(note); wrap.appendChild(out);
    slide(wrap);
  }

  /* ── the real maths answer box, ported verbatim from learn/index.html's createMathShortcutEditor - same
     contenteditable editor and keyboard shortcuts as node-review/lesson calculation answers site-wide. */
  var MATH_SHORTCUT_GREEK_MAP = {
    'a': { lower: 'α', upper: 'Α' }, 'b': { lower: 'β', upper: 'Β' },
    'd': { lower: 'δ', upper: 'Δ' }, 'y': { lower: 'γ', upper: 'Γ' },
    'u': { lower: 'μ', upper: 'Μ' }, 'p': { lower: 'π', upper: 'Π' },
    't': { lower: 'θ', upper: 'Θ' }, 's': { lower: 'σ', upper: 'Σ' },
    'l': { lower: 'λ', upper: 'Λ' }, 'w': { lower: 'ω', upper: 'Ω' },
    'x': { lower: 'χ', upper: 'Χ' },
  };
  var MATH_SHORTCUT_TWO_CHAR = { '<=': '≤', '>=': '≥', '!=': '≠' };
  var MATH_SHORTCUT_ZWS = '​';

  function createMathShortcutEditor(placeholder) {
    var wrap = el('div', 'math-shortcut-wrap');
    var editor = document.createElement('div');
    editor.className = 'math-shortcut-editor';
    editor.contentEditable = 'true';
    editor.dataset.placeholder = placeholder || 'Type your answer…';
    wrap.appendChild(editor);
    var hint = el('div', 'math-shortcut-hint', 'Shortcuts: ^ power, _ subscript, / fraction, Shift+letter Greek, * ×, ~ √');
    wrap.appendChild(hint);

    function insertStyledSymbol(text) {
      var sel = window.getSelection(); if (!sel.rangeCount) return null;
      var range = sel.getRangeAt(0); range.deleteContents();
      var span = document.createElement('i'); span.className = 'math-symbol'; span.textContent = text;
      var landing = document.createTextNode(MATH_SHORTCUT_ZWS);
      var frag = document.createDocumentFragment(); frag.appendChild(span); frag.appendChild(landing);
      range.insertNode(frag);
      var after = document.createRange(); after.setStart(landing, 1); after.collapse(true);
      sel.removeAllRanges(); sel.addRange(after);
      return span;
    }
    function startZone(tag) {
      var sel = window.getSelection(); if (!sel.rangeCount) return;
      var range = sel.getRangeAt(0); range.deleteContents();
      var zone = document.createElement(tag); zone.appendChild(document.createTextNode(MATH_SHORTCUT_ZWS));
      range.insertNode(zone);
      var inner = document.createRange(); inner.setStart(zone.firstChild, 1); inner.collapse(true);
      sel.removeAllRanges(); sel.addRange(inner);
    }
    function currentZone() {
      var sel = window.getSelection(); if (!sel.rangeCount) return null;
      var node = sel.getRangeAt(0).startContainer;
      while (node && node !== editor) { if (node.nodeType === 1 && (node.tagName === 'SUP' || node.tagName === 'SUB')) return node; node = node.parentNode; }
      return null;
    }
    function exitZoneAfter(zoneEl) {
      var parent = zoneEl.parentNode, nextSibling = zoneEl.nextSibling;
      if (zoneEl.textContent === MATH_SHORTCUT_ZWS) { zoneEl.remove(); }
      else { zoneEl.normalize && zoneEl.normalize(); var zw = zoneEl.firstChild; if (zw && zw.nodeType === 3 && zw.textContent.charAt(0) === MATH_SHORTCUT_ZWS) zw.textContent = zw.textContent.slice(1); }
      var landing = document.createTextNode(MATH_SHORTCUT_ZWS);
      (parent || editor).insertBefore(landing, nextSibling || null);
      var sel = window.getSelection(); var range = document.createRange();
      range.setStart(landing, 1); range.collapse(true); sel.removeAllRanges(); sel.addRange(range);
    }
    function findTokenBeforeCaret() {
      var sel = window.getSelection(); if (!sel.rangeCount || !sel.isCollapsed) return null;
      var range = sel.getRangeAt(0); var node = range.startContainer, offset = range.startOffset;
      if (node.nodeType !== 3) return null;
      var text = node.textContent; var start = offset;
      while (start > 0 && /[0-9a-zA-Z.]/.test(text.charAt(start - 1))) start--;
      if (start === offset) return null;
      return { node: node, start: start, end: offset, text: text.slice(start, offset) };
    }
    function makeFraction(numText) {
      var sel = window.getSelection(); if (!sel.rangeCount) return;
      var range = sel.getRangeAt(0); range.deleteContents();
      var frac = document.createElement('span'); frac.className = 'frac';
      var num = document.createElement('span'); num.className = 'frac-num';
      var den = document.createElement('span'); den.className = 'frac-den';
      num.appendChild(document.createTextNode(numText || MATH_SHORTCUT_ZWS));
      den.appendChild(document.createTextNode(MATH_SHORTCUT_ZWS));
      frac.appendChild(num); frac.appendChild(den);
      range.insertNode(frac);
      var inner = document.createRange();
      if (numText) inner.setStart(den.firstChild, 1); else inner.setStart(num.firstChild, 1);
      inner.collapse(true); sel.removeAllRanges(); sel.addRange(inner);
    }
    function currentFracPart() {
      var sel = window.getSelection(); if (!sel.rangeCount) return null;
      var node = sel.getRangeAt(0).startContainer;
      while (node && node !== editor) { if (node.nodeType === 1 && (node.className === 'frac-num' || node.className === 'frac-den')) return node; node = node.parentNode; }
      return null;
    }
    function advanceFracNumToDen(numEl) {
      numEl.normalize && numEl.normalize();
      var first = numEl.firstChild;
      if (first && first.nodeType === 3 && first.textContent.charAt(0) === MATH_SHORTCUT_ZWS && first.textContent.length > 1) first.textContent = first.textContent.slice(1);
      var den = numEl.parentNode.querySelector('.frac-den');
      var sel = window.getSelection(); var range = document.createRange();
      range.setStart(den.firstChild, 1); range.collapse(true); sel.removeAllRanges(); sel.addRange(range);
    }
    function maybeConvertTwoChar() {
      var sel = window.getSelection(); if (!sel.rangeCount || !sel.isCollapsed) return;
      var node = sel.getRangeAt(0).startContainer; var offset = sel.getRangeAt(0).startOffset;
      if (node.nodeType !== 3 || offset < 2) return;
      var last2 = node.textContent.slice(offset - 2, offset);
      var symbol = MATH_SHORTCUT_TWO_CHAR[last2]; if (!symbol) return;
      node.textContent = node.textContent.slice(0, offset - 2) + symbol + node.textContent.slice(offset);
      var range = document.createRange(); range.setStart(node, offset - 1); range.collapse(true);
      sel.removeAllRanges(); sel.addRange(range);
    }

    editor.addEventListener('keydown', function (ev) {
      if (ev.key === '*') { ev.preventDefault(); insertStyledSymbol('×'); return; }
      if (ev.key === '~') { ev.preventDefault(); insertStyledSymbol('√'); return; }
      if (ev.key === '^') { ev.preventDefault(); startZone('sup'); return; }
      if (ev.key === '_') { ev.preventDefault(); startZone('sub'); return; }
      if (ev.shiftKey && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
        var lower = ev.key.toLowerCase();
        if (MATH_SHORTCUT_GREEK_MAP[lower] && ev.key.length === 1) {
          ev.preventDefault();
          var capsOn = ev.getModifierState && ev.getModifierState('CapsLock');
          insertStyledSymbol(capsOn ? MATH_SHORTCUT_GREEK_MAP[lower].upper : MATH_SHORTCUT_GREEK_MAP[lower].lower);
          return;
        }
      }
      if (ev.key === '/') {
        var fracPart = currentFracPart();
        if (fracPart && fracPart.className === 'frac-num') { ev.preventDefault(); advanceFracNumToDen(fracPart); return; }
        if (fracPart && fracPart.className === 'frac-den') return;
        ev.preventDefault();
        var token = findTokenBeforeCaret();
        if (token) {
          var delRange = document.createRange();
          delRange.setStart(token.node, token.start); delRange.setEnd(token.node, token.end);
          delRange.deleteContents();
          var sel0 = window.getSelection(); sel0.removeAllRanges(); sel0.addRange(delRange);
          makeFraction(token.text);
        } else { makeFraction(null); }
        return;
      }
      var zone = currentZone();
      if (zone && (ev.key === 'ArrowRight' || ev.key === ' ')) { ev.preventDefault(); exitZoneAfter(zone); return; }
      var denPart = currentFracPart();
      if (denPart && denPart.className === 'frac-den' && (ev.key === 'ArrowRight' || ev.key === ' ')) { ev.preventDefault(); exitZoneAfter(denPart.parentNode); return; }
    });
    editor.addEventListener('paste', function (e) { e.preventDefault(); });
    editor.addEventListener('drop', function (e) { e.preventDefault(); });
    editor.addEventListener('input', function () { maybeConvertTwoChar(); });

    function serializeNode(node) {
      if (node.nodeType === 3) return node.textContent.replace(/​/g, '');
      if (node.nodeType !== 1) return '';
      if (node.classList && node.classList.contains('frac')) {
        var num = serializeChildren(node.querySelector('.frac-num'));
        var den = serializeChildren(node.querySelector('.frac-den'));
        if (!num && !den) return '';
        return '(' + num + ')/(' + den + ')';
      }
      if (node.tagName === 'SUP') { var innerU = serializeChildren(node); return innerU ? '^(' + innerU + ')' : ''; }
      if (node.tagName === 'SUB') { var innerD = serializeChildren(node); return innerD ? '_(' + innerD + ')' : ''; }
      return serializeChildren(node);
    }
    function serializeChildren(node) { if (!node) return ''; return Array.prototype.map.call(node.childNodes, serializeNode).join(''); }

    return {
      container: wrap, editorEl: editor,
      getValue: function () { return serializeChildren(editor).trim(); },
      isEmpty: function () { return !serializeChildren(editor).trim(); },
      focus: function () { editor.focus(); },
    };
  }

  /* a step with a genuine computed answer (step.answer, optionally step.tol - default 0.01) rather than a
     reasoning choice: the same maths answer box as everywhere else on the site, checked locally against the
     number since this offline player has no server round-trip. */
  function buildCalc(step) {
    var wrap = stack('<div class="eyebrow">Work it out</div><p class="big">' + mathify(step.q) + '</p>');
    var mathEditor = createMathShortcutEditor('Type your answer…');
    var note = el('div', 'note'), out = el('div', 'reveal'); out.hidden = true;
    var solved = false;
    var go = el('button', 'mathgo', 'Check'); go.type = 'button';
    go.addEventListener('click', function () {
      if (solved) return;
      var raw = mathEditor.getValue();
      var val = parseFloat(raw), tol = step.tol != null ? step.tol : 0.01;
      var editorEl = mathEditor.editorEl;
      if (!isNaN(val) && Math.abs(val - step.answer) <= tol) {
        solved = true; editorEl.classList.remove('wrong'); editorEl.classList.add('right'); note.textContent = '';
        editorEl.contentEditable = 'false'; go.disabled = true;
        out.hidden = false; out.innerHTML = '<span>' + mathify(step.pre) + '</span>' + termHtml(step.term, 'pop');
        chunk(step.term);
        setTimeout(function () { next(true); }, 1500);
      } else {
        editorEl.classList.add('wrong'); note.textContent = step.hint;
        setTimeout(function () { editorEl.classList.remove('wrong'); }, 500);
      }
    });
    wrap.appendChild(mathEditor.container); wrap.appendChild(go); wrap.appendChild(note); wrap.appendChild(out);
    slide(wrap);
    setTimeout(function () { mathEditor.focus(); }, 50);
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
    /* only real links force an order: a term must come before the terms it leads to, and everything else may go in any order */
    function judge(placed) {
      var v = {}, pos = {};
      defs.forEach(function (d, i) { if (placed[d.id]) pos[placed[d.id]] = i; });
      defs.forEach(function (d, i) {
        var t = placed[d.id], ok = !!t;
        (step.pairs || []).forEach(function (p) {
          if (p[0] === t && pos[p[1]] != null && pos[p[1]] < i) ok = false;
          if (p[1] === t && pos[p[0]] != null && pos[p[0]] > i) ok = false;
        });
        v[d.id] = ok;
      });
      return v;
    }
    board({ slots: defs, bank: shuffle(step.order), bankEl: bank, btn: btn, note: note, auto: true, judge: judge, onSolved: function () { milestoneDone(note, step.done); } });
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
  /* a label is wrapped to the width of its own box, over as many lines as it needs, so it always fits */
  function wrapLabel(text, maxChars) {
    maxChars = maxChars || 15;
    if (text.length <= maxChars) return [text];
    var words = text.split(' '), lines = [], cur = '';
    words.forEach(function (w) {
      if (cur && (cur + ' ' + w).length > maxChars) { lines.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w;
    });
    if (cur) lines.push(cur);
    return lines;
  }
  function setLabel(t, n, text) {
    t.textContent = '';
    var lines = wrapLabel(text, Math.max(10, Math.floor((n[2] - 22) / 10)));
    var step = lines.length > 3 ? 17 : 22;
    if (lines.length > 3) t.setAttribute('style', 'font-size: 15px');
    lines.forEach(function (w, j) { var ts = svgEl('tspan', { x: n[0] + n[2] / 2, dy: j === 0 ? -((lines.length - 1) * step) / 2 + 2 : step }, t); ts.textContent = w; });
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
      /* terms that come from the same places and lead to the same places are interchangeable, so one of them is right in any of their boxes
         even when something else on the board is still wrong */
      var preds = {}, succs = {};
      (g.pairs || []).forEach(function (p) { (succs[p[0]] = succs[p[0]] || []).push(p[1]); (preds[p[1]] = preds[p[1]] || []).push(p[0]); });
      function sig(k) { return (preds[k] || []).slice().sort().join(',') + '|' + (succs[k] || []).slice().sort().join(','); }
      defs.forEach(function (d) { v[d.id] = placed[d.id] === d.expect || (!!placed[d.id] && !!g.pairs && sig(placed[d.id]) === sig(d.expect)); });
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

