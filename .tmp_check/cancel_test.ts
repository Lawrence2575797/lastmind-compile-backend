// Run: npx ts-node --transpile-only .tmp_check/cancel_test.ts   (no network: Claude and Supabase are replaced by fakes)
const Module = require('module');
let calls = 0, abortedCalls = 0;
const fakeCall = async (p: any) => {
  calls++;
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => { clearTimeout(t); abortedCalls++; reject(new Error('aborted')); };
    const t = setTimeout(() => { if (p.signal) p.signal.removeEventListener('abort', onAbort); resolve(); }, 120);
    if (p.signal) p.signal.addEventListener('abort', onAbort, { once: true });
  });
  return { text: 'not json at all', usage: { input_tokens: 1, output_tokens: 1 } };
};
const fakeSupabase = { from: () => ({ insert: async () => ({ error: null }), upsert: async () => ({ error: null }) }) };
const origLoad = Module._load;
Module._load = function (request: string, ...rest: any[]) {
  if (/supabaseAdmin$/.test(request)) return { supabaseAdmin: fakeSupabase };
  if (/claudeClient$/.test(request)) return { callClaudeJSONUnmetered: fakeCall, MODELS: { diagnosticTree: 'x' } };
  if (/generationCostService$/.test(request)) return { chargeForClaudeCall: async () => {} };
  return origLoad.call(this, request, ...rest);
};
const svc = require('../src/services/derivationGenericService');

let bad = 0;
const ok = (label: string, c: boolean, extra?: string) => { if (!c) bad++; console.log((c ? 'ok   ' : 'FAIL ') + label + (extra ? '  ' + extra : '')); };
const byId: any = { A: { id: 'A', label: 'Alpha', subtopic: 's' }, B: { id: 'B', label: 'Beta', subtopic: 's' }, C: { id: 'C', label: 'Gamma', subtopic: 's' }, D: { id: 'D', label: 'Delta', subtopic: 's' } };
const mkInfo = (idx: number): any => ({ subject: 'Test', qualification: 'q', examBoard: '', stageIndex: idx, byId, node: { id: 'n', concept_id: 'A', label: 'Alpha' }, cached: null,
  stages: Array.from({ length: idx + 1 }, () => ({ subject: 'Test', subtopic: 's', nodes: ['A', 'B', 'C', 'D'], edges: [], given: [], givenEdges: [], later: 0 })) });
const settle = (p: Promise<any>) => p.then(() => 'resolved', (e: any) => e.constructor.name + ':' + String(e.message).slice(0, 40));

(async () => {
  // 1. two requests for the same stage share one generation: 3 attempts in total, not 6
  calls = 0;
  const [r1, r2] = await Promise.all([settle(svc.derivationGenericGenerate(mkInfo(0), 'u1')), settle(svc.derivationGenericGenerate(mkInfo(0), 'u1'))]);
  ok('two requests for one stage share a single generation', calls === 3, 'Claude calls: ' + calls + ' (would be 6 without sharing)');
  ok('both are told the same outcome', r1 === r2 && /^Error:derivation generation failed/.test(r1), r1);

  // 2. the student cancels: the call to Claude is aborted and no further attempt is made
  calls = 0; abortedCalls = 0;
  const ac = new AbortController();
  const p = settle(svc.derivationGenericGenerate(mkInfo(1), 'u1', ac.signal));
  setTimeout(() => ac.abort(), 40);
  const r3 = await p;
  await new Promise((r) => setTimeout(r, 300));
  ok('cancelling reports an abort, not a failure', /^DerivationGenerationAbortedError/.test(r3), r3);
  ok('cancelling stops the call to Claude and starts no more', calls === 1 && abortedCalls === 1, 'calls ' + calls + ', aborted ' + abortedCalls);

  // 3. two people waiting on the same stage and one gives up: the other still gets their lesson attempt
  calls = 0; abortedCalls = 0;
  const ac2 = new AbortController();
  const pa = settle(svc.derivationGenericGenerate(mkInfo(2), 'u1', ac2.signal));
  const pb = settle(svc.derivationGenericGenerate(mkInfo(2), 'u2'));
  setTimeout(() => ac2.abort(), 40);
  const [ra, rb] = await Promise.all([pa, pb]);
  ok('one waiter leaving does not stop the generation for the other', /^DerivationGenerationAbortedError/.test(ra) && /^Error:derivation generation failed/.test(rb) && abortedCalls === 0, ra + ' | ' + rb + ' | calls ' + calls + ', aborted ' + abortedCalls);

  // 4. already cancelled before starting: nothing is started at all
  calls = 0;
  const ac3 = new AbortController(); ac3.abort();
  const r5 = await settle(svc.derivationGenericGenerate(mkInfo(3), 'u1', ac3.signal));
  ok('a request cancelled before it starts spends nothing', calls === 0 && /^DerivationGenerationAbortedError/.test(r5), 'calls ' + calls);

  console.log(bad ? bad + ' FAILED' : 'all checks passed'); process.exit(bad ? 1 : 0);
})();
