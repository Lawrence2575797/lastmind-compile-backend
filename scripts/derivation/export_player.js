'use strict';
// Builds the runtime player page (no lesson baked in): the parent LastMind page posts a compiled stage in, the player teaches it and
// reports back. node export_player.js <out.html>
const fs = require('fs');
const path = require('path');
const { build } = require('./build');

const sample = JSON.parse(fs.readFileSync(path.join(__dirname, 'specs', 'economics_scarcity.json'), 'utf8'));
let { js, html } = build(sample);

const marker = "  var feed = document.getElementById('feed')";
const i = js.indexOf(marker);
if (i < 0) throw new Error('engine marker not found');
const head = `window.__runDerive = function (D, CP) {
  'use strict';
  var TERMS = {};
  Object.keys(D.terms).forEach(function (k) { TERMS[k] = { t: D.terms[k].t, c: D.terms[k].c }; });
  var CAP = 4, DAY = 86400000;
  var STAGES = [D.stage];
  STAGES[0].hud = D.stage.title;
  var PLAN = [{ name: D.stage.name, needs: D.stage.given || [] }];
  var SUMMARY = '';
`;
let body = js.slice(i);

// a single lesson, so the title slide says just "Lesson"
body = body.replaceAll("Lesson ' + (stageIdx + 1) + ' of ' + STAGES.length + '", "Lesson' + '");
if (body.includes("(stageIdx + 1) + ' of '")) throw new Error('title label not patched');

// Moving on no longer depends only on scrolling: a "Next" hint you can click, and a lower visibility threshold (the lesson can sit partly
// below the visible edge when embedded, which used to keep the next step from ever being built).
const rd = body.indexOf('  function buildRead(step) {'), rdEnd = body.indexOf('  function buildAsk(step) {');
if (rd < 0 || rdEnd < 0) throw new Error('buildRead not found');
let readFn = body.slice(rd, rdEnd);
readFn = readFn.replace('<div class="down">Scroll ↓</div>', '<button type="button" class="nextbtn">Next ↓</button>')
  .replace("var s = slide(wrap), done = false;", "var s = slide(wrap), done = false;\n    var advance = function () { if (done) return; done = true; io.disconnect(); chunk(step.term); next(false); };")
  .replace("if (e.isIntersecting && e.intersectionRatio > 0.6 && !done) { done = true; io.disconnect(); chunk(step.term); next(false); }", "if (e.isIntersecting && e.intersectionRatio > 0.4) advance();")
  .replace("threshold: [0.6]", "threshold: [0.4]")
  .replace("io.observe(s);", "io.observe(s);\n    s.querySelector('.nextbtn').addEventListener('click', function () { advance(); setTimeout(scrollToLast, 60); });");
if (!readFn.includes('nextbtn').valueOf() || readFn.includes('intersectionRatio > 0.6')) throw new Error('read patch failed');
body = body.slice(0, rd) + readFn + body.slice(rdEnd);
// the title slide (the later definition is the one that runs)
const tt = body.lastIndexOf('  function buildTitle() {');
const ttEnd = body.indexOf('\n  }\n', tt) + 5;
let titleFn = body.slice(tt, ttEnd);
titleFn = titleFn.replace('<div class="down">Scroll ↓</div>', '<button type="button" class="nextbtn">Start ↓</button>')
  .replace("var s = slide(wrap), done = false;", "var s = slide(wrap), done = false;\n    var advance = function () { if (done) return; done = true; io.disconnect(); next(false); };")
  .replace("if (e.isIntersecting && e.intersectionRatio > 0.6 && !done) { done = true; io.disconnect(); next(false); }", "if (e.isIntersecting && e.intersectionRatio > 0.4) advance();")
  .replace("threshold: [0.6]", "threshold: [0.4]")
  .replace("io.observe(s);", "io.observe(s);\n    s.querySelector('.nextbtn').addEventListener('click', function () { advance(); setTimeout(scrollToLast, 60); });");
if (!titleFn.includes('nextbtn') || titleFn.includes('intersectionRatio > 0.6')) throw new Error('title patch failed');
body = body.slice(0, tt) + titleFn + body.slice(ttEnd);

