'use strict';
// Generates derivation stages from a knowledge map with the Anthropic API. NOT run by anything automatically: it spends money.
//   node generate.js <map.json> <out-dir> [--limit N] [--dry-run]
// Needs ANTHROPIC_API_KEY in the environment (read only from the process env, never from a file here).
// Each stage is validated by build.js's rules; a failing stage is retried once with the errors, then written to failed/ for a look.
const fs = require('fs');
const path = require('path');
const { plan } = require('./plan_stages');
const { validate } = require('./build');
const { SYSTEM, user } = require('./prompt');

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5';
const args = process.argv.slice(2);
const [mapPath, outDir] = args;
const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;
const dry = args.includes('--dry-run');

async function call(messages) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 4000, system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }], messages }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(j));
  return { text: j.content.map((c) => c.text || '').join(''), usage: j.usage };
}

function toSpec(stage, out, labels) {
  const terms = { ...out.terms };
  (stage.given || []).forEach((g) => { terms[g] = terms[g] || { label: labels[g] }; });
  const given = (stage.given || []).slice(0, 4);
  return { id: 'gen', subject: stage.subject, title: out.stage.title, terms, stages: [{ ...out.stage, given, needs: stage.given, builds: given, edges: stage.edges.concat(stage.givenEdges) }] };
}

(async () => {
  const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  const { stages, byId } = plan(map);
  stages.forEach((s) => { s.subject = map.subject; });
  const labels = {}; // labels of already generated terms, filled as we go
  fs.mkdirSync(path.join(outDir, 'failed'), { recursive: true });
  const known = new Set();
  let total = { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 };
  for (let i = 0; i < Math.min(stages.length, limit); i++) {
    const st = stages[i];
    const prompt = user(st, byId, labels);
    if (dry) { console.log(prompt); continue; }
    let messages = [{ role: 'user', content: prompt }], ok = false, spec, errs = [];
    for (let attempt = 0; attempt < 2 && !ok; attempt++) {
      const { text, usage } = await call(messages);
      total.in += usage.input_tokens; total.out += usage.output_tokens; total.cacheRead += usage.cache_read_input_tokens || 0; total.cacheWrite += usage.cache_creation_input_tokens || 0;
      try {
        const out = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
        spec = toSpec(st, out, labels);
        errs = validate(spec, known);
      } catch (e) { errs = ['not valid JSON: ' + e.message]; }
      ok = !errs.length;
      if (!ok) messages = [...messages, { role: 'assistant', content: text }, { role: 'user', content: 'Rejected by the checker:\n- ' + errs.join('\n- ') + '\nReturn the corrected JSON only.' }];
    }
    const file = path.join(outDir, ok ? `${String(i).padStart(3, '0')}.json` : `failed/${String(i).padStart(3, '0')}.json`);
    fs.writeFileSync(file, JSON.stringify(ok ? spec : { spec, errs }, null, 1));
    if (ok) { Object.entries(spec.terms).forEach(([k, v]) => { labels[k] = v.label; known.add(k); }); }
    console.log(i, ok ? 'ok' : 'FAILED', st.subtopic);
  }
  console.log('usage', total);
})();
