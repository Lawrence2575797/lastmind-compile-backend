/*
 * LastMind macro engine, policy layer v0.2
 * Every policy a student can pick is one row in CATALOGUE: what the control looks like (slider, exact number, dropdown) and a function
 * that says how that choice enters the engine. The functions write to a small set of engine channels (see econModel.js, step()):
 *   fiscal:  cur, curImp, tr, rev, prog{id}, ydW, debtAdd, cashAdd, dem        real economy: corpETR, invBoost, lab, ust, tfp, uProtect, bizSupport, cDamp
 *   prices:  cpiLevel, costLevel, tariff, shield    trade: xAdd, mAdd    money: qe, creditTight, creditRelief, wealthPol, rate
 *   external: fxInt, capCtrl, peg, pegTo    banking: guarantee, bankResil    framework: fiscalCred, defTarget, debtTarget, spendCeil, haircut, matDelta, fxShare
 *   outcomes: emisPct, giniPol, povPol
 * All money amounts are fractions of GDP (0.01 = 1% of GDP) except where a channel says otherwise.
 * Coefficients are judgement calls anchored to the sources in `src`; the tests in validatePolicy() check the headline ones.
 */
(function (root) {
  'use strict';
  var E = root.LMEcon || (typeof require !== 'undefined' ? require('./econModel.js') : null);
  var clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };
  var grp = function (pf) { return pf.incomeRel > 0.7 ? 0 : (pf.incomeRel > 0.2 ? 1 : 2); };
  var pick = function (a, pf) { return a[grp(pf)]; };

  /* ---------- what the economy taxes and spends, by development stage ---------- */
  function mixFor(pf) {
    var g = grp(pf), tr = pf.taxRatio * 100, m = {};
    function t(key, share, rate0, e) { m[key] = { base: share[g] * tr, rate0: rate0 ? rate0[g] : null, e: e }; }
    t('incBasic', [0.14, 0.07, 0.04], [20, 15, 10], 0.12);
    t('incTop', [0.14, 0.07, 0.03], [45, 35, 30], 0.40);
    t('corp', [0.07, 0.14, 0.10], [25, 28, 30], 0.60);
    t('vat', [0.17, 0.28, 0.25], [20, 16, 15], 0.10);
    t('duty', [0.07, 0.10, 0.10], null, 0.30);
    t('property', [0.08, 0.03, 0.01], null, 0.05);
    t('cgt', [0.015, 0.005, 0.001], [20, 15, 10], 0.80);
    t('inherit', [0.010, 0.002, 0.0005], [20, 10, 5], 0.35);
    m.fuel = { base: [0.8, 0.8, 0.5][g], rate0: null, e: 0.3 };
    return m;
  }
  function spendFor(pf) {
    var g = grp(pf), o = {};
    var t = { health: [7, 3.5, 1.8], education: [5, 4, 3], defence: [2, 1.5, 1.5], police: [1.8, 1.5, 1], local: [3, 2, 1], pay: [10, 8, 6], unemp: [0.5, 0.1, 0.02], pensions: [6, 2.5, 0.5], child: [1.2, 0.3, 0.05], housing: [1, 0.2, 0.02] };
    Object.keys(t).forEach(function (k) { o[k] = t[k][g]; });
    return o;
  }
  var INFRA_BASE = { roads: [1.0, 1.5, 2.0], rail: [0.6, 0.3, 0.1], ports: [0.1, 0.2, 0.3], digital: [0.15, 0.3, 0.2], water: [0.3, 0.5, 0.6], housingInfra: [0.3, 0.3, 0.3], renew: [0.2, 0.3, 0.3], nuclear: [0.1, 0, 0], grid: [0.3, 0.3, 0.3], school: [0.5, 0.6, 0.6], university: [0.3, 0.2, 0.1], vocational: [0.1, 0.1, 0.1], adult: [0.05, 0.03, 0.02], earlyYears: [0.3, 0.1, 0.05], rd: [0.6, 0.3, 0.1] };
  var R = function (t, e) { return t * Math.pow(1 - t, e); };
  function taxRev(X, k, dpp) { var m = X.mix[k], r0 = m.rate0 / 100, r1 = clamp(r0 + dpp / 100, 0.001, 0.95); return m.base / 100 * (R(r1, m.e) / R(r0, m.e) - 1); }
  function linRev(X, k, pct, e) { return X.mix[k].base / 100 * (pct / 100) * (1 - (e || 0)); }
  var oneOff = function (total, dur, k) { return k < dur ? total * 4 / dur : 0; };   // spread a one-off amount over dur quarters, as an annual rate

  var SEC = {
    tariff: { all: 1, consumer: 0.35, intermediate: 0.40, food: 0.12, energy: 0.12, manufacturing: 0.55 },
    dereg: { all: 1, retail: 0.3, energy: 0.3, finance: 0.25, transport: 0.2, manufacturing: 0.35, professional: 0.2 },
    sanction: { all: 1, energy: 0.4, finance: 0.3, technology: 0.3, arms: 0.05 },
    cap: { all: 0.35, food: 0.12, energy: 0.08, housing: 0.08 }
  };
  var opts = function (o) { return Object.keys(o).map(function (k) { return { v: k, l: k.charAt(0).toUpperCase() + k.slice(1) }; }); };
  var lst = function (arr) { return arr.map(function (k) { return { v: k, l: k.charAt(0).toUpperCase() + k.slice(1) }; }); };

  /* ---------- controls ---------- */
  // sl: a slider that also has a number box. exact:true puts the number box first (for policies that need a precise value).
  var sl = function (min, max, step, unit, o) { return Object.assign({ t: 'slider', min: min, max: max, step: step, unit: unit, def: 0 }, o || {}); };
  var sel = function (options, def) { return { t: 'select', options: options, def: def == null ? options[0].v : def }; };
  var infra = function (id) { return function (X) { var b = INFRA_BASE[id] ? pick(INFRA_BASE[id], X.pf) : 0; return sl(-b, 3, 0.05, '% of GDP per year', { base: b }); }; };

  var AREAS = ['Income tax', 'Business tax', 'Consumption tax', 'Wealth and property', 'Government spending', 'Welfare', 'Infrastructure', 'Energy', 'Human capital', 'Labour market', 'Business and supply side', 'Innovation', 'Housing', 'Trade', 'Foreign investment', 'Industrial policy', 'Environment', 'Regional', 'Migration and labour supply', 'Monetary', 'Exchange rate', 'Banking and finance', 'Fiscal framework', 'Debt management', 'Development', 'Agriculture and food', 'Crisis controls'];

  var CAT = [];
  // C(id, area, name, choice, ctl, enters, fn, more)   more: {gate, dur, now, opt}
  function C(id, area, name, choice, ctl, enters, fn, more) { CAT.push(Object.assign({ id: id, area: area, name: name, choice: choice, ctl: typeof ctl === 'function' ? ctl({ pf: { incomeRel: 0.9 } }) : ctl, ctlFn: typeof ctl === 'function' ? ctl : null, enters: enters, fn: fn }, more || {})); }

  function carbon(X, o, p) {
    var pf = X.pf, intens = pick([0.11, 0.30, 0.40], pf), cov = 0.7, abate = Math.min(0.5, 0.0010 * p);
    var rev = p * intens / 1000 * cov * (1 - abate), en = pick([1, 1.3, 1.5], pf);
    o.rev(rev); o.yd(-rev, 1.0);
    o.a('cpiLevel', 0.010 * p * en); o.a('costLevel', 0.012 * p * en); o.a('emisPct', -Math.min(45, 0.10 * p)); o.a('tfp', -0.0015 * p);
    o.a('giniPol', 0.003 * p * en); o.a('povPol', 0.004 * p * en);
  }
  function tariffFx(X, o, avg, inter) {
    var ms = X.d.ms;
    o.a('tariff', avg); o.a('mAdd', -0.5 * avg); o.rev(ms * avg / 100); o.a('xAdd', -0.4 * avg); o.a('tfp', -0.05 * avg); o.a('costLevel', 0.12 * avg * inter);
  }
  function nation(X, o, cost, share, k, tfp) { o.a('debtAdd', oneOff(cost * share / 100, 4, k)); o.a('tfp', tfp * share / 100); o.tr(0.002 * share / 100); }

  /* INCOME TAX */
  C('inc_basic', 'Income tax', 'Basic income-tax rate', 'Rate up or down', sl(-10, 10, 0.5, 'pp change', { exact: true }), 'Revenue = base × Laffer curve (elasticity of taxable income 0.12). Households lose the net revenue, weighted by MPC. Labour supply -0.10% per pp.',
    function (v, X, o) { var d = taxRev(X, 'incBasic', v); o.rev(d); o.yd(-d, 1.0); o.a('lab', -0.10 * v); o.a('giniPol', 0.03 * v); }, { now: function (X) { return X.mix.incBasic.rate0 + '%'; } });
  C('inc_top', 'Income tax', 'Higher / top income-tax rate', 'Rate up or down', sl(-20, 30, 0.5, 'pp change', { exact: true }), 'Laffer curve with taxable-income elasticity 0.40: revenue peaks near 71%. Falls mostly on high earners (low MPC).',
    function (v, X, o) { var d = taxRev(X, 'incTop', v); o.rev(d); o.yd(-d, 0.4); o.a('lab', -0.02 * v); o.a('tfp', -0.01 * v); o.a('giniPol', -0.12 * v); }, { now: function (X) { return X.mix.incTop.rate0 + '%'; } });
  C('allowance', 'Income tax', 'Personal allowance / tax-free threshold', 'Threshold up or down', sl(-30, 30, 1, '% of average earnings', { exact: true }), 'Each 1% of average earnings costs about 0.04% of GDP. Goes mostly to lower earners (high MPC) and draws in workers at the margin.',
    function (v, X, o) { var d = -0.0004 * (X.pf.taxRatio / 0.37) * (1 - X.pf.informality) * v; o.rev(d); o.yd(-d, 1.2); o.a('lab', 0.01 * v); o.a('giniPol', -0.05 * v); o.a('povPol', -0.03 * v); });

  /* BUSINESS TAX */
  C('corp', 'Business tax', 'Corporation tax', 'Rate up or down', sl(-15, 15, 0.5, 'pp change', { exact: true }), 'Revenue on a Laffer curve (elasticity 0.6). Raises the effective tax on new investment one for one; investment falls 0.8% per pp.',
    function (v, X, o) { var d = taxRev(X, 'corp', v); o.rev(d); o.yd(-d * 0.3, 0.6); o.a('corpETR', v); o.a('giniPol', -0.02 * v); }, { now: function (X) { return X.mix.corp.rate0 + '%'; } });
  C('inv_allow', 'Business tax', 'Investment tax allowance', 'Generosity', sl(0, 10, 0.5, 'pp off the effective tax rate'), 'Costs revenue in proportion to the corporate base and cuts the effective tax on new investment.',
    function (v, X, o) { o.rev(-X.mix.corp.base / 100 * (v / X.mix.corp.rate0) * 0.6); o.a('corpETR', -v); });
  C('rd_credit', 'Business tax', 'R&D tax credits', 'Size', sl(0, 0.5, 0.01, '% of GDP', { exact: true }), 'Each 1 of credit brings about 1 of extra private R&D, building a knowledge stock that raises productivity after ~2 years.',
    function (v, X, o) { o.inv('privRD', v / 100); });

  /* CONSUMPTION TAX */
  C('vat', 'Consumption tax', 'VAT / sales tax', 'Rate up or down', sl(-10, 10, 0.5, 'pp change', { exact: true }), 'Nearly linear revenue (0.1 elasticity). One-off rise in the price level of about 0.5% per pp, spread over a year. Regressive.',
    function (v, X, o) { var d = taxRev(X, 'vat', v); o.rev(d); o.yd(-d, 0.6); o.a('cpiLevel', 0.9 * 0.65 * v / (1 + X.mix.vat.rate0 / 100)); o.a('giniPol', 0.05 * v); o.a('povPol', 0.08 * v); }, { now: function (X) { return X.mix.vat.rate0 + '%'; } });
  C('duties', 'Consumption tax', 'Duties on specific goods', 'Rate up or down', sl(-50, 100, 5, '% change'), 'Revenue with a 0.3 avoidance offset; small direct effect on the price level.',
    function (v, X, o) { var d = linRev(X, 'duty', v, 0.3); o.rev(d); o.yd(-d, 0.6); o.a('cpiLevel', 0.03 * v); });

  /* WEALTH AND PROPERTY */
  C('property', 'Wealth and property', 'Property / land taxation', 'Rate up or down', sl(-50, 100, 5, '% change'), 'Hardly distorts activity (0.05). Capitalised into property values, so a rise lowers household wealth a little.',
    function (v, X, o) { var d = linRev(X, 'property', v, 0.05); o.rev(d); o.yd(-d, 0.5); o.a('wealthPol', -0.05 * v); o.a('giniPol', -0.02 * v); });
  C('cgt', 'Wealth and property', 'Capital-gains taxation', 'Rate up or down', sl(-15, 20, 0.5, 'pp change', { exact: true }), 'Realisations respond strongly to the rate (0.8), so revenue rises less than proportionally. Lowers asset prices and entrepreneurship a little.',
    function (v, X, o) { var d = taxRev(X, 'cgt', v); o.rev(d); o.yd(-d, 0.3); o.a('wealthPol', -0.15 * v); o.a('tfp', -0.01 * v); o.a('giniPol', -0.05 * v); }, { now: function (X) { return X.mix.cgt.rate0 + '%'; } });
  C('inherit', 'Wealth and property', 'Inheritance / wealth taxation', 'Rate up or down', sl(-20, 30, 1, 'pp change'), 'Avoidance elasticity 0.35. Very small growth effect; reduces top-end inequality.',
    function (v, X, o) { var d = taxRev(X, 'inherit', v); o.rev(d); o.yd(-d, 0.2); o.a('wealthPol', -0.05 * v); o.a('tfp', -0.005 * v); o.a('giniPol', -0.04 * v); }, { now: function (X) { return X.mix.inherit.rate0 + '%'; } });

  /* GOVERNMENT SPENDING */
  var budget = function (id, key, imp, extra) { return function (v, X, o) { var x = X.sp[key] * v / 10000; extra(x, X, o, imp, v); }; };
  C('health', 'Government spending', 'Healthcare spending', 'Budget up or down', sl(-40, 60, 1, '% of the budget'), 'Three quarters is current spending (little import content); a quarter builds a health stock that raises productivity and participation.',
    budget('health', 'health', 0.12, function (x, X, o, imp) { o.cur(0.75 * x, imp * 0.75 * x); o.inv('health', 0.25 * x); }));
  C('education', 'Government spending', 'Education spending', 'Budget up or down', sl(-40, 60, 1, '% of the budget'), 'Three quarters current, a quarter into the school stock (20-quarter lag, large long-run productivity effect).',
    budget('education', 'education', 0.05, function (x, X, o, imp) { o.cur(0.75 * x, imp * 0.75 * x); o.inv('school', 0.25 * x); }));
  C('defence', 'Government spending', 'Defence spending', 'Budget up or down', sl(-40, 60, 1, '% of the budget'), 'Demand now, with 35% import content (equipment). No supply-side effect.',
    budget('defence', 'defence', 0.35, function (x, X, o, imp) { o.cur(x, imp * x); }));
  C('policing', 'Government spending', 'Policing and justice spending', 'Budget up or down', sl(-40, 60, 1, '% of the budget'), 'Mostly wages. Small productivity gain through institutional quality.',
    budget('policing', 'police', 0.05, function (x, X, o, imp) { o.cur(x, imp * x); o.a('tfp', 10 * x); }));
  C('local', 'Government spending', 'Local / regional government funding', 'Budget up or down', sl(-40, 60, 1, '% of the budget'), 'Passed on to local services; slightly more spent locally, so slightly less leakage.',
    budget('local', 'local', 0.08, function (x, X, o, imp) { o.cur(x, imp * x); }));
  C('pay', 'Government spending', 'Public-sector pay', 'Pay settlement', sl(-10, 15, 0.5, '% pay rise', { exact: true }), 'Wage bill × settlement, spent almost entirely at home. Spills into private pay (cost pressure).',
    function (v, X, o) { var x = X.sp.pay * v / 10000; o.cur(x, 0.05 * x); o.a('costLevel', 0.02 * v); });

  /* WELFARE */
  var welfare = function (key, w, gini, pov, extra) { return function (v, X, o) { var x = X.sp[key] * v / 10000; o.tr(x); o.yd(x, w); o.a('giniPol', gini * x * 100); o.a('povPol', pov * x * 100); if (extra) extra(v, x, o); }; };
  C('unemp_ben', 'Welfare', 'Unemployment benefits', 'Generosity up or down', sl(-50, 50, 1, '% of the payment'), 'Goes to high-MPC households and steadies demand. A 10% higher replacement rate adds about 0.1pp to structural unemployment.',
    welfare('unemp', 1.3, -0.5, -1.0, function (v, x, o) { o.a('ust', 0.010 * v); }));
  C('pensions', 'Welfare', 'Pensions', 'Generosity', sl(-30, 30, 1, '% of the payment'), 'Mostly spent (weight 0.9). Retirement age is a separate lever.',
    welfare('pensions', 0.9, -0.3, -0.5));
  C('child_ben', 'Welfare', 'Child and family benefits', 'Generosity', sl(-50, 100, 1, '% of the payment'), 'High MPC; the strongest poverty lever per pound. Small income effect on hours.',
    welfare('child', 1.2, -0.5, -1.2, function (v, x, o) { o.a('lab', -0.002 * v); }));
  C('housing_support', 'Welfare', 'Housing support', 'Generosity', sl(-50, 100, 1, '% of the payment'), 'High MPC; part is capitalised into rents and house prices.',
    welfare('housing', 1.1, -0.4, -0.8, function (v, x, o) { o.a('wealthPol', 0.02 * v); }));
  C('ubi', 'Welfare', 'Universal cash transfers', 'Amount / eligibility', sl(0, 8, 0.1, '% of GDP', { exact: true }), 'Paid to everyone, high MPC. Very small fall in hours (income effect -0.05% per % of GDP).',
    function (v, X, o) { var x = v / 100; o.tr(x); o.yd(x, 1.2); o.a('lab', -0.05 * v); o.a('giniPol', -0.4 * v); o.a('povPol', -1.3 * v); });

  /* INFRASTRUCTURE */
  [['roads', 'Roads'], ['rail', 'Rail and public transport'], ['ports', 'Ports and logistics'], ['digital', 'Digital and broadband'], ['water', 'Water infrastructure'], ['housingInfra', 'Housing infrastructure']].forEach(function (p) {
    C('inf_' + p[0], 'Infrastructure', p[1], 'Investment', infra(p[0]), 'Demand now (70% domestic content), then a capital stock after ' + E.PROG[p[0]].delay + ' quarters. Output elasticity ' + E.PROG[p[0]].tfp + '. Waste falls with institutional quality.',
      function (v, X, o) { o.inv(p[0], v / 100); });
  });

  /* ENERGY */
  C('renew', 'Energy', 'Renewable-energy investment', 'Scale', infra('renew'), 'Capacity after 8 quarters: cuts emissions, cushions energy-price shocks.', function (v, X, o) { o.inv('renew', v / 100); });
  C('nuclear', 'Energy', 'Nuclear-energy investment', 'Scale', infra('nuclear'), 'A 32-quarter build: almost nothing for years, then large emissions and energy-security gains.', function (v, X, o) { o.inv('nuclear', v / 100); });
  C('fossil', 'Energy', 'Fossil-fuel production', 'Expand or restrict', sl(-1, 1, 0.1, 'restrict to expand'), 'Expanding lowers domestic energy prices and raises royalties, but raises emissions.',
    function (v, X, o) { o.a('cpiLevel', -0.3 * v); o.a('emisPct', 8 * v); o.a('tfp', 0.02 * v); o.rev(0.002 * v * (X.pf.commExport > 0 ? 1 : 0.3)); });
  C('grid', 'Energy', 'Electricity-grid investment', 'Scale', infra('grid'), 'Productivity and a modest energy cushion; needed for renewables to pay off.', function (v, X, o) { o.inv('grid', v / 100); });
  C('hh_energy_sub', 'Energy', 'Household energy subsidy', 'Amount', sl(0, 3, 0.05, '% of GDP', { exact: true }), 'Household energy is ~3.5% of GDP and ~6% of the CPI basket, so each 1% of GDP cuts prices ~28% and CPI ~1.7%. Costs the budget; raises demand for energy.',
    function (v, X, o) { var x = v / 100; o.tr(x); o.a('cpiLevel', -1.7 * v); o.yd(x, 0.5); o.a('emisPct', 1.5 * v); });
  C('biz_energy_sub', 'Energy', 'Business energy subsidy', 'Amount', sl(0, 2, 0.05, '% of GDP', { exact: true }), 'Firms\' energy costs fall, which lowers cost pressure and lifts investment slightly.',
    function (v, X, o) { o.tr(v / 100); o.a('costLevel', -1.25 * v); o.a('invBoost', 0.3 * v); o.a('emisPct', 1.0 * v); });

  /* HUMAN CAPITAL */
  [['school', 'School investment', '20-quarter lag; the largest long-run productivity effect of any programme'], ['university', 'University funding', '24-quarter lag'], ['vocational', 'Vocational training / apprenticeships', 'Lowers structural unemployment'], ['adult', 'Adult retraining', 'Fast (4 quarters) but wears out quickly; small effect on unemployment'], ['earlyYears', 'Early-years investment', '28-quarter lag; raises parental participation and later productivity']].forEach(function (p) {
    C('hc_' + p[0], 'Human capital', p[1], 'Scale', infra(p[0]), p[2] + '. Output elasticity ' + E.PROG[p[0]].tfp + (E.PROG[p[0]].ust ? ', structural unemployment ' + E.PROG[p[0]].ust + 'pp per 1% of stock' : '') + '.', function (v, X, o) { o.inv(p[0], v / 100); });
  });

  /* LABOUR MARKET */
  C('min_wage', 'Labour market', 'Minimum wage', 'Level', sl(-30, 30, 1, '% change', { exact: true }), 'Raises pay at the bottom (+), a small employment cost (0.01pp of unemployment per %), and a cost pressure on prices. Lowers poverty.',
    function (v, X, o) { o.a('ust', 0.010 * v); o.a('costLevel', 0.03 * v); o.a('giniPol', -0.06 * v); o.a('povPol', -0.06 * v); o.yd(0.0005 * v, 1.3); });
  C('emp_sub', 'Labour market', 'Employment subsidies', 'Size and target', sl(0, 1, 0.05, '% of GDP'), 'Lowers structural unemployment (-0.25pp per 1% of GDP). Paid to firms, so little direct demand.', function (v, X, o) { o.tr(v / 100); o.yd(0.3 * v / 100, 1.0); o.a('ust', -0.25 * v); });
  C('hire_credit', 'Labour market', 'Hiring tax credits', 'Size', sl(0, 0.5, 0.05, '% of GDP'), 'Faster than a general subsidy, smaller lasting effect on unemployment.', function (v, X, o) { o.tr(v / 100); o.a('ust', -0.15 * v); });
  C('epl', 'Labour market', 'Employment protection', 'Strengthen or weaken', sl(-1, 1, 0.1, 'weaker to stronger'), 'Stronger rules protect jobs in slumps (less scarring) but raise structural unemployment slightly and lower productivity.', function (v, X, o) { o.a('ust', 0.08 * v); o.a('tfp', -0.3 * v); o.a('uProtect', 0.2 * v); });
  C('worktime', 'Labour market', 'Working-time rules', 'Strengthen or weaken', sl(-1, 1, 0.1, 'looser to stricter'), 'Shorter hours cut labour input and add to unit costs.', function (v, X, o) { o.a('lab', -0.8 * v); o.a('costLevel', 0.3 * v); });
  C('unions', 'Labour market', 'Union and collective-bargaining rules', 'Strengthen or weaken', sl(-1, 1, 0.1, 'weaker to stronger'), 'Higher pay floors and indexation, lower inequality, slightly higher structural unemployment.', function (v, X, o) { o.a('ust', 0.10 * v); o.a('giniPol', -0.4 * v); o.a('costLevel', 0.2 * v); });
  C('retire', 'Labour market', 'Retirement age', 'Raise or lower', sl(-3, 5, 0.5, 'years', { exact: true }), 'Each year adds about 0.5% to labour supply and saves ~5% of pension spending.', function (v, X, o) { var x = -X.sp.pensions * 0.05 * v / 100; o.tr(x); o.yd(x, 0.9); o.a('lab', 0.5 * v); o.a('giniPol', 0.05 * v); },
    { now: function (X) { return pick([66, 62, 60], X.pf) + ' now'; } });

  /* BUSINESS AND SUPPLY SIDE */
  C('biz_subsidy', 'Business and supply side', 'Business subsidies', 'Sector and amount', sl(0, 2, 0.05, '% of GDP', { pickOpts: lst(['manufacturing', 'services', 'agriculture', 'technology', 'construction']) }), 'Demand plus a small lift to investment (evidence on picking sectors is weak, so no productivity gain assumed).', function (v, X, o) { o.cur(v / 100, 0); o.a('invBoost', 0.4 * v); });
  C('sme', 'Business and supply side', 'SME support', 'Scale', sl(0, 1, 0.05, '% of GDP'), 'Eases credit for small firms and funds some capacity.', function (v, X, o) { o.cur(0.7 * v / 100, 0); o.inv('strategic', 0.3 * v / 100); o.a('creditRelief', 0.2 * v); });
  C('dereg', 'Business and supply side', 'Deregulation programme', 'Sector and intensity', sl(0, 1, 0.05, 'intensity', { pickOpts: opts(SEC.dereg) }), 'Product-market reform raises productivity (about 0.6% at full intensity across the economy) and lowers cost pressure; widens inequality a little.', function (v, X, o, m) { var s = SEC.dereg[m.opt || 'all']; o.a('tfp', 0.6 * v * s); o.a('costLevel', -0.2 * v * s); o.a('giniPol', 0.1 * v * s); });
  C('compete', 'Business and supply side', 'Competition-policy enforcement', 'Strength', sl(0, 1, 0.05, 'strength'), 'Lower mark-ups: lower cost pressure and higher productivity.', function (v, X, o) { o.a('tfp', 0.25 * v); o.a('costLevel', -0.3 * v); });
  var PRIV = { utilities: [1.5, 0.15, 0.15], transport: [0.8, 0.10, 0.05], telecom: [1.0, 0.10, -0.10], energy: [2.0, 0.15, 0.10], postal: [0.3, 0.05, 0.0] };
  C('privatise', 'Business and supply side', 'Privatisation', 'Which state enterprise', sl(0, 100, 5, '% sold', { pickOpts: opts(PRIV) }), 'Sale proceeds cut debt (one-off, over a year). Efficiency gain in productivity; prices for the sold service can rise.', function (v, X, o, m) { var p = PRIV[m.opt || 'utilities']; o.a('debtAdd', -oneOff(p[0] * v / 100 / 100, 4, m.k)); o.a('tfp', p[1] * v / 100); o.a('cpiLevel', p[2] * v / 100); });
  var NAT = { rail: [0.4, -0.1], energy: [1.5, -0.1], water: [0.9, -0.08], banks: [2.5, -0.1], steel: [0.3, -0.05], telecom: [0.8, -0.08] };
  C('nationalise', 'Business and supply side', 'Nationalisation', 'Which industry', sl(0, 100, 5, '% acquired', { pickOpts: opts(NAT) }), 'Purchase cost adds to debt (one-off); ongoing subsidy; lower efficiency. Banks also ease credit.', function (v, X, o, m) { var p = NAT[m.opt || 'rail']; nation(X, o, p[0] / 100, v, m.k, p[1]); if (m.opt === 'banks') o.a('creditRelief', 0.3 * v / 100); });
  C('planning', 'Business and supply side', 'Planning reform', 'Strength', sl(0, 1, 0.05, 'strength'), 'Faster building lowers house prices, raises productivity and labour mobility.', function (v, X, o) { o.a('wealthPol', -3 * v); o.a('tfp', 0.3 * v); o.a('lab', 0.05 * v); });
  C('ent_zones', 'Business and supply side', 'Enterprise zones', 'Location and incentives', sl(0, 1, 0.05, 'incentive', { pickOpts: lst(['north', 'coast', 'inner city', 'border region']) }), 'Costs a little revenue; small, mostly displaced local gains (evidence is weak).', function (v, X, o) { o.rev(-0.0005 * v); o.a('tfp', 0.02 * v); o.a('invBoost', 0.15 * v); });

  /* INNOVATION */
  [['gov_rd', 'Government R&D', 'rd', 'Knowledge stock after 12 quarters; slow depreciation'], ['priv_rd', 'Private R&D subsidies', 'privRD', 'Crowds in private R&D; 8-quarter lag'], ['adoption', 'Technology adoption incentives', 'adopt', 'Diffusion is faster than invention: 6 quarters'], ['univ_ind', 'University-industry research funding', 'univInd', '12 quarters']].forEach(function (p) {
    C(p[0], 'Innovation', p[1], 'Scale', sl(0, 1.5, 0.05, '% of GDP per year'), p[3] + '. Productivity elasticity ' + E.PROG[p[2]].tfp + '.', function (v, X, o) { o.inv(p[2], v / 100); });
  });

  /* HOUSING */
  C('housebuild', 'Housing', 'Government housebuilding', 'Number / investment', sl(0, 2, 0.05, '% of GDP per year', { exact: true }), 'New homes add to the housing stock after 8 quarters and lower house prices (about 2% per 1% more stock).', function (v, X, o) { o.inv('housingBuild', v / 100); });
  C('plan_lib', 'Housing', 'Planning liberalisation', 'Degree', sl(0, 1, 0.05, 'degree'), 'Lowers house prices (-2.5%) and improves matching in the labour market.', function (v, X, o) { o.a('wealthPol', -2.5 * v); o.a('tfp', 0.1 * v); });
  C('first_buyer', 'Housing', 'First-buyer subsidy', 'Size', sl(0, 1, 0.05, '% of GDP'), 'Mostly capitalised into prices: house prices rise about 1.5% per 1% of GDP.', function (v, X, o) { o.tr(v / 100); o.a('wealthPol', 1.5 * v); });
  C('rent_reg', 'Housing', 'Rent regulation', 'Strength', sl(0, 1, 0.05, 'strength'), 'Lowers measured rents (CPI -0.35 at full strength) but cuts supply and mobility over time.', function (v, X, o) { o.a('cpiLevel', -0.35 * v); o.a('wealthPol', -0.5 * v); o.a('tfp', -0.1 * v); });
  C('prop_struct', 'Housing', 'Property taxation (structure)', 'Rate / structure', sl(-50, 100, 5, '% change'), 'A shift toward land value taxation: less distortion than a tax on buildings, so a smaller wealth effect.', function (v, X, o) { var d = linRev(X, 'property', v, 0.02); o.rev(d); o.yd(-d, 0.5); o.a('wealthPol', -0.03 * v); });

  /* TRADE */
  C('tariff', 'Trade', 'Import tariff', 'Product or sector and rate', sl(0, 40, 1, 'pp on that sector', { exact: true, pickOpts: opts(SEC.tariff) }), 'Raises import prices (80% pass-through) and revenue; imports fall (elasticity 0.8); partners retaliate; inputs cost more.', function (v, X, o, m) { var s = SEC.tariff[m.opt || 'all']; tariffFx(X, o, v * s, m.opt === 'intermediate' || m.opt === 'manufacturing' ? 1 : 0.3); });
  C('tariff_cut', 'Trade', 'Remove or reduce a tariff', 'Product or sector', sl(0, 100, 5, '% of existing tariffs removed', { pickOpts: opts(SEC.tariff) }), 'The reverse of a tariff: cheaper imports, less revenue, slightly higher productivity.', function (v, X, o, m) { var s = SEC.tariff[m.opt || 'all']; tariffFx(X, o, -pick([2, 8, 12], X.pf) * s * v / 100, 0.6); });
  C('quota', 'Trade', 'Import quota', 'Product and quantity', sl(0, 50, 1, '% cut in imports', { pickOpts: opts(SEC.tariff) }), 'Cuts import volume directly; scarcity raises prices (no revenue for the government).', function (v, X, o, m) { var s = SEC.tariff[m.opt || 'all']; o.a('mAdd', -0.9 * s * v); o.a('tariff', 0.3 * s * v); });
  C('export_sub', 'Trade', 'Export subsidy / support', 'Sector and amount', sl(0, 1, 0.05, '% of GDP', { pickOpts: opts(SEC.dereg) }), 'Raises exports about 1.5% per 1% of GDP; costs the budget.', function (v, X, o) { o.tr(v / 100); o.a('xAdd', 1.5 * v); });
  C('fta', 'Trade', 'Free-trade agreement', 'Partner', sl(0, 1, 0.05, 'depth', { pickOpts: lst(['small market', 'medium market', 'large market']) }), 'Gravity-model gains: more exports and imports, a little more productivity.', function (v, X, o, m) { var w = { 'small market': 0.4, 'medium market': 0.8, 'large market': 1.2 }[m.opt || 'medium market']; o.a('xAdd', 3 * w * v); o.a('mAdd', 2.5 * w * v); o.a('tfp', 0.15 * w * v); });
  C('customs', 'Trade', 'Join or leave a customs arrangement', 'Agreement', sel([{ v: '0', l: 'No change' }, { v: '1', l: 'Join a customs union' }, { v: '-1', l: 'Leave a customs union' }]), 'Joining lowers trade costs with the bloc; leaving does the opposite.', function (v, X, o) { v = +v; o.a('xAdd', 2.5 * v); o.a('mAdd', 2 * v); o.a('tfp', 0.2 * v); });
  C('sanctions', 'Trade', 'Trade restrictions / sanctions', 'Country or sector', sl(0, 1, 0.05, 'strength', { pickOpts: opts(SEC.sanction) }), 'Cuts trade with the target; scarcity lifts prices.', function (v, X, o, m) { var s = SEC.sanction[m.opt || 'all']; o.a('xAdd', -4 * v * s); o.a('mAdd', -3 * v * s); o.a('cpiLevel', 0.3 * v * s); o.a('tfp', -0.05 * v * s); });

  /* FDI */
  C('fdi_inc', 'Foreign investment', 'Foreign-investment incentives', 'Size', sl(0, 1, 0.05, 'generosity'), 'Lifts investment (more in poorer countries) and brings productivity spill-overs; costs some revenue.', function (v, X, o) { o.a('invBoost', 1.2 * v * (1 - 0.5 * X.pf.incomeRel)); o.a('tfp', 0.10 * v); o.rev(-0.002 * v); });
  C('fdi_own', 'Foreign investment', 'Foreign-ownership restrictions', 'Tighten or loosen', sl(-1, 1, 0.1, 'looser to tighter'), 'Tighter rules deter investment and technology transfer.', function (v, X, o) { o.a('invBoost', -1.0 * v); o.a('tfp', -0.15 * v); });
  C('fdi_screen', 'Foreign investment', 'Investment screening', 'Strength', sl(0, 1, 0.05, 'strength'), 'Security benefit; a small deterrent to investment.', function (v, X, o) { o.a('invBoost', -0.3 * v); });
  C('sez', 'Foreign investment', 'Special economic zones', 'Location and incentives', sl(0, 1, 0.05, 'incentive', { pickOpts: lst(['port city', 'border', 'inland hub']) }), 'Attracts investment into the zone; tax cost; modest spill-overs.', function (v, X, o) { o.a('invBoost', 0.4 * v); o.a('tfp', 0.05 * v); o.rev(-0.0015 * v); });

  /* INDUSTRIAL */
  C('strat_sub', 'Industrial policy', 'Strategic-industry subsidy', 'Industry and amount', sl(0, 1, 0.05, '% of GDP', { pickOpts: lst(['semiconductors', 'steel', 'automotive', 'aerospace', 'AI and software']) }), 'Builds a capital stock with a small productivity return (industrial-policy evidence is mixed).', function (v, X, o) { o.inv('strategic', v / 100); });
  C('procure', 'Industrial policy', 'Domestic procurement preference', 'Strength', sl(0, 1, 0.05, 'strength'), 'More government purchases stay at home (demand), at the price of higher costs and less efficiency.', function (v, X, o) { o.a('dem', 0.006 * v); o.a('costLevel', 0.4 * v); o.a('tfp', -0.15 * v); });
  C('mfg', 'Industrial policy', 'Manufacturing strategy', 'Funding', sl(0, 1, 0.05, '% of GDP'), '12-quarter lag; small productivity gain.', function (v, X, o) { o.inv('mfg', v / 100); });
  C('green_ind', 'Industrial policy', 'Green-industry strategy', 'Funding', sl(0, 1, 0.05, '% of GDP'), 'Productivity and emissions intensity.', function (v, X, o) { o.inv('greenInd', v / 100); });

  /* ENVIRONMENT */
  C('carbon', 'Environment', 'Carbon tax', 'Rate', sl(0, 200, 5, '$ per tonne CO2', { exact: true }), 'Revenue = price × emissions × coverage; energy prices and costs rise; emissions fall 0.1% per $; regressive unless rebated.', function (v, X, o) { carbon(X, o, v); });
  C('ets', 'Environment', 'Emissions trading', 'Cap', sl(0, 60, 1, '% below the baseline'), 'A tighter cap is equivalent to a carbon price of about $1.7 per point of reduction.', function (v, X, o) { carbon(X, o, 1.7 * v); });
  C('green_sub', 'Environment', 'Green subsidies', 'Amount', sl(0, 1.5, 0.05, '% of GDP'), 'Buys clean capacity (70% additional).', function (v, X, o) { o.inv('greenPublic', 0.7 * v / 100); o.tr(0.3 * v / 100); });
  C('poll_reg', 'Environment', 'Pollution regulation', 'Strength', sl(0, 1, 0.05, 'strength'), 'Cuts emissions (-12% at full strength), raises costs, deters some investment.', function (v, X, o) { o.a('emisPct', -12 * v); o.a('invBoost', -0.5 * v); o.a('costLevel', 0.3 * v); o.a('tfp', -0.1 * v); });
  C('fuel_duty', 'Environment', 'Fuel duty', 'Rate', sl(-50, 100, 5, '% change'), 'A big share of the pump price, so prices move (0.018 CPI per %). Revenue with a 0.3 demand offset.', function (v, X, o) { var d = linRev(X, 'fuel', v, 0.3); o.rev(d); o.yd(-d, 0.6); o.a('cpiLevel', 0.018 * v); o.a('emisPct', -0.03 * v); });
  C('green_pub', 'Environment', 'Public green investment', 'Amount', sl(0, 2, 0.05, '% of GDP per year'), 'Public clean-energy and efficiency capacity.', function (v, X, o) { o.inv('greenPublic', v / 100); });

  /* REGIONAL */
  var REG = lst(['north', 'south west', 'midlands', 'coastal', 'rural interior']);
  C('reg_inv', 'Regional', 'Regional investment', 'Region and amount', sl(0, 1, 0.05, '% of GDP', { pickOpts: REG }), 'Aggregate effect only: 60% as productive as national projects because it is not placed where returns are highest.', function (v, X, o) { o.inv('strategic', 0.6 * v / 100); });
  C('reg_tax', 'Regional', 'Regional tax incentives', 'Region and size', sl(0, 1, 0.05, 'size', { pickOpts: REG }), 'Small revenue cost, small productivity gain, mostly displacement.', function (v, X, o) { o.rev(-0.0008 * v); o.a('tfp', 0.005 * v); });
  C('infra_redis', 'Regional', 'Infrastructure redistribution', 'Region', sl(0, 1, 0.05, 'share moved', { pickOpts: REG }), 'Moves spending away from the highest-return projects: a small aggregate loss.', function (v, X, o) { o.a('tfp', -0.02 * v); });
  C('relocation', 'Regional', 'Public-sector relocation', 'Region', sl(0, 1, 0.05, 'share moved', { pickOpts: REG }), 'One-off moving costs; small productivity loss.', function (v, X, o) { o.tr(0.0004 * v); o.a('tfp', -0.01 * v); });

  /* MIGRATION */
  C('mig_skilled', 'Migration and labour supply', 'Skilled-work migration rules', 'Loosen or tighten', sl(-1, 1, 0.1, 'tighter to looser'), 'Adds labour supply and productivity, a net fiscal gain, and some housing pressure.', function (v, X, o) { o.a('lab', 0.5 * v); o.a('tfp', 0.15 * v); o.rev(0.001 * v); o.a('wealthPol', 0.4 * v); o.a('costLevel', -0.05 * v); });
  C('mig_general', 'Migration and labour supply', 'General work migration rules', 'Loosen or tighten', sl(-1, 1, 0.1, 'tighter to looser'), 'More labour supply, some wage pressure relief, housing demand.', function (v, X, o) { o.a('lab', 0.8 * v); o.rev(0.0003 * v); o.a('costLevel', -0.1 * v); o.a('wealthPol', 0.6 * v); o.a('giniPol', 0.05 * v); });
  C('mig_students', 'Migration and labour supply', 'International-student / work rules', 'Loosen or tighten', sl(-1, 1, 0.1, 'tighter to looser'), 'Export earnings from education, some labour supply.', function (v, X, o) { o.a('lab', 0.3 * v); o.a('xAdd', 0.3 * v); o.rev(0.0004 * v); o.a('wealthPol', 0.2 * v); });
  C('childcare', 'Migration and labour supply', 'Childcare subsidy', 'Size', sl(0, 1, 0.05, '% of GDP'), 'Raises parental participation (+0.4% labour supply per 1% of GDP) and builds the early-years system.', function (v, X, o) { o.cur(0.7 * v / 100, 0); o.inv('earlyYears', 0.3 * v / 100); o.a('lab', 0.4 * v); });

  /* MONETARY (only where the government sets rates) */
  C('rate', 'Monetary', 'Policy interest rate', 'Rate', sl(0, 80, 0.25, '% policy rate', { exact: true, optional: true }), 'Overrides the rule. Reaches demand over about 3 quarters, through mortgages, investment, saving and the exchange rate.', function (v, X, o) { o.rate = v; }, { gate: 'gov', now: function (X) { return (X.pf.rstar + X.pf.target).toFixed(2) + '%'; } });
  C('cb_indep', 'Monetary', 'Central bank independence', 'Rule', sel([{ v: '0', l: 'No change' }, { v: '1', l: 'Ban the central bank from financing the deficit' }, { v: '2', l: 'Make the central bank independent' }]), 'Ends printing money to cover the deficit and rebuilds trust in the central bank, so expectations of inflation come back down. The classic first step out of high inflation.', function (v, X, o) { v = +v; o.a('cbIndep', v === 2 ? 1 : v === 1 ? 0.5 : 0); }, { gate: 'govcb' });
  C('qe', 'Monetary', 'Quantitative easing', 'Size', sl(0, 30, 1, '% of GDP purchased'), 'Lowers the effective rate ~0.10pp per 1% of GDP, lifts asset prices, weakens the currency slightly, lowers bond yields.', function (v, X, o) { o.a('qe', v); }, { gate: 'gov' });
  C('qt', 'Monetary', 'Quantitative tightening', 'Size', sl(0, 10, 1, '% of GDP sold'), 'The mirror image of QE.', function (v, X, o) { o.a('qe', -v); }, { gate: 'gov' });
  C('reserve_req', 'Monetary', 'Reserve requirements', 'Rate', sl(0, 10, 0.5, 'pp increase'), 'Banks lend less: credit conditions tighten (+0.06 per pp).', function (v, X, o) { o.a('creditTight', 0.06 * v); }, { gate: 'gov' });
  C('credit_ctrl', 'Monetary', 'Credit controls', 'Strength', sl(0, 1, 0.05, 'strength'), 'Direct limits on lending: credit conditions tighten.', function (v, X, o) { o.a('creditTight', 0.5 * v); }, { gate: 'gov' });

  /* EXCHANGE RATE */
  C('fx_int', 'Exchange rate', 'FX intervention', 'Buy or sell currency', sl(-5, 5, 0.25, '% of GDP (+ buys the currency)'), 'Sterilised intervention moves the rate about 0.25% per 1% of GDP and uses reserves.', function (v, X, o) { o.a('fxInt', v); }, { gate: 'notunion' });
  C('fixed_fx', 'Exchange rate', 'Fixed exchange rate', 'Target', sel([{ v: '0', l: 'Floating' }, { v: '1', l: 'Fix at today\'s rate' }]), 'Rates follow the anchor; the currency is held until reserves run out.', function (v, X, o) { if (+v === 1) o.a('peg', 1); }, { gate: 'notunion' });
  C('devalue', 'Exchange rate', 'Devaluation / revaluation', 'New target', sl(-40, 20, 1, '% vs today', { exact: true }), 'Moves the fixed rate to a new level at once: import prices and exports respond; debt in foreign currency jumps.', function (v, X, o) { if (v !== 0) { o.a('peg', 1); o.ch.pegTo = v; } }, { gate: 'notunion' });
  C('cap_ctrl', 'Exchange rate', 'Capital controls', 'Strength', sl(0, 1, 0.05, 'strength'), 'Shields the currency from sudden stops but deters investment and costs efficiency.', function (v, X, o) { o.a('capCtrl', v); o.a('tfp', -0.15 * v); o.a('invBoost', -0.8 * v); }, { gate: 'notunion' });

  /* BANKING */
  C('guarantee', 'Banking and finance', 'Deposit guarantee', 'Coverage', sl(0, 1, 0.05, 'coverage'), 'Dampens runs: banking shocks are 45% smaller at full coverage. Small moral hazard.', function (v, X, o) { o.a('guarantee', v); o.a('tfp', -0.02 * v); });
  C('bailout', 'Banking and finance', 'Bank bailout / recapitalisation', 'Institution and amount', sl(0, 5, 0.25, '% of GDP', { pickOpts: lst(['largest bank', 'mid-sized banks', 'whole system']) }), 'Adds to debt (one-off) and eases credit conditions.', function (v, X, o, m) { o.a('debtAdd', oneOff(v / 100, 4, m.k)); o.a('creditRelief', 0.5 * Math.min(v, 3)); });
  C('bank_nat', 'Banking and finance', 'Bank nationalisation', 'Institution', sl(0, 1, 0.1, 'share of system', { pickOpts: lst(['failing bank', 'largest bank']) }), 'Buys the bank (adds debt), restores lending, lowers efficiency.', function (v, X, o, m) { o.a('creditRelief', 0.4 * v); o.a('debtAdd', oneOff(0.02 * v, 4, m.k)); o.a('tfp', -0.1 * v); });
  C('bank_cap', 'Banking and finance', 'Bank capital requirements', 'Tighten or loosen', sl(-1, 1, 0.1, 'looser to tighter'), 'Tighter rules restrain lending now and make crises smaller later.', function (v, X, o) { if (v > 0) o.a('creditTight', 0.15 * v); else o.a('creditRelief', -0.15 * v); o.a('bankResil', 0.5 * v); });
  C('mortgage', 'Banking and finance', 'Mortgage lending restrictions', 'Tighten or loosen', sl(-1, 1, 0.1, 'looser to tighter'), 'Tighter limits cool house prices and lending and reduce crisis risk.', function (v, X, o) { o.a('wealthPol', -1.5 * v); o.a('creditTight', 0.1 * v); o.a('bankResil', 0.2 * v); });
  C('fin_reg', 'Banking and finance', 'Financial regulation', 'Tighten or loosen', sl(-1, 1, 0.1, 'looser to tighter'), 'More resilient system, a little less lending and productivity.', function (v, X, o) { o.a('bankResil', 0.4 * v); o.a('tfp', -0.03 * v); o.a('creditTight', 0.05 * v); });

  /* FISCAL FRAMEWORK */
  C('fiscal_rule', 'Fiscal framework', 'Fiscal rule', 'Rule / target', sel([{ v: '0', l: 'None' }, { v: '1', l: 'Balanced-budget rule (deficit at most 1%)' }, { v: '2', l: 'Golden rule (deficit at most 3%)' }, { v: '3', l: 'Debt brake (debt at most 60%)' }]), 'A credible rule lowers sovereign stress; breaking it raises it (measured in the fiscal-rule status).', function (v, X, o) { v = +v; if (!v) return; o.set('fiscalCred', 0.8); if (v === 1) o.set('defTarget', 1); if (v === 2) o.set('defTarget', 3); if (v === 3) o.set('debtTarget', 60); });
  C('debt_target', 'Fiscal framework', 'Debt target', 'Target', sl(30, 150, 5, '% of GDP', { exact: true, optional: true }), 'Markets reward a credible target and punish missing it.', function (v, X, o) { o.set('debtTarget', v); o.set('fiscalCred', Math.max(0.6, o.ch.fiscalCred || 0)); });
  C('def_target', 'Fiscal framework', 'Deficit target', 'Target', sl(0, 8, 0.5, '% of GDP', { exact: true, optional: true }), 'Markets reward a credible target and punish missing it.', function (v, X, o) { o.set('defTarget', v); o.set('fiscalCred', Math.max(0.6, o.ch.fiscalCred || 0)); });
  C('spend_ceil', 'Fiscal framework', 'Spending ceiling', 'Limit', sl(20, 60, 1, '% of GDP', { exact: true, optional: true }), 'A cap on total spending; a breach raises sovereign stress.', function (v, X, o) { o.set('spendCeil', v); o.set('fiscalCred', Math.max(0.5, o.ch.fiscalCred || 0)); });
  C('emerg_budget', 'Fiscal framework', 'Emergency budget', 'Package', sel([{ v: '0', l: 'None' }, { v: 'austerity', l: 'Austerity package' }, { v: 'stimulus', l: 'Stimulus package' }, { v: 'growth', l: 'Supply-side growth package' }, { v: 'cost', l: 'Cost-of-living package' }]), 'A preset bundle of the levers above. Choosing one fills those levers in; you can then edit each.', function () { }, { preset: true });

  /* DEBT MANAGEMENT */
  C('debt_issue', 'Debt management', 'Issue additional government debt', 'Amount and maturity', sl(0, 10, 0.5, '% of GDP'), 'Raises debt and builds a cash buffer that eases rollover stress. Costs interest.', function (v, X, o, m) { o.a('cashAdd', oneOff(v / 100, 4, m.k)); });
  C('maturity', 'Debt management', 'Alter debt maturity', 'Shorter or longer', sl(-5, 10, 0.5, 'years', { exact: true }), 'Longer debt costs ~0.08pp more per year of maturity but shields against rate spikes.', function (v, X, o) { o.a('matDelta', v); });
  C('fx_borrow', 'Debt management', 'Foreign-currency borrowing', 'Amount', sl(-20, 30, 1, 'pp of debt in foreign currency'), 'Cheaper by ~0.04pp per pp, but a fall in the currency inflates the debt.', function (v, X, o) { o.a('fxShare', v); });
  C('restructure', 'Debt management', 'Debt restructuring', 'Terms', sl(0, 60, 5, '% haircut', { exact: true }), 'Cuts debt now but closes markets for years: the risk premium jumps and credit tightens (Cruces and Trebesch 2013).', function (v, X, o, m) { if (m.k === 0) o.a('haircut', v); }, { gate: 'crisis' });

  /* DEVELOPMENT */
  C('dev_aid', 'Development', 'Social-development programmes / foreign aid', 'Amount', sl(0, 3, 0.1, '% of GDP'), 'Poorer economies deliver health, schooling and cash locally (high MPC, lower poverty). Rich donors send it abroad: no domestic demand.', function (v, X, o) { var x = v / 100; if (grp(X.pf) === 0) { o.cur(x, x); } else { o.cur(0.4 * x, 0.1 * x); o.inv('health', 0.2 * x); o.inv('school', 0.2 * x); o.tr(0.2 * x); o.yd(0.2 * x, 1.3); o.a('povPol', -0.8 * v); o.a('giniPol', -0.2 * v); } });
  [['rural_inf', 'Rural infrastructure', 'rural'], ['electrify', 'Electrification', 'electrify'], ['sanitation', 'Clean water and sanitation', 'sanitation'], ['agri_inv', 'Agricultural investment', 'agri'], ['microfin', 'Micro and SME finance', 'microfin']].forEach(function (p) {
    C(p[0], 'Development', p[1], 'Investment', sl(0, 1, 0.05, '% of GDP per year'), 'Large returns where the stock is small: output elasticity ' + E.PROG[p[2]].tfp + ', ' + E.PROG[p[2]].delay + '-quarter lag.', function (v, X, o) { o.inv(p[2], v / 100); });
  });

  /* AGRICULTURE AND FOOD */
  C('agri_sub', 'Agriculture and food', 'Agricultural subsidy', 'Amount', sl(0, 2, 0.05, '% of GDP'), 'Lowers food prices a little and lifts farm productivity.', function (v, X, o) { o.tr(v / 100); o.a('cpiLevel', -X.pf.foodShareCPI * 3 * v); o.a('tfp', 0.02 * v); });
  C('food_sub', 'Agriculture and food', 'Food subsidy', 'Amount', sl(0, 2, 0.05, '% of GDP'), 'Cuts food prices ~12% per 1% of GDP; a strong anti-poverty tool where food is a big share of spending.', function (v, X, o) { o.tr(v / 100); o.yd(v / 100, 1.1); o.a('cpiLevel', -X.pf.foodShareCPI * 12 * v); o.a('povPol', -0.5 * v); });
  C('food_reserve', 'Agriculture and food', 'Strategic food reserves', 'Build or release', sl(-1, 1, 0.1, 'release to build'), 'Building raises prices a little and cushions later world food shocks; releasing does the reverse.', function (v, X, o) { o.a('cpiLevel', 0.15 * v); o.a('shield', 0.10 * Math.max(v, 0)); o.cur(0.002 * Math.max(v, 0), 0); });
  C('agri_tariff', 'Agriculture and food', 'Agricultural tariffs', 'Rate', sl(0, 30, 1, 'pp'), 'Raises food prices in proportion to food import dependence.', function (v, X, o) { o.a('cpiLevel', 0.8 * X.pf.foodShareCPI * X.pf.foodImpDep * v); o.rev(0.0002 * v); });

  /* CRISIS CONTROLS */
  C('price_cap', 'Crisis controls', 'Temporary price cap', 'Product and cap', sl(0, 40, 1, '% below market', { pickOpts: opts(SEC.cap), duration: [1, 16, 4] }), 'Lowers the price level while it lasts; causes shortages (productivity loss); prices catch up when it ends.', function (v, X, o, m) { var s = SEC.cap[m.opt || 'food']; o.a('cpiLevel', -s * v); o.a('tfp', -0.1 * s * v); }, { dur: true });
  C('temp_tax', 'Crisis controls', 'Temporary tax cut', 'Tax and duration', sl(0, 10, 0.5, 'pp cut', { pickOpts: lst(['vat', 'basic income tax', 'corporation tax']), duration: [1, 16, 4] }), 'The chosen tax is cut for the period and then restored.', function (v, X, o, m) { var t = m.opt || 'vat'; if (t === 'vat') { var d = taxRev(X, 'vat', -v); o.rev(d); o.yd(-d, 0.6); o.a('cpiLevel', -0.9 * 0.65 * v / (1 + X.mix.vat.rate0 / 100)); } else if (t === 'corporation tax') { var d2 = taxRev(X, 'corp', -v); o.rev(d2); o.a('corpETR', -v); } else { var d3 = taxRev(X, 'incBasic', -v); o.rev(d3); o.yd(-d3, 1.0); } }, { dur: true });
  C('hh_payments', 'Crisis controls', 'Emergency household payments', 'Amount', sl(0, 5, 0.25, '% of GDP in total'), 'Paid over two quarters to households (weight 1.3): a fast lift to demand.', function (v, X, o, m) { var f = oneOff(v / 100, 2, m.k); o.tr(f); o.yd(f, 1.3); });
  C('furlough', 'Crisis controls', 'Wage subsidy / furlough', 'Coverage', sl(0, 1, 0.05, 'share of workers covered', { duration: [1, 16, 4] }), 'Keeps people in jobs: unemployment rises about half as much, and less long-term damage. Costs up to 12% of GDP a year at full cover.', function (v, X, o) { o.a('uProtect', v); o.tr(0.12 * v); o.yd(0.10 * v, 1.0); }, { dur: true });
  C('biz_grants', 'Crisis controls', 'Business grants', 'Amount', sl(0, 3, 0.25, '% of GDP in total'), 'Keeps firms alive and investing; less scarring.', function (v, X, o, m) { var f = oneOff(v / 100, 4, m.k); o.tr(f); o.a('bizSupport', Math.min(1, v / 3)); o.a('invBoost', 0.3 * v); o.a('creditRelief', 0.2 * Math.min(v, 3)); });
  C('loan_guar', 'Crisis controls', 'Government loan guarantees', 'Size', sl(0, 10, 0.5, '% of GDP guaranteed'), 'Eases credit; expected losses (~1.2% a year of the amount) fall on the budget.', function (v, X, o) { o.a('creditRelief', Math.min(0.8, 0.08 * v)); o.tr(0.012 * v / 100); });
  C('rationing', 'Crisis controls', 'Rationing', 'Goods', sl(0, 1, 0.05, 'strictness', { pickOpts: lst(['food', 'fuel', 'basic goods']) }), 'Holds measured prices down (CPI -1.2 at full strictness) but suppresses spending, cuts productivity, and only makes sense in an emergency.', function (v, X, o) { o.a('cpiLevel', -1.2 * v); o.a('cDamp', 1.5 * v); o.a('tfp', -0.4 * v); }, { gate: 'emergency' });
  C('emerg_nat', 'Crisis controls', 'Emergency nationalisation', 'Industry', sl(0, 100, 5, '% acquired', { pickOpts: opts(NAT) }), 'Saves jobs and keeps the firm running; purchase cost adds to debt; efficiency falls.', function (v, X, o, m) { var p = NAT[m.opt || 'rail']; nation(X, o, p[0] / 100, v, m.k, p[1]); o.a('uProtect', 0.2 * v / 100); });

  /* ---------- packages ---------- */
  var PRESETS = {
    austerity: { name: 'Austerity package', set: { vat: 2, inc_basic: 1, health: -5, education: -5, defence: -10, pay: -3, ubi: 0, retire: 1 } },
    stimulus: { name: 'Stimulus package', set: { hh_payments: 1.5, vat: -2, inf_roads: 0.5, inf_digital: 0.2, corp: -2 } },
    growth: { name: 'Supply-side growth package', set: { hc_school: 0.3, gov_rd: 0.3, inf_rail: 0.3, dereg: 0.5, compete: 0.5, planning: 0.5, corp: -3 } },
    cost: { name: 'Cost-of-living package', set: { hh_energy_sub: 1, food_sub: 0.5, child_ben: 20, unemp_ben: 10, vat: -1 } }
  };

  /* ---------- gating (star rows in the brief) ---------- */
  function available(entry, pf, flags) {
    flags = flags || {};
    if (!entry.gate) return { ok: true };
    var reg = pf.regime;
    if (entry.gate === 'gov') return reg === 'govcontrolled' || flags.unlock ? { ok: true } : { ok: false, reason: reg === 'independent' ? 'Interest rates are set by the independent central bank. You cannot change this directly.' : reg === 'peg' ? 'Rates follow the exchange-rate anchor.' : 'Rates are set by the currency union.' };
    if (entry.gate === 'govcb') return reg === 'govcontrolled' || flags.unlock ? { ok: true } : { ok: false, reason: 'The central bank already acts independently of the government.' };
    if (entry.gate === 'notunion') return reg !== 'union' ? { ok: true } : { ok: false, reason: 'The exchange rate is shared with the currency union.' };
    if (entry.gate === 'crisis') return flags.crisis || flags.unlock ? { ok: true } : { ok: false, reason: 'Only available in a sovereign debt crisis (debt distress and market closure).' };
    if (entry.gate === 'emergency') return flags.emergency || flags.unlock ? { ok: true } : { ok: false, reason: 'Only available in a declared emergency such as a war, blockade or severe shortage.' };
    return { ok: true };
  }

  /* ---------- implementation lags: quarters between deciding and the policy taking effect ---------- */
  var LAGS = {
    'Income tax': [2, 'Tax changes need legislation and a new collection cycle'], 'Business tax': [2, 'Tax changes need legislation and a new collection cycle'], 'Consumption tax': [2, 'Tax changes need legislation and a new collection cycle'], 'Wealth and property': [2, 'Tax changes need legislation and a new collection cycle'],
    'Government spending': [2, 'Budgets are set annually and money takes time to reach departments'], 'Welfare': [2, 'Benefit changes need legislation and system changes'],
    'Infrastructure': [2, 'Procurement and planning come before any spending'], 'Energy': [2, 'Procurement and planning come before any spending'], 'Human capital': [2, 'Procurement and hiring come before any spending'], 'Innovation': [2, 'Grant rounds and procurement come first'], 'Housing': [2, 'Procurement and planning come first'], 'Development': [2, 'Programmes must be set up before money flows'], 'Regional': [2, 'Programmes must be set up before money flows'],
    'Labour market': [3, 'Legislation and consultation'], 'Business and supply side': [3, 'Legislation and consultation'], 'Trade': [3, 'Negotiation, legislation and customs changes'], 'Foreign investment': [3, 'Legislation and consultation'], 'Industrial policy': [3, 'Legislation and procurement'], 'Environment': [3, 'Legislation and consultation'], 'Migration and labour supply': [3, 'Rules and visa systems take time to change'], 'Agriculture and food': [3, 'Legislation and consultation'],
    'Monetary': [0, 'The central bank can act at once'], 'Exchange rate': [0, 'Can act at once'], 'Debt management': [0, 'Can act at once'],
    'Banking and finance': [1, 'Regulators and the treasury can act within a quarter'], 'Fiscal framework': [1, 'Announced within a quarter'], 'Crisis controls': [1, 'Emergency measures pass quickly, but not instantly']
  };
  var lagOf = function (area) { return (LAGS[area] || [0, ''])[0]; };

  /* ---------- compile a set of choices into engine input ---------- */
  var OVERRIDE = { peg: 1, pegTo: 1, defTarget: 1, debtTarget: 1, spendCeil: 1 };
  var UNSCALED = { haircut: 1 };
  function context(pf) { return { pf: pf, d: E.derive(pf), mix: mixFor(pf), sp: spendFor(pf), g: grp(pf) }; }
  function newOut() {
    var ch = { prog: {} };
    return {
      ch: ch, rate: null,
      a: function (key, x) { ch[key] = (ch[key] || 0) + x; }, set: function (key, x) { ch[key] = x; },
      cur: function (x, imp) { ch.cur = (ch.cur || 0) + x; ch.curImp = (ch.curImp || 0) + (imp || 0); }, tr: function (x) { ch.tr = (ch.tr || 0) + x; },
      rev: function (x) { ch.rev = (ch.rev || 0) + x; }, yd: function (x, w) { ch.ydW = (ch.ydW || 0) + x * w; },
      inv: function (id, x) { ch.prog[id] = (ch.prog[id] || 0) + x; }
    };
  }
  // settings: { id: value | {v, opt, dur} }.  options: { start: quarter the decision is taken, phase: quarters to phase in once it takes effect, flags }
  // Each policy takes effect `lag` quarters after the decision (see LAGS), then phases in over `phase` quarters.
  function compile(settings, pf, options) {
    options = options || {}; var start = options.start == null ? 2 : options.start, phase = options.phase || 2, X = context(pf), flags = options.flags || {};
    var ids = Object.keys(settings || {}).filter(function (id) { return settings[id] != null; });
    var byId = {}; CAT.forEach(function (c) { byId[c.id] = c; });
    return function (t) {
      if (t < start) return {};
      var tot = { prog: {} }, rate = null, any = false;
      ids.forEach(function (id) {
        var e = byId[id]; if (!e || e.preset) return;
        var raw0 = settings[id];
        var k = (raw0 && typeof raw0 === 'object' && raw0.k != null) ? raw0.k : t - start - lagOf(e.area); if (k < 0) return;
        var raw = settings[id], v = raw, m = { k: k, opt: null };
        if (raw && typeof raw === 'object') { v = raw.v; m.opt = raw.opt || null; if (raw.dur) m.dur = raw.dur; }
        if (e.dur && (m.dur == null)) m.dur = 4;
        if (m.dur != null && k >= m.dur) return;
        if (v === '' || v === false || v == null) return;
        if (e.ctl.t === 'select') { if (String(v) === '0' || String(v) === 'none') return; } else { v = +v; if (!v && !e.ctl.optional) return; if (isNaN(v)) return; }
        if (!available(e, pf, flags).ok) return;
        if (e.id === 'devalue' && v === 0) return;
        var o = newOut(); e.fn(v, X, o, m); any = true;
        var ramp = (raw0 && typeof raw0 === 'object' && raw0.noRamp) ? 1 : Math.min(1, (k + 1) / phase);
        Object.keys(o.ch).forEach(function (key) {
          if (key === 'prog') { Object.keys(o.ch.prog).forEach(function (q) { tot.prog[q] = (tot.prog[q] || 0) + o.ch.prog[q] * ramp; }); }
          else if (OVERRIDE[key]) tot[key] = o.ch[key];
          else if (key === 'fiscalCred') tot[key] = Math.max(tot[key] || 0, o.ch[key]);
          else tot[key] = (tot[key] || 0) + o.ch[key] * (UNSCALED[key] ? 1 : ramp);
        });
        if (o.rate != null) rate = o.rate;
      });
      if (!any) return {};
      tot.bankResil = clamp(tot.bankResil || 0, -1, 1);
      var pol = { ch: tot };
      if (rate != null) pol.rate = rate;
      return pol;
    };
  }
  function catalogue(pf) { var X = context(pf); return CAT.map(function (c) { var ctl = c.ctlFn ? c.ctlFn(X) : c.ctl; return { id: c.id, area: c.area, name: c.name, choice: c.choice, lag: lagOf(c.area), lagWhy: (LAGS[c.area] || [0, ''])[1], ctl: ctl, enters: c.enters, gate: c.gate || null, now: c.now ? c.now(X) : null, dur: !!c.dur, preset: !!c.preset, availability: available(c, pf, {}) }; }); }


  /* ---------- checks on the policy layer ---------- */
  function validatePolicy() {
    var A = E.PROFILES.advanced, M = E.PROFILES.emerging, out = [];
    function add(group, name, val, lo, hi, unit, src) { out.push({ group: group, name: name, value: val, lo: lo, hi: hi, unit: unit, src: src, pass: val >= lo && val <= hi }); }
    function run2(pf, settings, q, o) { var base = E.run(pf, q, {}), sim = E.run(pf, q, { policy: compile(settings, pf, o) }); return { base: base, sim: sim }; }
    var pk = function (r, key, pct, sgn) { var b = 0; r.sim.forEach(function (x, k) { var d = pct ? (x[key] / r.base[k][key] - 1) * 100 : x[key] - r.base[k][key]; if (sgn < 0 ? d < b : d > b) b = d; }); return b; };
    var XA = context(A);
    add('Tax', 'VAT: revenue from +1pp (advanced), % of GDP', taxRev(XA, 'vat', 1) * 100, 0.2, 0.4, '% GDP', 'HMRC ready reckoner (1pp of UK VAT is about 0.3% of GDP)');
    var best = 0, bestR = -1; for (var t = 30; t <= 95; t += 1) { var v = R(t / 100, XA.mix.incTop.e); if (v > bestR) { bestR = v; best = t; } }
    add('Tax', 'Top income-tax rate that maximises revenue', best, 55, 80, '%', 'Diamond & Saez (2011); Piketty, Saez & Stantcheva (2014)');
    var c1 = run2(A, { corp: -5 }, 32); add('Tax', 'Corporation tax cut of 5pp: peak investment effect', pk(c1, 'I', false, 1), 1.5, 8, '%', 'Ohrn (2018); Zwick & Mahon (2017); OBR');
    var t1 = run2(A, { tariff: { v: 10, opt: 'all' } }, 32); add('Trade', 'A 10pp tariff on all imports: peak GDP effect', pk(t1, 'Y', true, -1), -1.5, -0.05, '%', 'Fajgelbaum et al. (2020); Amiti, Redding & Weinstein (2019)');
    var lev = 0; t1.sim.forEach(function (x, k) { lev = Math.max(lev, x.cpiLevel - t1.base[k].cpiLevel); });
    add('Trade', 'A 10pp tariff on all imports: peak CPI level effect', lev, 0.5, 3.5, '%', 'Cavallo, Gopinath, Neiman & Tang (2021): near-complete pass-through');
    var q1 = run2(Object.assign({}, A, { regime: 'govcontrolled' }), { qe: 10 }, 32); add('Money', 'QE of 10% of GDP: peak GDP effect', pk(q1, 'Y', true, 1), 0.4, 2.0, '%', 'Joyce, Tong & Woods (2011); Kapetanios et al. (2012); Weale & Wieladek (2016)');
    var cb = run2(A, { carbon: 50 }, 28), Xc = XA; var cRev = 50 * 0.11 / 1000 * 0.7 * (1 - 0.05) * 100;
    add('Environment', 'Carbon tax of $50/t: revenue, % of GDP', cRev, 0.2, 0.6, '% GDP', 'OECD (2021) Effective Carbon Rates; IMF (2019)');
    add('Environment', 'Carbon tax of $50/t: emissions after 6 years', -(100 - cb.sim[24].emis) + (100 - cb.base[24].emis), -8, -2, '%', 'Metcalf & Stock (2020); Andersson (2019)');
    var dv = run2(M, { devalue: -20 }, 24); add('Exchange rate', 'A 20% devaluation (emerging peg): CPI level after 2 years', dv.sim[8].cpiLevel - dv.base[8].cpiLevel, 2, 9, '%', 'Burstein, Eichenbaum & Rebelo (2005); Ha et al. (2019)');
    var sh = { 1: { bankHH: -3, bankBiz: -3, credit: 3, unc: 1.5 }, 2: { credit: 2 }, 3: { credit: 1 } };
    function crisis(settings) { var s = E.run(A, 40, { shocks: sh, policy: compile(settings, A, { start: 0, phase: 1 }) }), g = 0, u = 0; s.forEach(function (r) { g = Math.min(g, r.gap); u = Math.max(u, r.u); }); return { g: g, u: u }; }
    var c0 = crisis({}), cf = crisis({ furlough: { v: 0.5, dur: 8 } }), cg = crisis({ guarantee: 1 });
    add('Crisis', 'Furlough at 50% cover: reduction in the peak rise in unemployment', 1 - (cf.u - A.ustar) / (c0.u - A.ustar), 0.25, 0.9, 'share', 'Giupponi & Landais (2023); OECD (2021) job retention schemes');
    add('Crisis', 'Full deposit guarantee already in place: reduction in the depth of a banking-crisis recession', 1 - cg.g / c0.g, 0.1, 0.5, 'share', 'Demirguc-Kunt, Kane & Laeven (2008); Laeven & Valencia (2018)');
    var mw = run2(A, { min_wage: 10 }, 24); add('Labour', 'Minimum wage +10%: structural unemployment effect', mw.sim[24].ustar + 0 - mw.base[24].ustar + (mw.sim[24].u - mw.base[24].u) * 0, -0.3, 0.3, 'pp', 'Cengiz et al. (2019); Dube (2019); Low Pay Commission');
    /* timing */
    function firstMove(rows, base, key, thr) { for (var k = 0; k < rows.length; k++) if (Math.abs(rows[k][key] - base[k][key]) > thr) return k; return -1; }
    var base32 = E.run(A, 32, {});
    var tc = E.run(A, 32, { policy: compile({ inc_basic: -3 }, A, { start: 2, phase: 1 }) });
    add('Timing', 'Income-tax cut decided in quarter 2: first quarter the economy moves (legislation lag)', firstMove(tc, base32, 'ydW' in tc[0] ? 'ydW' : 'C', 0.02), 4, 6, 'quarter', 'Legislative and collection lags (OBR forecast process; Blanchard & Perotti 2002 implementation lags)');
    var sc = E.run(A, 60, { policy: compile({ hc_school: 0.5 }, A, { start: 2, phase: 1 }) }), b60 = E.run(A, 60, {});
    add('Timing', 'School investment (0.5% of GDP): quarter when potential output is first 0.3% higher', firstMove(sc.map(function (r) { return { d: r.potDev }; }), b60.map(function (r) { return { d: r.potDev }; }), 'd', 0.3), 16, 40, 'quarter', 'Hanushek & Woessmann (2012): education effects take a decade to build');
    var nc = E.run(A, 60, { policy: compile({ nuclear: 0.5 }, A, { start: 2, phase: 1 }) });
    add('Timing', 'Nuclear build: quarter when emissions are first 1% lower', firstMove(nc.map(function (r) { return { d: 100 - r.emis }; }), b60.map(function (r) { return { d: 100 - r.emis }; }), 'd', 1), 28, 50, 'quarter', 'IEA (2022): 8 to 10 year builds');
    function hike(pf) { var b = E.run(pf, 40, {}), r = E.impulse(pf, 40, { policy: function (t) { return t === 1 ? { rate: b[t].i + 1 } : {}; } }), best = 0, kk = 0; r.forEach(function (x, k) { if (x.C < best) { best = x.C; kk = k; } }); return kk; }
    add('Timing', 'Rate rise: household spending bottoms out later when mortgages are fixed than when floating (quarters)', hike(Object.assign({}, A, { varMortgage: 0.1 })) - hike(Object.assign({}, A, { varMortgage: 0.95 })), 1, 6, 'quarters', 'Cloyne, Ferreira & Surico (2020); Bank of England (2012)');
    var rr = E.impulse(A, 40, { policy: function (t) { return t === 1 ? { rate: E.run(A, 3, {})[1].i + 1 } : {}; } }), ty = 0, my = 0; rr.forEach(function (x, k) { if (x.Y < my) { my = x.Y; ty = k; } });
    add('Timing', 'One-off 100bp rate rise: quarter of the deepest GDP effect', ty, 5, 10, 'quarter', 'Christiano, Eichenbaum & Evans (2005); Bank of England (2012): 4 to 8 quarters');
    var pl = 0, tl = 0; rr.forEach(function (x, k) { if (x.cpiLevel < pl) { pl = x.cpiLevel; tl = k; } });
    add('Timing', 'One-off 100bp rate rise: quarter of the biggest fall in the price level', tl, 5, 12, 'quarter', 'Bank of England (2012); Romer & Romer (2004): prices respond slowly');
    return out;
  }

  var api = { LAGS: LAGS, lagOf: lagOf, validate: validatePolicy, AREAS: AREAS, CAT: CAT, PRESETS: PRESETS, compile: compile, catalogue: catalogue, available: available, context: context, mixFor: mixFor, spendFor: spendFor, count: CAT.length };
  root.LMPolicy = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