// after "a"/"an" the revealed term goes in the singular ("a capital good", not "a Capital goods")
body = body.replace("  function termHtml(k, extra) {", `  function singularWord(w) {
    if (w.length < 4 || /[0-9]/.test(w) || w === w.toUpperCase()) return w;
    if (/(ss|us|is|ics|ness)$/i.test(w)) return w;
    if (/ies$/i.test(w)) return w.slice(0, -3) + 'y';
    if (/(sses|xes|ches|shes)$/i.test(w)) return w.slice(0, -2);
    if (/s$/i.test(w)) return w.slice(0, -1);
    return w;
  }
  function labelAfter(before, label) {
    if (!/\\b(a|an)\\s*$/i.test(before)) return label;
    var parts = label.split(' '); parts[parts.length - 1] = singularWord(parts[parts.length - 1]); return parts.join(' ');
  }
  function termHtmlAs(k, text, extra) { return '<span class="term ' + (extra || '') + '" style="--tc:' + TERMS[k].c + '">' + text + '</span>'; }
  function termHtml(k, extra) {`);
const askOld = "out.innerHTML = '<span>' + step.pre + '</span>' + termHtml(step.term, 'pop');";
const readOld = "step.text + termHtml(step.term, 'pop') + '.";
if (!body.includes(askOld) || !body.includes(readOld)) throw new Error('reveal lines not found');
body = body.replace(askOld, "out.innerHTML = '<span>' + step.pre + '</span>' + termHtmlAs(step.term, labelAfter(step.pre, TERMS[step.term].t), 'pop');");
body = body.replace(readOld, "step.text + termHtmlAs(step.term, labelAfter(step.text, TERMS[step.term].t), 'pop') + '.");

// a slight scroll or key press moves on to the next step (building it if it is waiting); you can scroll back up any time
const gestures = `
  (function slightScroll() {
    var lock = false, startY = null;
    function topOf(s) { return s.getBoundingClientRect().top - feed.getBoundingClientRect().top + feed.scrollTop; }
    function slidesNow() { return [].slice.call(feed.querySelectorAll('.slide')); }
    function current() {
      var a = slidesNow(), top = feed.scrollTop, best = 0, dist = 1e9;
      a.forEach(function (s, i) { var d = Math.abs(topOf(s) - top); if (d < dist) { dist = d; best = i; } });
      return best;
    }
    function go(dir) {
      var a = slidesNow(), i = current(), s = a[i];
      if (!s) return false;
      if (dir > 0) {
        if (topOf(s) + s.offsetHeight - feed.clientHeight > feed.scrollTop + 4) return false; /* a tall slide scrolls first */
        if (i === a.length - 1) { var nb = s.querySelector('.nextbtn'); if (nb) { nb.click(); setTimeout(function () { var b = slidesNow(); b[b.length - 1].scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 80); return true; } return false; }
        a[i + 1].scrollIntoView({ behavior: 'smooth', block: 'start' }); return true;
      }
      if (feed.scrollTop > topOf(s) + 4) return false;
      if (i > 0) { a[i - 1].scrollIntoView({ behavior: 'smooth', block: 'start' }); return true; }
      return false;
    }
    function throttled(dir) { if (lock) return true; if (!go(dir)) return false; lock = true; setTimeout(function () { lock = false; }, 450); return true; }
    feed.addEventListener('wheel', function (e) { if (Math.abs(e.deltaY) < 4) return; if (throttled(e.deltaY > 0 ? 1 : -1)) e.preventDefault(); }, { passive: false });
    feed.addEventListener('touchstart', function (e) { startY = e.touches[0].clientY; }, { passive: true });
    feed.addEventListener('touchend', function (e) { if (startY == null) return; var dy = startY - e.changedTouches[0].clientY; startY = null; if (Math.abs(dy) > 24) throttled(dy > 0 ? 1 : -1); });
    document.addEventListener('keydown', function (e) {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName || '')) return;
      if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') { if (throttled(1)) e.preventDefault(); }
      else if (e.key === 'ArrowUp' || e.key === 'PageUp') { if (throttled(-1)) e.preventDefault(); }
    });
  })();
`;
const tailAt = body.lastIndexOf("  stageTitle.textContent = STAGES[0].hud;");
if (tailAt < 0) throw new Error('tail not found');
body = body.slice(0, tailAt) + gestures + body.slice(tailAt);

// checkpoint: after every completed step the page around us is told where we are, so a lesson left half way resumes at the same step
body = body.replace("    idx++;\n    var step = script()[idx]; if (!step) return;",
  "    idx++;\n    try { if (idx >= 1 && idx < script().length - 1) parent.postMessage({ type: 'lm-derive-progress', cp: { idx: idx, collected: collected.slice(), held: held } }, location.origin); } catch (e) { /* standalone */ }\n    var step = script()[idx]; if (!step) return;");
