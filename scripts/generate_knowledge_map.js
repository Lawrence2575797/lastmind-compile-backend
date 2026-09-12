// Two-call pipeline: GENERATION (per subtopic) -> VERIFICATION (whole batch)
// -> apply fixes -> validate as a DAG. Mirrors exactly what happened by
// hand in the Claude Code session that designed these prompts: generate,
// then have a separate, dedicated pass hunt for the blind-comprehension
// gaps, missing cross-links, and ordering bugs a single pass reliably
// misses.
//
// Uses YOUR OWN Anthropic API key (never Claude Code) - this is real
// production content generation for LastMind, so it must run through the
// Commercial/API terms, not a personal session.
//
// Usage: node scripts/generate_knowledge_map.js
// Requires ANTHROPIC_API_KEY in the environment (see .env.example).
// Edit SUBJECT/QUALIFICATION/EXAM_BOARD and SUBTOPICS below before running.

// override:true - a stale CLAUDE_API_KEY/Claude_API_KEY inherited from the
// parent shell's own process environment (Windows env vars are case-
// insensitive) otherwise wins over whatever this project's own .env says,
// since dotenv's default behavior never overrides an already-set variable.
require('dotenv').config({ override: true });
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

// knowledgeMapPrompts.ts is TypeScript (consumed normally by the compiled
// backend); this script runs as plain Node like every other file in
// scripts/, so it can't require() a .ts file directly without a build
// step. Extract the exported template-literal constants as text instead,
// rather than adding a TS toolchain dependency to a one-off script.
function extractPromptConstant(source, name) {
  const marker = `export const ${name} = \``;
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`Could not find ${name} in knowledgeMapPrompts.ts`);
  const contentStart = start + marker.length;
  const end = source.indexOf('`;', contentStart);
  if (end === -1) throw new Error(`Could not find the end of ${name}`);
  return source.slice(contentStart, end);
}
const promptsSource = fs.readFileSync(path.join(__dirname, '../src/constants/knowledgeMapPrompts.ts'), 'utf8');
const KNOWLEDGE_MAP_GENERATION_PROMPT_BASE = extractPromptConstant(promptsSource, 'KNOWLEDGE_MAP_GENERATION_PROMPT');
const KNOWLEDGE_MAP_GENERATION_PROMPT_PRACTICAL_RULE = extractPromptConstant(promptsSource, 'KNOWLEDGE_MAP_GENERATION_PROMPT_PRACTICAL_RULE');
const KNOWLEDGE_MAP_COVERAGE_PROMPT = extractPromptConstant(promptsSource, 'KNOWLEDGE_MAP_COVERAGE_PROMPT');
const KNOWLEDGE_MAP_VERIFICATION_PROMPT_BASE = extractPromptConstant(promptsSource, 'KNOWLEDGE_MAP_VERIFICATION_PROMPT');
const KNOWLEDGE_MAP_VERIFICATION_PROMPT_PRACTICAL_CHECK = extractPromptConstant(promptsSource, 'KNOWLEDGE_MAP_VERIFICATION_PROMPT_PRACTICAL_CHECK');

// Rule 17 (and its matching verification check) only ever fires for a
// subject with real lab/fieldwork content - sending it on every subtopic
// call for a subject like Economics is pure dead input cost (and a
// standing invitation for the model to go looking for practical content
// that was never asked for). Set this per subject, not per call.
const HAS_PRACTICAL_CONTENT = false; // true for Chemistry/Biology/Physics-style specs
const KNOWLEDGE_MAP_GENERATION_PROMPT = KNOWLEDGE_MAP_GENERATION_PROMPT_BASE.replace(
  '{{PRACTICAL_RULE}}',
  HAS_PRACTICAL_CONTENT ? KNOWLEDGE_MAP_GENERATION_PROMPT_PRACTICAL_RULE : ''
);
const KNOWLEDGE_MAP_VERIFICATION_PROMPT = KNOWLEDGE_MAP_VERIFICATION_PROMPT_BASE.replace(
  '{{PRACTICAL_CHECK}}',
  HAS_PRACTICAL_CONTENT ? KNOWLEDGE_MAP_VERIFICATION_PROMPT_PRACTICAL_CHECK : ''
);

// Same env var claudeClient.ts already reads - not ANTHROPIC_API_KEY.
const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

// Matches the draft/gate split already established by
// chainGenerationSimple + factCheck in claudeClient.ts, not
// chainGeneration + factCheck (both-Opus) - generation here is a
// structured decomposition task against explicit rules, which Sonnet
// handles reliably; verification is the precision-critical judgment call
// (is this edge actually wrong, is this really a duplicate) applied
// across the whole batch at once, where Opus's extra reasoning capacity
// earns its cost. The cost delta between the two options is trivial
// either way at this volume (roughly $1-1.50 per subject) - this is a
// quality choice, not a cost one.
const GENERATION_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5';
const VERIFICATION_MODEL = 'claude-opus-5';
// Coverage-checking against the raw spec text is a completeness GATE,
// not a draft - same reasoning as VERIFICATION_MODEL, and the class of
// error it exists to catch (a whole named theory silently dropped) is
// exactly the kind of thing worth an unconditional Opus check regardless
// of which model drafted the subtopic.
const COVERAGE_MODEL = 'claude-opus-5';
const MAX_COVERAGE_ROUNDS = 2;

// Each of the three system prompts below is byte-identical across every
// subtopic call in a run (and across coverage-check/regenerate retries
// for the same subtopic) - wrapping it as a cached content block means
// only the FIRST call in a run pays full input price for it; every
// subsequent call within the ~5 minute cache window reads it back at a
// steep discount instead of repaying for the same ~1-2k token ruleset
// 15-20+ times per subject.
function cachedSystem(promptText) {
  return [{ type: 'text', text: promptText, cache_control: { type: 'ephemeral' } }];
}

