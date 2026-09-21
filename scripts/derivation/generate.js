'use strict';
// Generates derivation stages from a knowledge map with the Anthropic API. NOT run by anything automatically: it spends money.
//   node generate.js <map.json> <out-dir> [--limit N] [--dry-run]            one request at a time (fast feedback, full price)
//   node generate.js <map.json> <out-dir> --batch [--limit N]                Message Batches API (half price, results within 24h, usually far sooner)
//   node generate.js <map.json> <out-dir> --batch --resume <batch_id>        pick up a batch already submitted
// Needs ANTHROPIC_API_KEY in the process environment (never read from a file here).
// Every request has prompt caching on the system prompt and extended thinking off. Each result is checked by build.js's rules;
// a failing stage is retried once (as a second, small batch in batch mode) with the checker's errors, then written to failed/.
const fs = require('fs');
const path = require('path');
const { plan } = require('./plan_stages');
const { validate } = require('./build');
const { SYSTEM, user } = require('./prompt');

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5';
const args = process.argv.slice(2);
const [mapPath, outDir] = args;
const flag = (f) => args.includes(f);
const val = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);
const maxUsd = val('--max-usd') ? Number(val('--max-usd')) : Infinity; // hard stop: no new request once this much has been spent
const limit = val('--limit') ? Number(val('--limit')) : Infinity;
const BASE = 'https://api.anthropic.com/v1';
const headers = () => ({ 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' });
const pad = (i) => String(i).padStart(3, '0');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One request's params. The 1-hour cache TTL matters in batch mode: requests are processed over minutes to hours, so the
// default 5-minute cache would expire between them. thinking is explicitly disabled (this model thinks by default and bills it as output).
function params(messages) {
  return {
    model: MODEL,
    max_tokens: 4000,
    thinking: { type: 'disabled' },
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral', ttl: '1h' } }],
    messages,
  };
}

async function api(method, url, body) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { method, headers: headers(), body: body ? JSON.stringify(body) : undefined });
      if (res.ok) return res;
      const text = await res.text();
      if (attempt < 3 && (res.status === 429 || res.status >= 500)) { await sleep(2000 * (attempt + 1)); continue; }
      throw new Error(`${res.status} ${text}`);
    } catch (e) {
      if (attempt < 3 && /fetch failed/.test(String(e))) { await sleep(2000 * (attempt + 1)); continue; }
      throw e;
    }
  }
}

function toSpec(stage, out, byId) {
  const terms = { ...out.terms };
  (stage.given || []).forEach((g) => { terms[g] = terms[g] || { label: byId[g].label }; });
  const given = (stage.given || []).slice(0, 4);
  return { id: 'gen', subject: stage.subject, title: out.stage.title, terms, stages: [{ ...out.stage, given, needs: stage.given, builds: given, nodes: stage.nodes, dropped: out.dropEdges || [], edges: stage.edges.concat(stage.givenEdges).filter(([a, b]) => !(out.dropEdges || []).some(([x, y]) => x === a && y === b)).concat(out.extraEdges || []) }] };
}

// text -> { spec } or { errs }
function check(stage, text, byId) {
  try {
    const out = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    const spec = toSpec(stage, out, byId);
    const errs = validate(spec, stage.given);
    return errs.length ? { errs } : { spec };
  } catch (e) { return { errs: ['not valid JSON: ' + e.message] }; }
}

const spent = (t) => (t.in * 2 + t.out * 10 + t.cacheWrite * 4 + t.cacheRead * 0.2) / 1e6; // Sonnet 5 list prices; 1h cache writes cost 2x input
function addUsage(t, u) {
  t.in += u.input_tokens || 0; t.out += u.output_tokens || 0; t.cacheRead += u.cache_read_input_tokens || 0; t.cacheWrite += u.cache_creation_input_tokens || 0;
}

async function runBatch(requests, resumeId, outDir, label) {
  let id = resumeId;
  if (!id) {
    const b = await (await api('POST', `${BASE}/messages/batches`, { requests })).json();
    id = b.id;
    fs.writeFileSync(path.join(outDir, `batch_${val('--tag') || ''}${label}.json`), JSON.stringify({ id, submitted: new Date().toISOString(), requests: requests.length }));
    console.log(`submitted ${label} batch ${id} (${requests.length} requests)`);
  }
  for (;;) {
    const b = await (await api('GET', `${BASE}/messages/batches/${id}`)).json();
    const c = b.request_counts;
    console.log(`${new Date().toLocaleTimeString()} ${b.processing_status}: ${c.succeeded} done, ${c.processing} processing, ${c.errored} errored`);
    if (b.processing_status === 'ended') {
      const lines = (await (await api('GET', b.results_url)).text()).split('\n').filter(Boolean).map((l) => JSON.parse(l));
      return lines;
    }
    await sleep(60000);
  }
}

