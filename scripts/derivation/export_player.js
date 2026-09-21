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
const head = `window.__runDerive = function (D) {
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

// finish card: report completion to the page that embeds us
const a = body.indexOf('  function buildDone() {');
const b = body.indexOf('  var BUILDERS =');
if (a < 0 || b < 0) throw new Error('buildDone not found');
const done = `  function buildDone() {
    completed = STAGES.length;
    var wrap = stack('<span class="milestone">Lesson complete</span><p class="big">' + STAGES[0].title + '</p><p class="hint">Every term of this lesson is on your knowledge map now.</p>');
    var actions = el('div', 'actions'), go = el('button', 'btn', 'Continue'); go.type = 'button';
    go.addEventListener('click', function () { try { parent.postMessage({ type: 'lm-derive-continue' }, location.origin); } catch (e) { /* standalone */ } });
    actions.appendChild(go); wrap.appendChild(actions); slide(wrap);
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
  if (e.origin !== location.origin || !e.data || e.data.type !== 'lm-derive-init' || window.__started) return;
  window.__started = true; window.__runDerive(e.data.data);
});
try { parent.postMessage({ type: 'lm-derive-ready' }, location.origin); } catch (e) { /* standalone */ }
`;
html = html.replace('</style>', '.nextbtn { justify-self: start; border: 1px solid var(--line); background: transparent; color: var(--muted); border-radius: 999px; padding: 8px 16px; font: 600 13px var(--sans); cursor: pointer; } .nextbtn:hover { border-color: var(--accent); color: var(--ink); } .tray { display: none !important; } .feed { padding-bottom: 0; }\n</style>');
html = html.replace(/<title>[^<]*<\/title>/, '<title>LastMind lesson</title>').replace(/<h1 id="stageTitle">[^<]*<\/h1>/, '<h1 id="stageTitle">Lesson</h1>');
let shell = html.slice(0, html.indexOf('<script>') + 8) + '\n' + head + body + boot + html.slice(html.indexOf('</script>'));
// The lesson feed is always the light grey-blue, whatever the page around it or the device is set to.
shell = shell.replace('<title>', "<script>document.documentElement.setAttribute('data-theme', 'light');</script><title>");
const out = process.argv[2] || path.join(__dirname, 'player.html');
fs.writeFileSync(out, shell);
new Function(head + body);
console.log('player written', out, (shell.length / 1024).toFixed(0) + ' KB');