// Hard spend ceiling for THIS run, checked before every API call and
// after every response - not just an estimate printed at the end. Set
// deliberately close to (not far above) the quoted estimate for this
// specific subject, since the whole point of asking for a cap is that it
// actually holds, not that it's generous. Standard (non-intro) per-token
// rates are used for the running total on purpose: if intro pricing
// applies, real spend comes in under what this tracker reports, which is
// the safe direction to be wrong in for a cap - never the other way.
// User's explicit cap for this run: $5.
const SPEND_CAP_USD = 5.0;
const PRICING_PER_MTOK = {
  'claude-sonnet-5': { in: 3, out: 15 },
  'claude-opus-5': { in: 5, out: 25 },
};
let totalSpendUsd = 0;
function recordUsage(model, usage) {
  const p = PRICING_PER_MTOK[model];
  if (!p || !usage) return;
  const inTok = usage.input_tokens || 0;
  const cacheWriteTok = usage.cache_creation_input_tokens || 0;
  const cacheReadTok = usage.cache_read_input_tokens || 0;
  const outTok = usage.output_tokens || 0;
  const cost = (inTok * p.in + cacheWriteTok * p.in * 1.25 + cacheReadTok * p.in * 0.1 + outTok * p.out) / 1e6;
  totalSpendUsd += cost;
  console.error(`  [spend] +$${cost.toFixed(4)} (${model}) -> running total $${totalSpendUsd.toFixed(4)} / $${SPEND_CAP_USD} cap`);
  if (totalSpendUsd >= SPEND_CAP_USD) {
    throw new Error(`SPEND CAP REACHED: running total $${totalSpendUsd.toFixed(4)} has hit the $${SPEND_CAP_USD} cap for this run. Stopping before starting further calls - re-run with a higher SPEND_CAP_USD if this was expected and you want to continue from the checkpoint.`);
  }
}
// Checked at the START of every call site too (not just after), so a
// chunk that's already at/over cap from a sibling call refuses to even
// start its own next API call rather than only noticing after paying for it.
function assertUnderCap() {
  if (totalSpendUsd >= SPEND_CAP_USD) {
    throw new Error(`SPEND CAP REACHED: running total $${totalSpendUsd.toFixed(4)} already at/over the $${SPEND_CAP_USD} cap - refusing to start another call.`);
  }
}

const SUBJECT = 'Economics';
const QUALIFICATION = 'A-Level';
const EXAM_BOARD = 'Edexcel';

