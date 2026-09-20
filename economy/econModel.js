/*
 * LastMind macro engine, v0.1
 * One quarterly model shared by every economics simulation. Creators describe an economy by its STRUCTURE
 * (openness, household debt, maturity of government debt, monetary regime ...). They never set the strength
 * of a relationship: every behavioural coefficient below is fixed and calibrated to published empirical ranges,
 * and structure only moves the coefficients through the rules in derive().
 *
 * Units: percentages unless stated. Rates and inflation are annualised %. Levels are indices (base 100) or
 * log-% deviations from a no-shock baseline path. Debt is a fraction of annual GDP. One step = one quarter.
 */
(function (root) {
  'use strict';
  var clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };
  var avg = function (a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return a.length ? s / a.length : 0; };

  /* ---------- fixed empirical parameters (single source of truth; also rendered on the explainer page) ---------- */
  var PARAM_DOC = [
    // Demand
    { k: 'cPersist', v: 0.60, lo: 0.4, hi: 0.85, g: 'Demand', what: 'Consumption persistence (habit / smoothing)', src: 'Fuhrer (2000); Smets-Wouters (2007)' },
    { k: 'iPersist', v: 0.65, lo: 0.5, hi: 0.85, g: 'Demand', what: 'Investment persistence (adjustment costs)', src: 'Smets-Wouters (2007)' },
    { k: 'xmPersist', v: 0.70, lo: 0.5, hi: 0.85, g: 'Demand', what: 'Trade-flow persistence', src: 'Hooper, Johnson & Marquez (2000)' },
    { k: 'rateC0', v: 0.05, lo: 0.05, hi: 0.2, g: 'Demand', what: '% fall in consumption per 1pp higher real rate, before household-debt scaling', src: 'Romer & Romer (2004); Cloyne, Ferreira & Surico (2020)' },
    { k: 'rateCdebt', v: 0.07, lo: 0.08, hi: 0.35, g: 'Demand', what: 'Extra consumption sensitivity for a typical-debt household sector', src: 'Cloyne et al. (2020); Flodén et al. (2021)' },
    { k: 'wealthCons', v: 0.10, lo: 0.05, hi: 0.15, g: 'Demand', what: 'Elasticity of consumption to household wealth', src: 'Case, Quigley & Shiller (2005); Carroll et al. (2011)' },
    { k: 'confCons', v: 0.35, lo: 0.2, hi: 0.5, g: 'Demand', what: '% consumption per 1 s.d. household confidence', src: 'Carroll, Fuhrer & Wilcox (1994); Ludvigson (2004)' },
    { k: 'uncCons', v: 0.25, lo: 0.1, hi: 0.5, g: 'Demand', what: '% consumption lost per unit of uncertainty (precautionary saving)', src: 'Bloom (2009); Basu & Bundick (2017)' },
    { k: 'accelI', v: 1.9, lo: 1.5, hi: 3.0, g: 'Demand', what: 'Investment elasticity to expected demand (accelerator)', src: 'Clark (1979); Chirinko (1993)' },
    { k: 'costI', v: 0.5, lo: 0.5, hi: 2.0, g: 'Demand', what: '% investment lost per 1pp higher real user cost of capital', src: 'Chirinko (1993); Auerbach (2002)' },
    { k: 'creditI', v: 0.9, lo: 0.4, hi: 1.5, g: 'Demand', what: '% investment lost per 1pp of tighter credit conditions', src: 'Gertler & Gilchrist (1994); Gilchrist & Zakrajsek (2012)' },
    { k: 'confI', v: 0.8, lo: 0.4, hi: 1.5, g: 'Demand', what: '% investment per 1 s.d. business confidence', src: 'Bloom (2009); Barrero, Bloom & Davis (2017)' },
    { k: 'uncI', v: 0.8, lo: 0.4, hi: 1.5, g: 'Demand', what: '% investment lost per unit of uncertainty', src: 'Bloom (2009)' },
    { k: 'corpTaxI', v: 0.8, lo: 0.4, hi: 1.5, g: 'Demand', what: '% investment lost per 1pp higher corporate tax', src: 'Hall & Jorgenson (1967); Djankov et al. (2010)' },
    { k: 'exFor', v: 1.2, lo: 1.0, hi: 1.7, g: 'External', what: 'Export elasticity to foreign demand', src: 'Hooper et al. (2000); Bussiere et al. (2013)' },
    { k: 'exPrice', v: 0.45, lo: 0.4, hi: 1.2, g: 'External', what: 'Export elasticity to real exchange rate', src: 'Imbs & Mejean (2015); Bank of England staff estimates' },
    { k: 'impInc', v: 1.6, lo: 1.2, hi: 2.5, g: 'External', what: 'Import elasticity to domestic demand', src: 'Hooper et al. (2000); Bussiere et al. (2013)' },
    { k: 'impPrice', v: 0.30, lo: 0.3, hi: 1.0, g: 'External', what: 'Import elasticity to real exchange rate', src: 'Imbs & Mejean (2015)' },
    { k: 'capX', v: 0.15, lo: 0.05, hi: 0.3, g: 'External', what: 'Exports crowded out per pp of excess demand at capacity', src: 'Judgement; capacity-constraint literature' },
    // Prices and labour
    { k: 'lambda', v: 0.55, lo: 0.4, hi: 0.75, g: 'Prices', what: 'Weight on last quarter\'s inflation in the Phillips curve', src: 'Gali & Gertler (1999); Fuhrer (2011); Fed and BoE estimates' },
    { k: 'kappa0', v: 0.09, lo: 0.02, hi: 0.15, g: 'Prices', what: 'Phillips-curve slope when there is slack (pp inflation per pp gap per quarter)', src: 'Hazell et al. (2022); Blanchard (2016); IMF (2013)' },
    { k: 'kappaX', v: 0.35, lo: 0.15, hi: 0.7, g: 'Prices', what: 'Convexity: extra slope per pp of excess demand', src: 'Bank of England staff (Bunn et al.); Forbes, Gagnon & Collins (2021); Babb & Detmeister (2017)' },
    { k: 'ulcPsi', v: 0.15, lo: 0.05, hi: 0.3, g: 'Prices', what: 'Pass-through of unit-labour-cost pressure to domestic prices', src: 'Bank of England; Gali (2011)' },
    { k: 'anchorLoss', v: 0.02, lo: 0.01, hi: 0.04, g: 'Prices', what: 'Anchor lost per quarter per pp that inflation runs more than 1.5pp from target', src: 'Coibion & Gorodnichenko (2015); Carvalho et al. (2023)' },
    { k: 'moneyPass', v: 4.0, lo: 2, hi: 8, g: 'Prices', what: 'Extra inflation (pp) per 1% of GDP of deficit above the baseline that the central bank finances by printing money', src: 'Cagan (1956); Sargent & Wallace (1981); Fischer, Sahay & Vegh (2002)' },
    { k: 'anchorGain', v: 0.008, lo: 0.003, hi: 0.02, g: 'Prices', what: 'Anchor rebuilt per quarter while inflation is inside the band', src: 'Bernanke (2007); Carvalho et al. (2023)' },
    { k: 'pmSpeed', v: 0.18, lo: 0.1, hi: 0.35, g: 'Prices', what: 'Speed import prices adjust to the exchange rate each quarter (full pass-through takes 1.5 to 2 years)', src: 'Burstein & Gopinath (2014); Bank of England (2015); Forbes, Hjortsoe & Nenova (2018)' },
    { k: 'ptComm', v: 0.45, lo: 0.3, hi: 0.6, g: 'Prices', what: 'Pass-through of a world energy/food price change into the retail basket (crude is a fraction of the pump price)', src: 'Blanchard & Gali (2007); Bank of England (2022); ECB (2010)' },
    { k: 'wSpeed', v: 0.40, lo: 0.25, hi: 0.6, g: 'Labour', what: 'Speed of wage adjustment per quarter', src: 'Blanchflower & Oswald (1994); Galí (2011)' },
    { k: 'wageTight', v: 0.25, lo: 0.1, hi: 0.5, g: 'Labour', what: 'Extra wage pressure per pp of unemployment below equilibrium (convex)', src: 'Blanchflower & Bell (2022); Benigno & Eggertsson (2023)' },
    { k: 'uSpeed', v: 0.35, lo: 0.2, hi: 0.5, g: 'Labour', what: 'Speed unemployment closes on its Okun target', src: 'Ball, Leigh & Loungani (2017)' },
    { k: 'hystUp', v: 0.03, lo: 0.01, hi: 0.06, g: 'Labour', what: 'Structural unemployment drift per quarter when unemployment exceeds it by more than 0.5pp', src: 'Ball (2009); Blanchard & Summers (1986)' },
    { k: 'hystDown', v: 0.008, lo: 0.003, hi: 0.02, g: 'Labour', what: 'Recovery of structural unemployment when the economy is running hot', src: 'Ball (2009)' },
    { k: 'scarTFP', v: 0.020, lo: 0.005, hi: 0.03, g: 'Supply', what: '% productivity level lost per quarter per pp the output gap is below -3', src: 'Cerra & Saxena (2008); Blanchard, Cerutti & Summers (2015)' },
    // Monetary
    { k: 'rhoI', v: 0.80, lo: 0.7, hi: 0.9, g: 'Monetary', what: 'Interest-rate smoothing', src: 'Clarida, Gali & Gertler (2000); Coibion & Gorodnichenko (2012)' },
    { k: 'phiY', v: 0.50, lo: 0.25, hi: 1.0, g: 'Monetary', what: 'Central bank weight on the output gap (Taylor 1993)', src: 'Taylor (1993)' },
    { k: 'lagPeak', v: 3.0, lo: 3, hi: 6, g: 'Monetary', what: 'Quarters until a rate change has its biggest effect on demand when households borrow at floating rates; fixed-rate mortgages add up to 5 more (see derive)', src: 'Bank of England (2012); Christiano, Eichenbaum & Evans (2005)' },
    // Exchange rate and risk
    { k: 'eRate', v: 2.0, lo: 1.0, hi: 3.0, g: 'External', what: '% appreciation per 1pp higher real-rate differential', src: 'Eichenbaum & Evans (1995); Engel (2014)' },
    { k: 'eRisk', v: 2.0, lo: 1.0, hi: 4.0, g: 'External', what: '% depreciation per 1pp higher sovereign risk premium', src: 'Obstfeld & Rogoff; IMF EM studies' },
    { k: 'eSpeed', v: 0.35, lo: 0.2, hi: 0.6, g: 'External', what: 'Speed the exchange rate moves toward fundamentals', src: 'Meese & Rogoff (1983); Rossi (2013)' },
    { k: 'eNoiseAdv', v: 2.0, lo: 1.5, hi: 3.0, g: 'External', what: 'Quarterly exchange-rate volatility, advanced (s.d. %)', src: 'IMF IFS data' },
    { k: 'eNoiseEm', v: 4.0, lo: 3.0, hi: 6.0, g: 'External', what: 'Quarterly exchange-rate volatility, emerging (s.d. %)', src: 'IMF IFS data' },
    // Fiscal
    { k: 'mGov', v: 0.15, lo: 0.1, hi: 0.35, g: 'Fiscal', what: 'Import content of government current spending', src: 'Input-output tables (OECD TiVA)' },
    { k: 'mInv', v: 0.30, lo: 0.2, hi: 0.5, g: 'Fiscal', what: 'Import content of public investment', src: 'Input-output tables (OECD TiVA)' },
    { k: 'revEl', v: 1.10, lo: 1.0, hi: 1.3, g: 'Fiscal', what: 'Elasticity of tax revenue to GDP', src: 'Girouard & Andre (2005), OECD; Price, Dang & Guillemette (2014)' },
    { k: 'crowdIn', v: 0.30, lo: 0.1, hi: 0.5, g: 'Fiscal', what: '% private investment per pp of GDP of public investment', src: 'IMF WEO (2014) ch.3; Abiad, Furceri & Topalova (2016)' },
    { k: 'capSoft', v: 0.15, lo: 0.05, hi: 0.3, g: 'Supply', what: 'How quickly output growth saturates above capacity', src: 'Judgement; consistent with Forbes et al. (2021)' },
    { k: 'permShare', v: 0.85, lo: 0.7, hi: 1.0, g: 'Supply', what: 'Share of a permanent supply change passed into demand', src: 'Permanent-income hypothesis' },
    { k: 'alpha', v: 0.33, lo: 0.3, hi: 0.4, g: 'Supply', what: 'Capital share of income', src: 'Karabarbounis & Neiman (2014)' },
    { k: 'delta', v: 0.05, lo: 0.04, hi: 0.08, g: 'Supply', what: 'Private capital depreciation per year', src: 'Penn World Table 10' },
    { k: 'convergence', v: 0.02, lo: 0.01, hi: 0.03, g: 'Supply', what: 'Convergence to the frontier per year (per unit of log income gap, institution-adjusted)', src: 'Barro & Sala-i-Martin (1992); Johnson & Papageorgiou (2020)' }
  ];
  var P = {};
  PARAM_DOC.forEach(function (d) { P[d.k] = d.v; });

  // Capital programmes: what each kind of spending buys. Spending enters a pipeline (time to build), adds to a stock that wears out,
  // and the stock (as % above its baseline size) moves the targets below. Effects are per 1% of extra stock.
  //   tfp = % productivity, lab = % labour supply, ust = pp structural unemployment, house = % house prices, energy = energy shield, emis = % emissions
  var PROG = {
    transport: { tfp: 0.045, delay: 8, dep: 0.025, s0: 0.25, src: 'Bom & Ligthart (2014); Calderon, Moral-Benito & Serven (2015)' },
    energy: { tfp: 0.030, energy: 0.004, delay: 10, dep: 0.030, s0: 0.10, src: 'Calderon et al. (2015); IEA' },
    digital: { tfp: 0.025, delay: 6, dep: 0.070, s0: 0.03, src: 'Czernich et al. (2011); Roller & Waverman (2001)' },
    education: { tfp: 0.100, delay: 20, dep: 0.010, s0: 0.30, src: 'Psacharopoulos & Patrinos (2018); Hanushek & Woessmann (2012)' },
    health: { tfp: 0.020, lab: 0.010, delay: 8, dep: 0.020, s0: 0.07, src: 'Bloom, Canning & Sevilla (2004)' },
    housing: { tfp: 0.010, house: -0.30, delay: 6, dep: 0.015, s0: 0.12, src: 'Hsieh & Moretti (2019)' },
    roads: { tfp: 0.030, delay: 8, dep: 0.025, s0: 0.18, src: 'Bom & Ligthart (2014)' },
    rail: { tfp: 0.020, delay: 12, dep: 0.025, s0: 0.10, src: 'Bom & Ligthart (2014); Donaldson (2018)' },
    ports: { tfp: 0.020, delay: 8, dep: 0.030, s0: 0.03, src: 'Calderon et al. (2015); Hummels (2007)' },
    water: { tfp: 0.010, lab: 0.005, delay: 8, dep: 0.020, s0: 0.10, src: 'Calderon et al. (2015); WHO (2012)' },
    housingInfra: { tfp: 0.005, house: -0.15, delay: 6, dep: 0.015, s0: 0.12, src: 'Hsieh & Moretti (2019)' },
    housingBuild: { tfp: 0.003, house: -2.0, delay: 8, dep: 0.010, s0: 3.5, src: 'Hilber & Vermeulen (2016); Barker Review (2004)' },
    renew: { tfp: 0.010, energy: 0.003, emis: -0.20, delay: 8, dep: 0.030, s0: 0.06, src: 'IEA (2021); IRENA (2022)' },
    nuclear: { tfp: 0.010, energy: 0.003, emis: -0.25, delay: 32, dep: 0.020, s0: 0.05, src: 'IEA (2022); Lovering, Yip & Nordhaus (2016)' },
    grid: { tfp: 0.020, energy: 0.002, emis: -0.05, delay: 12, dep: 0.030, s0: 0.06, src: 'IEA (2021); National Grid ESO' },
    school: { tfp: 0.070, delay: 20, dep: 0.010, s0: 0.30, src: 'Hanushek & Woessmann (2012)' },
    university: { tfp: 0.030, delay: 24, dep: 0.010, s0: 0.10, src: 'Valero & Van Reenen (2019)' },
    vocational: { tfp: 0.015, ust: -0.010, delay: 8, dep: 0.030, s0: 0.03, src: 'Card, Kluve & Weber (2018); Kemple (2008)' },
    adult: { tfp: 0.005, lab: 0.005, ust: -0.008, delay: 4, dep: 0.050, s0: 0.02, src: 'Card, Kluve & Weber (2018)' },
    earlyYears: { tfp: 0.040, lab: 0.020, delay: 28, dep: 0.010, s0: 0.06, src: 'Heckman et al. (2010); Blau & Currie (2006)' },
    rd: { tfp: 0.050, delay: 12, dep: 0.120, s0: 0.15, src: 'Guellec & van Pottelsberghe (2004); Bloom, Van Reenen & Williams (2019)' },
    privRD: { tfp: 0.050, delay: 8, dep: 0.150, s0: 0.25, src: 'Dechezlepretre et al. (2016); Bloom, Griffith & Van Reenen (2002)' },
    adopt: { tfp: 0.030, delay: 6, dep: 0.100, s0: 0.05, src: 'Comin & Hobijn (2010); Andrews, Criscuolo & Gal (2016)' },
    univInd: { tfp: 0.030, delay: 12, dep: 0.080, s0: 0.03, src: 'Bloom et al. (2019); Hausman (2022)' },
    rural: { tfp: 0.040, delay: 8, dep: 0.030, s0: 0.04, src: 'Fan, Hazell & Thorat (2000); Aggarwal (2018)' },
    electrify: { tfp: 0.050, lab: 0.010, delay: 8, dep: 0.030, s0: 0.02, src: 'Dinkelman (2011); Lipscomb et al. (2013)' },
    sanitation: { tfp: 0.010, lab: 0.020, delay: 6, dep: 0.030, s0: 0.02, src: 'Hutton & Varughese (2016); Bloom et al. (2004)' },
    agri: { tfp: 0.030, delay: 6, dep: 0.050, s0: 0.03, src: 'Gollin, Lagakos & Waugh (2014); World Bank (2008)' },
    microfin: { tfp: 0.020, ust: -0.004, delay: 4, dep: 0.100, s0: 0.02, src: 'Banerjee et al. (2015); Meager (2019)' },
    greenPublic: { tfp: 0.010, energy: 0.002, emis: -0.15, delay: 8, dep: 0.030, s0: 0.05, src: 'OECD (2017); IMF (2020) Green recovery' },
    greenInd: { tfp: 0.015, emis: -0.10, delay: 12, dep: 0.060, s0: 0.05, src: 'Rodrik (2014); Aghion et al. (2016)' },
    mfg: { tfp: 0.015, delay: 12, dep: 0.060, s0: 0.06, src: 'Juhasz, Lane & Rodrik (2023)' },
    strategic: { tfp: 0.010, delay: 12, dep: 0.060, s0: 0.05, src: 'Juhasz, Lane & Rodrik (2023); Criscuolo et al. (2019)' }
  };
  Object.keys(PROG).forEach(function (k) { PROG[k].theta = PROG[k].tfp; });
  var PUBLIC = PROG;

  /* ---------- structural profiles (what a creator picks; the coefficients come from derive) ---------- */
  var PROFILES = {
    advanced: { name: 'Advanced, diversified (UK-like)', incomeRel: 0.9, popGrowth: 0.3, potGrowth: 1.6, openness: 0.30, exportShare: 0.29, energyImpDep: 0.3, foodImpDep: 0.35, foodShareCPI: 0.12, commExport: 0.0, commRev: 0.0,
      hhDebt: 1.3, varMortgage: 0.35, creditDepth: 1.3, taxRatio: 0.37, spendCur: 0.22, transfers: 0.13, ginv: 0.03, debt: 0.95, maturityYrs: 14, fxDebt: 0.0, regime: 'independent', target: 2, hawk: 0.5, credibility: 0.9,
      instQ: 0.9, polStab: 0.85, reserves: 3, finOpen: 0.95, informality: 0.1, union: 0.3, ustar: 4.5, part: 63, capOut: 2.7, rstar: 0.75, baseRp: 0.3 },
    emerging: { name: 'Emerging, import-dependent (Varuna-like)', incomeRel: 0.35, popGrowth: 1.2, potGrowth: 3.5, openness: 0.32, exportShare: 0.28, energyImpDep: 0.6, foodImpDep: 0.4, foodShareCPI: 0.25, commExport: 0.0, commRev: 0.0,
      hhDebt: 0.4, varMortgage: 0.7, creditDepth: 0.5, taxRatio: 0.24, spendCur: 0.15, transfers: 0.05, ginv: 0.045, debt: 0.62, maturityYrs: 6, fxDebt: 0.35, regime: 'independent', target: 4, hawk: 1.0, credibility: 0.55,
      instQ: 0.5, polStab: 0.55, reserves: 5, finOpen: 0.5, informality: 0.35, union: 0.15, ustar: 8, part: 62, capOut: 2.2, rstar: 2.0, baseRp: 2.0 },
    lowincome: { name: 'Low-income, agrarian', incomeRel: 0.08, popGrowth: 2.5, potGrowth: 4.5, openness: 0.30, exportShare: 0.20, energyImpDep: 0.7, foodImpDep: 0.3, foodShareCPI: 0.40, commExport: 0.6, commRev: 0.03,
      hhDebt: 0.1, varMortgage: 0.8, creditDepth: 0.15, taxRatio: 0.15, spendCur: 0.11, transfers: 0.02, ginv: 0.05, debt: 0.55, maturityYrs: 8, fxDebt: 0.6, regime: 'peg', target: 5, hawk: 0.5, credibility: 0.4,
      instQ: 0.3, polStab: 0.45, reserves: 3, finOpen: 0.2, informality: 0.7, union: 0.05, ustar: 6, part: 70, capOut: 2.0, rstar: 3.0, baseRp: 4.0 },
    commodity: { name: 'Commodity exporter (Gulf/Andean-like)', incomeRel: 0.5, popGrowth: 1.0, potGrowth: 3.0, openness: 0.28, exportShare: 0.32, energyImpDep: 0.0, foodImpDep: 0.6, foodShareCPI: 0.20, commExport: 0.7, commRev: 0.08,
      hhDebt: 0.5, varMortgage: 0.6, creditDepth: 0.6, taxRatio: 0.22, spendCur: 0.17, transfers: 0.05, ginv: 0.05, debt: 0.55, maturityYrs: 8, fxDebt: 0.3, regime: 'independent', target: 3.5, hawk: 0.8, credibility: 0.6,
      instQ: 0.5, polStab: 0.6, reserves: 8, finOpen: 0.4, informality: 0.3, union: 0.15, ustar: 7, part: 60, capOut: 2.4, rstar: 1.5, baseRp: 1.5 }
  };

  /* ---------- structure -> effective coefficients ---------- */
  function derive(pf) {
    var d = {};
    var constrained = clamp(1 - pf.creditDepth / 1.4, 0.1, 0.75);
    d.mpc = 0.32 + 0.25 * constrained / 0.75;                      // hand-to-mouth share raises MPC (Kaplan-Violante 2014; Jappelli-Pistaferri 2014)
    var hhF = pf.hhDebt * (0.35 + 0.65 * pf.varMortgage);          // debt-service exposure to policy rate
    d.rateC = P.rateC0 * 0.5 + P.rateCdebt * clamp(hhF / 0.8, 0.1, 2.5);
    d.wealthC = P.wealthCons * clamp(pf.creditDepth / 1.3, 0.2, 1.3);
    d.creditDep = clamp(pf.creditDepth / 1.3, 0.3, 1.2);           // how much credit conditions matter
    d.constrained = constrained;
    d.ms = pf.openness; d.xs = pf.exportShare;
    d.ptImp = 0.55 + 0.35 * (1 - pf.incomeRel);                    // pass-through to import prices (Ha, Stocker & Yilmazkuday 2019; Gopinath 2015)
    d.omegaM = 0.7 * pf.openness;                                  // imported content of the CPI basket
    d.omegaC = 0.09 * pf.energyImpDep + pf.foodShareCPI * pf.foodImpDep;
    d.okun = 0.42 * (1 - 0.5 * pf.informality);                    // Ball, Leigh & Loungani (2017); informality mutes measured unemployment
    d.wageSlope = 0.45 * (1 - 0.4 * pf.informality);
    d.idx = 0.15 + 0.35 * pf.union;                                // indexation / bargaining
    d.kappa = P.kappa0 * (1 + 0.06 * Math.max(0, pf.target - 2));  // Ball, Mankiw & Romer (1988): steeper at higher average inflation
    d.mtr = 0.75 * pf.taxRatio;
    d.uBen = 0.20 * (pf.transfers / 0.13);                         // unemployment-linked spending, pp GDP per pp unemployment
    d.eFin = clamp(0.3 + 0.7 * pf.finOpen, 0.3, 1.0);              // capital mobility scales exchange-rate response
    d.eNoise = (pf.incomeRel > 0.7 ? P.eNoiseAdv : P.eNoiseEm);
    d.debtCap = 0.60 + 0.55 * pf.instQ + (pf.regime === 'peg' ? 0 : 0.30) + 0.15 * (pf.maturityYrs / 10) - 0.5 * pf.fxDebt;
    d.invEff = 0.4 + 0.6 * pf.instQ;                               // IMF PIMA: ~1/3 of public investment lost in EMDEs
    d.iFloor = pf.incomeRel > 0.7 ? 0.1 : 0.5;
    // Timing of the interest-rate channel depends on how households borrow: fixed-rate debt only reprices when fixes expire
    // (Cloyne, Ferreira & Surico 2020; Bank of England 2012; ECB 2016 on mortgage fixation and pass-through).
    d.lagPeak = P.lagPeak + 5 * (1 - pf.varMortgage) * clamp(pf.hhDebt / 1.3, 0.25, 1.2);
    d.lagW = []; var lsum = 0;
    for (var lk = 1; lk <= 12; lk++) { var lx = lk * Math.exp(-lk / d.lagPeak); d.lagW.push(lx); lsum += lx; }
    d.lagW = d.lagW.map(function (x) { return x / lsum; });
    d.ioShare = pf.capOut ? 0 : 0;
    return d;
  }

  /* ---------- sovereign stress -> spread (pp) ---------- */
  function sovStress(s, pf, d) {
    var revShare = s.revenue / 100;
    var debtStress = Math.max(0, s.debt / d.debtCap - 0.6) * 1.5;
    var trajectory = clamp(s.debtChange4, -0.1, 0.4) * 2.0;                 // rise in debt/GDP over 4 quarters
    var burden = Math.max(0, (s.interest / 100) / Math.max(0.05, revShare) - 0.08) * 3.0;   // interest / revenue
    var fx = pf.fxDebt * Math.max(0, -s.e4) / 10;
    var infl = Math.max(0, s.pi - 10) / 40;
    var res = Math.max(0, 4 - s.reserves) * 0.06 * (pf.regime === 'peg' || pf.finOpen > 0.6 ? 1 : 0.5);
    var ca = Math.max(0, -s.CA / 100 - 0.03) * 8 * pf.finOpen;
    var pol = (1 - pf.polStab) * 0.6 + Math.max(0, s.riskS) * 0.15;
    var reg = pf.regime === 'union' ? -0.25 : (pf.regime === 'govcontrolled' ? 0.15 : 0);
    var S = Math.max(0, debtStress + trajectory + burden + fx + infl + res + ca + pol + reg);
    return S;
  }
  function spreadFromStress(S) { return clamp(0.15 + 2.4 * Math.pow(S, 1.6), 0.1, 25); }

  /* ---------- initial (steady) state ---------- */
  function init(pf) {
    var d = derive(pf);
    var s = {
      t: 0,
      // production
      Y: 100, Ystar: 100, g: pf.potGrowth, gap: 0, prod: 100, K: pf.capOut * 100, L: 100, part: pf.part,
      // labour
      u: pf.ustar, ustar: pf.ustar, w: pf.target + pf.potGrowth * 0.6, rw: pf.potGrowth * 0.6, w0rw: pf.potGrowth * 0.6, eS: 0,
      // prices
      pi: pf.target, piE: pf.target, piCore: pf.target, piImport: pf.target,
      // private
      C: 0, I: 0, confH: 0, confB: 0, savingRate: 0.08,
      // government
      Gcur: pf.spendCur * 100, Ginv: pf.ginv * 100, T: pf.taxRatio * 100, deficit: 0, debtGDP: pf.debt * 100, debtInterest: 0,
      // financial
      i: pf.rstar + pf.target, r: pf.rstar, credit: 0, riskPremium: pf.baseRp,
      // external
      E: 100, X: 0, M: 0, CA: 0, foreignDemand: 0,
      // internals
      Ipol: pf.rstar + pf.target,
      A: pf.credibility, W: 0, unc: 0, e: 0, pm: 0, pc: 0, ustar0: pf.ustar, part0: pf.part, rstar: pf.rstar,
      capDev: 0, tfpDev: 0, tfpScar: 0, lDev: 0, kDev: 0, potDev: 0, yd: 0, rwLev: 0, prel: 0, res: pf.reserves,
      fd: 0, comm: 0, hhS: 0, bizS: 0, riskS: 0, creditS: 0, tfpS: 0, iwd: 0, uncS: 0, costS: 0, cpiLevel: 0,
      pub: {}, pipe: {}, S: 0, spread: pf.baseRp, iEff: pf.rstar + pf.target + 0.4 + pf.baseRp, debt: pf.debt, revenue: pf.taxRatio * 100,
      interest: 0, debtChange4: 0, e4: 0, reserves: pf.reserves, Dp: 0, pegDev: false,
      hist: { pi: [pf.target, pf.target, pf.target, pf.target], rgap: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], gap: [0, 0], e: [0, 0, 0, 0, 0], debt: [pf.debt, pf.debt, pf.debt, pf.debt, pf.debt], Y: [100, 100, 100, 100, 100] },
      base: { Ystar: 100, K: pf.capOut * 100 }, spendEff: 0, revEff: 0, mult: 0
    };
    Object.keys(PROG).forEach(function (k) { s.pub[k] = 0; s.pipe[k] = []; for (var q = 0; q < PROG[k].delay; q++) s.pipe[k].push(0); });
    s.labPol = 0; s.ustPol = 0; s.tfpPolS = 0; s.cpiPol = 0; s.costPol = 0; s.qeS = 0; s.emis = 100; s.gini = 0; s.poverty = 0; s.hcDone = false; s.ruleBreach = 0; s.pegTo = 0; s.giniS = 0; s.povS = 0; s.emisPct = 0; s.cpiStep = 0; s.costStep = 0;
    // baseline interest and effective rate
    s.interest = s.iEff * s.debt;
    s.d = d;
    var gn0 = (pf.potGrowth + pf.target) / 400;
    s.pd0 = 400 * s.debt * (1 - (1 + s.iEff / 400) / (1 + gn0));     // baseline primary balance that holds debt/GDP steady
    s.spend0 = (pf.spendCur + pf.ginv + pf.transfers) * 100;
    s.revAdj = s.spend0 - pf.taxRatio * 100 - pf.commRev * 100 - s.pd0;   // other revenue (non-modelled) that closes the baseline budget
    s.deficit = s.pd0 + s.interest;
    s.def0 = s.deficit; s.monetShare = 0;
    s.revenue = s.spend0 - s.pd0;
    s.S0 = sovStress(s, pf, d);
    s.spread0 = spreadFromStress(s.S0); s.spread = s.spread0;
    return s;
  }

  var LAGW = null;
  function lagWeights() {
    if (LAGW && LAGW.pk === P.lagPeak) return LAGW.w;
    var w = [], sum = 0, pk = P.lagPeak;
    for (var k = 1; k <= 8; k++) { var x = k * Math.exp(-k / pk); w.push(x); sum += x; }
    LAGW = { pk: pk, w: w.map(function (x) { return x / sum; }) };
    return LAGW.w;
  }

  /* ---------- one quarter ---------- */
  function step(s, pf, pol, sh, rng) {
    var d = s.d, H = s.hist;
    pol = pol || {}; sh = sh || {};
    var ch = pol.ch || {}; var c = function (k) { return ch[k] || 0; };            // compiled policy channels (see econPolicy.js)
    var pg = Object.assign({}, pol.ginv || {}, ch.prog || {});
    var dGinv = 0; Object.keys(PROG).forEach(function (k) { dGinv += pg[k] || 0; });
    var reg = (c('peg') && pf.regime !== 'union') ? 'peg' : pf.regime;
    var dGcur = pol.dGcur || 0, dTr = pol.dTr || 0, dTaxInc = pol.dTaxInc || 0, dTaxCons = pol.dTaxCons || 0, dTaxCorp = pol.dTaxCorp || 0, training = pol.training || 0, tariff = pol.tariff || 0;

    // 1. exogenous states (AR processes hit by impulses)
    s.fd = 0.85 * s.fd + (sh.fd || 0);
    s.comm = 0.90 * s.comm + (sh.comm || 0);
    s.hhS = 0.75 * s.hhS + (sh.hh || 0) + (sh.bankHH || 0) * (1 - 0.45 * c('guarantee') - 0.3 * c('bankResil'));
    s.bizS = 0.75 * s.bizS + (sh.biz || 0) + (sh.bankBiz || 0) * (1 - 0.45 * c('guarantee') - 0.3 * c('bankResil'));
    s.riskS = 0.90 * s.riskS + (sh.risk || 0) * (1 - 0.5 * c('capCtrl'));
    s.creditS = 0.85 * s.creditS + (sh.credit || 0) * (1 - 0.45 * c('guarantee') - 0.3 * c('bankResil'));
    s.tfpS = 0.995 * s.tfpS + (sh.tfp || 0);
    s.iwd = 0.90 * s.iwd + (sh.iw || 0);
    s.uncS = 0.80 * s.uncS + (sh.unc || 0) * (1 - 0.3 * c('guarantee'));
    s.costS = 0.50 * s.costS + (sh.cost || 0);
    s.eS = 0.93 * s.eS + (sh.e || 0) * (1 - 0.5 * c('capCtrl'));
    s.capDev = 0.98 * s.capDev + (sh.capDestroy || 0);
    s.lDev = 0.94 * s.lDev + (sh.labour || 0);

    // 2. expectations and anchoring (from last quarter's data)
    var pi4 = avg(H.pi);
    var dev = Math.abs(pi4 - pf.target);
    // A stabilisation programme rebuilds credibility even while inflation is still high: rates above inflation, a deficit that is not being printed away,
    // a fiscal rule, or an independent central bank (Sargent 1982; Bruno 1993; Fischer, Sahay & Vegh 2002).
    var stab = (pi4 > 15 && s.r >= 2 && (s.deficit - s.def0) < 2 ? 0.025 : 0) + 0.035 * clamp(c('cbIndep'), 0, 1) + 0.03 * clamp(c('fiscalCred'), 0, 1);
    if (dev > 1.5 && stab > 0.02) s.A = Math.min(0.9, s.A + stab);
    else if (dev > 1.5) s.A = Math.max(0.05, s.A - P.anchorLoss * (0.5 + (1 - pf.credibility)) * Math.min(dev - 1.5, 6));
    else s.A = Math.min(Math.max(pf.credibility + 0.05, c('cbIndep') > 0.5 ? 0.85 : 0), s.A + P.anchorGain * (0.5 + pf.credibility) + 0.5 * stab);
    var mix = 0.7 * pi4 + 0.3 * H.pi[H.pi.length - 1];
    s.piE = 0.5 * s.piE + 0.5 * (s.A * pf.target + (1 - s.A) * mix);

    // 3. monetary policy
    var piBar = 0.5 * pi4 + 0.5 * s.piE;
    var iw = 3.0 + s.iwd;
    var rstarNom = s.rstar + pf.target;
    var i;
    var lastGap = H.gap[H.gap.length - 1];
    var fearFloat = pf.incomeRel < 0.7 ? 0.08 * Math.max(0, -s.e4) : 0;
    if (reg === 'peg') {
      i = rstarNom + s.iwd + (s.riskPremium - pf.baseRp) + 0.5 * Math.max(0, -(s.pegPressure || 0));
    } else if (pf.regime === 'union') {
      i = rstarNom + s.iwd + 0.6 * Math.max(0, s.riskPremium - pf.baseRp);
    } else {
      var hawk = pf.regime === 'govcontrolled' ? 0.1 : pf.hawk;
      var phiY = pf.regime === 'govcontrolled' ? 0.3 : P.phiY;
      var rule = rstarNom + (piBar - pf.target) + hawk * (piBar - pf.target) + phiY * lastGap - 0.4 * Math.max(0, s.credit) + fearFloat;
      if (pf.regime === 'govcontrolled') rule = rule - (pol.polBias || 0.6);
      i = P.rhoI * s.Ipol + (1 - P.rhoI) * rule;
    }
    if (pol.rate != null && pol.rate !== '') i = pol.rate;
    i = clamp(i, d.iFloor, 150);
    s.Ipol = i; s.i = i;
    var rpriv = i + 0.6 * (s.riskPremium - pf.baseRp) - s.piE;
    s.r = i - s.piE;
    var rgap = rpriv - s.rstar;
    H.rgap.unshift(rgap); H.rgap.length = 12;

    // 4. transmission signals
    var pe0 = { house: 0 };
    Object.keys(PROG).forEach(function (kk) { pe0.house += (PROG[kk].house || 0) * s.pub[kk]; });
    var wts = d.lagW;
    var rEff = 0; for (var k = 0; k < 12; k++) rEff += wts[k] * H.rgap[k];
    s.qeS += 0.15 * (c('qe') - s.qeS);                                             // asset purchases build up in market prices
    rEff -= 0.10 * s.qeS;                                                          // 1% of GDP of QE is worth ~0.10pp off the effective rate (Joyce et al. 2012; Kapetanios et al. 2012)
    // credit conditions and household wealth
    s.credit = 0.75 * s.credit + 0.25 * (0.35 * (rpriv - s.rstar) + 0.35 * (s.riskPremium - pf.baseRp) + s.creditS + 0.12 * Math.max(0, -lastGap - 2) + c('creditTight') - c('creditRelief'));
    s.W = 0.90 * s.W + 0.10 * (-6 * rEff + 2.5 * lastGap - 4 * Math.max(0, s.credit) * 0.5 + c('wealthPol') + 0.30 * s.qeS + pe0.house);
    s.unc = 0.85 * s.unc + 0.15 * (0.15 * Math.abs(pi4 - pf.target) + 0.5 * Math.max(0, s.riskPremium - pf.baseRp)) + s.uncS;

    // 5. consumption
    var uGap = s.u - (s.ustar + s.ustPol);
    var slack = clamp(-lastGap / 4, 0, 1);                              // share of households/firms constrained rises in a slump (Auerbach & Gorodnichenko 2012)
    var mpcEff = d.mpc * (1 + 0.7 * slack);
    var ydPol = 140 * (-dTaxInc - 0.85 * dTaxCons + dTr) + 140 * c('ydW') - c('cDamp');
    var tot = -0.085 * pf.energyImpDep * s.comm + 0.35 * pf.commExport * pf.exportShare * s.comm;   // terms-of-trade income effect (% GDP)
    var yd = (1 - d.mtr) * lastGap + 0.25 * s.rwLev + ydPol + tot - 0.8 * d.ms * s.pm - 0.15 * pf.fxDebt * Math.max(0, -s.e);   // dearer imports cut real income
    var Ctgt = mpcEff * yd - d.rateC * rEff + d.wealthC * s.W + P.confCons * s.confH - P.uncCons * s.unc - 0.25 * d.constrained * Math.max(0, s.credit) + P.permShare * s.potDev;
    s.C = P.cPersist * s.C + (1 - P.cPersist) * Ctgt;
    s.yd = yd;

    // 6. investment
    var gapExp = lastGap + 0.5 * (lastGap - H.gap[0]);
    var Itgt = P.accelI * (1 + 0.5 * slack) * gapExp - P.costI * rEff * (0.5 + 0.5 * d.creditDep) - P.creditI * d.creditDep * Math.max(0, s.credit) * 0.8 - P.uncI * s.unc - 0.25 * pf.fxDebt * Math.max(0, -s.e) + P.confI * s.confB
      - P.corpTaxI * dTaxCorp - P.corpTaxI * c('corpETR') + c('invBoost') + P.crowdIn * dGinv * 100 * d.invEff + P.permShare * s.potDev * 0.6;
    s.I = P.iPersist * s.I + (1 - P.iPersist) * Itgt;

    // 7. government demand and public capital
    var gDir = (1 - P.mGov) * dGcur * 100 + (1 - P.mInv) * dGinv * 100 + (c('cur') - c('curImp')) * 100 + c('dem') * 100;   // pp of GDP
    var pe = { tfp: 0, lab: 0, ust: 0, energy: 0, emis: 0, house: 0 };
    Object.keys(PROG).forEach(function (kk) {
      var spec = PROG[kk];
      s.pipe[kk].push((pg[kk] || 0) * 100);
      var arrived = s.pipe[kk].shift();
      s.pub[kk] = s.pub[kk] * (1 - spec.dep / 4) + (arrived / 4) * d.invEff / spec.s0;   // % of baseline stock (1pp GDP/yr adds 1/(4*s0) %)
      var st = s.pub[kk];
      pe.tfp += spec.tfp * st; pe.lab += (spec.lab || 0) * st; pe.ust += (spec.ust || 0) * st; pe.energy += (spec.energy || 0) * st; pe.emis += (spec.emis || 0) * st;
    });
    var shield = clamp(pe.energy + c('shield'), 0, 0.5);                                            // domestic energy capacity cushions world energy prices

    // 8. trade
    var q = s.e - s.prel;                                          // real appreciation vs baseline (+ = less competitive)
    var Xtgt = P.exFor * s.fd - P.exPrice * q - P.capX * Math.max(0, s.Dp) + 0.3 * pf.commExport * s.comm * 0.2 + c('xAdd');
    s.X = P.xmPersist * s.X + (1 - P.xmPersist) * Xtgt;
    var Mtgt = P.impInc * lastGap * 0.9 + P.impPrice * q - 1.0 * tariff * 100 * 0.3 + c('mAdd');
    s.M = P.xmPersist * s.M + (1 - P.xmPersist) * Mtgt;
    var nx = d.xs * s.X - d.ms * s.M;

    // 9. aggregate demand -> output gap
    var shareC = clamp(0.60 - 0.1 * (1 - pf.incomeRel) * 0, 0.5, 0.7), shareI = clamp(0.18 * (pf.capOut / 2.7), 0.12, 0.26);
    var Dtotal = shareC * s.C + shareI * s.I + gDir + nx + (sh.demand || 0);
    var gapDemand = Dtotal - s.potDev;
    s.DpPrev = s.Dp || 0; s.Dp = gapDemand;
    var gap = gapDemand > 0 ? gapDemand / (1 + P.capSoft * gapDemand) : gapDemand;
    var prevGap = lastGap;
    s.gap = gap;
    H.gap.unshift(gap); H.gap.length = 2;

    // 10. labour market
    s.ustPol += 0.06 * (c('ust') + pe.ust - s.ustPol);                            // policy-driven shift in structural unemployment (pp)
    s.labPol += 0.06 * (c('lab') + pe.lab - s.labPol);                            // policy-driven shift in labour supply (%)
    var ustEff = s.ustar + s.ustPol;
    var protect = c('uProtect');                                                  // furlough / wage subsidy: jobs held through a slump
    var uTgt = ustEff - d.okun * gap * (1 - 0.5 * protect);
    s.u = Math.max(0.4 * s.ustar, s.u + P.uSpeed * (uTgt - s.u));
    var uG = s.u - ustEff;
    if (uG > 0.5) s.ustar += P.hystUp * (uG - 0.5) * (1 - 0.6 * protect); else if (uG < 0) s.ustar += P.hystDown * uG * 0.5;   // ustar rises when slack persists, falls back when hot
    s.ustar -= 0.04 * training * 100;
    s.ustar = clamp(s.ustar, 0.6 * s.ustar0, s.ustar0 + 5);
    if (uG > 1.5) s.part = Math.max(s.part0 - 6, s.part - 0.03 * (uG - 1.5)); else if (uG < -1) s.part = Math.min(s.part0 + 1, s.part + 0.02 * (-uG - 1) + 0.0); else s.part = Math.min(s.part0, s.part + 0.012);
    var partDev = (s.part - s.part0) / s.part0 * 100;
    var lDevTot = s.lDev - (s.ustar - s.ustar0) * 1.05 - s.ustPol * 1.05 + partDev + s.labPol;

    // 11. potential output: baseline path plus deviations (capital, labour, productivity, public capital)
    var Ibase = (pf.capOut * (pf.potGrowth / 100 + P.delta));
    var Iflow = Ibase * (1 + s.I / 100) * (1 + gap / 100);
    var Kprev = s.K;
    s.K = Kprev * (1 - P.delta / 4) + Iflow * s.Y / 4;
    s.base.K = s.base.K * (1 - P.delta / 4) + Ibase * s.base.Ystar / 4;   // same recursion on the baseline path
    s.kDev = 100 * Math.log(s.K / s.base.K) + s.capDev;
    s.tfpPolS += 0.05 * (c('tfp') - s.tfpPolS);
    var infra = pe.tfp + s.tfpPolS;
    var scar = 0; if (gap < -3) scar = P.scarTFP * (-3 - gap) * (1 - 0.5 * protect - 0.3 * c('bizSupport'));
    s.tfpScar -= scar; s.tfpScar *= 0.999;
    var tfpDevNew = s.tfpS + infra + s.tfpScar + convergenceDev(pf, s);
    var potDevNew = P.alpha * s.kDev + (1 - P.alpha) * lDevTot + tfpDevNew;
    var potPrev = s.potDev;
    s.potDev = potDevNew;
    s.base.Ystar *= 1 + pf.potGrowth / 400;
    var YstarPrev = s.Ystar;
    s.Ystar = s.base.Ystar * Math.exp(s.potDev / 100);
    s.Y = s.Ystar * (1 + gap / 100);
    H.Y.unshift(s.Y); H.Y.length = 5;
    s.g = 100 * (s.Y / H.Y[4] - 1);
    var gAq = 4 * (tfpDevNew - (s.tfpDev || 0));
    s.tfpDev = tfpDevNew;
    s.potGrowth = 400 * (s.Ystar / YstarPrev - 1);

    // 12. wages
    var gA0 = pf.potGrowth * 0.6;
    var uPress = uG < 0 ? -d.wageSlope * uG * (1 + P.wageTight * (-uG)) : -d.wageSlope * uG;
    var wTgt = s.piE + gA0 + gAq + uPress + d.idx * (pi4 - s.piE);
    s.w = (1 - P.wSpeed) * s.w + P.wSpeed * wTgt;
    // 13. prices
    var dPress = 0.5 * gapDemand + 0.5 * s.DpPrev;                                 // firms reset prices with a lag, so pressure works through the last two quarters
    var kap = dPress > 0 ? d.kappa * dPress * (1 + P.kappaX * dPress) : d.kappa * dPress * 0.9;
    var ulc = s.w - (gA0 + gAq) - s.piCore;                                        // wage growth above productivity + prior inflation
    var cpOld = s.cpiPol; s.cpiPol = cpOld + 0.35 * (c('cpiLevel') - cpOld); s.cpiStep = s.cpiPol - cpOld;      // taxes/subsidies/caps move the price level over ~a year
    var coOld = s.costPol; s.costPol = coOld + 0.35 * (c('costLevel') - coOld); s.costStep = s.costPol - coOld;   // business cost pushes into domestic prices
    s.monetShare = (reg === 'independent' || reg === 'union') ? 0 : (pf.monetise || 0) * (1 - clamp(c('cbIndep'), 0, 1));
    var monetPush = P.moneyPass * s.monetShare * Math.max(0, s.deficit - s.def0);          // deficit financed by the central bank feeds straight into prices
    var piCore = P.lambda * s.piCore + (1 - P.lambda) * s.piE + monetPush + kap + P.ulcPsi * ulc + s.costS + 0.15 * d.omegaM * 4 * (s.pmStep || 0) + 4 * s.costStep;
    s.piCore = clamp(piCore, -5, 150);
    // exchange rate & import prices (nominal e is last quarter's; this quarter's move uses the new value below)
    var eNew = exchangeRate(s, pf, d, rpriv, rng, sh, pol);
    var de = eNew - s.e;
    s.e = eNew;
    var pmTgt = -d.ptImp * s.e + 0.8 * c('tariff');
    var pmOld = s.pm; s.pm = pmOld + P.pmSpeed * (pmTgt - pmOld);
    s.pmStep = s.pm - pmOld;
    var pcTgt = P.ptComm * (s.comm - s.e) * (1 - shield);
    var pcOld = s.pc; s.pc = pcOld + 0.6 * (pcTgt - pcOld);
    var vat = dTaxCons * 100 * 0.9;                                                // level effect spread over 4 quarters
    s.piImport = pf.target + 4 * s.pmStep;
    s.pi = (1 - d.omegaM - d.omegaC) * s.piCore + d.omegaM * s.piImport + d.omegaC * (pf.target + 4 * (s.pc - pcOld)) + (sh.cost || 0) * 0 + (s.vatFlow || 0);
    s.vatFlow = 0; if (dTaxCons !== (s.lastVat || 0)) { s.vatQ = 4; s.vatAmt = (dTaxCons - (s.lastVat || 0)) * 100 * 0.9; s.lastVat = dTaxCons; }
    if (s.vatQ > 0) { s.vatFlow = s.vatAmt; s.vatQ--; }
    s.pi = s.pi + s.vatFlow + 4 * s.cpiStep;
    s.pi = clamp(s.pi, -8, 200);
    H.pi.unshift(s.pi - 4 * s.cpiStep - (s.vatFlow || 0)); H.pi.length = 4;   // policy-driven one-off price changes are looked through by expectations and the central bank
    s.rw = s.w - s.pi; s.rwLev += (s.rw - s.w0rw) / 4;
    s.prel += (s.pi - pf.target) / 400 * 100;
    s.cpiLevel += (s.pi - pf.target) / 4;

    // 14. confidence
    var conf1 = -0.35 * uG + 0.25 * (s.rw - s.w0rw) - 0.25 * Math.max(0, s.pi - pf.target) + 0.03 * s.W - 0.3 * s.unc + 4 * s.hhS - 0.1 * Math.max(0, s.riskPremium - pf.baseRp);
    s.confH = 0.75 * s.confH + 0.25 * conf1;
    var conf2 = 0.25 * gap - 0.15 * (rpriv - s.rstar) - 0.2 * s.unc + 0.05 * dGinv * 100 + 4 * s.bizS - 0.15 * Math.max(0, s.credit);
    s.confB = 0.75 * s.confB + 0.25 * conf2;
    s.savingRate = clamp(0.08 + 0.5 * (yd - s.C) / 100 * 0.6 + 0.004 * s.unc, 0, 0.5);

    // 15. public finances (% of GDP; spending fixed in real terms so it falls as a share when output booms)
    var gdpR = 1 + gap / 100;
    var trAuto = d.uBen * uG;
    var spend = (pf.spendCur * 100 + dGcur * 100 + pf.ginv * 100 + dGinv * 100 + pf.transfers * 100 + dTr * 100 + trAuto + (c('cur') + c('tr')) * 100) / gdpR;
    var revBase = (pf.taxRatio * 100 + s.revAdj + (dTaxInc + dTaxCons + dTaxCorp) * 100 + pf.commRev * 100 * (1 + s.comm / 100 * 1.0) + tariff * pf.openness * 100 + c('rev') * 100);
    var revenue = revBase * Math.pow(gdpR, P.revEl - 1);
    s.revenue = revenue; s.T = revenue;
    s.Gcur = (pf.spendCur * 100 + dGcur * 100) / gdpR; s.Ginv = (pf.ginv * 100 + dGinv * 100) / gdpR;
    var pd = spend - revenue + (training * 100 * 0);
    var gnq = (s.Y / H.Y[1] - 1) + s.pi / 400;
    if (c('haircut') > 0 && !s.hcDone) {                                            // restructuring: debt cut now, market access lost for years (Cruces & Trebesch 2013)
      s.hcDone = true; s.debt *= 1 - c('haircut') / 100;
      s.riskS += 0.07 * c('haircut'); s.creditS += 0.04 * c('haircut'); s.A = Math.max(0.05, s.A - 0.004 * c('haircut'));
    }
    var oldD = s.debt;
    // sovereign spread and financing cost
    H.debt.unshift(oldD); H.debt.length = 5;
    s.debtChange4 = oldD - H.debt[4];
    var brk = 0;
    if (c('defTarget') > 0) brk += Math.max(0, s.deficit - c('defTarget')) / 2;
    if (c('debtTarget') > 0) brk += Math.max(0, s.debtGDP - c('debtTarget')) / 25;
    if (c('spendCeil') > 0) brk += Math.max(0, spend - c('spendCeil')) / 3;
    s.ruleBreach = Math.min(brk, 2);
    var ruleAdj = c('fiscalCred') > 0 ? c('fiscalCred') * (-0.18 + 0.35 * s.ruleBreach) : 0;
    s.S = Math.max(0, sovStress(s, pf, d) + ruleAdj);
    var spread = spreadFromStress(s.S) + s.riskS * 1.0;
    s.spread = 0.5 * s.spread + 0.5 * Math.max(0.1, spread);
    s.riskPremium = Math.max(0.05, pf.baseRp + (s.spread - s.spread0) * (pf.regime === 'union' ? 0.5 : 1));   // structural premium plus stress-driven change
    var iGov = i + 0.4 + s.riskPremium - 0.07 * s.qeS + 0.08 * c('matDelta') - 0.04 * c('fxShare');
    var refi = 1 / (4 * Math.max(1, pf.maturityYrs + c('matDelta')));
    s.iEff = s.iEff * (1 - refi) + refi * iGov;
    s.interest = s.iEff * oldD;                                                     // % of GDP (iEff in %, debt fraction)
    s.deficit = pd + s.interest;
    var fxHit = clamp(pf.fxDebt + c('fxShare') / 100, 0, 1) * (-de) / 100;                                            // depreciation (de<0) inflates FX debt
    s.debt = oldD * (1 + s.iEff / 400) / (1 + gnq) * (1 + fxHit) + pd / 100 / 4 + (c('debtAdd') + c('cashAdd')) / 4;
    s.debtGDP = s.debt * 100; s.debtInterest = s.interest;
    s.mult = 0;

    // 16. external accounts
    s.E = 100 * Math.exp(s.e / 100);
    s.CA = nx + tot * 0.5 + pf.commExport * pf.exportShare * s.comm * 0.15 * 0.2;
    s.reserves = Math.max(0, s.reserves + (s.CA / 100 / 4) / (d.ms / 12) * 0.5 + (pol.fxIntervention || 0) - 0.15 * Math.max(0, -(s.pegPressure || 0)) + (c('cashAdd') / 4) / (d.ms / 12) - (c('fxInt') / 100 / 4) / (d.ms / 12));
    s.e4 = s.e - H.e[H.e.length - 1];
    H.e.unshift(s.e); H.e.length = 5;
    s.foreignDemand = s.fd;
    // indicative outcome trackers (not calibrated as tightly as the macro block)
    var ydev = (s.Y / s.base.Ystar - 1) * 100;
    var emisTgt = 100 * (1 + 0.6 * ydev / 100) * (1 + (pe.emis + c('emisPct')) / 100);
    s.emis += 0.08 * (emisTgt - s.emis);
    s.giniS += 0.10 * (c('giniPol') + 0.35 * uG + 0.02 * s.W + 0.03 * (s.pi - pf.target) - s.giniS);
    s.povS += 0.10 * (c('povPol') + 0.7 * uG - 0.4 * (s.rw - s.w0rw) + 0.02 * pf.foodShareCPI * s.pc * 10 - s.povS);
    s.gini = s.giniS; s.poverty = s.povS;
    s.t++;
    return s;
  }

  function convergenceDev(pf, s) {
    // catch-up: extra productivity growth for poorer countries with good institutions, on top of the baseline path
    // (deviation form: enters only when institutions/openness/education diverge from baseline through policy; kept at 0 here so baseline is stable)
    return 0;
  }

  var _baseCache = {};
  function baselineStress(pf, d) {
    return { revenue: pf.taxRatio * 100, debt: pf.debt, debtChange4: 0, interest: (pf.rstar + pf.target + 0.4 + pf.baseRp) * pf.debt, e4: 0, pi: pf.target, reserves: pf.reserves, CA: 0, riskS: 0 };
  }

  function exchangeRate(s, pf, d, rpriv, rng, sh, pol) {
    var chx0 = (pol && pol.ch) || {};
    var rdiff = (rpriv - s.rstar) - (0 + s.iwd);                                    // real-rate differential vs baseline
    var finOpenX = d.eFin * (1 - 0.6 * (chx0.capCtrl || 0));
    var tgt = P.eRate * finOpenX * rdiff + 0.25 * (chx0.fxInt || 0) - 0.15 * s.qeS
      + 0.3 * s.gap - P.eRisk * finOpenX * (s.riskPremium - pf.baseRp)
      - 0.08 * s.prel + s.eS - 0.5 * s.iwd * d.eFin;
    var e = s.e;
    var chx = (pol && pol.ch) || {};
    if (pf.regime === 'union') return 0;
    if ((chx.peg && pf.regime !== 'union') || pf.regime === 'peg') {
      s.pegPressure = tgt - e;
      if (s.reserves < 1.0 && !s.pegDev && s.pegPressure < -1) { s.pegDev = true; s.A = Math.max(0.05, s.A - 0.2); return e - 25; }
      if (s.pegDev) e = e + P.eSpeed * (tgt - e); else e = chx.pegTo || 0;
      return e;
    }
    var noise = 0;
    if (rng) { noise = clamp(rng() * 2 - 1, -1, 1) * d.eNoise * 0.6; }
    return e + P.eSpeed * (tgt - e) + noise;
  }

  /* ---------- runners ---------- */
  function mulberry(seed) { var a = seed >>> 0; return function () { a += 0x6D2B79F5; var t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  function snapshot(s, pf) {
    return { t: s.t, e: s.e, Y: s.Y, Ystar: s.Ystar, g: s.g, gap: s.gap, u: s.u, ustar: s.ustar, w: s.w, rw: s.rw, pi: s.pi, piE: s.piE, piCore: s.piCore, piImport: s.piImport, i: s.i, r: s.r, credit: s.credit,
      riskPremium: s.riskPremium, E: s.E, CA: s.CA, C: s.C, I: s.I, X: s.X, M: s.M, confH: s.confH, confB: s.confB, savingRate: s.savingRate * 100, deficit: s.deficit, debtGDP: s.debtGDP, interest: s.debtInterest,
      T: s.T, Gcur: s.Gcur, Ginv: s.Ginv, part: s.part, A: s.A, W: s.W, K: s.K, potGrowth: s.potGrowth, reserves: s.reserves, S: s.S, spread: s.spread, monet: (s.monetShare || 0) * Math.max(0, s.deficit - (s.def0 || 0)) * P.moneyPass, cpiLevel: s.cpiLevel, pm: s.pm, comm: s.comm, potDev: s.potDev, emis: s.emis, gini: s.gini, poverty: s.poverty, qe: s.qeS, ruleBreach: s.ruleBreach, fd: s.fd, L: 100 * (1 - s.u / 100) * (s.part / s.part0) / (1 - s.ustar0 / 100), prod: s.Y / ((1 - s.u / 100) * (s.part / s.part0) / (1 - s.ustar0 / 100)) };
  }

  // policy(t, state) may return a policy object; shocks is a function t -> impulse object (or array of scheduled shocks)
  function run(pf, quarters, opts) {
    opts = opts || {};
    var s = init(pf), out = [snapshot(s, pf)];
    var rng = opts.noise ? mulberry(opts.seed || 1) : null;
    for (var t = 1; t <= quarters; t++) {
      var pol = typeof opts.policy === 'function' ? opts.policy(t, s) : (opts.policy || {});
      var sh = typeof opts.shocks === 'function' ? opts.shocks(t) : (opts.shocks && opts.shocks[t]) || {};
      step(s, pf, pol, sh, rng);
      out.push(snapshot(s, pf));
    }
    return out;
  }

  // difference from a matching no-shock, no-policy baseline
  function impulse(pf, quarters, opts) {
    var base = run(pf, quarters, {}), sim = run(pf, quarters, opts);
    return sim.map(function (row, k) { var o = {}; for (var key in row) o[key] = row[key] - base[k][key]; o.t = row.t; return o; });
  }

  /* ---------- shock library (pulses into the exogenous states) ---------- */
  var SHOCKS = {
    hhConfidence: { name: 'Consumer confidence crash', on: function (m) { return { hh: -1.5 * m }; } },
    foreignRecession: { name: 'Foreign recession', on: function (m) { return { fd: -3 * m }; } },
    investmentBoom: { name: 'Investment boom', on: function (m) { return { biz: 1.5 * m }; } },
    oil: { name: 'Oil/energy price shock', on: function (m) { return { comm: 15 * m }; } },
    drought: { name: 'Drought / harvest failure', on: function (m) { return { comm: 6 * m, tfp: -0.4 * m, cost: 1.0 * m }; } },
    pandemic: { name: 'Pandemic', on: function (m) { return { labour: -0.6 * m, fd: -2 * m, hh: -1.0 * m, tfp: -0.15 * m, unc: 0.6 * m }; } },
    productivity: { name: 'Productivity breakthrough', on: function (m) { return { tfp: 0.25 * m }; } },
    naturalDisaster: { name: 'Natural disaster', on: function (m) { return { capDestroy: -0.8 * m, hh: -0.5 * m, unc: 0.3 * m }; } },
    bankingCrisis: { name: 'Banking crisis', on: function (m) { return { credit: 1.5 * m, bankHH: -0.8 * m, bankBiz: -1.2 * m, unc: 0.8 * m }; } },
    capitalFlight: { name: 'Capital flight', on: function (m) { return { risk: 1.0 * m, e: -6 * m, unc: 0.3 * m }; } },
    tradeWar: { name: 'Trade war', on: function (m) { return { fd: -1.5 * m, unc: 0.4 * m, cost: 0.4 * m }; } },
    globalRate: { name: 'Global rate shock', on: function (m) { return { iw: 0.5 * m }; } },
    politicalCrisis: { name: 'Political / institutional crisis', on: function (m) { return { risk: 0.8 * m, unc: 0.8 * m, biz: -0.5 * m }; } }
  };

  /* ---------- validation against published empirical ranges (run live on the explainer page) ---------- */
  function validate() {
    var A = PROFILES.advanced, M = PROFILES.emerging, out = [];
    var mn = function (rows, k) { var m = 0; rows.forEach(function (r) { if (r[k] < m) m = r[k]; }); return m; };
    var mx = function (rows, k) { var m = 0; rows.forEach(function (r) { if (r[k] > m) m = r[k]; }); return m; };
    function add(group, name, val, lo, hi, unit, src) { out.push({ group: group, name: name, value: val, lo: lo, hi: hi, unit: unit, src: src, pass: val >= lo && val <= hi }); }
    var hike = function (pf) { var b = run(pf, 40, {}); return impulse(pf, 40, { policy: function (t) { return t <= 4 ? { rate: b[t].i + 1 } : {}; } }); };
    var hA = hike(A), hM = hike(M);
    add('Monetary policy', '+100bp for a year: peak GDP effect (advanced)', mn(hA, 'Y'), -0.9, -0.2, '%', 'Romer & Romer (2004); Cloyne & Hurtgen (2016); BoE staff');
    add('Monetary policy', '+100bp for a year: peak CPI effect (advanced)', mn(hA, 'pi'), -0.6, -0.1, 'pp', 'Cloyne & Hurtgen (2016); Bernanke & Mihov (1998)');
    add('Monetary policy', 'Same hike in a low-household-debt emerging economy: GDP effect as share of the advanced effect', mn(hM, 'Y') / mn(hA, 'Y'), 0.4, 0.85, 'x', 'Cloyne, Ferreira & Surico (2020); Flodén et al. (2021)');
    var mult = function (pf, pre, k) { var base = run(pf, 24, { shocks: pre }), sim = run(pf, 24, { shocks: pre, policy: function (t) { return t >= 2 && t <= 9 ? { dGcur: 0.01 } : {}; } }); return (sim[k].Y - base[k].Y) / base[k].Y * 100; };
    var slump = { 1: { hh: -6, biz: -5, fd: -6, credit: 2 } };
    add('Fiscal policy', 'Government spending multiplier, year 1, normal conditions', mult(A, null, 5), 0.5, 1.1, 'x', 'OBR; Ilzetzki, Mendoza & Vegh (2013); Blanchard & Leigh (2013)');
    add('Fiscal policy', 'Multiplier after 2 years in a deep slump relative to normal times', mult(A, slump, 9) / mult(A, null, 9), 1.2, 3.0, 'x', 'Auerbach & Gorodnichenko (2012); Gechert & Rannenberg (2018)');
    var b0 = run(A, 24, {}), tx = run(A, 24, { policy: function (t) { return t >= 2 ? { dTaxInc: -0.01 } : {}; } });
    add('Fiscal policy', 'Income-tax cut multiplier, year 1', (tx[5].Y - b0[5].Y) / b0[5].Y * 100, 0.15, 0.7, 'x', 'OBR; Romer & Romer (2010); Mertens & Ravn (2013)');
    var sl = impulse(A, 16, { shocks: { 1: { hh: -3 } } }), kk = 0; sl.forEach(function (r, k) { if (r.gap < sl[kk].gap) kk = k; });
    add('Fiscal policy', 'Budget balance change per 1pp fall in the output gap', sl[kk].deficit / -sl[kk].gap, 0.35, 0.65, 'pp', 'OECD (Girouard & Andre 2005); Fedelino, Ivanova & Horton (2009)');
    var pi1 = impulse(A, 16, { shocks: { 1: { demand: 3 } } }), pi2 = impulse(A, 16, { shocks: { 1: { demand: -3 } } });
    add('Inflation', 'Inflation response to +3% excess demand, relative to a -3% shortfall (convexity)', mx(pi1, 'pi') / -mn(pi2, 'pi'), 1.5, 6, 'x', 'Bank of England staff; Forbes et al. (2021); Babb & Detmeister (2017)');
    var fxA = impulse(A, 16, { shocks: { 1: { e: -10 } } }), fxM = impulse(M, 16, { shocks: { 1: { e: -10 } } });
    add('Inflation', '10% depreciation: CPI level after 2 years (advanced)', fxA[8].cpiLevel, 0.5, 2.5, '%', 'Bank of England (2015); Forbes, Hjortsoe & Nenova (2018)');
    add('Inflation', '10% depreciation: CPI level after 2 years (emerging)', fxM[8].cpiLevel, 1.0, 5.0, '%', 'Ha, Stocker & Yilmazkuday (2019); Jasova et al. (2020)');
    var oil = impulse(A, 24, { shocks: { 1: { comm: 33 } } }), oc = 0, cum = 0; oil.forEach(function (r) { cum += r.pi / 4; if (cum > oc) oc = cum; });
    add('Inflation', 'Oil/energy +33%: peak effect on the CPI price level (advanced)', oc, 0.4, 1.6, '%', 'Blanchard & Gali (2007); ECB (2010); BoE (2022)');
    add('Supply side', 'Oil/energy +33%: peak GDP effect (advanced)', mn(oil, 'Y'), -0.8, -0.05, '%', 'Kilian (2008); Blanchard & Gali (2007)');
    var cr = impulse(A, 80, { shocks: { 1: { bankHH: -3, bankBiz: -3, credit: 3, unc: 1.5 }, 2: { credit: 2 }, 3: { credit: 1 } } });
    add('Supply side', 'Banking crisis: potential output loss after 5 years', -cr[20].potDev, 0.5, 5, '%', 'Blanchard, Cerutti & Summers (2015); Cerra & Saxena (2008); BoE (2014)');
    var pi = impulse(A, 60, { policy: function (t) { return t <= 16 ? { ginv: { transport: 0.01 } } : {}; } });
    add('Supply side', 'Public investment +1% of GDP for 4 years: output after 4 years', pi[16].Y, 0.4, 2.0, '%', 'IMF WEO (2014) ch.3; Abiad, Furceri & Topalova (2016)');
    add('Labour', 'Okun coefficient: unemployment per 1pp output gap (advanced)', derive(A).okun, 0.3, 0.5, 'pp', 'Ball, Leigh & Loungani (2017); Knotek (2007)');
    var sh = {}; for (var t = 1; t <= 20; t += 3) sh[t] = { cost: 2.5 };
    var ea = run(A, 40, { shocks: sh }), ee = run(M, 40, { shocks: sh });
    var drop = function (rows) { var m = 1; rows.forEach(function (x) { if (x.A < m) m = x.A; }); return rows[0].A - m; };
    add('Inflation', 'Repeated cost shocks: expectations de-anchor more in the low-credibility economy (its loss / the advanced loss)', drop(ee) / Math.max(0.01, drop(ea)), 1.2, 10, 'x', 'Carvalho, Nechio & Tristao (2023); Coibion & Gorodnichenko (2015)');
    var bs = run(A, 40, {}); add('Model integrity', 'No-shock baseline: output gap stays at zero for 10 years', Math.max.apply(null, bs.map(function (r) { return Math.abs(r.gap); })), 0, 0.05, '%', 'Internal consistency check');
    add('Model integrity', 'No-shock baseline: debt/GDP unchanged after 10 years', Math.abs(bs[40].debtGDP - bs[0].debtGDP), 0, 0.5, 'pp', 'Debt arithmetic');
    var cA = Object.assign({}, A, { debt: 1.3, maturityYrs: 15 }), cB = Object.assign({}, M, { debt: 0.65, fxDebt: 0.7, reserves: 1.5, polStab: 0.3, instQ: 0.3, maturityYrs: 4 });
    var sa = run(cA, 12, { shocks: { 1: { risk: 0.5, e: -8 } } }), sb = run(cB, 12, { shocks: { 1: { risk: 0.5, e: -8 } } });
    add('Sovereign risk', 'Same shock: spread rise, 65% debt/foreign-currency/low reserves vs 130% debt/own currency/long maturity', (sb[6].spread - sb[0].spread) / Math.max(0.01, sa[6].spread - sa[0].spread), 1.5, 40, 'x', 'IMF sovereign spreads work; Reinhart & Rogoff (2009)');
    return out;
  }

  /* ---------- what the player sees: data arrive late and are revised ---------- */
  // First release comes `lag` quarters after the fact, with noise that shrinks to nothing after `revise` more quarters (ONS/BEA-style revisions).
  function observed(rows, key, o) {
    o = o || {}; var lag = o.lag == null ? 2 : o.lag, revise = o.revise == null ? 4 : o.revise, sd = o.noise == null ? 0.25 : o.noise, rng = mulberry(o.seed || 7);
    var noise = rows.map(function () { return (rng() * 2 - 1) * sd; });
    return rows.map(function (r, k) {
      if (k < lag) return null;                                                   // nothing published yet
      var src = k - lag, age = 0;                                                  // quarters since first release of the point being shown
      var v = rows[src][key];
      var n = noise[src] * Math.max(0, 1 - (k - (src + lag)) / Math.max(1, revise));
      return v + n;
    });
  }

  root.LMEcon = { P: P, PARAM_DOC: PARAM_DOC, PUBLIC: PUBLIC, PROFILES: PROFILES, SHOCKS: SHOCKS, derive: derive, init: init, step: step, run: run, impulse: impulse, mulberry: mulberry, validate: validate, PROG: PROG, observed: observed, snapshot: snapshot };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.LMEcon;
})(typeof window !== 'undefined' ? window : globalThis);