body = body.replace("  function restart() {\n", "  function restart() {\n    try { parent.postMessage({ type: 'lm-derive-progress', cp: null }, location.origin); } catch (e) { /* standalone */ }\n");
const tailCall = "  setHeld(0); next(false);";
const tc = body.lastIndexOf(tailCall);
if (tc < 0 || body.indexOf("type: 'lm-derive-progress'") < 0) throw new Error('checkpoint hooks not found');
body = body.slice(0, tc) + `  var resumed = false;
  if (CP && typeof CP.idx === 'number' && CP.idx >= 1 && CP.idx < script().length - 1) {
    (CP.collected || []).forEach(function (k) { if (TERMS[k]) collect(k); });
    setHeld(CP.held || 0); idx = CP.idx - 1; resumed = true; next(false);
  }
  if (!resumed) { setHeld(0); next(false); }` + body.slice(tc + tailCall.length);

// sounds, and a question that stands out in a box
const sfx = `
  /* ---- sounds: a soft tick on hover, a firmer click on press, a bright ding for right and a low one for wrong. Made with the browser's
     own audio, so there are no files to load; a Sound button in the top bar turns them off. ---- */
  var audioCtx = null;
  function sndOn() { return window.__snd !== false; }
  function audio() {
    if (!audioCtx) { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    if (audioCtx.state === 'suspended') { try { audioCtx.resume(); } catch (e) { /* needs a gesture first */ } }
    return audioCtx;
  }
  function blip(freq, dur, type, gain, when, slideTo) {
    var a = audio(); if (!a || !sndOn()) return;
    var t = a.currentTime + (when || 0), o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function sfxHover() { blip(2100, 0.035, 'triangle', 0.022); }
  function sfxPress() { blip(520, 0.06, 'square', 0.03, 0, 300); blip(1400, 0.03, 'triangle', 0.02); }
  function sfxOk() { blip(880, 0.5, 'sine', 0.08); blip(1320, 0.55, 'sine', 0.06, 0.09); blip(1760, 0.4, 'sine', 0.025, 0.09); }
  function sfxBad() { blip(240, 0.32, 'triangle', 0.09, 0, 170); blip(180, 0.34, 'sine', 0.05, 0.02); }
  (function wireSounds() {
    var lastHover = null;
    var SEL = '.opt, .chip, .slot, .nextbtn, .btn, .hbtn';
    document.addEventListener('mouseover', function (e) {
      var t = e.target.closest ? e.target.closest(SEL) : null;
      if (!t || t === lastHover || t.disabled) return;
      lastHover = t; sfxHover();
    });
    document.addEventListener('mouseout', function (e) { var t = e.target.closest ? e.target.closest(SEL) : null; if (t && t === lastHover) lastHover = null; });
    document.addEventListener('pointerdown', function (e) { var t = e.target.closest ? e.target.closest(SEL) : null; if (t && !t.disabled) sfxPress(); });
  })();
`;
const patchPairs = [
  ["if (i !== step.ok) { b.classList.add('wrong');", "if (i !== step.ok) { sfxBad(); b.classList.add('wrong');"],
  ["b.classList.add('right'); note.textContent = '';", "sfxOk(); b.classList.add('right'); note.textContent = '';"],
  ["if (allOk) { cfg.btn.disabled = true; cfg.note.textContent = ''; cfg.onSolved(); }\n      else cfg.note.textContent = 'Some are in the wrong place. The right ones stay put; rework the others.';",
   "if (allOk) { sfxOk(); cfg.btn.disabled = true; cfg.note.textContent = ''; cfg.onSolved(); }\n      else { sfxBad(); cfg.note.textContent = 'Some are in the wrong place. The right ones stay put; rework the others.'; }"],
  ["stack('<div class=\"eyebrow\">What follows?</div><p class=\"big\">' + step.q + '</p>')", "stack('<div class=\"eyebrow\">What follows?</div><div class=\"qbox\"><p class=\"big\">' + step.q + '</p></div>')"],
];
patchPairs.forEach(function (p) { if (!body.includes(p[0])) throw new Error('sound hook not found: ' + p[0].slice(0, 50)); body = body.replace(p[0], p[1]); });
{
  const at = body.lastIndexOf("  (function slightScroll() {");
  if (at < 0) throw new Error('slightScroll not found');
  body = body.slice(0, at) + sfx + body.slice(at);
}