// Fill in with the REAL specification content for each subtopic - the
// actual named theories/concepts from the syllabus. Generation quality is
// bounded by what's given here; do not leave this to the model's own
// possibly-stale recall of the spec.
const SUBTOPICS = [
  {
    subtopic: "1.1 Nature of economics",
    specContent: `1.1 Nature of economics

Content - what students need to learn:
- Thinking like an economist: the process of developing models in economics, including the need to make assumptions.
- The use of the ceteris paribus assumption in building models.
- The inability in economics to make scientific experiments.
- The distinction between positive and normative economic statements.
- The role of value judgements in influencing economic decision making and policy.
- The problem of scarcity, where there are unlimited wants and finite resources.
- The distinction between renewable and non-renewable resources.
- The importance of opportunity costs to economic agents (consumers, producers and government).
- The use of production possibility frontiers (PPFs) to depict the maximum productive potential of an economy, opportunity cost (through marginal analysis), economic growth or decline, efficient or inefficient allocation of resources, and possible and unobtainable production.
- The distinction between movements along and shifts in production possibility curves, considering the possible causes for such changes.
- The distinction between capital and consumer goods.
- Specialisation and the division of labour: reference to Adam Smith.
- The advantages and disadvantages of specialisation and the division of labour in organising production.
- The advantages and disadvantages of specialising in the production of goods and services to trade.
- The functions of money (as a medium of exchange, a measure of value, a store of value, a method of deferred payment).
- The distinction between free market, mixed and command economies: reference to Adam Smith, Friedrich Hayek and Karl Marx.
- The advantages and disadvantages of a free market economy and a command economy.
- The role of the state in a mixed economy.
`
  },
  {
    subtopic: "1.2 How markets work",
    specContent: `1.2 How markets work

Content - what students need to learn:
- The underlying assumptions of rational economic decision making: consumers aim to maximise utility, and firms aim to maximise profits.
- The distinction between movements along a demand curve and shifts of a demand curve.
- The factors that may cause a shift in the demand curve (the conditions of demand).
- The concept of diminishing marginal utility and how this influences the shape of the demand curve.
- Understanding of price, income and cross elasticities of demand.
- Use of formulae to calculate price, income and cross elasticities of demand.
- Interpretation of numerical values of price elasticity of demand (unitary elastic, perfectly and relatively elastic, and perfectly and relatively inelastic), income elasticity of demand (inferior, normal and luxury goods; relatively elastic and relatively inelastic), and cross elasticity of demand (substitutes, complementary and unrelated goods).
- The factors influencing elasticities of demand.
- The significance of elasticities of demand to firms and government in terms of the imposition of indirect taxes and subsidies, changes in real income, and changes in the prices of substitute and complementary goods.
- The relationship between price elasticity of demand and total revenue (including calculation).
- The distinction between movements along a supply curve and shifts of a supply curve.
- The factors that may cause a shift in the supply curve (the conditions of supply).
- Understanding of price elasticity of supply.
- Use of formula to calculate price elasticity of supply.
- Interpretation of numerical values of price elasticity of supply: perfectly and relatively elastic, and perfectly and relatively inelastic.
- Factors that influence price elasticity of supply.
- The distinction between short run and long run in economics and its significance for elasticity of supply.
- Equilibrium price and quantity and how they are determined.
- The use of supply and demand diagrams to depict excess supply and excess demand.
- The operation of market forces to eliminate excess demand and excess supply.
- The use of supply and demand diagrams to show how shifts in demand and supply curves cause the equilibrium price and quantity to change in real-world situations.
- Functions of the price mechanism to allocate resources: rationing, incentive, and signalling.
- The price mechanism in the context of different types of markets, including local, national and global markets.
- The distinction between consumer and producer surplus.
- The use of supply and demand diagrams to illustrate consumer and producer surplus.
- How changes in supply and demand might affect consumer and producer surplus.
- Supply and demand analysis and elasticities applied to: the impact of indirect taxes on consumers, producers and government; the incidence of indirect taxes on consumers and producers; the impact of subsidies on consumers, producers and government; and the area that represents the producer subsidy and consumer subsidy.
- The reasons why consumers may not behave rationally: consideration of the influence of other people's behaviour, the importance of habitual behaviour, and consumer weakness at computation.
`
  },
  {
    subtopic: "1.3 Market failure",
    specContent: `1.3 Market failure

Content - what students need to learn:
- Understanding of market failure.
- Types of market failure: externalities, under-provision of public goods, and information gaps.
- Distinction between private costs, external costs and social costs.
- Distinction between private benefits, external benefits and social benefits.
- Use of a diagram to illustrate the external costs of production using marginal analysis, the distinction between market equilibrium and social optimum position, and identification of the welfare loss area.
- Use of a diagram to illustrate the external benefits of consumption using marginal analysis, the distinction between market equilibrium and social optimum position, and identification of the welfare gain area.
- The impact on economic agents of externalities and government intervention in various markets.
- Distinction between public and private goods using the concepts of non-rivalry and non-excludability.
- Why public goods may not be provided by the private sector: the free rider problem.
- The distinction between symmetric and asymmetric information.
- How imperfect market information may lead to a misallocation of resources.
`
  },
  {
    subtopic: "1.4 Government intervention",
    specContent: `1.4 Government intervention

Content - what students need to learn:
- Purpose of intervention with reference to market failure, using diagrams in various contexts: indirect taxation (ad valorem and specific), subsidies, and maximum and minimum prices.
- Other methods of government intervention: trade pollution permits, state provision of public goods, provision of information, and regulation.
- Understanding of government failure as intervention that results in a net welfare loss.
- Causes of government failure: distortion of price signals, unintended consequences, excessive administrative costs, and information gaps.
- Government failure in various markets.
`
  },
  {
    subtopic: "2.1 Measures of economic performance",
    specContent: `2.1 Measures of economic performance

Content - what students need to learn:
- Rates of change of real Gross Domestic Product (GDP) as a measure of economic growth.
- Distinction between real and nominal, total and per capita, and value and volume.
- Other national income measures: Gross National Income (GNI).
- Comparison of rates of growth between countries and over time.
- Understanding of Purchasing Power Parities (PPPs) and the use of PPP-adjusted figures in international comparisons.
- The limitations of using GDP to compare living standards between countries and over time.
- National happiness: UK national wellbeing, and the relationship between real incomes and subjective happiness.
- Understanding of inflation, deflation and disinflation.
- The process of calculating the rate of inflation in the UK using the Consumer Prices Index (CPI).
- The limitations of CPI in measuring the rate of inflation.
- The Retail Prices Index (RPI) as an alternative measure of the rate of inflation.
- Causes of inflation: demand pull, cost push, and growth of the money supply.
- The effects of inflation on consumers, firms, the government and workers.
- Measures of unemployment: the claimant count, and the International Labour Organisation (ILO) measure via the UK Labour Force Survey.
- The distinction between unemployment and under-employment.
- The significance of changes in the rates of employment, unemployment and inactivity.
- The causes of unemployment: structural unemployment, frictional unemployment, seasonal unemployment, demand deficiency and cyclical unemployment, and real wage inflexibility.
- The significance of migration and skills for employment and unemployment.
- The effects of unemployment on consumers, firms, workers, the government and society.
- Components of the balance of payments, with particular reference to the current account and the balance of trade in goods and services.
- Current account deficits and surpluses.
- The relationship between current account imbalances and other macroeconomic objectives.
- The interconnectedness of economies through international trade.
`
  },
  {
    subtopic: "2.2 Aggregate demand (AD)",
    specContent: `2.2 Aggregate demand (AD)

Content - what students need to learn:
- Components of AD: C+I+G+(X-M).
- The relative importance of the components of AD.
- The AD curve.
- The distinction between a movement along, and a shift of, the AD curve.
- Disposable income and its influence on consumer spending.
- An understanding of the relationship between savings and consumption.
- Other influences on consumer spending: interest rates, consumer confidence, and wealth effects.
- Distinction between gross and net investment.
- Influences on investment: the rate of economic growth, business expectations and confidence, Keynes and 'animal spirits', demand for exports, interest rates, access to credit, and the influence of government and regulations.
- The main influences on government expenditure: the trade cycle and fiscal policy.
- The main influences on the (net) trade balance: real income, exchange rates, state of the world economy, degree of protectionism, and non-price factors.
`
  },
  {
    subtopic: "2.3 Aggregate supply (AS)",
    specContent: `2.3 Aggregate supply (AS)

Content - what students need to learn:
- The AS curve.
- The distinction between movement along, and a shift of, the AS curve.
- The relationship between short-run AS and long-run AS.
- Factors influencing short-run AS: changes in costs of raw materials and energy, changes in exchange rates, and changes in tax rates.
- Different shapes of the long-run AS curve: Keynesian and classical.
- Factors influencing long-run AS: technological advances, changes in relative productivity, changes in education and skills, changes in government regulations, demographic changes and migration, and competition policy.
`
  },
  {
    subtopic: "2.4 National income",
    specContent: `2.4 National income

Content - what students need to learn:
- The circular flow of income.
- The distinction between income and wealth.
- The impact of injections into, and withdrawals from, the circular flow of income.
- The concept of equilibrium real national output.
- The use of AD/AS diagrams to show how shifts in AD or AS cause changes in the equilibrium price level and real national output.
- The multiplier ratio.
- The multiplier process.
- Effects of the multiplier on the economy.
- Understanding of marginal propensities and their effects on the multiplier: the marginal propensity to consume (MPC), the marginal propensity to save (MPS), the marginal propensity to tax (MPT), and the marginal propensity to import (MPM).
- Calculations of the multiplier using the formulae 1/(1-MPC) and 1/MPW, where MPW=MPS+MPT+MPM.
- The significance of the multiplier for shifts in AD.
`
  },
  {
    subtopic: "2.5 Economic growth",
    specContent: `2.5 Economic growth

Content - what students need to learn:
- Factors which could cause economic growth.
- The distinction between actual and potential growth.
- The importance of international trade for (export-led) economic growth.
- Distinction between actual growth rates and long-term trends in growth rates.
- Understanding of positive and negative output gaps and the difficulties of measurement.
- Use of an AD/AS diagram to illustrate an output gap (level of spare capacity) in an economy.
- Understanding of the trade (business) cycle.
- Characteristics of a boom.
- Characteristics of a recession.
- The benefits and costs of economic growth and the impact on consumers, firms, the government, and current and future living standards.
`
  },
  {
    subtopic: "2.6 Macroeconomic objectives and policies",
    specContent: `2.6 Macroeconomic objectives and policies

Content - what students need to learn:
- Possible macroeconomic objectives: economic growth, low unemployment, low and stable rate of inflation, balance of payments equilibrium on current account, balanced government budget, protection of the environment, and greater income equality.
- Distinction between monetary and fiscal policy.
- Monetary policy instruments: interest rates, and asset purchases to increase the money supply (quantitative easing).
- Fiscal policy instruments: government spending and taxation.
- Distinction between government budget (fiscal) deficit and surplus.
- Distinction between, and examples of, direct and indirect taxation.
- Use of AD/AS diagrams to illustrate demand-side policies.
- The role of the Bank of England, including the role and operation of the Bank of England's Monetary Policy Committee.
- Awareness of demand-side policies in the Great Depression and the Global Financial Crisis of 2008, including different interpretations and policy responses in the US and UK.
- Strengths and weaknesses of demand-side policies.
- Distinction between market-based and interventionist methods.
- Market-based and interventionist supply-side policies: to increase incentives, to promote competition, to reform the labour market, to improve skills and quality of the labour force, and to improve infrastructure.
- Use of AD/AS diagrams to illustrate supply-side policies.
- Strengths and weaknesses of supply-side policies.
- Potential conflicts and trade-offs between the macroeconomic objectives.
- The short-run Phillips curve.
- Potential policy conflicts and trade-offs.
`
  },
  {
    subtopic: "3.1 Business growth",
    specContent: `3.1 Business growth

Content - what students need to learn:
- Reasons why some firms tend to remain small and why others grow.
- Significance of the divorce of ownership from control: the principal-agent problem.
- Distinction between public and private sector organisations.
- Distinction between profit and not-for-profit organisations.
- How businesses grow: organic growth, forward and backward vertical integration, horizontal integration, and conglomerate integration.
- Advantages and disadvantages of organic growth, vertical integration, horizontal integration, and conglomerate integration.
- Constraints on business growth: size of the market, access to finance, owner objectives, and regulation.
- Reasons for demergers.
- Impact of demergers on businesses, workers and consumers.
`
  },
  {
    subtopic: "3.2 Business objectives",
    specContent: `3.2 Business objectives

Content - what students need to learn:
- Different business objectives and reasons for them: profit maximisation, revenue maximisation, sales maximisation, and satisficing.
- Diagrams and formulae to illustrate the different business objectives: profit maximisation, revenue maximisation, and sales maximisation.
`
  },
  {
    subtopic: "3.3 Revenues, costs and profits",
    specContent: `3.3 Revenues, costs and profits

Content - what students need to learn:
- Formulae to calculate and understand the relationship between total revenue, average revenue, and marginal revenue.
- Price elasticity of demand and its relationship to revenue concepts (calculation required).
- Formulae to calculate and understand the relationship between total cost, total fixed cost, total variable cost, average (total) cost, average fixed cost, average variable cost, and marginal cost.
- Derivation of short-run cost curves from the assumption of diminishing marginal productivity.
- Relationship between short-run and long-run average cost curves.
- Types of economies and diseconomies of scale.
- Minimum efficient scale.
- Distinction between internal and external economies of scale.
- Condition for profit maximisation.
- Normal profit, supernormal profit and losses.
- Short-run and long-run shut-down points: diagrammatic analysis.
`
  },
  {
    subtopic: "3.4 Market structures",
    specContent: `3.4 Market structures

Content - what students need to learn:
- Allocative efficiency.
- Productive efficiency.
- Dynamic efficiency.
- X-inefficiency.
- Efficiency/inefficiency in different market structures.
- Characteristics of perfect competition.
- Profit maximising equilibrium in the short run and long run under perfect competition, with diagrammatic analysis.
- Characteristics of monopolistically competitive markets.
- Profit maximising equilibrium in the short run and long run under monopolistic competition, with diagrammatic analysis.
- Characteristics of oligopoly: high barriers to entry and exit, high concentration ratio, interdependence of firms, and product differentiation.
- Calculation of n-firm concentration ratios and their significance.
- Reasons for collusive and non-collusive behaviour.
- Overt and tacit collusion; cartels and price leadership.
- Simple game theory: the prisoner's dilemma in a simple two firm/two outcome model.
- Types of price competition: price wars, predatory pricing, and limit pricing.
- Types of non-price competition.
- Characteristics of monopoly.
- Profit maximising equilibrium under monopoly, with diagrammatic analysis.
- Third degree price discrimination: necessary conditions, diagrammatic analysis, and costs and benefits to consumers and producers.
- Costs and benefits of monopoly to firms, consumers, employees and suppliers.
- Natural monopoly.
- Characteristics and conditions for a monopsony to operate.
- Costs and benefits of a monopsony to firms, consumers, employees and suppliers.
- Characteristics of contestable markets.
- Implications of contestable markets for the behaviour of firms.
- Types of barrier to entry and exit.
- Sunk costs and the degree of contestability.
`
  },
  {
    subtopic: "3.5 Labour market",
    specContent: `3.5 Labour market

Content - what students need to learn:
- Factors that influence the demand for labour.
- Demand for labour as a derived demand.
- Factors that influence the supply of labour to a particular occupation.
- Market failure in labour markets: the geographical and occupational mobility and immobility of labour.
- Diagrammatic analysis of labour market equilibrium.
- Understanding of current labour market issues.
- Government intervention in the labour market: maximum and minimum wages, public sector wage setting, and policies to tackle labour market immobility.
- The significance of the elasticity of demand for labour and the elasticity of supply of labour.
`
  },
  {
    subtopic: "3.6 Government intervention",
    specContent: `3.6 Government intervention

Content - what students need to learn:
- Government intervention to control mergers.
- Government intervention to control monopolies: price regulation, profit regulation, quality standards, and performance targets.
- Government intervention to promote competition and contestability: enhancing competition between firms through promotion of small business, deregulation, competitive tendering for government contracts, and privatisation.
- Government intervention to protect suppliers and employees: restrictions on monopsony power of firms, and nationalisation.
- The impact of government intervention on prices, profit, efficiency, quality and choice.
- Limits to government intervention: regulatory capture and asymmetric information.
`
  },
  {
    subtopic: "4.1 International economics",
    specContent: `4.1 International economics

Content - what students need to learn:
- Characteristics of globalisation.
- Factors contributing to globalisation in the last 50 years.
- Impacts of globalisation and global companies on individual countries, governments, producers and consumers, workers and the environment.
- Absolute and comparative advantage (numerical and diagrammatic): assumptions and limitations relating to the theory of comparative advantage.
- Advantages and disadvantages of specialisation and trade in an international context.
- Factors influencing the pattern of trade between countries and changes in trade flows between countries: comparative advantage, impact of emerging economies, growth of trading blocs and bilateral trading agreements, and changes in relative exchange rates.
- Calculation of terms of trade.
- Factors influencing a country's terms of trade.
- Impact of changes in a country's terms of trade.
- Types of trading blocs (regional trade agreements and bilateral trade agreements): free trade areas, customs unions, common markets, and monetary unions, including the conditions necessary for their success with particular reference to the Eurozone.
- Costs and benefits of regional trade agreements.
- Role of the WTO in trade liberalisation.
- Possible conflicts between regional trade agreements and the WTO.
- Reasons for restrictions on free trade.
- Types of restrictions on trade: tariffs, quotas, subsidies to domestic producers, and non-tariff barriers.
- Impact of protectionist policies on consumers, producers, governments, living standards, and equality.
- Components of the balance of payments: the current account, and the capital and financial accounts.
- Causes of deficits and surpluses on the current account.
- Measures to reduce a country's imbalance on the current account.
- Significance of global trade imbalances.
- Exchange rate systems: floating, fixed, and managed.
- Distinction between revaluation and appreciation of a currency.
- Distinction between devaluation and depreciation of a currency.
- Factors influencing floating exchange rates.
- Government intervention in currency markets through foreign currency transactions and the use of interest rates.
- Competitive devaluation/depreciation and its consequences.
- Impact of changes in exchange rates on: the current account of the balance of payments (reference to the Marshall-Lerner condition and J curve effect), economic growth and employment/unemployment, the rate of inflation, and foreign direct investment (FDI) flows.
- Measures of international competitiveness: relative unit labour costs and relative export prices.
- Factors influencing international competitiveness.
- Significance of international competitiveness: benefits of being internationally competitive, and problems of being internationally uncompetitive.
`
  },
  {
    subtopic: "4.2 Poverty and inequality",
    specContent: `4.2 Poverty and inequality

Content - what students need to learn:
- Distinction between absolute poverty and relative poverty.
- Measures of absolute poverty and relative poverty.
- Causes of changes in absolute poverty and relative poverty.
- Distinction between wealth and income inequality.
- Measurements of income inequality: the Lorenz curve (diagrammatic analysis) and the Gini coefficient.
- Causes of income and wealth inequality within countries and between countries.
- Impact of economic change and development on inequality.
- Significance of capitalism for inequality.
`
  },
  {
    subtopic: "4.3 Emerging and developing economies",
    specContent: `4.3 Emerging and developing economies

Content - what students need to learn:
- The three dimensions of the Human Development Index (HDI) - education, health and living standards - and how they are measured and combined.
- The advantages and limitations of using the HDI to compare levels of development between countries and over time.
- Other indicators of development.
- Impact of economic factors in different countries: primary product dependency, volatility of commodity prices, savings gap (the Harrod-Domar model), foreign currency gap, capital flight, demographic factors, debt, access to credit and banking, infrastructure, education/skills, and absence of property rights.
- Impact of non-economic factors in different countries.
- Market-orientated strategies for growth and development: trade liberalisation, promotion of FDI, removal of government subsidies, floating exchange rate systems, microfinance schemes, and privatisation.
- Interventionist strategies for growth and development: development of human capital, protectionism, managed exchange rates, infrastructure development, promoting joint ventures with global companies, and buffer stock schemes.
- Other strategies for growth and development: industrialisation (the Lewis model), development of tourism, development of primary industries, Fairtrade schemes, aid, and debt relief.
- Awareness of the role of international institutions and non-government organisations (NGOs): the World Bank, the International Monetary Fund (IMF), and NGOs.
`
  },
  {
    subtopic: "4.4 The financial sector",
    specContent: `4.4 The financial sector

Content - what students need to learn:
- The role of financial markets to facilitate saving.
- The role of financial markets to lend to businesses and individuals.
- The role of financial markets to facilitate the exchange of goods and services.
- The role of financial markets to provide forward markets in currencies and commodities.
- The role of financial markets to provide a market for equities.
- Market failure in the financial sector: consideration of asymmetric information, externalities, moral hazard, speculation and market bubbles, and market rigging.
- Key functions of central banks: implementation of monetary policy, banker to the government, banker to the banks (lender of last resort), and role in regulation of the banking industry.
`
  },
  {
    subtopic: "4.5 Role of the state in the macroeconomy",
    specContent: `4.5 Role of the state in the macroeconomy

Content - what students need to learn:
- Distinction between capital expenditure, current expenditure and transfer payments.
- Reasons for the changing size and composition of public expenditure in a global context.
- The significance of differing levels of public expenditure as a proportion of GDP on productivity and growth, living standards, crowding out, level of taxation, and equality.
- Distinction between progressive, proportional and regressive taxes.
- The economic effects of changes in direct and indirect tax rates on other variables: incentives to work, tax revenues (the Laffer curve), income distribution, real output and employment, the price level, the trade balance, and FDI flows.
- Distinction between automatic stabilisers and discretionary fiscal policy.
- Distinction between a fiscal deficit and the national debt.
- Distinction between structural and cyclical deficits.
- Factors influencing the size of fiscal deficits.
- Factors influencing the size of national debts.
- The significance of the size of fiscal deficits and national debts.
- Use of fiscal policy, monetary policy, exchange rate policy, supply-side policies and direct controls in different countries, with specific reference to the impact of measures to reduce fiscal deficits and national debts, measures to reduce poverty and inequality, changes in interest rates and the supply of money, and measures to increase international competitiveness.
- Use and impact of macroeconomic policies to respond to external shocks to the global economy.
- Measures to control global companies' (transnationals') operations: the regulation of transfer pricing, and limits to government ability to control global companies.
- Problems facing policymakers when applying policies: inaccurate information, risks and uncertainties, and inability to control external shocks.
`
  },
];


