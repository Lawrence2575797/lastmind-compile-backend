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
html = html.replace(/<title>[^<]*<\/title>/, '<title>LastMind lesson</title>').replace(/<h1 id="stageTitle">[^<]*<\/h1>/, '<h1 id="stageTitle">Lesson</h1>');
let shell = html.slice(0, html.indexOf('<script>') + 8) + '\n' + head + body + boot + html.slice(html.indexOf('</script>'));
// The lesson feed is always the light grey-blue, whatever the page around it or the device is set to.
shell = shell.replace('<title>', "<script>document.documentElement.setAttribute('data-theme', 'light');</script><title>");
const out = process.argv[2] || path.join(__dirname, 'player.html');
fs.writeFileSync(out, shell);
new Function(head + body);
console.log('player written', out, (shell.length / 1024).toFixed(0) + ' KB');