// finish card: report completion to the page that embeds us
const a = body.indexOf('  function buildDone() {');
const b = body.indexOf('  var BUILDERS =');
if (a < 0 || b < 0) throw new Error('buildDone not found');
const done = `  function buildDone() {
    completed = STAGES.length;
    var wrap = stack('<span class="milestone">Lesson complete</span><p class="big">' + STAGES[0].title + '</p><p class="hint">Every term of this lesson is on your knowledge map now.</p>');
    var actions = el('div', 'actions'), go = el('button', 'btn', 'Continue'); go.type = 'button';
    go.addEventListener('click', function () { try { parent.postMessage({ type: 'lm-derive-continue' }, location.origin); } catch (e) { /* standalone */ } });
    var mapBtn = el('button', 'btn', 'See it on my key-term map'); mapBtn.type = 'button';
    mapBtn.addEventListener('click', function () { try { parent.postMessage({ type: 'lm-derive-open-map' }, location.origin); } catch (e) { /* standalone */ } });
    actions.appendChild(mapBtn); actions.appendChild(go); wrap.appendChild(actions); slide(wrap);
    if (!window.__reported) { window.__reported = true; try { parent.postMessage({ type: 'lm-derive-complete' }, location.origin); } catch (e) { /* standalone */ } }
  }

`;
body = body.slice(0, a) + done + body.slice(b);

// the file ends with "})();" for the old IIFE; it becomes the end of __runDerive
const end = body.lastIndexOf('})();');
if (end < 0) throw new Error('IIFE end not found');
body = body.slice(0, end) + '};\n';

const boot = `
window.addEventListener('message', function (e) {
  if (e.origin !== location.origin || !e.data) return;
  if (e.data.type === 'lm-derive-size') { var sb = document.getElementById('sizeBtn'); if (sb) sb.textContent = e.data.expanded ? 'Shrink' : 'Expand'; return; }
  if (e.data.type !== 'lm-derive-init' || window.__started) return;
  if (e.data.look) {
    var root = document.documentElement;
    root.setAttribute('data-look', 'glass');
    root.style.setProperty('--gtext', e.data.look.text);
    root.style.setProperty('--pr', e.data.look.rgb);
  }
  window.__started = true; window.__runDerive(e.data.data, e.data.checkpoint);
});
(function () {
  var snd = document.getElementById('soundBtn');
  try { window.__snd = localStorage.getItem('lm-derive-sound') !== 'off'; } catch (e) { window.__snd = true; }
  if (snd) {
    var paint = function () { snd.textContent = window.__snd ? 'Sound: on' : 'Sound: off'; };
    paint();
    snd.addEventListener('click', function () { window.__snd = !window.__snd; paint(); try { localStorage.setItem('lm-derive-sound', window.__snd ? 'on' : 'off'); } catch (e) { /* no storage */ } });
  }
})();
(function () {
  var sb = document.getElementById('sizeBtn');
  if (!sb || window.parent === window) return;
  sb.hidden = false;
  sb.addEventListener('click', function () { try { parent.postMessage({ type: 'lm-derive-toggle-size' }, location.origin); } catch (err) { /* standalone */ } });
})();
try { parent.postMessage({ type: 'lm-derive-ready' }, location.origin); } catch (e) { /* standalone */ }
`;
html = html.replace('</style>', '.nextbtn { justify-self: start; border: 1px solid var(--line); background: transparent; color: var(--muted); border-radius: 999px; padding: 8px 16px; font: 600 13px var(--sans); cursor: pointer; } .nextbtn:hover { border-color: var(--accent); color: var(--ink); } .tray { display: none !important; } .feed { padding-bottom: 0; overflow-x: hidden; scroll-snap-type: y proximity; } html, body { overflow: hidden; height: 100%; } .svgwrap, .bank, .slots, .lanes { scrollbar-width: none; } .svgwrap::-webkit-scrollbar, .bank::-webkit-scrollbar, .slots::-webkit-scrollbar, .lanes::-webkit-scrollbar { display: none; }\n</style>');
html = html.replace('<button class="hbtn" id="howBtn" type="button">', '<button class="hbtn" id="soundBtn" type="button">Sound: on</button>\n  <button class="hbtn" id="howBtn" type="button">');
html = html.replace('<button class="hbtn" id="howBtn" type="button">', '<button class="hbtn" id="sizeBtn" type="button" hidden>Expand</button>\n  <button class="hbtn" id="howBtn" type="button">');
html = html.replace(/<title>[^<]*<\/title>/, '<title>LastMind lesson</title>').replace(/<h1 id="stageTitle">[^<]*<\/h1>/, '<h1 id="stageTitle">Lesson</h1>');
let shell = html.slice(0, html.indexOf('<script>') + 8) + '\n' + head + body + boot + html.slice(html.indexOf('</script>'));
// The lesson feed is always the light grey-blue, whatever the page around it or the device is set to.
shell = shell.replace('<title>', "<script>document.documentElement.setAttribute('data-theme', 'light');</script><title>");
const out = process.argv[2] || path.join(__dirname, 'player.html');
fs.writeFileSync(out, shell);
new Function(head + body);
console.log('player written', out, (shell.length / 1024).toFixed(0) + ' KB');