function stripCodeFences(text) {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}

// Found live on this exact subject's real run: two coverage-check
// responses came back missing precisely their final closing '}' - every
// string properly terminated, every array properly closed, just the one
// outermost brace dropped (confirmed by counting: 3 '{' vs 2 '}' in both
// cases, nothing else off). Too small and too specific a defect to be
// max_tokens truncation (these responses were a few hundred tokens
// against a 16000 cap) - looks like an occasional real model formatting
// slip on this call shape. A plain JSON.parse has no way to recover from
// that; this repairs the one specific, common case (a handful of missing
// closers at the very end, string content itself intact) by walking the
// text tracking bracket/brace/string-quote state and appending whatever
// closers are still open, in the correct nesting order, before a final
// parse attempt. Does not attempt to fix anything IN the middle of the
// text (a truncated string value, a missing comma) - those are genuine
// truncations that should keep failing loudly, not be silently patched.
// Found live on THIS Italian run: the model second-guessed itself
// mid-response - wrote a first, flawed JSON object, a line of plain-text
// commentary ("Wait, I need to remove the invalid placeholder edge."),
// then a corrected second JSON object. stripCodeFences only strips the
// very first/last code fence, so the middle closing/opening fences and
// the commentary between the two objects survive into `text` - a bracket
// stack over the whole thing balances perfectly (both objects are
// individually well-formed), so parseJsonWithRepair's own "missing
// trailing closer" repair correctly declines to touch it, and a plain
// JSON.parse stops at the end of the FIRST object and reports "Unexpected
// non-whitespace character after JSON" for everything past it. Since a
// self-correcting model's LAST complete top-level object/array is its
// actual final answer, this scans for every top-level {...}/[...] span in
// the text and returns the last one, discarding the superseded draft and
// the commentary in between.
function extractLastJsonValue(text) {
  let depth = 0, start = -1, inString = false, escaped = false, lastSpan = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{' || ch === '[') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0 && start !== -1) {
        lastSpan = [start, i + 1];
        start = -1;
      }
    }
  }
  return lastSpan ? text.slice(lastSpan[0], lastSpan[1]) : text;
}