(async () => {
  const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  const { stages, byId } = plan(map);
  stages.forEach((s) => { s.subject = map.subject; });
  let todo = stages.slice(val('--from') ? Number(val('--from')) : 0, Math.min(stages.length, limit));
  // stages already generated in this out-dir are kept, not regenerated; indexes stay the stage's position in the full plan
  const indexOf = new Map(stages.map((st, i) => [st, i]));
  if (flag('--skip-existing')) todo = todo.filter((st) => !fs.existsSync(path.join(outDir, `${pad(indexOf.get(st))}.json`)));
  fs.mkdirSync(path.join(outDir, 'failed'), { recursive: true });
  const total = { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 };
  const idx = (i) => indexOf.get(todo[i]);
  // a stage rejected on an earlier run is asked again with the checker's reasons, so it does not repeat the same mistake
  const prompts = todo.map((st) => {
    let p = user(st, byId, {});
    try {
      const prev = JSON.parse(fs.readFileSync(path.join(outDir, 'failed', `${pad(indexOf.get(st))}.json`), 'utf8'));
      p += '\n\nA previous attempt at this stage was rejected by the checker for:\n- ' + prev.errs.join('\n- ') + '\nAvoid these problems.';
    } catch (e) { /* first attempt */ }
    return p;
  });
  if (flag('--dry-run')) { prompts.forEach((p) => console.log(p, '\n---')); return; }

  const save = (i, r, st) => {
    fs.writeFileSync(path.join(outDir, r.spec ? `${pad(idx(i))}.json` : `failed/${pad(idx(i))}.json`), JSON.stringify(r.spec || { errs: r.errs, stage: st.nodes }, null, 1));
    console.log(idx(i), r.spec ? 'ok' : 'FAILED', st.subtopic);
  };

  if (!flag('--batch')) {
    for (let i = 0; i < todo.length; i++) {
      if (spent(total) >= maxUsd) { console.log(`stopped at $${spent(total).toFixed(3)}: --max-usd reached`); break; }
      let messages = [{ role: 'user', content: prompts[i] }], r;
      for (let attempt = 0; attempt < 2; attempt++) {
        const j = await (await api('POST', `${BASE}/messages`, params(messages))).json();
        addUsage(total, j.usage);
        if (spent(total) >= maxUsd && attempt === 0) console.log(`at $${spent(total).toFixed(3)}, retries will be skipped`);
        const text = j.content.filter((c) => c.type === 'text').map((c) => c.text).join('');
        r = check(todo[i], text, byId);
        if (r.spec || spent(total) >= maxUsd) break;
        messages = [...messages, { role: 'assistant', content: text }, { role: 'user', content: 'Rejected by the checker:\n- ' + r.errs.join('\n- ') + '\nReturn the corrected JSON only.' }];
      }
      save(i, r, todo[i]);
    }
    console.log('usage', total, `~$${spent(total).toFixed(3)}`);
    fs.writeFileSync(path.join(outDir, 'usage.json'), JSON.stringify({ stages: todo.length, usd: spent(total), perAttempt: spent(total) / Math.max(1, todo.length) }));
    return;
  }

  // ---- batch mode: pass 1 for every stage, then one small retry batch for the ones the checker rejected
  const texts = {}, results = {};
  const collect = (lines) => lines.forEach((l) => {
    const i = Number(l.custom_id);
    if (l.result.type === 'succeeded') { addUsage(total, l.result.message.usage); texts[i] = l.result.message.content.filter((c) => c.type === 'text').map((c) => c.text).join(''); results[i] = check(todo[i], texts[i], byId); }
    else results[i] = { errs: ['request ' + l.result.type] };
  });
  if (Number.isFinite(maxUsd)) {
    // batch prices are half of list; assume 30% of stages need a retry. Per-stage list cost is measured from a sequential run when available.
    let per = 0.03, measured = false;
    try { per = JSON.parse(fs.readFileSync(path.join(outDir, 'usage.json'), 'utf8')).perAttempt; measured = true; } catch (e) { /* no measurement: conservative default */ }
    const perBatch = per * 0.5 * (measured ? 1 : 1.3), fit = Math.floor(maxUsd / perBatch);
    console.log(`projected ~$${(todo.length * perBatch).toFixed(2)} for ${todo.length} stages (measured $${per.toFixed(4)} per stage at list price); cap $${maxUsd}`);
    if (todo.length > fit) { console.log(`cap allows about ${fit} stages: submitting the first ${fit} of them`); todo = todo.slice(0, fit); prompts.length = fit; }
  }
  const first = todo.map((_, i) => ({ custom_id: String(i), params: params([{ role: 'user', content: prompts[i] }]) }));
  collect(await runBatch(first, val('--resume'), outDir, 'pass1'));
  const bad = todo.map((_, i) => i).filter((i) => !results[i] || !results[i].spec);
  if (bad.length) {
    const retry = bad.map((i) => ({ custom_id: String(i), params: params(texts[i]
      ? [{ role: 'user', content: prompts[i] }, { role: 'assistant', content: texts[i] }, { role: 'user', content: 'Rejected by the checker:\n- ' + results[i].errs.join('\n- ') + '\nReturn the corrected JSON only.' }]
      : [{ role: 'user', content: prompts[i] }]) }));
    collect(await runBatch(retry, undefined, outDir, 'pass2'));
  }
  todo.forEach((st, i) => save(i, results[i], st));
  // give terms taught in one stage the same short label wherever they appear as a given term in another
  const labels = {};
  todo.forEach((_, i) => { if (results[i].spec) { const sp = results[i].spec, st = sp.stages[0]; Object.keys(sp.terms).forEach((k) => { if (!(st.given || []).includes(k)) labels[k] = sp.terms[k].label; }); } });
  todo.forEach((_, i) => {
    const r = results[i]; if (!r.spec) return;
    Object.keys(r.spec.terms).forEach((k) => { if (labels[k]) r.spec.terms[k].label = labels[k]; });
    fs.writeFileSync(path.join(outDir, `${pad(idx(i))}.json`), JSON.stringify(r.spec, null, 1));
  });
  console.log('usage (batch prices are half of these list prices)', total);
})();
