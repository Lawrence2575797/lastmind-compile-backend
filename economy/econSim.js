/*
 * LastMind Be the Chancellor: simulation layer v0.1
 * Runs a game on top of the shared macro engine (econModel.js) and policy layer (econPolicy.js).
 *   - starting conditions come from stage of development + starting situation, by simulating a plausible recent history
 *   - time moves by an Advance button and stops on event days; monthly figures are published between the quarterly engine steps
 *   - policies can only be changed in windows (budgets and shock sessions) and take effect after their implementation lag
 *   - popularity, cabinet confidence, polls, early-election pressure and the four-year general election
 *   - passive news, and interviews (the questions and the marking are done server-side by Cortex; see routes/chancellor.ts)
 * Everything here is deterministic given the seed. State is plain JSON so a game can be saved.
 */
(function (root) {
  'use strict';
  var E = root.LMEcon || (typeof require !== 'undefined' ? require('./econModel.js') : null);
  var L = root.LMPolicy || (typeof require !== 'undefined' ? (root.LMEcon = E, require('./econPolicy.js')) : null);
  var clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };
  var round = function (x, d) { var m = Math.pow(10, d || 0); return Math.round(x * m) / m; };

  /* ---------- dates (ISO strings, UTC) ---------- */
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var ms = function (s) { var p = s.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); };
  var iso = function (t) { var d = new Date(t); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); };
  var addDays = function (s, n) { return iso(ms(s) + n * 864e5); };
  var monthEnd = function (s) { var d = new Date(ms(s)); return iso(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)); };
  var addMonthsEnd = function (s, n) { var d = new Date(ms(s)); return iso(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n + 1, 0)); };
  var addYears = function (s, n) { var p = s.split('-'); return (+p[0] + n) + '-' + p[1] + '-' + p[2]; };
  var quarterEndOf = function (s) { var d = new Date(ms(s)); var m = Math.floor(d.getUTCMonth() / 3) * 3 + 2; return iso(Date.UTC(d.getUTCFullYear(), m + 1, 0)); };
  var isQuarterEnd = function (s) { return monthEnd(s) === s && [2, 5, 8, 11].indexOf(new Date(ms(s)).getUTCMonth()) > -1; };
  var monthIndex = function (s) { return new Date(ms(s)).getUTCMonth(); };
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var nice = function (s) { var p = s.split('-'); return +p[2] + ' ' + MONTHS[+p[1] - 1] + ' ' + p[0]; };
  var niceMonth = function (s) { var p = s.split('-'); return MONTHS[+p[1] - 1] + ' ' + p[0]; };

  /* ---------- seeded random ---------- */
  function rnd(g) { g.rs = (g.rs + 0x6D2B79F5) >>> 0; var t = g.rs; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }
  var between = function (g, a, b) { return a + (b - a) * rnd(g); };
  var pickOne = function (g, arr) { return arr[Math.floor(rnd(g) * arr.length) % arr.length]; };

  /* ---------- starting conditions ---------- */
  var STAGES = { low: { profile: 'lowincome', perCapita: 1500, label: 'Low-income economy' }, emerging: { profile: 'emerging', perCapita: 9000, label: 'Emerging economy' }, advanced: { profile: 'advanced', perCapita: 45000, label: 'Advanced economy' } };

  var SITUATIONS = {
    'stable': { name: 'A well-run economy', diagnosis: "Nothing is broken. The job is to keep growth steady, prices stable and the public finances sound, and to make the country better off.", pf: function (pf) { pf.credibility = Math.min(0.95, pf.credibility + 0.1); return pf; }, shocks: {} },
    'debt-crisis': { name: 'External debt crisis', diagnosis: "The government owes a lot in foreign currency, reserves are thin and lenders are pulling back, which pushes the currency down and borrowing costs up. It can be fixed: cut the deficit credibly, lengthen the debt, borrow less in foreign currency, rebuild reserves and protect the currency.",
      pf: function (pf) { pf.debt = Math.max(pf.debt, pf.incomeRel > 0.7 ? 1.05 : 0.8); pf.fxDebt = Math.max(pf.fxDebt, 0.5); pf.reserves = Math.min(pf.reserves, 1.5); pf.baseRp += 1.5; pf.credibility = Math.max(0.2, pf.credibility - 0.25); pf.polStab = Math.max(0.2, pf.polStab - 0.2); pf.maturityYrs = Math.max(3, pf.maturityYrs * 0.5); return pf; },
      shocks: { 7: { risk: 1.2, e: -8, fd: -2 }, 8: { fd: -3, risk: 1.0, e: -10, hh: -1.5, biz: -2 }, 9: { risk: 1.2, credit: 1.5, e: -8, biz: -1.5 }, 10: { risk: 1.0, unc: 0.8, e: -6, hh: -1 }, 11: { risk: 0.6, e: -4, biz: -1 }, 12: { unc: 0.4 } } },
    'hyperinflation': { name: 'Hyperinflation', diagnosis: "Three things are feeding each other. The central bank is printing money to cover the government's deficit. The currency has collapsed, so imports keep getting dearer. And nobody believes inflation will come down, so prices and wages are set ever higher. Each can be attacked: close the deficit, stop the central bank financing it (Monetary: Central bank independence), raise interest rates above inflation, stabilise the currency, and adopt a fiscal rule. Rates alone will not work while the deficit is still being printed away.",
      pf: function (pf) { pf.regime = pf.regime === 'union' ? 'independent' : 'govcontrolled'; pf.monetise = 0.65; pf.credibility = 0.12; pf.hawk = 0.1; pf.maturityYrs = Math.min(pf.maturityYrs, 3); pf.fxDebt = Math.max(pf.fxDebt, 0.3); pf.baseRp += 2; pf.polStab = Math.max(0.2, pf.polStab - 0.3); return pf; },
      shocks: { 4: { cost: 4, e: -8 }, 5: { cost: 6, e: -12, risk: 0.6 }, 6: { cost: 8, e: -14, risk: 0.6 }, 7: { cost: 10, e: -16 }, 8: { cost: 10, e: -16 }, 9: { cost: 12, e: -16 }, 10: { cost: 12, e: -16 }, 11: { cost: 10, e: -14 }, 12: { cost: 10, e: -12 } } },
    'slump': { name: 'Deep slump', diagnosis: "Households and firms have stopped spending, credit is tight and unemployment is climbing. It can be fixed: support demand (spending, tax cuts, payments to households), ease credit, and protect jobs with furlough and grants.", pf: function (pf) { return pf; },
      shocks: { 8: { hh: -6, biz: -5, fd: -6, credit: 2 }, 9: { credit: 1.5, unc: 0.8 }, 10: { biz: -1.5 }, 11: {}, 12: {} } },
    'overheating': { name: 'Overheating boom', diagnosis: "Credit and spending are running ahead of what the economy can supply, so prices and asset values are rising fast. Tighten before it becomes a bust: higher rates, tighter credit and mortgage rules, and firmer tax and spending.", pf: function (pf) { pf.hhDebt *= 1.25; pf.creditDepth *= 1.15; return pf; },
      shocks: { 3: { hh: 1.2, biz: 1.2, demand: 0.6, credit: -0.6 }, 4: { hh: 1, biz: 1.2, demand: 0.6 }, 5: { hh: 1, biz: 1.2, demand: 0.6 }, 6: { hh: 1, biz: 1, demand: 0.6 }, 7: { hh: 1, biz: 1, demand: 0.6 }, 8: { hh: 1, biz: 1, demand: 0.6 }, 9: { hh: 1, biz: 1, demand: 0.6 }, 10: { hh: 1, biz: 1, demand: 0.6, credit: -0.4 }, 11: { demand: 0.6 }, 12: { demand: 0.5 } } },
    'commodity-bust': { name: 'Commodity bust', diagnosis: "The price of the main export has collapsed, cutting incomes, tax revenue and the currency. Cushion the drop with temporary fiscal support, protect the currency, and use the time to diversify.", pf: function (pf) { pf.commExport = Math.max(pf.commExport, 0.55); pf.commRev = Math.max(pf.commRev, 0.06); return pf; },
      shocks: { 8: { comm: -30, fd: -2 }, 9: { comm: -25, fd: -1.5, risk: 0.5 }, 10: { risk: 0.5, unc: 0.5 }, 11: {}, 12: {} } },
    'banking-crisis': { name: 'Banking crisis', diagnosis: "Banks are short of capital, lending has frozen and confidence is fragile. Calm the system with a deposit guarantee, recapitalisation and loan guarantees, and support demand while credit recovers.", pf: function (pf) { return pf; },
      shocks: { 9: { bankHH: -3, bankBiz: -3, credit: 3, unc: 1.5 }, 10: { credit: 2, unc: 0.8 }, 11: { credit: 1 }, 12: {} } }
  };

  var HAS = function (list, words) { var t = (list || []).join(' ').toLowerCase(); return words.some(function (w) { return t.indexOf(w) > -1; }); };
  function tuneProfile(pf, cfg) {
    var ex = cfg.exports || [], im = cfg.imports || [];
    if (HAS(ex, ['oil', 'gas', 'petrol', 'coal', 'lng'])) { pf.commExport = Math.max(pf.commExport, 0.55); pf.commRev = Math.max(pf.commRev, 0.05); pf.energyImpDep = Math.min(pf.energyImpDep, 0.1); }
    else if (HAS(ex, ['copper', 'gold', 'iron', 'lithium', 'bauxite', 'diamond', 'mineral', 'metal', 'ore', 'nickel', 'tin', 'zinc'])) { pf.commExport = Math.max(pf.commExport, 0.45); pf.commRev = Math.max(pf.commRev, 0.03); }
    else if (HAS(ex, ['coffee', 'cocoa', 'cotton', 'tea', 'sugar', 'palm', 'rubber', 'timber', 'cattle', 'fish', 'banana', 'wheat', 'rice', 'grain'])) pf.commExport = Math.max(pf.commExport, 0.35);
    if (HAS(ex, ['tourism', 'travel'])) pf.exportShare = Math.min(0.6, pf.exportShare + 0.04);
    if (HAS(ex, ['garment', 'textile', 'car', 'vehicle', 'electronic', 'machinery', 'chemical', 'pharma', 'steel'])) pf.exportShare = Math.min(0.6, pf.exportShare + 0.04);
    if (HAS(im, ['oil', 'fuel', 'gas', 'petrol', 'energy'])) pf.energyImpDep = Math.max(pf.energyImpDep, 0.75);
    if (HAS(im, ['food', 'wheat', 'rice', 'grain', 'maize', 'meat', 'sugar', 'cooking'])) pf.foodImpDep = Math.max(pf.foodImpDep, 0.6);
    return pf;
  }

  var HISTORY_Q = 12;
  var baseSnap = function (s, pf) { var x = E.snapshot(s, pf); return x; };

  /* ---------- the world: people, parties, papers ---------- */
  var CABINET_ROLES = [
    { key: 'pm', role: 'Prime Minister', dept: [], want: 'polls' },
    { key: 'chancellor', role: 'Chancellor of the Exchequer (you)', dept: [], want: '' },
    { key: 'foreign', role: 'Foreign Secretary', dept: ['tariff', 'tariff_cut', 'fta', 'customs', 'sanctions', 'quota', 'export_sub'], want: 'trade' },
    { key: 'home', role: 'Home Secretary', dept: ['policing', 'mig_skilled', 'mig_general', 'mig_students'], want: 'police' },
    { key: 'health', role: 'Health Secretary', dept: ['health'], want: 'health' },
    { key: 'education', role: 'Education Secretary', dept: ['education', 'hc_school', 'hc_university', 'hc_vocational', 'hc_adult', 'hc_earlyYears'], want: 'education' },
    { key: 'defence', role: 'Defence Secretary', dept: ['defence'], want: 'defence' },
    { key: 'business', role: 'Business and Trade Secretary', dept: ['corp', 'inv_allow', 'rd_credit', 'dereg', 'compete', 'biz_subsidy', 'sme', 'strat_sub', 'fdi_inc'], want: 'business' },
    { key: 'work', role: 'Work and Pensions Secretary', dept: ['pensions', 'unemp_ben', 'child_ben', 'housing_support', 'ubi', 'min_wage'], want: 'welfare' },
  ];
  var OPPOSITION_ROLES = [{ key: 'oppLeader', role: 'Leader of the Opposition' }, { key: 'shadowChancellor', role: 'Shadow Chancellor' }, { key: 'shadowHome', role: 'Shadow Home Secretary' }, { key: 'shadowHealth', role: 'Shadow Health Secretary' }];
  var RISING_ROLES = [{ key: 'risingLeader', role: 'Leader' }, { key: 'risingEconomy', role: 'Economy spokesperson' }];
  var GROUPS = [{ key: 'public', label: 'The public' }, { key: 'workers', label: 'Working households' }, { key: 'business', label: 'Business and investors' }, { key: 'pensioners', label: 'Pensioners' }, { key: 'young', label: 'Young people and renters' }, { key: 'markets', label: 'Financial markets' }, { key: 'party', label: 'Your party members' }];
  var OUTLET_FORMS = { left: ' Tribune', right: ' Sentinel', business: ' Financial Courier' };
  var JOURNALISTS = ['Marcus Hale', 'Priya Anand', 'Tomas Reyes', 'Ingrid Sol', 'Kwame Adeyemi', 'Leila Haddad', 'Daniel Voss', 'Aiko Tanaka', 'Rosa Delgado', 'Henrik Lund'];
  var BROADCASTERS = ['Northlight News', 'Evening Desk', 'Morning Hour', 'The Economy Hour', 'Newsline Tonight'];

  /* ---------- shocks the creator can choose ---------- */
  var SHOCK_MENU = [
    { id: 'oil', label: 'Oil and energy price spike', text: 'World energy prices jump.' },
    { id: 'foreignRecession', label: 'Foreign recession', text: 'Major trading partners fall into recession and stop buying.' },
    { id: 'hhConfidence', label: 'Consumer confidence crash', text: 'Households suddenly stop spending.' },
    { id: 'investmentBoom', label: 'Investment boom', text: 'Business confidence surges and investment takes off.' },
    { id: 'drought', label: 'Drought or harvest failure', text: 'Crops fail, food prices rise and farm output falls.' },
    { id: 'pandemic', label: 'Pandemic', text: 'A disease outbreak hits workers, trade and confidence at once.' },
    { id: 'productivity', label: 'Productivity breakthrough', text: 'A technology boom makes the economy more productive.' },
    { id: 'naturalDisaster', label: 'Natural disaster', text: 'A flood or earthquake destroys capital and disrupts activity.' },
    { id: 'bankingCrisis', label: 'Banking crisis', text: 'A large bank fails and lending freezes.' },
    { id: 'capitalFlight', label: 'Capital flight', text: 'Investors pull money out and the currency falls.' },
    { id: 'tradeWar', label: 'Trade war', text: 'Trading partners raise tariffs and uncertainty rises.' },
    { id: 'globalRate', label: 'Global interest-rate shock', text: 'Rates rise sharply in the big economies.' },
    { id: 'politicalCrisis', label: 'Political or institutional crisis', text: 'A scandal or constitutional row rattles investors.' },
  ];


  /* ---------- the lasting causes behind each starting situation ---------- */
  // Each is a level (0 to 1) that keeps pressing on the economy every quarter, fades slowly by itself, and fades much faster when the right policies are used.
  var DRIVER_DEFS = {
    'credit-crunch': { label: 'A credit crunch and lost confidence', decay: 0.04,
      text: 'Banks are lending little and households and firms have stopped spending, so weak demand feeds on itself and jobs keep going.',
      fix: 'Ease credit (loan guarantees, bank support, cheaper money), put money in the hands of households (payments, tax cuts), protect jobs (furlough, grants) and rebuild confidence.',
      shock: function (L) { return { credit: 0.5 * L, hh: -0.5 * L, biz: -0.5 * L, unc: 0.15 * L }; },
      relief: function (ch, m) { return 0.10 * Math.min(1, (ch.creditRelief || 0) / 0.4) + 0.08 * Math.min(1, (ch.ydW || 0) / 0.01) + 0.08 * (ch.uProtect || 0) + 0.05 * Math.min(1, (ch.bizSupport || 0)) + 0.04 * (m.r < m.rstar - 0.5 ? 1 : 0); } },
    'asset-boom': { label: 'A credit and asset-price boom', decay: 0.03,
      text: 'Cheap credit is inflating house and asset prices and pulling spending forward. The stronger it gets, the harder the fall.',
      fix: 'Cool it before it bursts: raise interest rates, tighten mortgage lending and bank capital rules, and tighten tax and spending.',
      shock: function (L) { return { hh: 0.5 * L, biz: 0.5 * L, demand: 0.35 * L, credit: -0.3 * L }; },
      relief: function (ch, m) { return 0.08 * (m.r > m.rstar + 1.5 ? 1 : 0) + 0.10 * Math.min(1, (ch.creditTight || 0) / 0.3) + 0.06 * Math.min(1, -(ch.wealthPol || 0) / 1.5) + 0.05 * Math.min(1, (ch.bankResil || 0) / 0.4) + 0.05 * Math.min(1, Math.max(0, (ch.rev || 0) - (ch.cur || 0)) / 0.01); } },
    'export-dependence': { label: 'Dependence on one export', decay: 0.015,
      text: 'The country lives off one commodity, so when its world price is weak, incomes, tax revenue and the currency all suffer at once.',
      fix: 'Diversify: invest in manufacturing and strategic industries, technology adoption and trade agreements. Meanwhile cushion the fall with temporary fiscal support and protect the currency.',
      shock: function (L) { return { comm: -4 * L, fd: -0.2 * L }; },
      relief: function (ch) { var pr = ch.prog || {}; return 6 * ((pr.mfg || 0) + (pr.strategic || 0) + (pr.adopt || 0) + (pr.greenInd || 0)) + 0.02 * Math.max(0, ch.xAdd || 0) + 0.03 * Math.min(1, (ch.tfp || 0) / 0.5); } },
    'bank-weakness': { label: 'Weak bank balance sheets', decay: 0.03,
      text: 'Banks are short of capital after bad loans, so they will not lend and depositors are nervous. Until they are fixed the credit freeze continues.',
      fix: 'Clean up the banks: recapitalise or nationalise the weakest, guarantee deposits and loans, and tighten capital rules for the future.',
      shock: function (L) { return { credit: 0.6 * L, bankHH: -0.4 * L, bankBiz: -0.4 * L, unc: 0.15 * L }; },
      relief: function (ch) { return 0.12 * ((ch.debtAdd || 0) > 0 ? 1 : 0) + 0.15 * Math.min(1, (ch.creditRelief || 0) / 0.5) + 0.05 * (ch.guarantee || 0) + 0.05 * Math.max(0, ch.bankResil || 0); } },
    'investor-distrust': { label: 'Investors no longer trust the government to repay', decay: 0.03,
      text: 'Most of the debt is in foreign currency and falls due soon, reserves are thin and the deficit is large, so lenders demand more and more to keep lending.',
      fix: 'Rebuild trust: cut the deficit credibly, adopt a fiscal rule, lengthen the debt, borrow less in foreign currency, and build reserves.',
      shock: function (L) { return { risk: 0.35 * L, e: -1.5 * L, unc: 0.1 * L }; },
      relief: function (ch, m) { return 0.06 * (ch.fiscalCred || 0) + 0.08 * Math.min(1, (ch.cashAdd || 0) / 0.05) + 0.03 * Math.min(1, Math.max(0, ch.matDelta || 0) / 3) + 0.03 * ((ch.fxShare || 0) < 0 ? 1 : 0) + 0.03 * (m.deficit - m.def0 < 2 ? 1 : 0); } },
  };
  var SITUATION_DRIVERS = { 'debt-crisis': [['investor-distrust', 0.9]], 'slump': [['credit-crunch', 0.8]], 'overheating': [['asset-boom', 0.8]], 'commodity-bust': [['export-dependence', 0.8]], 'banking-crisis': [['bank-weakness', 0.9]] };
  function driverShocks(drivers) {
    var out = {};
    (drivers || []).forEach(function (d) { var def = DRIVER_DEFS[d.id]; if (!def || d.level < 0.01) return; var sh = def.shock(d.level); Object.keys(sh).forEach(function (k) { out[k] = (out[k] || 0) + sh[k]; }); });
    return out;
  }
  function stepDrivers(drivers, pol, m) {
    (drivers || []).forEach(function (d) { var def = DRIVER_DEFS[d.id]; if (!def) return; d.level = Math.max(0, d.level * (1 - def.decay) - def.relief((pol && pol.ch) || {}, m)); });
  }
  function driverMetrics(g, snap) { return { r: snap.r, rstar: g.pf.rstar, deficit: snap.deficit, def0: g.def0 == null ? snap.deficit : g.def0 }; }

  /* ---------- new game ---------- */
  function newGame(cfg) {
    cfg = cfg || {};
    var stage = STAGES[cfg.stage] ? cfg.stage : 'emerging';
    var sit = SITUATIONS[cfg.situation] ? cfg.situation : 'stable';
    var pf = JSON.parse(JSON.stringify(E.PROFILES[STAGES[stage].profile]));
    pf.name = cfg.country || pf.name;
    pf = tuneProfile(pf, cfg); pf = SITUATIONS[sit].pf(pf);
    var seed0 = (cfg.seed || Date.now()) >>> 0;
    var g = { v: 1, cfg: cfg, stage: stage, sit: sit, pf: pf, rs: seed0, seed0: seed0, draft: {} };
    var start = cfg.startDate || iso(Date.now());
    // recent history: quarters before the player takes over
    var s = E.init(pf), snaps = [E.snapshot(s, pf)], H = HISTORY_Q, sh = SITUATIONS[sit].shocks;
    for (var q = 1; q <= H; q++) { E.step(s, pf, {}, sh[q] || {}, null); snaps.push(E.snapshot(s, pf)); }
    var lastQEnd = addMonthsEnd(start, -(((new Date(ms(start)).getUTCMonth()) % 3) + 1));   // end of the last completed calendar quarter
    g.H = H; g.q = H; g.baseQEnd = lastQEnd; g.s = s; g.startDate = start; g.date = start;
    g.qhist = snaps.slice(1).map(function (sn, i) { return { t: i + 1, date: addMonthsEnd(lastQEnd, -3 * (H - 1 - i)), snap: sn }; });
    g.startSnap = snaps[H];
    g.mhist = []; g.decisions = []; g.shocksByQ = {}; g.pending = []; g.events = []; g.log = []; g.news = []; g.recent = []; g.interviewAngles = []; g.spendLog = [];
    g.gdpNominal0 = (cfg.populationNumber || 10e6) * STAGES[stage].perCapita;
    g.priceIndex = 100; g.startE = g.startSnap.E;
    g.termStart = start; g.electionDate = addYears(start, 4); g.earlyElection = null;
    g.window = { kind: 'none' }; g.over = null;
    g.drivers = (SITUATION_DRIVERS[sit] || []).map(function (d) { return { id: d[0], level: d[1] }; });
    g.def0 = g.s.def0;
    g.outlets = outletsFor(cfg.country || 'Varuna');
    setupPeople(g, cfg);
    setupPopularity(g);
    proj(g);
    backfillMonthly(g);
    g.news = openingNews(g).reverse().concat(g.news);   // the papers on day one explain how the country got here
    g.bigBudget = { date: defaultBudgetDate(start), done: false, prepDone: false };
    scheduleAll(g);
    addEvent(g, { kind: 'interview', needsAction: true, goals: true, date: g.startDate, title: 'First interview: your goals', journalist: pickOne(g, JOURNALISTS), outlet: pickOne(g, BROADCASTERS) });
    return g;
  }

  function backfillMonthly(g) {
    var n = g.qhist.length, months = 12;
    for (var i = months; i >= 1; i--) {
      var d = addMonthsEnd(g.baseQEnd, -(i - 1)), qi = n - 1 - Math.floor((i - 1) / 3), a = g.qhist[Math.max(0, qi - 1)].snap, b = g.qhist[Math.max(0, qi)].snap, frac = 1 - ((i - 1) % 3) / 3;
      var snap = {}; Object.keys(b).forEach(function (k) { snap[k] = typeof b[k] === 'number' && typeof a[k] === 'number' ? a[k] + (b[k] - a[k]) * frac : b[k]; });
      snap.pi += (rnd(g) - 0.5) * 0.7; snap.u += (rnd(g) - 0.5) * 0.2;
      var m = metricsOf(snap, g); m.date = d; g.mhist.push(m); g.mnow = m;
    }
    g.mhistBefore = g.mhist.length;
  }
  function outletsFor(country) { return [{ name: country + OUTLET_FORMS.left, slant: 'left' }, { name: country + OUTLET_FORMS.right, slant: 'right' }, { name: country + OUTLET_FORMS.business, slant: 'business' }]; }
  function defaultBudgetDate(start) { return addDays(start, 30); }

  function setupPeople(g, cfg) {
    var gov = cfg.government || {}, opp = cfg.opposition || {}, ris = cfg.rising || {};
    g.parties = { gov: { name: gov.party || 'Government', color: '#0b7285' }, opp: { name: opp.party || 'Opposition', color: '#b45309' }, rising: { name: ris.party || 'New Movement', color: '#7c3aed' } };
    g.people = [];
    CABINET_ROLES.forEach(function (r) { g.people.push({ key: r.key, party: 'gov', role: r.role, name: (gov.people || {})[r.key] || r.role, dept: r.dept, want: r.want, approval: 55 + Math.round(between(g, -8, 8)), resigned: false }); });
    g.people.push({ key: 'adviser', party: 'staff', role: 'Special Adviser', name: (gov.people || {}).adviser || 'Imogen Vale' });   // briefs the Chancellor before every interview
    OPPOSITION_ROLES.forEach(function (r) { g.people.push({ key: r.key, party: 'opp', role: r.role, name: (opp.people || {})[r.key] || r.role }); });
    RISING_ROLES.forEach(function (r) { g.people.push({ key: r.key, party: 'rising', role: r.role, name: (ris.people || {})[r.key] || r.role }); });
  }
  function person(g, key) { return g.people.filter(function (p) { return p.key === key; })[0]; }

  /* ---------- popularity ---------- */
  function setupPopularity(g) {
    var m = currentMetrics(g), base = { 'stable': 52, 'debt-crisis': 34, 'hyperinflation': 28, 'slump': 38, 'overheating': 52, 'commodity-bust': 38, 'banking-crisis': 34 }[g.sit] || 50;
    g.pop = { groups: {}, boosts: {}, pressure: { level: g.sit === 'stable' ? 5 : 20, cabinetLow: 0, warned: false }, polls: null, history: [], oppMomentum: 0, risingMomentum: 0 };
    GROUPS.forEach(function (gr) { g.pop.groups[gr.key] = clamp(base + between(g, -4, 4), 5, 95); g.pop.boosts[gr.key] = 0; });
    g.pop.polls = pollsFrom(g);
    g.investConf = { 'stable': 60, 'debt-crisis': 28, 'hyperinflation': 30, 'slump': 40, 'overheating': 58, 'commodity-bust': 38, 'banking-crisis': 32 }[g.sit] || 50;   // how much investors trust the government's direction
    g.statements = [];
    g.pop.history.push({ date: g.date, public: round(g.pop.groups.public, 1), gov: g.pop.polls.gov, opp: g.pop.polls.opp, rising: g.pop.polls.rising, invest: g.investConf });
  }
  function pollsFrom(g) {
    var A = g.pop.groups.public, d = Math.max(0, (50 - A) / 12);
    var ug = 0.32 * (A - 50) / 12 + 0.15, uo = -0.15 * (A - 50) / 12 + 0.1 - 0.25 * d, ur = -1.9 + 0.9 * d + g.pop.risingMomentum;
    var eg = Math.exp(ug), eo = Math.exp(uo), er = Math.exp(ur), t = eg + eo + er;
    return { gov: round(92 * eg / t, 1), opp: round(92 * eo / t, 1), rising: round(92 * er / t, 1), other: 8 };
  }

  var PULSE_WEIGHTS = { public: 1, workers: 1, business: 1, pensioners: 1, young: 1 };
  // an immediate reaction to a decision, computed from what the decision does in the engine
  function policyPulse(g, id, v) {
    var e = L.CAT.filter(function (c) { return c.id === id; })[0]; if (!e) return {};
    var settings = {}; settings[id] = { v: v, opt: null, k: 6, noRamp: true };
    var pol = L.compile(settings, g.pf, { start: 0, phase: 1, flags: { unlock: true } })(6), ch = (pol && pol.ch) || {}, out = {};
    var yd = ch.ydW || 0, rev = ch.rev || 0, cpi = ch.cpiLevel || 0;
    out.public = 260 * yd - 1.6 * cpi;
    out.workers = 380 * yd - 2.0 * cpi + (ch.ust ? -1.2 * ch.ust : 0);
    out.business = -0.7 * (ch.corpETR || 0) + 0.5 * (ch.invBoost || 0) - 70 * Math.max(0, rev) + 0.9 * (ch.tfp || 0) - 0.6 * (ch.costLevel || 0);
    out.pensioners = 0; out.young = 0;
    if (id === 'pensions' || id === 'health') out.pensioners += 0.10 * v;
    if (id === 'unemp_ben' || id === 'child_ben' || id === 'housing_support') out.young += 0.05 * v;
    if (id === 'hc_school' || id === 'hc_university' || id === 'education' || id === 'childcare' || id === 'housebuild' || id === 'first_buyer' || id === 'plan_lib') out.young += (id === 'education' ? 0.06 : 3) * v;
    out.pensioners += -1.5 * cpi; out.young += 150 * yd - 1.0 * cpi;
    out.markets = -60 * Math.max(0, (ch.cur || 0) + (ch.tr || 0) - rev) + 30 * Math.max(0, rev - (ch.cur || 0) - (ch.tr || 0)) + 0.4 * (ch.fiscalCred || 0) * 10;
    out.party = 0.5 * out.public;
    Object.keys(out).forEach(function (k) { out[k] = clamp(out[k], -8, 8); });
    return out;
  }

  function applyPulse(g, pulse, factor) { Object.keys(pulse).forEach(function (k) { if (g.pop.boosts[k] != null) g.pop.boosts[k] += pulse[k] * (factor == null ? 1 : factor); }); }

  function popularityMonth(g) {
    var m = currentMetrics(g), pf = g.pf, P = g.pop, tgt = pf.target;
    var gr = m.growth, u = m.unemployment, du = m.unemployment - (g.startSnap.u), infl = m.inflation, rw = m.realWages, deficit = m.deficit, debt = m.debtGDP;
    var sig = {
      cost: clamp(-(infl - tgt) * 1.6, -22, 8) + clamp(rw * 1.6, -10, 8),
      jobs: clamp(-(u - (g.startSnap.ustar || u)) * 3, -14, 8) + clamp(-du * 1.5, -8, 6),
      growth: clamp((gr - 1.5) * 2.4, -16, 10),
      fiscal: clamp(-(deficit - 3) * 1.2, -10, 4) + clamp(-(debt - 80) * 0.05, -6, 2),
    };
    var tgtG = {
      public: 50 + 0.9 * sig.cost + 0.9 * sig.jobs + 0.7 * sig.growth + 0.15 * sig.fiscal,
      workers: 50 + 0.7 * sig.cost + 1.3 * sig.jobs + 0.6 * sig.growth,
      business: 50 + 0.3 * sig.cost + 0.2 * sig.jobs + 1.2 * sig.growth + 0.7 * sig.fiscal + 3 * (m.confB || 0),
      pensioners: 50 + 1.3 * sig.cost + 0.2 * sig.jobs + 0.3 * sig.growth + 0.3 * sig.fiscal,
      young: 50 + 0.5 * sig.cost + 1.4 * sig.jobs + 0.6 * sig.growth - 0.25 * (m.housePrices || 0),
      markets: 50 + 0.6 * sig.growth + 1.5 * sig.fiscal - 3.5 * (m.riskPremium - g.pf.baseRp) - 0.4 * Math.max(0, infl - tgt - 2),
    };
    tgtG.party = 0.55 * tgtG.public + 0.45 * (P.groups.public) + 8 - 0.2 * P.pressure.level;
    GROUPS.forEach(function (grp) {
      var k = grp.key, t = tgtG[k] + P.boosts[k];
      P.groups[k] = clamp(P.groups[k] + 0.28 * (t - P.groups[k]), 3, 97);
      P.boosts[k] *= 0.82;
    });
    // political mood in the opposition and the rising party
    var d = Math.max(0, (50 - P.groups.public) / 12);
    P.risingMomentum = clamp(P.risingMomentum * 0.96 + 0.05 * d - 0.02, -0.4, 1.2);
    P.polls = pollsFrom(g);
    var lead = P.polls.opp - P.polls.gov;
    P.pressure.level = clamp(P.pressure.level * 0.93 + Math.max(0, lead) * 0.55 - Math.max(0, -lead) * 0.35 + (P.groups.public < 30 ? 2.5 : 0), 0, 100);
    g.investConf = clamp((g.investConf == null ? 50 : g.investConf) + 0.12 * (0.5 * P.groups.business + 0.5 * P.groups.markets - (g.investConf == null ? 50 : g.investConf)), 3, 97);
    P.history.push({ date: g.date, public: round(P.groups.public, 1), gov: P.polls.gov, opp: P.polls.opp, rising: P.polls.rising, pressure: round(P.pressure.level, 0), invest: round(g.investConf, 1) });
    // cabinet
    g.people.forEach(function (p) {
      if (p.party !== 'gov' || p.key === 'chancellor') return;
      var mood = 0.35 * (P.groups.public - 50) + 0.25 * (sig.growth + sig.jobs) + (p.key === 'pm' ? 0.35 * (P.groups.public - 50) : 0) - 0.15 * P.pressure.level;
      p.approval = clamp(p.approval + 0.25 * ((52 + mood + (p.pulse || 0)) - p.approval), 3, 97);
      p.pulse = (p.pulse || 0) * 0.82;
    });
    var ch = person(g, 'chancellor'); ch.approval = round(P.groups.party, 1);
  }
  function cabinetAverage(g) { var c = g.people.filter(function (p) { return p.party === 'gov' && p.key !== 'chancellor' && !p.resigned; }); return c.reduce(function (a, p) { return a + p.approval; }, 0) / Math.max(1, c.length); }

  /* ---------- decisions, windows and projections ---------- */
  var BIG_ONLY = ['Labour market', 'Business and supply side', 'Trade', 'Foreign investment', 'Industrial policy', 'Environment', 'Regional', 'Migration and labour supply', 'Banking and finance', 'Fiscal framework', 'Innovation'];
  var ALWAYS_WITH_WINDOW = ['Monetary', 'Exchange rate', 'Debt management', 'Crisis controls'];
  function areaAllowed(window, area) {
    if (!window || window.kind === 'none') return false;
    if (window.kind === 'bigBudget') return true;
    if (window.kind === 'shock') return BIG_ONLY.indexOf(area) === -1 || area === 'Banking and finance';
    return BIG_ONLY.indexOf(area) === -1;                                       // quarterly budget
  }
  function entry(id) { return L.CAT.filter(function (c) { return c.id === id; })[0]; }
  function canDecide(g, id) {
    var e = entry(id); if (!e) return { ok: false, reason: 'Unknown policy.' };
    var a = L.available(e, g.pf, { crisis: crisisFlag(g), emergency: emergencyFlag(g) });
    if (!a.ok) return a;
    if (!areaAllowed(g.window, e.area)) {
      var why = g.window.kind === 'none' ? 'Policy can only be changed at a budget or in an emergency session.' : (g.window.kind === 'shock' ? 'Structural reforms wait for the Budget. Emergency sessions cover taxes, spending, crisis measures, banking, money and debt.' : 'Structural reforms (labour, trade, business, regulation) wait for the main Budget.');
      return { ok: false, reason: why };
    }
    return { ok: true };
  }
  function crisisFlag(g) { var m = currentMetrics(g); return m.sovereignStress >= 1.2 || m.debtGDP > 120; }
  function emergencyFlag(g) { return g.window.kind === 'shock' || g.emergency; }

  function settingsAt(g, t, phase) {
    var by = {}, ph = phase || 2;
    g.decisions.forEach(function (d) { (by[d.id] = by[d.id] || []).push(d); });
    var out = {};
    Object.keys(by).forEach(function (id) {
      var e = entry(id), lag = e ? L.lagOf(e.area) : 0, sel = !!(e && e.ctl && e.ctl.t === 'select');
      var eff = by[id].filter(function (d) { return t >= d.at + lag; });
      if (!eff.length) return;
      var last = eff[eff.length - 1], prev = eff.length > 1 ? eff[eff.length - 2].v : 0, k = t - (last.at + lag);
      var v = sel ? last.v : prev + (last.v - prev) * Math.min(1, (k + 1) / ph);
      out[id] = { v: v, opt: last.opt, dur: last.dur, k: k, noRamp: true };
    });
    return out;
  }
  function polFor(g, t) { return L.compile(settingsAt(g, t), g.pf, { start: 0, phase: 1, flags: { unlock: true } })(t); }
  function shocksFor(g, t) {
    var out = Object.assign({}, g.shocksByQ[t] || {}), ds = driverShocks(g.drivers); Object.keys(ds).forEach(function (k) { out[k] = (out[k] || 0) + ds[k]; });
    var dv = ((g.investConf == null ? 50 : g.investConf) - 50) / 50;        // investor confidence, from -1 to +1, moves business confidence and the risk premium
    out.biz = (out.biz || 0) + 0.5 * dv; out.risk = (out.risk || 0) - 0.12 * dv;
    return out;
  }

  function proj(g) {
    var t = g.q + 1, s2 = JSON.parse(JSON.stringify(g.s));
    E.step(s2, g.pf, polFor(g, t) || {}, shocksFor(g, t), null);
    g.projSnap = E.snapshot(s2, g.pf); g.projState = { S: s2.S, spread: s2.spread, ruleBreach: s2.ruleBreach };
    return g.projSnap;
  }

  function decide(g, id, v, opt, dur) {
    var c = canDecide(g, id); if (!c.ok) return c;
    var e = entry(id), was = latestValue(g, id);
    g.decisions.push({ id: id, at: g.q + 1, date: g.date, v: v, opt: opt || null, dur: dur || null });
    var pulse = policyPulse(g, id, typeof v === 'number' ? v - was : 0);
    if (typeof v === 'number') applyPulse(g, pulse, 1);
    var mine = g.people.filter(function (p) { return p.party === 'gov' && p.dept && p.dept.indexOf(id) > -1; });
    mine.forEach(function (p) { var delta = typeof v === 'number' ? (v - was) : 0; var sign = /^(health|education|defence|policing|local|pensions|unemp_ben|child_ben|housing_support|hc_|inf_|renew|nuclear|grid|rd_credit|gov_rd|inv_allow|fta|fdi_inc|sme|biz_subsidy|strat_sub|ubi|min_wage)/.test(id) ? 1 : (id === 'corp' || id === 'tariff' ? -1 : 1); p.pulse = (p.pulse || 0) + clamp(sign * delta * (/^(health|education|defence|policing|local|pensions|unemp_ben|child_ben|housing_support)$/.test(id) ? 0.45 : 6), -14, 14); });
    g.recent.unshift(describe(e, v, opt, dur) + ' (' + nice(g.date) + ')'); g.recent.length = Math.min(g.recent.length, 12);
    proj(g);
    return { ok: true };
  }
  function latestValue(g, id) { var l = g.decisions.filter(function (d) { return d.id === id; }).pop(); return l ? l.v : 0; }
  function describe(e, v, opt, dur) { var c = e.ctl || {}; var val = c.t === 'select' ? ((c.options.filter(function (o) { return String(o.v) === String(v); })[0] || {}).l || v) : ((v > 0 ? '+' : '') + v + ' ' + (c.unit || '')); return e.name + ': ' + val + (opt ? ' (' + opt + ')' : '') + (dur ? ' for ' + dur + ' quarters' : ''); }

  /* ---------- metrics ---------- */
  function metricsOf(snap, g) {
    return { growth: snap.g, gap: snap.gap, inflation: snap.pi, core: snap.piCore, unemployment: snap.u, policyRate: snap.i, realRate: snap.r, exchange: snap.E, exchangeVsStart: (snap.E / g.startE - 1) * 100, debtGDP: snap.debtGDP, deficit: snap.deficit,
      interest: snap.interest, currentAccount: snap.CA, reserves: snap.reserves, riskPremium: snap.riskPremium, spread: snap.spread, realWages: snap.rw, confH: snap.confH, confB: snap.confB, gini: snap.gini, poverty: snap.poverty, emissions: snap.emis,
      housePrices: snap.W, savingRate: snap.savingRate, expectedInflation: snap.piE, moneyFinancing: snap.monet,
      nominalWages: snap.w, importInflation: snap.piImport, importPrices: snap.pm, commodityPrices: snap.comm, consumption: snap.C, investment: snap.I, exports: snap.X, imports: snap.M, gdpIndex: snap.Y, potentialGdp: snap.Ystar, employment: snap.L, productivity: snap.prod,
      povertyRate: ({ low: 38, emerging: 17, advanced: 12 }[g.stage] || 17) + snap.poverty, giniLevel: ({ low: 44, emerging: 40, advanced: 33 }[g.stage] || 40) + snap.gini, potGrowth: snap.potGrowth, sovereignStress: snap.S, taxRevenue: snap.T, participation: snap.part, anchor: snap.A, ustar: snap.ustar };
  }
  function currentMetrics(g) {
    var m = g.mnow || (g.qhist.length ? metricsOf(g.qhist[g.qhist.length - 1].snap, g) : metricsOf(g.startSnap, g));
    return m;
  }
  function monthlyPublish(g) {
    var last = g.qhist[g.qhist.length - 1].snap, pr = g.projSnap, mi = monthIndex(g.date) % 3, frac = (mi + 1) / 3;
    var snap = {}; Object.keys(last).forEach(function (k) { snap[k] = typeof last[k] === 'number' && typeof pr[k] === 'number' ? last[k] + (pr[k] - last[k]) * frac : last[k]; });
    if (isQuarterEnd(g.date)) snap = last;
    else {
      snap.pi += (rnd(g) - 0.5) * 0.9 * (1 + Math.abs(snap.pi) / 12);
      snap.u += (rnd(g) - 0.5) * 0.25; snap.E *= 1 + (rnd(g) - 0.5) * (g.pf.incomeRel > 0.7 ? 0.014 : 0.028);
      snap.g += (rnd(g) - 0.5) * 0.5;
    }
    var m = metricsOf(snap, g); m.date = g.date; g.mnow = m; g.mhist.push(m);
    return m;
  }

  /* ---------- events ---------- */
  var evId = 0;
  function addEvent(g, e) { e.id = 'e' + (++evId) + '_' + g.date; e.done = false; g.events.push(e); g.events.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }); return e; }

  function scheduleAll(g) { scheduleTerm(g, g.startDate); scheduleBigBudget(g); }
  // everything that is scheduled in advance for one parliamentary term: shocks, budget statements, interviews, the election
  function scheduleTerm(g, from) {
    var cfg = g.cfg, chosen = (cfg.shocks || []).filter(function (id) { return E.SHOCKS[id]; }), used = [];
    var span = Math.round((ms(g.electionDate) - ms(from)) / 864e5);
    chosen.forEach(function (id) {
      var n = rnd(g) < 0.6 ? 2 : 1;
      for (var i = 0; i < n; i++) {
        for (var tries = 0; tries < 20; tries++) {
          var d = addDays(from, Math.round(between(g, 75, Math.max(120, span - 90))));
          if (used.every(function (u) { return Math.abs(ms(u) - ms(d)) > 60 * 864e5; })) { used.push(d); var menu = SHOCK_MENU.filter(function (s) { return s.id === id; })[0]; addEvent(g, { kind: 'shock', needsAction: true, date: d, shock: id, magnitude: round(between(g, 0.7, 1.5), 2), title: menu ? menu.label : id, text: menu ? menu.text : '' }); break; }
        }
      }
    });
    var y0 = +from.split('-')[0];
    for (var y = y0; y <= y0 + 5; y++) [[1, '02-10'], [4, '05-10'], [7, '08-10'], [10, '11-10']].forEach(function (q) {
      var d = y + '-' + q[1]; if (d <= addDays(from, 20) || d >= addDays(g.electionDate, -50)) return;
      if (g.bigBudget && Math.abs(ms(d) - ms(g.bigBudget.date)) < 30 * 864e5) return;
      addEvent(g, { kind: 'interview', needsAction: true, speculation: true, date: addDays(d, -4), budgetDate: d, title: 'Budget speculation interview', journalist: pickOne(g, JOURNALISTS), outlet: pickOne(g, BROADCASTERS) });
      addEvent(g, { kind: 'budget-prep', needsAction: true, date: addDays(d, -10), title: 'Preparing the budget statement', text: 'The Treasury has pulled together its forecast. Departments are lobbying for money.', quarterly: true, budgetDate: d });
      addEvent(g, { kind: 'budget', needsAction: true, date: d, title: 'Budget statement', text: 'You deliver the quarterly budget statement. Taxes, spending and welfare can be changed. Structural reforms wait for the main Budget.', quarterly: true });
    });
    var d0 = addDays(from, Math.round(between(g, 9, 16)));
    while (d0 < addDays(g.electionDate, -40)) { addEvent(g, { kind: 'interview', needsAction: true, date: d0, title: 'Interview', journalist: pickOne(g, JOURNALISTS), outlet: pickOne(g, BROADCASTERS) }); d0 = addDays(d0, Math.round(between(g, 12, 22))); }
    addEvent(g, { kind: 'campaign', needsAction: false, date: addDays(g.electionDate, -35), title: 'The election campaign begins', text: 'The general election has been called. Policy is frozen and every announcement is judged by voters.', election: g.electionDate });
    addEvent(g, { kind: 'election', needsAction: true, date: g.electionDate, title: 'General election', text: 'Voters go to the polls.' });
  }
  function scheduleBigBudget(g) {
    g.events = g.events.filter(function (e) { return !(e.big && !e.done); });
    var d = g.bigBudget.date;
    addEvent(g, { kind: 'interview', needsAction: true, speculation: true, big: true, date: addDays(d, -5), budgetDate: d, title: 'Budget speculation interview', journalist: pickOne(g, JOURNALISTS), outlet: pickOne(g, BROADCASTERS) });
    addEvent(g, { kind: 'budget-prep', needsAction: true, big: true, date: addDays(d, -14), title: 'Preparing the Budget', text: 'The big annual Budget is two weeks away. The Treasury forecast is ready and every department is lobbying.', budgetDate: d });
    addEvent(g, { kind: 'budget', needsAction: true, big: true, date: d, title: 'The Budget', text: 'The main annual Budget. Every lever is on the table: taxes, spending, welfare, and structural reforms.' });
  }
  function rescheduleBudget(g, newDate) {
    if (newDate < addDays(g.date, 15)) return { ok: false, reason: 'The Budget needs at least a fortnight to prepare.' };
    if (newDate > addDays(g.electionDate, -60)) return { ok: false, reason: 'The Budget must come before the election period.' };
    if (g.bigBudget.done) return { ok: false, reason: 'This year\'s Budget has been delivered.' };
    g.bigBudget.date = newDate; scheduleBigBudget(g); return { ok: true };
  }

  function politicalTemplates(g) {
    var gov = g.parties.gov.name, opp = g.parties.opp.name, rising = g.parties.rising.name;
    var oppL = person(g, 'oppLeader').name, shC = person(g, 'shadowChancellor').name, rL = person(g, 'risingLeader').name, pm = person(g, 'pm').name;
    var m = currentMetrics(g), P = g.pop;
    return [
      { key: 'attack', when: function () { return m.inflation > g.pf.target + 2 || m.unemployment > g.startSnap.ustar + 1.5; }, title: 'Opposition attack on the economy', text: shC + ' says your economic record is failing families and calls for you to go.',
        options: [{ label: 'Hit back with the figures', fx: { public: 1, business: 0, party: 2, pressure: 0 }, note: 'You defend the record. Firm but no one is persuaded.' }, { label: 'Announce a review of the cost of living', fx: { public: 2, workers: 2, markets: -1, pressure: -2 }, note: 'You are seen to be listening.' }, { label: 'Ignore it', fx: { public: -1, party: -1, pressure: 2 }, note: 'The attack goes unanswered.' }] },
      { key: 'scandal', when: function () { return true; }, title: 'Scandal in the government', text: 'A junior minister in ' + gov + ' is caught in an expenses row. The papers want to know what you knew.',
        options: [{ label: 'Demand a resignation', fx: { public: 2, party: -3, cabinet: -3, pressure: -2 }, note: 'You look decisive, but the party is uneasy.' }, { label: 'Defend the minister', fx: { public: -3, party: 2, cabinet: 2, pressure: 4 }, note: 'The story runs for a week.' }, { label: 'Say nothing', fx: { public: -1, pressure: 1 }, note: 'It fades, slowly.' }] },
      { key: 'strike', when: function () { return m.realWages < 0.5 || m.inflation > g.pf.target + 3; }, title: 'Public-sector strike threat', text: 'Unions warn of strikes unless pay keeps up with prices.',
        options: [{ label: 'Offer a pay rise', fx: { workers: 4, public: 1, business: -1, markets: -2, pressure: -2 }, note: 'Strikes are called off; the deficit widens.', spendPay: 2 }, { label: 'Refuse', fx: { workers: -4, public: -1, markets: 1, business: 1, pressure: 3 }, note: 'Walkouts begin in some services.' }, { label: 'Offer talks', fx: { workers: 1, pressure: 0 }, note: 'You buy some time.' }] },
      { key: 'rumbling', when: function () { return P.groups.public < 42; }, title: 'Leadership rumblings', text: 'Anonymous colleagues in ' + gov + ' tell the papers that ' + pm + ' is losing patience with you.',
        options: [{ label: 'Rally colleagues in person', fx: { party: 3, cabinet: 3, pressure: -2 }, note: 'You steady the ship for now.' }, { label: 'Go on the offensive publicly', fx: { public: 1, party: -2, cabinet: -2, pressure: 2 }, note: 'It plays badly inside the party.' }, { label: 'Wait it out', fx: { party: -1, pressure: 1 }, note: 'The rumbling continues.' }] },
      { key: 'rising', when: function () { return P.polls.rising > 9; }, title: rising + ' surges', text: rL + ' of ' + rising + ' has a strong week and tops a poll among young voters.',
        options: [{ label: 'Take their policies seriously', fx: { young: 2, public: 0, pressure: 0 }, note: 'You adopt a couple of their popular ideas.' }, { label: 'Dismiss them', fx: { young: -1, pressure: 1 }, note: 'They gain from being dismissed.' }, { label: 'Say nothing', fx: {}, note: '' }] },
      { key: 'business-letter', when: function () { return true; }, title: 'Business leaders write to you', text: 'Fifty chief executives sign a letter urging clarity on tax and regulation.',
        options: [{ label: 'Meet them', fx: { business: 3, workers: -1, markets: 1 }, note: 'Business is pleased. The left is not.' }, { label: 'Reply politely', fx: { business: 1 }, note: '' }, { label: 'Ignore it', fx: { business: -2, markets: -1 }, note: 'Business feels ignored.' }] },
      { key: 'bank-warning', when: function () { return m.gini > 0 || m.debtGDP > 85; }, title: 'Ratings agency warning', text: 'A ratings agency warns about the trajectory of public debt (' + Math.round(m.debtGDP) + '% of GDP).',
        options: [{ label: 'Promise fiscal discipline', fx: { markets: 3, business: 1, workers: -1 }, note: 'Markets note the promise. They will judge the numbers.' }, { label: 'Criticise the agency', fx: { markets: -3, public: 0 }, note: 'Investors are unimpressed.' }, { label: 'No comment', fx: { markets: -1 }, note: '' }] },
      { key: 'charity', when: function () { return m.poverty > 0.4 || m.unemployment > g.startSnap.ustar + 1; }, title: 'Charities report rising hardship', text: 'A coalition of charities says more families are struggling.',
        options: [{ label: 'Visit a food bank', fx: { public: 2, workers: 2, party: 0, pressure: -1 }, note: 'A good photo, and people notice.' }, { label: 'Promise action in the Budget', fx: { workers: 2, public: 1, markets: -1 }, note: 'Expectations are set.' }, { label: 'Ignore it', fx: { public: -2, workers: -2, pressure: 2 }, note: '' }] },
      { key: 'good-news', when: function () { return m.growth > 3 || m.inflation < g.pf.target + 0.5; }, title: 'Good news for the government', text: 'A respected think tank praises the government\'s economic management.',
        options: [{ label: 'Claim the credit', fx: { public: 1, party: 2, markets: 0, pressure: -1 }, note: 'The government basks for a few days.' }, { label: 'Stay measured', fx: { markets: 1, public: 1 }, note: 'Seen as sensible.' }, { label: 'Say nothing', fx: {}, note: '' }] },
    ];
  }
  function makePoliticalEvent(g) {
    var tpl = politicalTemplates(g).filter(function (t) { return t.when(); });
    var recent = g.log.slice(-4).map(function (l) { return l.key; });
    tpl = tpl.filter(function (t) { return recent.indexOf(t.key) === -1; });
    if (!tpl.length) return;
    var t = pickOne(g, tpl);
    addEvent(g, { kind: 'political', needsAction: true, date: addDays(g.date, Math.round(between(g, 4, 22))), key: t.key, title: t.title, text: t.text, options: t.options });
  }

  /* ---------- the passive papers ---------- */
  function fmt(x, d) { return (x >= 0 ? '' : '-') + Math.abs(round(x, d == null ? 1 : d)); }
  function monthlyNews(g, m) {
    var c = g.cfg.country || 'the country', out = [], tg = g.pf.target, P = g.pop, shC = person(g, 'shadowChancellor').name, oppL = person(g, 'oppLeader').name, chan = person(g, 'chancellor').name, pm = person(g, 'pm').name;
    var prev = g.mhist.length > 3 ? g.mhist[g.mhist.length - 4] : null;
    var push = function (slant, headline, body) { var o = g.outlets.filter(function (x) { return x.slant === slant; })[0]; out.push({ date: g.date, outlet: o.name, slant: slant, headline: headline, body: body, kind: 'passive' }); };
    if (m.inflation > tg + 3) push('left', 'Prices up ' + fmt(m.inflation) + '% as families feel the squeeze', 'Inflation is now ' + fmt(m.inflation) + '%, well above the ' + tg + '% target. ' + shC + ' says ministers have "lost control of the cost of living". Real wages are moving ' + fmt(m.realWages) + '% a year.');
    else if (m.inflation < tg - 0.5 && m.inflation > -5) push('business', 'Inflation slips below target at ' + fmt(m.inflation) + '%', 'Price rises are ' + fmt(m.inflation) + '%, under the ' + tg + '% target. Analysts ask whether the central bank has room to cut rates from ' + fmt(m.policyRate) + '%.');
    if (m.unemployment > g.startSnap.u + 1) push('left', 'Jobless total climbs to ' + fmt(m.unemployment) + '%', 'Unemployment has risen by more than a point since ' + niceMonth(g.startDate) + '. Unions call for urgent help for workers in the hardest-hit sectors.');
    else if (m.unemployment < g.startSnap.u - 0.8) push('business', 'Labour market tightens: unemployment ' + fmt(m.unemployment) + '%', 'Employers report difficulty hiring. Wage pressure may keep interest rates higher for longer.');
    if (m.growth > 3.5) push('business', 'Growth of ' + fmt(m.growth) + '% ahead of forecasts', 'The economy is expanding at an annual rate of ' + fmt(m.growth) + '%. Investors are asking whether it is running too hot.');
    else if (m.growth < 0) push('left', 'Economy shrinking: output down ' + fmt(-m.growth) + '% on a year ago', 'The recession is biting. ' + oppL + ' of ' + g.parties.opp.name + ' says the government has "no plan for growth".');
    if (m.deficit > 6) push('right', 'Borrowing at ' + fmt(m.deficit) + '% of GDP alarms City', 'The deficit is ' + fmt(m.deficit) + '% of national income and debt stands at ' + Math.round(m.debtGDP) + '%. "Somebody has to pay for this," says a leading economist.');
    if (m.exchangeVsStart < -10) push('business', c + ' currency down ' + fmt(-m.exchangeVsStart, 0) + '% since ' + niceMonth(g.startDate), 'The ' + (g.cfg.currency || 'currency') + ' has weakened sharply, raising the cost of imports. Importers are warning of price rises.');
    else if (m.exchangeVsStart > 10) push('right', 'Strong ' + (g.cfg.currency || 'currency') + ' hurts exporters', 'The currency is up ' + fmt(m.exchangeVsStart, 0) + '% since ' + niceMonth(g.startDate) + '. Exporters say they are losing orders.');
    if (P.polls.opp > P.polls.gov + 4) push('right', g.parties.opp.name + ' opens ' + fmt(P.polls.opp - P.polls.gov, 0) + '-point poll lead', 'A new poll puts ' + g.parties.opp.name + ' on ' + P.polls.opp + '%, ' + g.parties.gov.name + ' on ' + P.polls.gov + '% and ' + g.parties.rising.name + ' on ' + P.polls.rising + '%. Pressure grows on the Chancellor, ' + chan + '.');
    else if (P.polls.gov > P.polls.opp + 4) push('left', g.parties.gov.name + ' pulls ahead in the polls', 'A new poll gives ' + g.parties.gov.name + ' ' + P.polls.gov + '% against ' + P.polls.opp + '% for ' + g.parties.opp.name + '.');
    if (P.pressure.level > 60) push('right', 'Calls grow for an early election', pm + ' is under pressure to go to the country as the government trails in the polls.');
    if (m.riskPremium - g.pf.baseRp > 3) push('business', 'Borrowing costs climb as investors demand more to hold ' + c + ' debt', 'The risk premium on government bonds has risen to ' + fmt(m.riskPremium) + ' points. Markets are watching the next budget closely.');
    if (!out.length) push('business', 'Quiet month for the economy', 'Figures for ' + niceMonth(g.date) + ' show growth of ' + fmt(m.growth) + '%, inflation of ' + fmt(m.inflation) + '% and unemployment of ' + fmt(m.unemployment) + '%.');
    return out.slice(0, 3);
  }


  /* ---------- the papers on day one: how the country got here ---------- */
  // Written from the real starting figures and the drivers behind each situation, from three angles, so the causes are readable in the News section straight away.
  function openingNews(g) {
    var m = currentMetrics(g), c = g.cfg.country || 'the country', cur = g.cfg.currency || 'the currency', gov = g.parties.gov.name, opp = g.parties.opp.name, rising = g.parties.rising.name;
    var pm = person(g, 'pm').name, chan = person(g, 'chancellor').name, sc = person(g, 'shadowChancellor').name, ol = person(g, 'oppLeader').name, rl = person(g, 'risingLeader').name;
    var n1 = function (x) { return fmt(x, 1); };
    var A = {
      'stable': [
        ['business', 'A steady hand: growth ' + n1(m.growth) + '%, inflation ' + n1(m.inflation) + '%', c + ' begins a new chapter with the economy in reasonable health. Unemployment is ' + n1(m.unemployment) + '% and debt ' + Math.round(m.debtGDP) + '% of GDP. The risks are complacency and the next shock, which nobody can name in advance.'],
        ['left', 'Good figures, but who feels them?', 'Headline growth hides pressure on household budgets, says ' + sc + '. Real wages are moving ' + n1(m.realWages) + '% a year and ' + opp + ' wants the new Chancellor, ' + chan + ', to show fairness as well as competence.'],
        ['right', 'Do not waste the calm', 'With the deficit at ' + n1(m.deficit) + '% of GDP, the right-leaning press urges ' + chan + ' to rebuild room to act before the next downturn arrives.'],
      ],
      'debt-crisis': [
        ['business', 'Investors demand ' + n1(m.riskPremium) + ' points extra to hold ' + c + ' debt', 'Reserves have fallen to ' + n1(m.reserves) + ' months of imports and most of the debt is in foreign currency and falls due soon. Every fall in the ' + cur + ' makes the debt heavier, and lenders are pulling back. The deficit is ' + n1(m.deficit) + '% of GDP and debt ' + Math.round(m.debtGDP) + '%.'],
        ['right', 'Years of borrowing have caught up with us', 'The deficit and the debt are the root of the crisis, argue right-leaning commentators. ' + gov + ' spent beyond its means and now lenders are demanding proof of a credible plan: a fiscal rule, real cuts, and a longer debt profile.'],
        ['left', 'Panicking lenders, not public services, are the problem', sc + ' says the interest bill is being driven by market fear. Cuts that push the economy into recession, the left warns, will make the debt harder to repay. A restructuring, with fair terms, may yet be needed.'],
      ],
      'hyperinflation': [
        ['business', 'Central bank prints money to cover the deficit', 'With the government unable to borrow, the central bank is creating money to pay its bills. Inflation is ' + n1(m.inflation) + '% and expected to stay high: nobody believes the promises. The ' + cur + ' has collapsed, and every import costs more each month.'],
        ['right', 'Fix the budget and the bank, or nothing else will work', 'The deficit is ' + n1(m.deficit) + '% of GDP. Ending the printing, making the central bank independent and adopting a fiscal rule are the only credible way out, say economists. Raising rates alone will not work while the deficit is being printed away.'],
        ['left', 'Families crushed as prices spiral', 'Wages cannot keep up with prices rising ' + n1(m.inflation) + '% a year. ' + ol + ' says pensioners and workers are paying for the government\'s failures, and demands protection for the poorest as any stabilisation plan begins.'],
      ],
      'slump': [
        ['business', 'Credit crunch: lending dries up as firms stop investing', 'The economy is ' + n1(-m.gap) + '% below its potential. Banks are lending little, firms have cancelled investment and households have cut spending. Unemployment has reached ' + n1(m.unemployment) + '% and each round of layoffs weakens demand further.'],
        ['left', 'Jobs lost as confidence collapses', 'Working families are bearing the brunt of the slump. ' + sc + ' calls for immediate action: money in households\' hands, protection for jobs, and support for firms that can survive.'],
        ['right', 'Spending is not the answer, some warn', 'With the deficit already at ' + n1(m.deficit) + '% of GDP, right-leaning voices say the way out is lower taxes and less red tape rather than more government spending.'],
      ],
      'overheating': [
        ['business', 'Credit and house prices racing ahead', 'The economy is running ' + n1(m.gap) + '% above its sustainable capacity, unemployment is only ' + n1(m.unemployment) + '% and inflation is ' + n1(m.inflation) + '% and rising. Cheap credit is fuelling a boom in asset prices that analysts warn cannot last.'],
        ['left', 'Booming, but renters and first-time buyers are priced out', 'The young are shut out of a housing market driven by easy credit. ' + rl + ' of ' + rising + ' says both big parties have ignored a bubble that will burst on ordinary families.'],
        ['right', 'Tighten now, or pay later', 'Economists urge the new Chancellor to raise rates, tighten mortgage rules and trim spending before the boom turns to bust. "The bigger it gets, the harder the fall," one says.'],
      ],
      'commodity-bust': [
        ['business', 'Export price collapse: revenue and currency fall', 'The price of ' + c + '\'s main export has collapsed. Export earnings, tax revenue and the ' + cur + ' are all weaker, the deficit has reached ' + n1(m.deficit) + '% of GDP, and the currency is under pressure.'],
        ['left', 'Whole communities depend on one industry', 'Workers in the export regions face lost jobs. ' + sc + ' calls for temporary support and a serious plan for new industries.'],
        ['right', 'Too many eggs in one basket', 'The country has relied on one commodity for too long, say right-leaning commentators: diversify, invest in manufacturing and trade, and make sure the state can withstand a bad year.'],
      ],
      'banking-crisis': [
        ['business', 'Banks face losses as lending freezes', 'A wave of bad loans has left the banks short of capital. They are lending very little, firms cannot get credit, and the economy is ' + n1(-m.gap) + '% below its potential. Depositors are nervous.'],
        ['left', 'Bail out the banks or protect the public?', sc + ' warns that any rescue must protect ordinary savers and jobs, not the shareholders and executives who took the risks.'],
        ['right', 'Risk-taking banks and sleeping regulators', 'Right-leaning papers blame lax supervision and reckless lending, and want tough capital rules once the immediate crisis is over.'],
      ],
    }[g.sit] || [];
    return A.map(function (a, i) { var o = g.outlets.filter(function (x) { return x.slant === a[0]; })[0]; return { date: addDays(g.startDate, -1 - i), outlet: o.name, slant: a[0], headline: a[1], body: a[2], kind: 'background' }; });
  }


  /* ---------- speculation before budgets: confirm or deny, and be held to it ---------- */
  var GENERIC_RUMOURS = [
    function (m) { return m.deficit > 4 ? { id: 'vat', dir: 1, text: 'raise VAT' } : null; },
    function (m) { return m.deficit > 5 ? { id: 'inc_basic', dir: 1, text: 'raise income tax' } : null; },
    function (m) { return m.deficit > 4 ? { id: 'defence', dir: -1, text: 'cut defence spending' } : null; },
    function (m) { return m.unemployment > 6 ? { id: 'hh_payments', dir: 1, text: 'send emergency payments to households' } : null; },
    function (m) { return m.inflation > 6 ? { id: 'food_sub', dir: 1, text: 'subsidise food' } : null; },
    function () { return { id: 'corp', dir: -1, text: 'cut corporation tax' }; },
    function () { return { id: 'health', dir: 1, text: 'increase health spending' }; },
    function () { return { id: 'pensions', dir: -1, text: 'freeze pensions' }; },
  ];
  var AREA_RANK = { 'Income tax': 0, 'Consumption tax': 0, 'Business tax': 0, 'Wealth and property': 1, 'Government spending': 1, 'Welfare': 2 };
  function speculation(g) {
    var out = [], m = currentMetrics(g), seen = {};
    Object.keys(g.draft || {}).map(function (id) { var e = entry(id), d = g.draft[id]; return e && !e.preset && typeof d.v === 'number' ? { e: e, id: id, delta: d.v - latestValue(g, id), d: d } : null; }).filter(function (x) { return x && x.delta; })
      .sort(function (a, b) { return (AREA_RANK[a.e.area] == null ? 5 : AREA_RANK[a.e.area]) - (AREA_RANK[b.e.area] == null ? 5 : AREA_RANK[b.e.area]); }).slice(0, 3)
      .forEach(function (x) { seen[x.id] = 1; out.push({ id: 'r' + out.length, policyId: x.id, dir: x.delta > 0 ? 1 : -1, real: true, text: 'Sources say the Chancellor will ' + (x.delta > 0 ? 'increase' : 'cut') + ' ' + x.e.name.toLowerCase() + ' (' + (x.delta > 0 ? '+' : '') + Math.round(x.delta * 100) / 100 + ' ' + (x.e.ctl.unit || '') + ').' }); });
    for (var i = 0; i < GENERIC_RUMOURS.length && out.length < 3; i++) {
      var c = GENERIC_RUMOURS[(i + Math.floor(rnd(g) * GENERIC_RUMOURS.length)) % GENERIC_RUMOURS.length](m);
      if (c && !seen[c.id] && entry(c.id)) { seen[c.id] = 1; out.push({ id: 'r' + out.length, policyId: c.id, dir: c.dir, real: false, text: 'Talk in the corridors of power is that the Chancellor is preparing to ' + c.text + '.' }); }
    }
    return out;
  }
  // claims: [{ policyId, dir, claim: 'confirm' | 'deny' | 'nocomment', real }]
  function resolveSpeculation(g, ev, claims) {
    var before = g.investConf, delta = 0;
    claims.forEach(function (c) {
      g.statements.push({ policyId: c.policyId, dir: c.dir, claim: c.claim, real: !!c.real, date: g.date, budgetDate: ev.budgetDate, judged: false });
      if (c.claim === 'confirm') delta += c.real ? 3 : 0; else if (c.claim === 'deny') delta += 2; else delta -= 2;   // clarity calms investors, silence unsettles them
    });
    g.investConf = clamp(g.investConf + delta, 3, 97);
    g.pop.boosts.markets += delta * 0.4; g.pop.boosts.business += delta * 0.4;
    g.log.push({ key: 'speculation', date: g.date, title: 'Budget speculation interview', choice: claims.map(function (c) { return c.claim; }).join(', '), note: 'Investor confidence ' + round(before, 0) + ' to ' + round(g.investConf, 0) });
    ev.done = true;
    return { before: before, after: g.investConf };
  }
  // Called when a budget is delivered: what you told the press is checked against what you did.
  function evaluateStatements(g) {
    var out = [];
    (g.statements || []).forEach(function (st) {
      if (st.judged || st.budgetDate > g.date) return;
      var decs = g.decisions.filter(function (d) { return d.id === st.policyId; }), today = decs.filter(function (d) { return d.date === g.date; }), did = false;
      if (today.length) { var last = today[today.length - 1], idx = decs.indexOf(last), prev = idx > 0 ? decs[idx - 1].v : 0; did = (last.v - prev) * st.dir > 0; }
      var e = entry(st.policyId), name = e ? e.name.toLowerCase() : st.policyId, d = 0, text = '';
      if (st.claim === 'confirm') { d = did ? 4 : -6; text = did ? 'You said you would, and you did: ' + name + '.' : 'You said you would change ' + name + ' and then did not. Investors noticed.'; }
      else if (st.claim === 'deny') { d = did ? -10 : 3; text = did ? 'You denied it, then did it anyway: ' + name + '. The press calls it a U-turn.' : 'You denied changing ' + name + ' and kept your word.'; if (did) g.pop.pressure.level = clamp(g.pop.pressure.level + 4, 0, 100); }
      else { d = did ? -2 : 0; text = did ? 'You would not comment on ' + name + ' and then surprised the markets.' : ''; }
      st.judged = true; st.kept = st.claim === 'nocomment' ? null : (st.claim === 'confirm' ? did : !did);
      if (!d && !text) return;
      g.investConf = clamp(g.investConf + d, 3, 97); g.pop.boosts.markets += d * 0.4; g.pop.boosts.business += d * 0.4;
      out.push({ text: text, delta: d, policyId: st.policyId, kept: st.kept });
      if (d <= -6) { var o = g.outlets.filter(function (x) { return x.slant === 'business'; })[0]; g.news.unshift({ date: g.date, outlet: o.name, slant: 'business', headline: d <= -10 ? 'Chancellor U-turns on ' + name : 'Chancellor fails to deliver on ' + name, body: text + ' Investor confidence has fallen.', kind: 'passive' }); }
    });
    return out;
  }

  /* ---------- time ---------- */
  function nextEvent(g) { for (var i = 0; i < g.events.length; i++) if (!g.events[i].done) return g.events[i]; return null; }

  function commitQuarter(g) {
    var t = g.q + 1;
    E.step(g.s, g.pf, polFor(g, t) || {}, shocksFor(g, t), null);
    var snap = E.snapshot(g.s, g.pf);
    stepDrivers(g.drivers, polFor(g, t), driverMetrics(g, snap));
    g.qhist.push({ t: t, date: g.date, snap: snap }); g.q = t;
    g.priceIndex *= 1 + snap.pi / 400;
    recordSpending(g, t, snap);
    proj(g);
  }

  function monthTick(g) {
    if (isQuarterEnd(g.date)) commitQuarter(g);
    else if (!g.projSnap) proj(g);
    var m = monthlyPublish(g);
    popularityMonth(g);
    var arts = monthlyNews(g, m); arts.forEach(function (a) { g.news.unshift(a); }); g.news = g.news.slice(0, 80);
    g.needsQuarterNews = isQuarterEnd(g.date);
    // random political events
    if (rnd(g) < 0.42 && g.date < addDays(g.electionDate, -60)) makePoliticalEvent(g);
    checkPolitics(g);
    g.bigBudgetOpen = null;
  }

  function checkPolitics(g) {
    var P = g.pop;
    // resignations
    g.people.forEach(function (p) {
      if (p.party === 'gov' && p.key !== 'chancellor' && p.key !== 'pm' && !p.resigned && p.approval < 15) {
        p.resigned = true; p.approval = 45; p.name = 'a new ' + p.role;
        addEvent(g, { kind: 'info', needsAction: false, date: addDays(g.date, 1), title: 'Resignation', text: 'The ' + p.role + ' has resigned in protest at your handling of the economy. It is a serious blow for the government.' });
        P.pressure.level = clamp(P.pressure.level + 12, 0, 100);
      }
    });
    // cabinet confidence
    var avg = cabinetAverage(g), pm = person(g, 'pm');
    if (avg < 32 || pm.approval < 25) P.pressure.cabinetLow += 1; else P.pressure.cabinetLow = Math.max(0, P.pressure.cabinetLow - 1);
    if (P.pressure.cabinetLow === 1 && !P.pressure.warned) { P.pressure.warned = true; addEvent(g, { kind: 'info', needsAction: false, date: addDays(g.date, 2), title: 'Cabinet confidence is fading', text: 'Colleagues are briefing that they have lost faith in the Chancellor. If confidence does not recover soon, you will be replaced.' }); }
    if (P.pressure.cabinetLow >= 3 && !g.over) endGame(g, 'sacked', 'The Prime Minister has replaced you after cabinet confidence collapsed.');
    // early election pressure
    if (!g.earlyElection && P.pressure.level >= 92 && g.date < addDays(g.electionDate, -90)) {
      var d = addDays(g.date, 42);
      g.earlyElection = d;
      g.events = g.events.filter(function (e) { return !(e.kind === 'election' || e.kind === 'campaign') || e.done; });
      addEvent(g, { kind: 'campaign', needsAction: false, date: addDays(g.date, 2), title: 'An early election is called', text: person(g, 'pm').name + ' has called an early general election for ' + nice(d) + ' after weeks of pressure. Policy is now frozen.', election: d });
      addEvent(g, { kind: 'election', needsAction: true, date: d, title: 'General election (called early)', text: 'Voters go to the polls.' });
      g.electionDate = d;
    } else if (P.pressure.level >= 70 && !g.warnedEarly) { g.warnedEarly = true; addEvent(g, { kind: 'info', needsAction: false, date: addDays(g.date, 1), title: 'Calls for an early election', text: 'The opposition and several newspapers are demanding an early election. If the polls stay bad, the Prime Minister may give in.' }); }
    if (P.pressure.level < 55) g.warnedEarly = false;
  }

  function endGame(g, reason, text) {
    var last = g.qhist[g.qhist.length - 1].snap, first = g.startSnap;
    g.over = { reason: reason, text: text, date: g.date, summary: { growthStart: round(first.g, 1), growthEnd: round(last.g, 1), inflationEnd: round(last.pi, 1), unemploymentStart: round(first.u, 1), unemploymentEnd: round(last.u, 1), debtStart: round(first.debtGDP, 0), debtEnd: round(last.debtGDP, 0), approval: round(g.pop.groups.public, 0), months: g.mhist.length } };
  }

  function runElection(g) {
    var P = g.pop, polls = pollsFrom(g), r = { gov: polls.gov + between(g, -2.2, 2.2), opp: polls.opp + between(g, -2.2, 2.2), rising: polls.rising + between(g, -1.5, 1.5) };
    var tot = r.gov + r.opp + r.rising; ['gov', 'opp', 'rising'].forEach(function (k) { r[k] = round(r[k] * 92 / tot, 1); });
    r.other = 8;
    var winner = r.gov >= r.opp && r.gov >= r.rising ? 'gov' : (r.opp >= r.rising ? 'opp' : 'rising');
    g.lastElection = { date: g.date, shares: r, winner: winner };
    if (winner === 'gov') {
      g.termStart = g.date; g.electionDate = addYears(g.date, 4); g.earlyElection = null; P.pressure.level = 10; P.pressure.cabinetLow = 0; P.pressure.warned = false;
      GROUPS.forEach(function (gr) { P.boosts[gr.key] += 5; });
      g.events = g.events.filter(function (e) { return e.done; });
      g.bigBudget = { date: addDays(g.date, 60), done: false }; scheduleBigBudget(g);
      scheduleTerm(g, g.date);
    } else endGame(g, 'voted-out', (winner === 'opp' ? g.parties.opp.name : g.parties.rising.name) + ' wins the election with ' + r[winner] + '% of the vote. You are no longer Chancellor.');
    return g.lastElection;
  }

  // Move time on to the next stop. Returns { events: [...due], blocked, over }.
  function advance(g, opts) {
    opts = opts || {};
    if (g.over) return { over: g.over, events: [] };
    var blocked = g.events.filter(function (e) { return !e.done && e.needsAction && e.date <= g.date; });
    if (blocked.length) return { blocked: true, events: blocked };
    g.window = { kind: 'none' };
    var nxt = nextEvent(g), me = monthEnd(addDays(g.date, 1));
    var target = nxt && nxt.date < me ? nxt.date : me;
    if (target <= g.date) target = addDays(g.date, 1);
    if (target > addYears(g.startDate, 12)) return { over: g.over, events: [] };
    g.date = target;
    if (monthEnd(g.date) === g.date) monthTick(g);
    if (g.over) return { over: g.over, events: [] };
    var due = g.events.filter(function (e) { return !e.done && e.date <= g.date; });
    due.forEach(function (e) { openEvent(g, e); });
    return { events: due, date: g.date, monthEnd: monthEnd(g.date) === g.date, over: g.over };
  }

  function openEvent(g, e) {
    if (e.kind === 'shock' && !e.applied) {
      e.applied = true;
      var imp = E.SHOCKS[e.shock].on(e.magnitude), t = g.q + 1; g.shocksByQ[t] = g.shocksByQ[t] || {};
      Object.keys(imp).forEach(function (k) { g.shocksByQ[t][k] = (g.shocksByQ[t][k] || 0) + imp[k]; });
      g.window = { kind: 'shock', shock: e.shock };
      g.pop.boosts.public -= 1; proj(g);
    }
    if (e.kind === 'budget') { g.window = { kind: e.big ? 'bigBudget' : 'budget' }; }
    if (!e.needsAction) e.done = true;
  }

  function resolveEvent(g, id, choice, extra) {
    var e = g.events.filter(function (x) { return x.id === id; })[0]; if (!e) return { ok: false };
    if (e.done) return { ok: true };
    if (e.kind === 'political' && e.options && e.options[choice]) {
      var o = e.options[choice], fx = o.fx || {};
      Object.keys(fx).forEach(function (k) { if (k === 'pressure') g.pop.pressure.level = clamp(g.pop.pressure.level + fx[k], 0, 100); else if (k === 'cabinet') g.people.forEach(function (p) { if (p.party === 'gov') p.pulse = (p.pulse || 0) + fx[k]; }); else if (g.pop.boosts[k] != null) g.pop.boosts[k] += fx[k]; });
      g.log.push({ key: e.key, date: g.date, title: e.title, choice: o.label, note: o.note });
      e.result = o.note;
    } else if (e.kind === 'budget-prep') {
      if (extra && extra.lobby) {
        // extra.lobby: { departmentKey: true/false } accepted requests are applied at the budget as pulses
        Object.keys(extra.lobby).forEach(function (k) { var p = person(g, k); if (p) p.pulse = (p.pulse || 0) + (extra.lobby[k] ? 6 : -5); });
      }
      g.log.push({ key: 'budget-prep', date: g.date, title: e.title, choice: 'Prepared', note: '' });
    } else if (e.kind === 'budget') {
      g.log.push({ key: 'budget', date: g.date, title: e.title, choice: 'Delivered', note: '' });
      if (e.big) g.bigBudget.done = true;
      g.window = { kind: 'none' };
      // markets and public judge the budget: a bigger change to the deficit moves confidence
      var m = currentMetrics(g); g.pop.boosts.markets += m.deficit > 6 ? -2 : 1;
      if (e.big) { var nd = addDays(g.date, 365); g.bigBudget = { date: nd, done: false }; if (nd < addDays(g.electionDate, -60)) scheduleBigBudget(g); }
    } else if (e.kind === 'interview' && extra && extra.assessment) {
      applyInterview(g, extra.assessment, e);
    } else if (e.kind === 'shock') { e.result = 'session ended'; g.window = { kind: 'none' }; }
    else if (e.kind === 'election') { e.result = runElection(g); }
    e.done = true;
    return { ok: true, result: e.result };
  }

  function applyInterview(g, a, e) {
    var s = a.scores || {}, gaffe = a.gaffe ? -3 : 0;
    Object.keys(s).forEach(function (k) {
      if (k === 'cabinet') g.people.forEach(function (p) { if (p.party === 'gov') p.pulse = (p.pulse || 0) + s[k] * 1.6; });
      else if (g.pop.boosts[k] != null) g.pop.boosts[k] += s[k] * 1.4 + gaffe;
    });
    g.pop.pressure.level = clamp(g.pop.pressure.level + (a.pressure || 0), 0, 100);
    if (a.headline) g.news.unshift({ date: g.date, outlet: e ? e.outlet : 'Interview', slant: 'business', headline: a.headline, body: a.reaction || '', kind: 'interview' });
    g.log.push({ key: 'interview', date: g.date, title: 'Interview: ' + (e ? e.outlet : ''), choice: 'Answered', note: a.coaching || '' });
  }

  /* ---------- tracking spending ---------- */
  function spendBase(g) {
    var sp = L.spendFor(g.pf), pf = g.pf;
    var listed = sp.health + sp.education + sp.defence + sp.police + sp.local;
    var rows = { 'Healthcare': sp.health, 'Education': sp.education, 'Defence': sp.defence, 'Policing and justice': sp.police, 'Local government': sp.local, 'Other current spending': Math.max(0, pf.spendCur * 100 - listed),
      'Pensions': sp.pensions, 'Unemployment benefits': sp.unemp, 'Child and family benefits': sp.child, 'Housing support': sp.housing, 'Other transfers': Math.max(0, pf.transfers * 100 - sp.pensions - sp.unemp - sp.child - sp.housing), 'Public investment': pf.ginv * 100 };
    return rows;
  }
  function policyEffects(g, t) {
    var st = settingsAt(g, t), out = [];
    Object.keys(st).forEach(function (id) {
      var one = {}; one[id] = st[id];
      var pol = L.compile(one, g.pf, { start: 0, phase: 1, flags: { unlock: true } })(t), ch = (pol && pol.ch) || {};
      var prog = 0; Object.keys(ch.prog || {}).forEach(function (k) { prog += ch.prog[k]; });
      var spend = ((ch.cur || 0) + (ch.tr || 0) + prog) * 100, rev = (ch.rev || 0) * 100;
      if (Math.abs(spend) > 0.005 || Math.abs(rev) > 0.005) out.push({ id: id, name: entry(id).name, spendPct: spend, revPct: rev, prog: ch.prog || {} });
    });
    return out;
  }
  function nominalGdp(g, snap) { return g.gdpNominal0 * (snap.Y / g.startSnap.Y) * (g.priceIndex / 100); }
  function recordSpending(g, t, snap) {
    var gdp = nominalGdp(g, snap), q = gdp / 4, fx = policyEffects(g, t), base = spendBase(g);
    var by = {}; Object.keys(base).forEach(function (k) { by[k] = base[k] * q / 100; });
    fx.forEach(function (f) { by['Policy: ' + f.name] = f.spendPct * q / 100; });
    var revBase = L.mixFor(g.pf), rev = {}; Object.keys(revBase).forEach(function (k) { rev[k] = revBase[k].base * q / 100; });
    var revPolicy = fx.reduce(function (a, f) { return a + f.revPct; }, 0) * q / 100;
    g.spendLog.push({ t: t, date: g.date, gdp: gdp, spending: by, interest: snap.interest * q / 100, revenue: rev, revenuePolicy: revPolicy, deficit: snap.deficit * q / 100, debt: snap.debtGDP * gdp / 100 });
    g.spendLog = g.spendLog.slice(-24);
  }
  function spendingNow(g) {
    var t = g.q + 1, snap = g.projSnap, gdp = nominalGdp(g, snap), q = gdp / 4, fx = policyEffects(g, t), base = spendBase(g), by = {};
    Object.keys(base).forEach(function (k) { by[k] = base[k] * q / 100; });
    fx.forEach(function (f) { by['Policy: ' + f.name] = f.spendPct * q / 100; });
    var revBase = L.mixFor(g.pf), rev = {}; Object.keys(revBase).forEach(function (k) { rev[k] = revBase[k].base * q / 100; });
    return { gdp: gdp, spending: by, interest: snap.interest * q / 100, revenue: rev, revenuePolicy: fx.reduce(function (a, f) { return a + f.revPct; }, 0) * q / 100, deficit: snap.deficit * q / 100, policies: fx };
  }

  // Drafts: choices saved while preparing a budget. Saving a draft changes nothing; submitting it on budget day enacts it.
  function draftSet(g, id, v, opt, dur) { g.draft = g.draft || {}; g.draft[id] = { v: v, opt: opt || null, dur: dur || null }; }
  function draftClear(g, id) { if (!g.draft) return; if (id) delete g.draft[id]; else g.draft = {}; }
  function submitDraft(g) {
    var done = [], blocked = [];
    Object.keys(g.draft || {}).forEach(function (id) {
      var d = g.draft[id], r = decide(g, id, d.v, d.opt, d.dur);
      if (r.ok) { done.push(id); delete g.draft[id]; } else blocked.push({ id: id, reason: r.reason });
    });
    return { done: done, blocked: blocked };
  }


  // What is behind the starting situation, live: the lasting drivers plus (for hyperinflation) the causes the engine works out itself.
  function causes(g) {
    var out = [], m = currentMetrics(g);
    (g.drivers || []).forEach(function (d) { var def = DRIVER_DEFS[d.id]; if (def) out.push({ id: d.id, label: def.label, text: def.text, fix: def.fix, level: d.level, start: (SITUATION_DRIVERS[g.sit] || []).filter(function (x) { return x[0] === d.id; })[0][1] }); });
    if (g.sit === 'hyperinflation') {
      var ms = m.moneyFinancing || 0;
      out.push({ id: 'money', label: 'The central bank prints money to cover the deficit', level: Math.min(1, ms / 8), start: 1, text: 'The government cannot borrow, so the central bank creates money to pay its bills. That alone is adding about ' + (Math.round(ms * 10) / 10) + ' points to inflation.', fix: 'Cut the deficit and end the practice: Monetary, Central bank independence.' });
      out.push({ id: 'anchor', label: 'Nobody believes inflation will come down', level: 1 - Math.min(1, m.anchor / 0.85), start: 1, text: 'Expected inflation is ' + (Math.round(m.expectedInflation * 10) / 10) + '%, so wages and prices are set to match it. Credibility is close to zero.', fix: 'Raise interest rates above inflation, adopt a fiscal rule and make the central bank independent. Credibility rebuilds only slowly.' });
      out.push({ id: 'currency', label: 'The currency has collapsed', level: Math.min(1, Math.max(0, -m.exchangeVsStart + 60) / 100), start: 1, text: 'Every fall in the currency raises the price of imports, which feed straight into prices.', fix: 'Stabilise the currency: rates above inflation, reserves, capital controls or a peg.' });
    }
    return out;
  }

  // Look ahead n quarters with today's policies plus any changes not yet enacted; no new shocks. Used for forecasts and previews.
  function forecast(g, n, extra) {
    var c = { pf: g.pf, decisions: g.decisions.slice(), shocksByQ: g.shocksByQ, q: g.q, drivers: JSON.parse(JSON.stringify(g.drivers || [])), def0: g.def0, investConf: g.investConf }, s2 = JSON.parse(JSON.stringify(g.s)), out = [];
    (extra || []).forEach(function (d) { c.decisions.push({ id: d.id, at: g.q + 1, v: d.v, opt: d.opt || null, dur: d.dur || null }); });
    for (var i = 1; i <= n; i++) { var t = g.q + i, pol = polFor(c, t) || {}; E.step(s2, g.pf, pol, shocksFor(c, t), null); var sn = E.snapshot(s2, g.pf); stepDrivers(c.drivers, pol, driverMetrics(c, sn)); out.push(sn); }
    return out;
  }

  var api = { speculation: speculation, resolveSpeculation: resolveSpeculation, evaluateStatements: evaluateStatements, causes: causes, draftSet: draftSet, draftClear: draftClear, submitDraft: submitDraft, forecast: forecast, STAGES: STAGES, SITUATIONS: SITUATIONS, SHOCK_MENU: SHOCK_MENU, GROUPS: GROUPS, CABINET_ROLES: CABINET_ROLES, OPPOSITION_ROLES: OPPOSITION_ROLES, RISING_ROLES: RISING_ROLES,
    newGame: newGame, advance: advance, decide: decide, canDecide: canDecide, resolveEvent: resolveEvent, rescheduleBudget: rescheduleBudget, currentMetrics: currentMetrics, spendingNow: spendingNow, person: person, cabinetAverage: cabinetAverage,
    nice: nice, niceMonth: niceMonth, addDays: addDays, iso: iso, latestValue: latestValue, settingsAt: settingsAt, describe: describe, proj: proj, policyPulse: policyPulse };
  root.LMSim = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