function parseJsonWithRepair(text, context) {
  try {
    return JSON.parse(text);
  } catch (firstErr) {
    const stack = [];
    let inString = false;
    let escaped = false;
    for (const ch of text) {
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{') stack.push('}');
      else if (ch === '[') stack.push(']');
      else if (ch === '}' || ch === ']') {
        if (stack[stack.length - 1] === ch) stack.pop();
      }
    }
    if (!inString && stack.length) {
      const repaired = text + stack.reverse().join('');
      try {
        const parsed = JSON.parse(repaired);
        console.error(`  [repair] ${context}: response was missing ${stack.length} trailing closer(s) - repaired and parsed successfully`);
        return parsed;
      } catch (secondErr) {
        // fall through to the last-JSON-value repair below
      }
    }
    try {
      const parsed = JSON.parse(extractLastJsonValue(text));
      console.error(`  [repair] ${context}: response contained multiple JSON values (likely a self-corrected draft) - used the last one and parsed successfully`);
      return parsed;
    } catch (thirdErr) {
      throw firstErr; // neither repair worked - surface the ORIGINAL error, not a repaired one
    }
  }
}

async function generateSubtopic(subtopic, specContent, missingConcepts) {
  // missingConcepts is only ever set on a coverage-driven retry (see
  // main()) - appending it rather than silently starting over means the
  // model still has every reason for the atomicity/breadth decisions it
  // already got right, plus an explicit, unmissable instruction covering
  // exactly what the coverage check found absent.
  const retryNote = missingConcepts && missingConcepts.length
    ? `\n\nA completeness check against this same specification text found that your previous attempt did not cover the following - make sure this regeneration includes proper decomposed coverage of each one (not just a one-line mention):\n${missingConcepts.map(m => `- ${m.term}: ${m.whyItMatters}`).join('\n')}`
    : '';
  // 16k (up from 8k): a dense subtopic (e.g. 4.3's market/interventionist/
  // other strategy lists) can genuinely produce more than 8k tokens of
  // nodes+edges once rules 7/8's "brainstorm 4-6 points per side" is
  // followed properly - 8k risked silently truncating valid JSON on
  // exactly the subtopics that need the most decomposition. Streamed
  // (not just a higher max_tokens) because a long non-streamed generation
  // risks the client's own request timeout, independent of the token cap.
  // thinking explicitly disabled, matching claudeClient.ts's
  // THINKS_BY_DEFAULT_MODELS handling for every other Sonnet 5/Opus 5 call
  // in this codebase: this is a rule-driven structured-JSON extraction
  // task, not one that benefits from extended reasoning, and adaptive
  // thinking is what caused the original truncation bug this comment used
  // to describe (it was burning most of a 16k budget on invisible
  // reasoning before writing a single character of the actual JSON).
  // max_tokens now only has to cover the actual output.
  assertUnderCap();
  const stream1 = client.messages.stream({
    model: GENERATION_MODEL,
    max_tokens: 32000,
    thinking: { type: 'disabled' },
    system: cachedSystem(KNOWLEDGE_MAP_GENERATION_PROMPT),
    messages: [{
      role: 'user',
      content: `Subject: ${SUBJECT}\nQualification: ${QUALIFICATION}\nExam board: ${EXAM_BOARD}\nSubtopic: ${subtopic}\n\nReal specification content:\n${specContent}${retryNote}`,
    }],
  });
  stream1.on('error', (e) => console.error('STREAM ERROR EVENT:', e));
  stream1.on('streamEvent', (e) => { if (e.type === 'message_delta' || e.type === 'message_stop') console.error('STREAM EVENT:', JSON.stringify(e)); });
  const resp = await stream1.finalMessage();
  console.error('stop_reason:', resp.stop_reason, ' usage:', JSON.stringify(resp.usage));
  recordUsage(GENERATION_MODEL, resp.usage);
  const debugPath = path.join(__dirname, `debug_generation_${safeId(subtopic)}.txt`);
  const textBlock1 = resp.content.find(b => b.type === 'text');
  if (!textBlock1) {
    fs.writeFileSync(debugPath, JSON.stringify(resp, null, 2));
    throw new Error(`No text block in response for subtopic "${subtopic}" - stop_reason: ${resp.stop_reason}, full response dumped to ${debugPath}`);
  }
  const text = textBlock1.text;
  const cleaned = stripCodeFences(text);
  try {
    return parseJsonWithRepair(cleaned, `generate ${subtopic}`);
  } catch (err) {
    fs.writeFileSync(debugPath, cleaned);
    console.error(`JSON parse failed for subtopic "${subtopic}" - raw response written to ${debugPath}`);
    throw err;
  }
}

function safeId(raw) {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
}

async function checkCoverage(subtopic, specContent, nodes) {
  // 6k (up from 4k): a thin margin above what a genuinely thorough
  // missing-concepts list for a dense subtopic could need - this call's
  // output is bounded by how much the FIRST pass actually missed, so it
  // rarely approaches this, but 4k was cutting it close on worst-case
  // subtopics with several dropped named theories at once.
  assertUnderCap();
  const stream2 = client.messages.stream({
    model: COVERAGE_MODEL,
    max_tokens: 16000,
    thinking: { type: 'disabled' },
    system: cachedSystem(KNOWLEDGE_MAP_COVERAGE_PROMPT),
    messages: [{
      role: 'user',
      content: `Specification text:\n${specContent}\n\nNode labels already generated from it:\n${JSON.stringify(nodes.map(n => n.label))}`,
    }],
  });
  const resp = await stream2.finalMessage();
  recordUsage(COVERAGE_MODEL, resp.usage);
  const textBlock2 = resp.content.find(b => b.type === 'text');
  if (!textBlock2) throw new Error(`Coverage check: no text block, stop_reason: ${resp.stop_reason}`);
  try {
    return parseJsonWithRepair(stripCodeFences(textBlock2.text), `coverage ${subtopic}`).missingConcepts || [];
  } catch (err) {
    const debugPath = path.join(__dirname, `debug_coverage_${safeId(subtopic)}.txt`);
    fs.writeFileSync(debugPath, textBlock2.text);
    console.error(`Coverage JSON parse failed for "${subtopic}" - raw response written to ${debugPath}`);
    throw err;
  }
}

async function verifyBatch(allNodes, allEdges) {
  // 32k (up from 8k): this is the one call that sees the ENTIRE subject
  // at once (700+ nodes for Economics) and can legitimately surface
  // dozens of issues, each carrying its own explanation plus proposed
  // new_nodes/new_edges - the single most likely call in this whole
  // pipeline to have been silently truncating its JSON output at 8k on a
  // real full-subject run. Streamed for the same request-timeout reason
  // as generateSubtopic, more so here given the larger cap.
  assertUnderCap();
  const stream3 = client.messages.stream({
    model: VERIFICATION_MODEL,
    max_tokens: 60000,
    thinking: { type: 'disabled' },
    system: cachedSystem(KNOWLEDGE_MAP_VERIFICATION_PROMPT),
    messages: [{
      role: 'user',
      content: `Subject: ${SUBJECT} (${QUALIFICATION}, ${EXAM_BOARD})\n\nNodes:\n${JSON.stringify(allNodes)}\n\nEdges:\n${JSON.stringify(allEdges)}`,
    }],
  });
  const resp = await stream3.finalMessage();
  console.error('verification stop_reason:', resp.stop_reason, ' usage:', JSON.stringify(resp.usage));
  recordUsage(VERIFICATION_MODEL, resp.usage);
  const textBlock = resp.content.find(b => b.type === 'text');
  if (!textBlock) throw new Error(`Verification: no text block, stop_reason: ${resp.stop_reason}`);
  try {
    return parseJsonWithRepair(stripCodeFences(textBlock.text), 'verification');
  } catch (err) {
    fs.writeFileSync(path.join(__dirname, 'debug_last_verification_response.txt'), textBlock.text);
    console.error('Verification JSON parse failed - raw response written to scripts/debug_last_verification_response.txt');
    throw err;
  }
}

// Edges moved from plain [from, to] tuples to {from, to, difficulty}
// objects once difficulty scoring was added to the generation prompt -
// this normalizer accepts either shape so a verification fix's
// new_edges/remove_edges (still authored as plain [a, b] pairs in the
// verification prompt's output format, since verification only ever adds
// missing STRUCTURE, not a fresh difficulty judgment) work the same as a
// generation pass's own {from, to, difficulty} edges. A fix-added edge
// gets difficulty: null - a real value can only come from a judgment call
// against the full subtopic content, which a structural-fix pass never
// re-does; null is a valid, honest "not yet estimated" state, not a bug.
function normalizeEdge(e) {
  return Array.isArray(e) ? { from: e[0], to: e[1], difficulty: null } : e;
}

function applyFixes(nodes, edges, issues) {
  edges = edges.map(normalizeEdge);
  const nodeIds = new Set(nodes.map(n => n.id));
  const edgeKey = (e) => e.from + '->' + e.to;
  const edgeSet = new Set(edges.map(edgeKey));
  const nodeById = new Map(nodes.map(n => [n.id, n]));

  // Real bug found live: verification's own new_nodes never carry a
  // subtopic field (the prompt only asks for id/label - see
  // KNOWLEDGE_MAP_VERIFICATION_PROMPT's fix schema), so a node added here
  // used to be ingested with an empty subtopic - grouping every such node
  // across the whole batch into one fake shared "subtopic", which then
  // needed its own expensive one-time AI teaching-order call, and showed
  // wrong/blank in the sidebar tree's subtopic grouping. Inheriting the
  // affected_node's own subtopic is the direct, reliable fix: a fix is
  // always raised ABOUT a specific existing node, so that node's own
  // subtopic is a real, correct home for whatever's being added alongside it.
  issues.forEach(issue => {
    const inheritedSubtopic = nodeById.get(issue.affected_node)?.subtopic;
    (issue.fix?.new_nodes || []).forEach(n => {
      if (!nodeIds.has(n.id)) {
        if (!n.subtopic && inheritedSubtopic) n.subtopic = inheritedSubtopic;
        nodes.push(n);
        nodeIds.add(n.id);
        nodeById.set(n.id, n);
      }
    });
    (issue.fix?.new_edges || []).forEach(raw => {
      const e = normalizeEdge(raw);
      if (!edgeSet.has(edgeKey(e))) { edges.push(e); edgeSet.add(edgeKey(e)); }
    });
    (issue.fix?.remove_edges || []).forEach(raw => {
      const k = edgeKey(normalizeEdge(raw));
      const idx = edges.findIndex(x => edgeKey(x) === k);
      if (idx !== -1) edges.splice(idx, 1);
    });
  });
  return { nodes, edges };
}

// Same validity check used throughout the artifact this pipeline is
// replacing - a DAG with no orphaned edges, run automatically rather than
// by hand every time.
function validate(nodes, edges) {
  edges = edges.map(normalizeEdge);
  const nodeIds = new Set(nodes.map(n => n.id));
  const dupes = {};
  nodes.forEach(n => dupes[n.id] = (dupes[n.id] || 0) + 1);
  Object.entries(dupes).forEach(([id, c]) => { if (c > 1) console.warn('DUPLICATE ID:', id); });

  const bad = edges.filter(({ from, to }) => !nodeIds.has(from) || !nodeIds.has(to));
  bad.forEach(({ from, to }) => console.warn('ORPHANED EDGE:', from, '->', to));

  const adj = {};
  nodes.forEach(n => adj[n.id] = []);
  edges.forEach(({ from, to }) => { if (adj[from]) adj[from].push(to); });
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = {};
  nodes.forEach(n => color[n.id] = WHITE);
  let cyclePath = null;
  function dfs(u, path) {
    color[u] = GRAY;
    for (const v of adj[u]) {
      if (color[v] === GRAY) { cyclePath = path.concat([u, v]); return true; }
      if (color[v] === WHITE && dfs(v, path.concat([u]))) return true;
    }
    color[u] = BLACK;
    return false;
  }
  for (const n of nodes) if (color[n.id] === WHITE && dfs(n.id, [])) break;
  if (cyclePath) console.warn('CYCLE:', cyclePath.join(' -> '));

  return { valid: bad.length === 0 && !cyclePath && Object.values(dupes).every(c => c === 1) };
}

// Retries a transient failure (dropped connection, momentary API
// overload) with exponential backoff - discovered necessary on the real
// first full run, which died to a mid-stream ECONNRESET on subtopic 2.5
// after already paying for five subtopics' worth of generation calls.
// Does NOT retry a JSON-parse failure (that's a real content bug worth
// seeing immediately, not a flaky-network symptom) or anything already
// wrapped in its own try/catch inside generateSubtopic/checkCoverage/
// verifyBatch that writes a debug dump - only the raw network/SDK-level
// exception these three functions can also throw.
async function withRetry(fn, label, maxRetries = 4) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      // 429 added after raising SUBTOPIC_CONCURRENCY made hitting a rate
      // limit a real possibility, not just a network blip - a 429 needs a
      // longer, escalating wait than a dropped connection does, since
      // retrying immediately into an active rate limit just fails again.
      const isRateLimit = err?.status === 429;
      const transient = isRateLimit || err?.cause?.code === 'ECONNRESET' || err?.status >= 500 || err?.name === 'APIConnectionError';
      if (!transient || attempt === maxRetries) throw err;
      const waitMs = isRateLimit ? 20000 * attempt : 5000 * attempt;
      console.warn(`  ! ${label} failed (attempt ${attempt}/${maxRetries}: ${err.message}) - retrying in ${waitMs / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }
}

const CHECKPOINT_PATH = path.join(__dirname, `_checkpoint_${SUBJECT.toLowerCase()}_${QUALIFICATION.toLowerCase().replace(/[^a-z0-9]/g, '')}.json`);

function loadCheckpoint() {
  if (!fs.existsSync(CHECKPOINT_PATH)) return { completedSubtopics: [], allNodes: [], allEdges: [], totalSpendUsd: 0 };
  const data = JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf8'));
  console.log(`Resuming from checkpoint: ${data.completedSubtopics.length}/${SUBTOPICS.length} subtopics already done, $${(data.totalSpendUsd || 0).toFixed(4)} already spent.`);
  return data;
}

function saveCheckpoint(state) {
  fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify(state));
}

// One subtopic's full generate -> coverage-check -> regenerate pipeline,
// as a standalone unit safe to run concurrently with others (each only
// ever touches its own local `nodes`/`edges`, never shared state) - the
// only genuine cross-subtopic dependency in the whole pipeline is the
// FINAL verifyBatch call, which needs everything already finished, so
// nothing here needs to run sequentially.
async function processSubtopic(subtopic, specContent) {
  console.log(`Generating: ${subtopic}...`);
  let { nodes, edges } = await withRetry(() => generateSubtopic(subtopic, specContent), `generate ${subtopic}`);
  console.log(`  -> ${subtopic}: ${nodes.length} nodes, ${edges.length} edges`);

  // Coverage check against the RAW spec text - the only check in this
  // pipeline that can catch a whole named theory/model dropped entirely,
  // since it's the only one that ever sees the source text rather than
  // just the nodes already produced from it (see the comment above
  // KNOWLEDGE_MAP_COVERAGE_PROMPT for why this is a distinct failure
  // mode from anything verifyBatch below can catch).
  for (let round = 0; round < MAX_COVERAGE_ROUNDS; round++) {
    console.log(`  [${subtopic}] Checking coverage (round ${round + 1})...`);
    const missing = await withRetry(() => checkCoverage(subtopic, specContent, nodes), `coverage check ${subtopic}`);
    if (!missing.length) {
      console.log(`  -> ${subtopic}: full coverage confirmed`);
      break;
    }
    console.log(`  -> ${subtopic}: ${missing.length} concept(s) missing, regenerating: ${missing.map(m => m.term).join('; ')}`);
    ({ nodes, edges } = await withRetry(() => generateSubtopic(subtopic, specContent, missing), `regenerate ${subtopic}`));
    console.log(`  -> ${subtopic}: ${nodes.length} nodes, ${edges.length} edges after regeneration`);
  }

  nodes.forEach(n => n.subtopic = subtopic);
  return { subtopic, nodes, edges: edges.map(normalizeEdge) };
}

// Concurrency limited (not all 19 at once) to stay well clear of the
// account's own rate limits rather than guess at exactly where they are
// and find out the hard way mid-run. Lowered from 4 to 2 specifically for
// this run's hard SPEND_CAP_USD - the cap is only checked between calls,
// not mid-stream, so the worst-case overshoot once it trips is bounded by
// however many calls were already in flight in that chunk; halving
// concurrency halves that worst case, at the cost of roughly doubling
// wall-clock time.
const SUBTOPIC_CONCURRENCY = 2;

async function main() {
  const state = loadCheckpoint();
  let { allNodes, allEdges } = state;
  const done = new Set(state.completedSubtopics);
  // Seeded from the checkpoint, not left at 0 - found live on a previous
  // run: totalSpendUsd was in-memory only, so a checkpoint-resume after a
  // failure got a FRESH cap budget stacked on top of whatever the first
  // invocation had already spent, and the real total ended up well over
  // the intended cap. Persisting it here is what actually makes the cap
  // hold across a resume, not just within one invocation.
  totalSpendUsd = state.totalSpendUsd || 0;

  const remaining = SUBTOPICS.filter(s => !done.has(s.subtopic));
  for (const s of SUBTOPICS) { if (done.has(s.subtopic)) console.log(`Skipping (already done): ${s.subtopic}`); }

  let anyFailed = false;
  for (let i = 0; i < remaining.length; i += SUBTOPIC_CONCURRENCY) {
    const chunk = remaining.slice(i, i + SUBTOPIC_CONCURRENCY);
    // allSettled, not all - a genuine failure in one subtopic (e.g. a
    // real max_tokens truncation, not just a transient network blip)
    // must not throw away the OTHER subtopics in the same chunk that
    // finished fine. Promise.all would reject the whole chunk the moment
    // any one item threw, silently discarding already-done work that
    // was never given a chance to reach saveCheckpoint - exactly what
    // happened on the real run this was found on.
    const settled = await Promise.allSettled(chunk.map(s => processSubtopic(s.subtopic, s.specContent)));
    settled.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        const { subtopic, nodes, edges } = result.value;
        allNodes = allNodes.concat(nodes);
        allEdges = allEdges.concat(edges);
        done.add(subtopic);
      } else {
        anyFailed = true;
        console.error(`FAILED: ${chunk[idx].subtopic}: ${result.reason?.message || result.reason}`);
      }
    });
    saveCheckpoint({ completedSubtopics: Array.from(done), allNodes, allEdges, totalSpendUsd });
    console.log(`Checkpoint saved: ${done.size}/${SUBTOPICS.length} subtopics done.`);
  }
  if (anyFailed) {
    console.error('\nOne or more subtopics failed permanently (see FAILED lines above) - fix the underlying issue, then just re-run this script. The checkpoint means only the failed subtopic(s) get retried, nothing already-done gets re-paid for.');
    process.exit(1);
  }

  console.log(`\nVerifying batch of ${allNodes.length} nodes...`);
  let finalNodes = allNodes, finalEdges = allEdges, verified = false;
  try {
    const { issues } = await withRetry(() => verifyBatch(allNodes, allEdges), 'verification');
    console.log(`  -> ${issues.length} issue(s) found`);
    issues.forEach(i => console.log(`  [${i.type}] ${i.affected_node}: ${i.explanation}`));
    const fixed = applyFixes(allNodes, allEdges, issues);
    finalNodes = fixed.nodes;
    finalEdges = fixed.edges;
    verified = true;
  } catch (err) {
    // The spend cap is a hard promise for this run - if it trips here
    // (verification is one whole-batch Opus call, scaling with total node
    // count, so it can be the single biggest line item), the already-paid-
    // for generation work still gets written out rather than lost: an
    // unverified map is a real, usable result (same shape ingest_knowledge_map.js
    // expects), just without the whole-batch consistency pass. Re-run
    // verifyBatch by hand later (raise SPEND_CAP_USD or start a fresh
    // invocation) if that pass still matters once you're ready to spend more.
    console.error(`\nVerification did not complete (${err.message}). Writing out the generated-but-unverified map instead of losing it.`);
  }
  const result = validate(finalNodes, finalEdges);
  console.log(`\nFinal: ${finalNodes.length} nodes, ${finalEdges.length} edges, verified: ${verified}, valid DAG: ${result.valid}`);

  const outPath = `knowledge_map_${SUBJECT.toLowerCase()}_${QUALIFICATION.toLowerCase().replace(/[^a-z0-9]/g, '')}.json`;
  fs.writeFileSync(outPath, JSON.stringify({ subject: SUBJECT, qualification: QUALIFICATION, examBoard: EXAM_BOARD, nodes: finalNodes, edges: finalEdges }, null, 2));
  console.log(`Written to ${outPath}`);
}

main().catch(err => { console.error(err); process.exit(1); });
