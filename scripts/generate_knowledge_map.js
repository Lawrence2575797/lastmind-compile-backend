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

Subject content        What students need to learn:
1.1.1
Economics as a         a) Thinking like an economist: the process of developing
social science              models in economics, including the need to make
                            assumptions
1.1.2
Positive and           b) The use of the ceteris paribus assumption in building
normative economic          models
statements
1.1.3                  c) The inability in economics to make scientific experiments
The economic
problem                a) Distinction between positive and normative economic
                            statements
1.1.4
Production             b) The role of value judgements in influencing economic
possibility frontiers       decision making and policy

1.1.5                  a) The problem of scarcity - where there are unlimited
Specialisation and          wants and finite resources
the division of
labour                 b) The distinction between renewable and non-renewable
                            resources
1.1.6
Free market            c) The importance of opportunity costs to economic agents
economies, mixed            (consumers, producers and government)
economy and
command economy        a) The use of production possibility frontiers to depict:
                            o the maximum productive potential of an economy
                            o opportunity cost (through marginal analysis)
                            o economic growth or decline
                            o efficient or inefficient allocation of resources
                            o possible and unobtainable production

                       b) The distinction between movements along and shifts in
                            production possibility curves, considering the possible
                            causes for such changes

                       c) The distinction between capital and consumer goods

                       a) Specialisation and the division of labour: reference to
                            Adam Smith

                       b) The advantages and disadvantages of specialisation and
                            the division of labour in organising production

                       c) The advantages and disadvantages of specialising in the
                            production of goods and services to trade

                       d) The functions of money (as a medium of exchange, a
                            measure of value, a store of value, a method of deferred
                            payment)

                       a) The distinction between free market, mixed and
                            command economies: reference to Adam Smith,
                            Friedrich Hayek and Karl Marx

                       b) The advantages and disadvantages of a free market
                            economy and a command economy

                       c) The role of the state in a mixed economy`,
  },
  {
    subtopic: "1.2 How markets work",
    specContent: `1.2 How markets work

Subject content        What students need to learn:
1.2.1
Rational decision      a) The underlying assumptions of rational economic
making                      decision making:
1.2.2                       o consumers aim to maximise utility
Demand                      o firms aim to maximise profits

1.2.3                  a) The distinction between movements along a demand
Price, income and           curve and shifts of a demand curve
cross elasticities of
demand                 b) The factors that may cause a shift in the demand curve
                            (the conditions of demand)
1.2.4
Supply                 c) The concept of diminishing marginal utility and how this
                            influences the shape of the demand curve

                       a) Understanding of price, income and cross elasticities of
                            demand

                       b) Use formulae to calculate price, income and cross
                            elasticities of demand

                       c) Interpret numerical values of
                            o price elasticity of demand: unitary elastic, perfectly
                                 and relatively elastic, and perfectly and relatively
                                 inelastic
                            o income elasticity of demand: inferior, normal and
                                 luxury goods; relatively elastic and relatively inelastic
                            o cross elasticity of demand: substitutes,
                                 complementary and unrelated goods

                       d) The factors influencing elasticities of demand
                       e) The significance of elasticities of demand to firms and

                            government in terms of:
                            o the imposition of indirect taxes and subsidies
                            o changes in real income
                            o changes in the prices of substitute and

                                 complementary goods
                       f) The relationship between price elasticity of demand and

                            total revenue (including calculation)

                       a) The distinction between movements along a supply
                            curve and shifts of a supply curve

                       b) The factors that may cause a shift in the supply curve
                            (the conditions of supply)

Subject content       What students need to learn:
1.2.5
Elasticity of supply  a) Understanding of price elasticity of supply
                      b) Use formula to calculate price elasticity of supply
1.2.6                 c) Interpret numerical values of price elasticity of supply:
Price determination
                           perfectly and relatively elastic, and perfectly and
1.2.7                      relatively inelastic
Price mechanism       d) Factors that influence price elasticity of supply
                      e) The distinction between short run and long run in
1.2.8                      economics and its significance for elasticity of supply
Consumer and
producer surplus      a) Equilibrium price and quantity and how they are
1.2.9                      determined
Indirect taxes and
subsidies             b) The use of supply and demand diagrams to depict
                           excess supply and excess demand
1.2.10
Alternative views of  c) The operation of market forces to eliminate excess
consumer behaviour         demand and excess supply

                      d) The use of supply and demand diagrams to show how
                           shifts in demand and supply curves cause the
                           equilibrium price and quantity to change in real-world
                           situations

                      a) Functions of the price mechanism to allocate resources:
                           o rationing
                           o incentive
                           o signalling

                      b) The price mechanism in the context of different types of
                           markets, including local, national and global markets

                      a) The distinction between consumer and producer surplus
                      b) The use of supply and demand diagrams to illustrate

                           consumer and producer surplus
                      c) How changes in supply and demand might affect

                           consumer and producer surplus

                      a) Supply and demand analysis, elasticities, and:
                           o the impact of indirect taxes on consumers, producers
                                and government
                           o the incidence of indirect taxes on consumers and
                                producers
                           o the impact of subsidies on consumers, producers and
                                government
                           o the area that represents the producer subsidy and
                                consumer subsidy

                      a) The reasons why consumers may not behave rationally:
                           o consideration of the influence of other people's
                                behaviour
                           o the importance of habitual behaviour
                           o consumer weakness at computation`,
  },
  {
    subtopic: "1.3 Market failure",
    specContent: `1.3 Market failure

Subject content     What students need to learn:
1.3.1
Types of market     a) Understanding of market failure
failure             b) Types of market failure
1.3.2
Externalities            o externalities
                         o under-provision of public goods
1.3.3                    o information gaps
Public goods
1.3.4               a) Distinction between private costs, external costs and
Information gaps         social costs

                    b) Distinction between private benefits, external benefits
                         and social benefits

                    c) Use of a diagram to illustrate:
                         o the external costs of production using marginal
                              analysis
                         o the distinction between market equilibrium and social
                              optimum position
                         o identification of welfare loss area

                    d) Use of a diagram to illustrate:
                         o the external benefits of consumption using marginal
                              analysis
                         o the distinction between market equilibrium and social
                              optimum position
                         o identification of welfare gain area

                    e) The impact on economic agents of externalities and
                         government intervention in various markets

                    a) Distinction between public and private goods using the
                         concepts of non-rivalry and non-excludability

                    b) Why public goods may not be provided by the private
                         sector: the free rider problem

                    a) The distinction between symmetric and asymmetric
                         information

                    b) How imperfect market information may lead to a
                         misallocation of resources`,
  },
  {
    subtopic: "1.4 Government intervention",
    specContent: `1.4 Government intervention

Subject content     What students need to learn:
1.4.1
Government          a) Purpose of intervention with reference to market failure
intervention in          and using diagrams in various contexts:
markets                  o indirect taxation (ad valorem and specific)
                         o subsidies
1.4.2                    o maximum and minimum prices
Government failure
                    b) Other methods of government intervention:
                         o trade pollution permits
                         o state provision of public goods
                         o provision of information
                         o regulation

                    a) Understanding of government failure as intervention that
                         results in a net welfare loss

                    b) Causes of government failure:
                         o distortion of price signals
                         o unintended consequences
                         o excessive administrative costs
                         o information gaps

                    c) Government failure in various markets

Theme 2: The UK economy - performance and
policies

Overview  This theme is one of two in this qualification that focuses on
Content   macroeconomics. This theme introduces the key measures
          of economic performance and the main instruments of
          economic policy primarily in a UK context.

          Students will need to build upon the knowledge, skills and
          understanding developed from Theme 2 in Theme 4,
          making connections across these two macroeconomic
          themes for Paper 2, and across Themes 1, 2, 3 and 4 in
          Paper 3. Teaching approaches to content must reflect this.

          Students will need to apply their knowledge and
          understanding to both familiar and unfamiliar contexts in
          the assessments and demonstrate an awareness of current
          economic events and policies.

          Students will be introduced to the aggregate
          demand/aggregate supply model so that they can use it to
          analyse changes in real output and the price level. They
          will: examine the use of demand-side policies, supply-side
          policies and direct controls as means of improving an
          economy's performance; recognise the underlying
          assumptions; predict the likely impact and effectiveness of
          such policies; and consider these in an historical context.

          Students should consider the different approaches that may
          be used by policymakers to address macroeconomic issues
          and be able to identify the criteria for success.

          Students should have knowledge of the UK economy in the
          last 10 years.

          This theme will provide a coherent coverage of
          macroeconomic content with students drawing on local and
          national contexts, as appropriate.

          Students are encouraged to use an enquiring, critical and
          thoughtful approach to the study of economics and to
          develop an ability to think as an economist.

          To develop their skills, knowledge and understanding in
          economics, students need to have acquired competence in
          quantitative skills that are relevant to and applied in the
          context of this theme (see Appendix 3: Quantitative skills).`,
  },
  {
    subtopic: "2.1 Measures of economic performance",
    specContent: `2.1 Measures of economic performance

Subject content  What students need to learn:
2.1.1
Economic growth  a) Rates of change of real Gross Domestic Product (GDP) as
                      a measure of economic growth
2.1.2
Inflation        b) Distinction between:
                      o real and nominal
                      o total and per capita
                      o value and volume

                 c) Other national income measures:
                      o Gross National Income (GNI)

                 d) Comparison of rates of growth between countries and
                      over time

                 e) Understanding of Purchasing Power Parities (PPPs) and
                      the use of PPP-adjusted figures in international
                      comparisons

                 f) The limitations of using GDP to compare living standards
                      between countries and over time

                 g) National happiness:
                      o UK national wellbeing
                      o The relationship between real incomes and subjective
                           happiness

                 a) Understanding of:
                      o inflation
                      o deflation
                      o disinflation

                 b) The process of calculating the rate of inflation in the UK
                      using the Consumer Prices Index (CPI)

                 c) The limitations of CPI in measuring the rate of inflation
                 d) The Retail Prices Index (RPI) as an alternative measure

                      of the rate of inflation
                 e) Causes of inflation:

                      o demand pull
                      o cost push
                      o growth of the money supply
                 f) The effects of inflation on consumers, firms, the
                      government and workers

Subject content  What students need to learn:
2.1.3
Employment and   a) Measures of unemployment:
unemployment          o the claimant count
                      o the International Labour Organisation (ILO) and the
2.1.4                      UK Labour Force Survey
Balance of
payments         b) The distinction between unemployment and
                      under-employment

                 c) The significance of changes in the rates of:
                      o employment
                      o unemployment
                      o inactivity

                 d) The causes of unemployment:
                      o structural unemployment
                      o frictional unemployment
                      o seasonal unemployment
                      o demand deficiency and cyclical unemployment
                      o real wage inflexibility

                 e) The significance of migration and skills for employment
                      and unemployment

                 f) The effects of unemployment on consumers, firms,
                      workers, the government and society

                 a) Components of the balance of payments, with particular
                      reference to the current account, and the balance of
                      trade in goods and services

                 b) Current account deficits and surpluses
                 c) The relationship between current account imbalances

                      and other macroeconomic objectives
                 d) The interconnectedness of economies through

                      international trade`,
  },
  {
    subtopic: "2.2 Aggregate demand (AD)",
    specContent: `2.2 Aggregate demand (AD)

Subject content      What students need to learn:
2.2.1
The characteristics  a) Components of AD: C+I+G+(X-M)
of AD                b) The relative importance of the components of AD
                     c) The AD curve
2.2.2                d) The distinction between a movement along, and a shift
Consumption (C)
                          of, the AD curve
2.2.3
Investment (I)       a) Disposable income and its influence on consumer
                          spending
2.2.4
Government           b) An understanding of the relationship between savings
expenditure (G)           and consumption
2.2.5
Net trade (X-M)      c) Other influences on consumer spending:
                          o interest rates
                          o consumer confidence
                          o wealth effects

                     a) Distinction between gross and net investment
                     b) Influences on investment:

                          o the rate of economic growth
                          o business expectations and confidence
                          o Keynes and \`animal spirits'
                          o demand for exports
                          o interest rates
                          o access to credit
                          o the influence of government and regulations

                     a) The main influences on government expenditure:
                          o the trade cycle
                          o fiscal policy

                     a) The main influences on the (net) trade balance:
                          o real income
                          o exchange rates
                          o state of the world economy
                          o degree of protectionism
                          o non-price factors`,
  },
  {
    subtopic: "2.3 Aggregate supply (AS)",
    specContent: `2.3 Aggregate supply (AS)

Subject content      What students need to learn:
2.3.1
The characteristics  a) The AS curve
of AS                b) The distinction between movement along, and a shift of,

2.3.2                     the AS curve
Short-run AS         c) The relationship between short-run AS and long-run AS

2.3.3                a) Factors influencing short-run AS:
Long-run AS               o changes in costs of raw materials and energy
                          o changes in exchange rates
                          o changes in tax rates

                     a) Different shapes of the long-run AS curve:
                          o Keynesian
                          o classical

                     b) Factors influencing long-run AS:
                          o technological advances
                          o changes in relative productivity
                          o changes in education and skills
                          o changes in government regulations
                          o demographic changes and migration
                          o competition policy`,
  },
  {
    subtopic: "2.4 National income",
    specContent: `2.4 National income

Subject content        What students need to learn:

2.4.1                  a) The circular flow of income
National income        b) The distinction between income and wealth
2.4.2
Injections and         a) The impact of injections into, and withdrawals from, the
withdrawals                 circular flow of income
2.4.3
Equilibrium levels of  a) The concept of equilibrium real national output
real national output   b) The use of AD/AS diagrams to show how shifts in AD or

2.4.4                       AS cause changes in the equilibrium price level and real
The multiplier              national output

                       a) The multiplier ratio
                       b) The multiplier process
                       c) Effects of the multiplier on the economy
                       d) Understanding of marginal propensities and their effects

                            on the multiplier:
                            o the marginal propensity to consume (MPC)
                            o the marginal propensity to save (MPS)
                            o the marginal propensity to tax (MPT)
                            o the marginal propensity to import (MPM)
                       e) Calculations of the multiplier using the formulae
                            1/(1-MPC) and 1/MPW, where MPW=MPS+MPT+MPM
                       f) The significance of the multiplier for shifts in AD`,
  },
  {
    subtopic: "2.5 Economic growth",
    specContent: `2.5 Economic growth

Subject content   What students need to learn:
2.5.1
Causes of growth  a) Factors which could cause economic growth
                  b) The distinction between actual and potential growth
2.5.2             c) The importance of international trade for (export-led)
Output gaps
                       economic growth
2.5.3
Trade (business)  a) Distinction between actual growth rates and long-term
cycle                  trends in growth rates
2.5.4
The impact of     b) Understanding of positive and negative output gaps and
economic growth        the difficulties of measurement

                  c) Use of an AD/AS diagram to illustrate an output gap
                       (level of spare capacity) in an economy

                  a) Understanding of the trade (business) cycle
                  b) Characteristics of a boom
                  c) Characteristics of a recession

                  a) The benefits and costs of economic growth and the
                       impact on:
                       o consumers
                       o firms
                       o the government
                       o current and future living standards`,
  },
  {
    subtopic: "2.6 Macroeconomic objectives and policies",
    specContent: `2.6 Macroeconomic objectives and policies

Subject content  What students need to learn:
2.6.1
Possible         a) Economic growth
macroeconomic    b) Low unemployment
objectives       c) Low and stable rate of inflation
                 d) Balance of payments equilibrium on current account
2.6.2            e) Balanced government budget
Demand-side      f) Protection of the environment
policies         g) Greater income equality

                 a) Distinction between monetary and fiscal policy
                 b) Monetary policy instruments:

                      o interest rates
                      o asset purchases to increase the money supply

                           (quantitative easing)
                 c) Fiscal policy instruments:

                      o government spending and taxation
                 d) Distinction between government budget (fiscal) deficit

                      and surplus
                 e) Distinction between, and examples of, direct and indirect

                      taxation
                 f) Use of AD/AS diagrams to illustrate demand-side policies
                 g) The role of the Bank of England:

                      o the role and operation of the Bank of England's
                           Monetary Policy Committee

                 h) Awareness of demand-side policies in the Great
                      Depression and the Global Financial Crisis of 2008
                      o different interpretations
                      o policy responses in the US and UK

                 i) Strengths and weaknesses of demand-side policies

Subject content       What students need to learn:
2.6.3
Supply-side policies  a) Distinction between market-based and interventionist
                           methods
2.6.4
Conflicts and trade-  b) Market-based and interventionist policies:
offs between               o to increase incentives
objectives and             o to promote competition
policies                   o to reform the labour market
                           o to improve skills and quality of the labour force
                           o to improve infrastructure

                      c) Use of AD/AS diagrams to illustrate supply-side policies
                      d) Strengths and weaknesses of supply-side policies

                      a) Potential conflicts and trade-offs between the
                           macroeconomic objectives

                      b) Short-run Phillips curve
                      c) Potential policy conflicts and trade-offs

Theme 3: Business behaviour and the labour
market

Overview  This theme builds on the content of Theme 1: Introduction
Content   to markets and market failure and focuses on business
          economics.

          Students will need to build upon the knowledge, skills and
          understanding developed from Theme 1 in Theme 3,
          making connections across these two microeconomic
          themes in Paper 1, and across Themes 1, 2, 3 and 4 in
          Paper 3. Teaching approaches to content must reflect this.

          Students will need to apply their knowledge and
          understanding to both familiar and unfamiliar contexts in
          the assessments and demonstrate an awareness of current
          economic events and policies.

          This theme examines how the number and size of market
          participants, and the level of contestability, affect the
          pricing and nature of competition among firms. Students
          will consider the size and growth of firms through exploring
          organic growth, mergers and takeovers. They will look at
          the reasons for demergers and why some firms tend to
          remain small.

          Students will look at the rational assumption that firms are
          profit maximisers and then challenge this by looking at
          alternative business objectives. Revenues, costs and profits
          are explored before linking these ideas to different market
          structures. Students will then be able to analyse and
          evaluate the pricing and output decisions of firms in
          different contexts and understand the role of competition in
          business decision making. Supply and demand analysis is
          specifically applied to the labour market to see how wages
          are determined in competitive and non-competitive
          markets.

          At the end of this theme students should be capable of
          making an appraisal of government intervention aimed at
          promoting competitive markets.

          This theme will provide a coherent coverage of
          microeconomic content, drawing on local, national and
          global contexts.

          Students are encouraged to use an enquiring, critical and
          thoughtful approach to the study of economics and to
          develop an ability to think as an economist.

          To develop their skills, knowledge and understanding in
          economics, students need to have acquired competence in
          quantitative skills that are relevant to and applied in the
          context of this theme (see Appendix 3: Quantitative skills).`,
  },
  {
    subtopic: "3.1 Business growth",
    specContent: `3.1 Business growth

Subject content      What students need to learn:
3.1.1
Sizes and types of   a) Reasons why some firms tend to remain small and why
firms                     others grow

3.1.2                b) Significance of the divorce of ownership from control:
Business growth           the principal-agent problem

3.1.3                c) Distinction between public and private sector
Demergers                 organisations

                     d) Distinction between profit and not-for-profit
                          organisations

                     a) How businesses grow:
                          o organic growth
                          o forward and backward vertical integration
                          o horizontal integration
                          o conglomerate integration

                     b) Advantages and disadvantages of:
                          o organic growth
                          o vertical integration
                          o horizontal integration
                          o conglomerate integration

                     c) Constraints on business growth:
                          o size of the market
                          o access to finance
                          o owner objectives
                          o regulation

                     a) Reasons for demergers
                     b) Impact of demergers on businesses, workers and

                          consumers`,
  },
  {
    subtopic: "3.2 Business objectives",
    specContent: `3.2 Business objectives

Subject content      What students need to learn:

3.2.1                a) Different business objectives and reasons for them:
Business objectives       o profit maximisation
                          o revenue maximisation
                          o sales maximisation
                          o satisficing

                     b) Diagrams and formulae to illustrate the different
                          business objectives:
                          o profit maximisation
                          o revenue maximisation
                          o sales maximisation`,
  },
  {
    subtopic: "3.3 Revenues, costs and profits",
    specContent: `3.3 Revenues, costs and profits

Subject content      What students need to learn:
3.3.1
Revenue              a) Formulae to calculate and understand the relationship
                          between:
3.3.2                     o total revenue
Costs                     o average revenue
                          o marginal revenue
3.3.3
Economies and        b) Price elasticity of demand and its relationship to revenue
diseconomies of           concepts (calculation required)
scale
3.3.4                a) Formulae to calculate and understand the relationship
Normal profits,           between:
supernormal profits       o total cost
and losses                o total fixed cost
                          o total variable cost
                          o average (total) cost
                          o average fixed cost
                          o average variable cost
                          o marginal cost

                     b) Derivation of short-run cost curves from the assumption
                          of diminishing marginal productivity

                     c) Relationship between short-run and long-run average
                          cost curves

                     a) Types of economies and diseconomies of scale
                     b) Minimum efficient scale
                     c) Distinction between internal and external economies of

                          scale

                     a) Condition for profit maximisation
                     b) Normal profit, supernormal profit and losses
                     c) Short-run and long-run shut-down points: diagrammatic

                          analysis`,
  },
  {
    subtopic: "3.4 Market structures",
    specContent: `3.4 Market structures

Subject content      What students need to learn:
3.4.1
Efficiency           a) Allocative efficiency
                     b) Productive efficiency
3.4.2                c) Dynamic efficiency
Perfect competition  d) X-inefficiency
3.4.3                e) Efficiency/inefficiency in different market structures
Monopolistic
competition          a) Characteristics of perfect competition
3.4.4                b) Profit maximising equilibrium in the short run and long
Oligopoly
                          run
3.4.5                c) Diagrammatic analysis
Monopoly
                     a) Characteristics of monopolistically competitive markets
                     b) Profit maximising equilibrium in the short run and long

                          run
                     c) Diagrammatic analysis

                     a) Characteristics of oligopoly
                          o high barriers to entry and exit
                          o high concentration ratio
                          o interdependence of firms
                          o product differentiation

                     b) Calculation of n-firm concentration ratios and their
                          significance

                     c) Reasons for collusive and non-collusive behaviour
                     d) Overt and tacit collusion; cartels and price leadership
                     e) Simple game theory: the prisoner's dilemma in a simple

                          two firm/two outcome model
                     f) Types of price competition:

                          o price wars
                          o predatory pricing
                          o limit pricing
                     g) Types of non-price competition

                     a) Characteristics of monopoly
                     b) Profit maximising equilibrium
                     c) Diagrammatic analysis
                     d) Third degree price discrimination:

                          o necessary conditions
                          o diagrammatic analysis
                          o costs and benefits to consumers and producers
                     e) Costs and benefits of monopoly to firms, consumers,
                          employees and suppliers
                     f) Natural monopoly

Subject content  What students need to learn:
3.4.6
Monopsony        a) Characteristics and conditions for a monopsony to
                      operate
3.4.7
Contestability   b) Costs and benefits of a monopsony to firms, consumers,
                      employees and suppliers

                 a) Characteristics of contestable markets
                 b) Implications of contestable markets for the behaviour of

                      firms
                 c) Types of barrier to entry and exit
                 d) Sunk costs and the degree of contestability`,
  },
  {
    subtopic: "3.5 Labour market",
    specContent: `3.5 Labour market

Subject content     What students need to learn:

3.5.1               a) Factors that influence the demand for labour
Demand for labour   b) Demand for labour as a derived demand
3.5.2
Supply of labour    a) Factors that influence the supply of labour to a particular
                         occupation
3.5.3
Wage determination  b) Market failure in labour markets: the geographical and
in competitive and       occupational mobility and immobility of labour
non-competitive
markets             a) Diagrammatic analysis of labour market equilibrium
                    b) Understanding of current labour market issues
                    c) Government intervention in the labour market:

                         o maximum and minimum wages
                         o public sector wage setting
                         o policies to tackle labour market immobility
                    d) The significance of the elasticity of demand for labour
                         and the elasticity of supply of labour`,
  },
  {
    subtopic: "3.6 Government intervention",
    specContent: `3.6 Government intervention

Subject content  What students need to learn:
3.6.1
Government       a) Government intervention to control mergers
intervention     b) Government intervention to control monopolies:

3.6.2                 o price regulation
The impact of         o profit regulation
government            o quality standards
intervention          o performance targets
                 c) Government intervention to promote competition and
                      contestability:
                      o enhancing competition between firms through

                           promotion of small business
                      o deregulation
                      o competitive tendering for government contracts
                      o privatisation
                 d) Government intervention to protect suppliers and
                      employees:
                      o restrictions on monopsony power of firms
                      o nationalisation

                 a) The impact of government intervention on:
                      o prices
                      o profit
                      o efficiency
                      o quality
                      o choice

                 b) Limits to government intervention:
                      o regulatory capture
                      o asymmetric information

Theme 4: A global perspective

Overview  This theme builds on the knowledge and skills gained in
Content   Theme 2: The UK economy - performance and policies, and
          applies them in a global context.

          Students will need to build upon the knowledge, skills and
          understanding developed from Theme 2 in Theme 4,
          making connections across these two macroeconomic
          themes in Paper 2, and across Themes 1, 2, 3 and 4 in
          Paper 3. Teaching approaches to content must reflect this.

          Students will need to apply their knowledge and
          understanding to both familiar and unfamiliar contexts in
          the assessments and demonstrate an awareness of current
          economic events and policies.

          Students will be expected to understand the significance of
          globalisation, international trade, the balance of payments
          and exchange rates. They will examine public finance,
          macroeconomic policies and the role of the financial sector
          in a global context. Students will consider the factors
          influencing the growth and development of emerging and
          developing countries.

          In examining these areas, application, analysis and
          evaluation of economic models is required as well as an
          ability to assess policies that might be used to address
          national and global economic challenges. Students should
          develop an awareness of trends in the global economy over
          the last 25 years through wider reading and research so
          that they can include relevant examples in their analysis
          and evaluation.

          Students are encouraged to use an enquiring, critical and
          thoughtful approach to the study of economics and to
          develop an ability to think as an economist.

          To develop their skills, knowledge and understanding in
          economics, students need to have acquired competence in
          quantitative skills that are relevant to and applied in the
          context of this theme (see Appendix 3: Quantitative skills).`,
  },
  {
    subtopic: "4.1 International economics",
    specContent: `4.1 International economics

Subject content       What students need to learn:
4.1.1
Globalisation         a) Characteristics of globalisation
                      b) Factors contributing to globalisation in the last 50 years
4.1.2                 c) Impacts of globalisation and global companies on
Specialisation and
trade                      individual countries, governments, producers and
                           consumers, workers and the environment
4.1.3
Pattern of trade      a) Absolute and comparative advantage (numerical and
                           diagrammatic): assumptions and limitations relating to
4.1.4                      the theory of comparative advantage
Terms of trade
4.1.5                 b) Advantages and disadvantages of specialisation and
Trading blocs and          trade in an international context
the World Trade
Organisation (WTO)    a) Factors influencing the pattern of trade between
                           countries and changes in trade flows between countries:
4.1.6                      o comparative advantage
Restrictions on free       o impact of emerging economies
trade                      o growth of trading blocs and bilateral trading
                                agreements
                           o changes in relative exchange rates

                      a) Calculation of terms of trade
                      b) Factors influencing a country's terms of trade
                      c) Impact of changes in a country's terms of trade

                      a) Types of trading blocs (regional trade agreements and
                           bilateral trade agreements):
                           o free trade areas
                           o customs unions
                           o common markets
                           o monetary unions: conditions necessary for their
                                success with particular reference to the Eurozone

                      b) Costs and benefits of regional trade agreements
                      c) Role of the WTO in trade liberalisation
                      d) Possible conflicts between regional trade agreements

                           and the WTO

                      a) Reasons for restrictions on free trade
                      b) Types of restrictions on trade:

                           o tariffs
                           o quotas
                           o subsidies to domestic producers
                           o non-tariff barriers
                      c) Impact of protectionist policies on consumers,
                           producers, governments, living standards, equality

Subject content  What students need to learn:
4.1.7
Balance of       a) Components of the balance of payments:
payments              o the current account
                      o the capital and financial accounts
4.1.8
Exchange rates   b) Causes of deficits and surpluses on the current account
                 c) Measures to reduce a country's imbalance on the current
4.1.9
International         account
competitiveness  d) Significance of global trade imbalances

                 a) Exchange rate systems:
                      o floating
                      o fixed
                      o managed

                 b) Distinction between revaluation and appreciation of a
                      currency

                 c) Distinction between devaluation and depreciation of a
                      currency

                 d) Factors influencing floating exchange rates
                 e) Government intervention in currency markets through

                      foreign currency transactions and the use of interest
                      rates
                 f) Competitive devaluation/depreciation and its
                      consequences
                 g) Impact of changes in exchange rates:
                      o the current account of the balance of payments

                           (reference to Marshall-Lerner condition and J curve
                           effect)
                      o economic growth and employment/unemployment
                      o rate of inflation
                      o foreign direct investment (FDI) flows

                 a) Measures of international competitiveness:
                      o relative unit labour costs
                      o relative export prices

                 b) Factors influencing international competitiveness
                 c) Significance of international competitiveness:

                      o benefits of being internationally competitive
                      o problems of being internationally uncompetitive`,
  },
  {
    subtopic: "4.2 Poverty and inequality",
    specContent: `4.2 Poverty and inequality

Subject content   What students need to learn:
4.2.1
Absolute and      a) Distinction between absolute poverty and relative
relative poverty       poverty

4.2.2             b) Measures of absolute poverty and relative poverty
Inequality        c) Causes of changes in absolute poverty and relative

                       poverty

                  a) Distinction between wealth and income inequality
                  b) Measurements of income inequality:

                       o the Lorenz curve (diagrammatic analysis)
                       o the Gini coefficient
                  c) Causes of income and wealth inequality within countries
                       and between countries
                  d) Impact of economic change and development on
                       inequality
                  e) Significance of capitalism for inequality`,
  },
  {
    subtopic: "4.3 Emerging and developing economies",
    specContent: `4.3 Emerging and developing economies

Subject content      What students need to learn:
4.3.1
Measures of          a) The three dimensions of the Human Development Index
development               (HDI) (education, health and living standards) and how
                          they are measured and combined
4.3.2
Factors influencing  b) The advantages and limitations of using the HDI to
growth and                compare levels of development between countries and
development               over time

                     c) Other indicators of development

                     a) Impact of economic factors in different countries:
                          o primary product dependency
                          o volatility of commodity prices
                          o savings gap: Harrod-Domar model
                          o foreign currency gap
                          o capital flight
                          o demographic factors
                          o debt
                          o access to credit and banking
                          o infrastructure
                          o education/skills
                          o absence of property rights

                     b) Impact of non-economic factors in different countries

Subject content     What students need to learn:

4.3.3               a) Market-orientated strategies:
Strategies               o trade liberalisation
influencing growth       o promotion of FDI
and development          o removal of government subsidies
                         o floating exchange rate systems
                         o microfinance schemes
                         o privatisation

                    b) Interventionist strategies:
                         o development of human capital
                         o protectionism
                         o managed exchange rates
                         o infrastructure development
                         o promoting joint ventures with global companies
                         o buffer stock schemes

                    c) Other strategies:
                         o industrialisation: the Lewis model
                         o development of tourism
                         o development of primary industries
                         o Fairtrade schemes
                         o aid
                         o debt relief

                    d) Awareness of the role of international institutions and
                         non-government organisations (NGOs):
                         o World Bank
                         o International Monetary Fund (IMF)
                         o NGOs`,
  },
  {
    subtopic: "4.4 The financial sector",
    specContent: `4.4 The financial sector

Subject content        What students need to learn:
4.4.1
Role of financial      a) To facilitate saving
markets                b) To lend to businesses and individuals
                       c) To facilitate the exchange of goods and services
4.4.2                  d) To provide forward markets in currencies and
Market failure in the
financial sector            commodities
                       e) To provide a market for equities
4.4.3
Role of central        a) Consideration of:
banks                       o asymmetric information
                            o externalities
                            o moral hazard
                            o speculation and market bubbles
                            o market rigging

                       a) Key functions of central banks:
                            o implementation of monetary policy
                            o banker to the government
                            o banker to the banks - lender of last resort
                            o role in regulation of the banking industry`,
  },
  {
    subtopic: "4.5 Role of the state in the macroeconomy",
    specContent: `4.5 Role of the state in the macroeconomy

Subject content     What students need to learn:
4.5.1
Public expenditure  a) Distinction between capital expenditure, current
                         expenditure and transfer payments
4.5.2
Taxation            b) Reasons for the changing size and composition of public
                         expenditure in a global context
4.5.3
Public sector       c) The significance of differing levels of public expenditure
finances                 as a proportion of GDP on:
                         o productivity and growth
                         o living standards
                         o crowding out
                         o level of taxation
                         o equality

                    a) Distinction between progressive, proportional and
                         regressive taxes

                    b) The economic effects of changes in direct and indirect
                         tax rates on other variables:
                         o incentives to work
                         o tax revenues: the Laffer curve
                         o income distribution
                         o real output and employment
                         o the price level
                         o the trade balance
                         o FDI flows

                    a) Distinction between automatic stabilisers and
                         discretionary fiscal policy

                    b) Distinction between a fiscal deficit and the national debt
                    c) Distinction between structural and cyclical deficits
                    d) Factors influencing the size of fiscal deficits
                    e) Factors influencing the size of national debts
                    f) The significance of the size of fiscal deficits and national

                         debts

Subject content       What students need to learn:

4.5.4                 a) Use of fiscal policy, monetary policy, exchange rate
Macroeconomic              policy, supply-side policies and direct controls in
policies in a global       different countries, with specific reference to the impact
context                    of:
                           o measures to reduce fiscal deficits and national debts
                           o measures to reduce poverty and inequality
                           o changes in interest rates and the supply of money
                           o measures to increase international competitiveness

                      b) Use and impact of macroeconomic policies to respond to
                           external shocks to the global economy

                      c) Measures to control global companies' (transnationals')
                           operations:
                           o the regulation of transfer pricing
                           o limits to government ability to control global
                                companies

                      d) Problems facing policymakers when applying policies:
                           o inaccurate information
                           o risks and uncertainties
                           o inability to control external shocks`,
  },
];

function stripCodeFences(text) {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
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
  // Sonnet 5 uses adaptive thinking by default even with no explicit
  // `thinking` param - on this task it burned ~14k of a 16k max_tokens
  // budget on invisible reasoning before writing a single character of
  // the actual JSON, hitting max_tokens mid-string every time (discovered
  // empirically on the real first run, not assumed). max_tokens caps
  // thinking+output TOGETHER, so this has to be sized for both.
  const stream1 = client.messages.stream({
    model: GENERATION_MODEL,
    max_tokens: 32000,
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
  const textBlock1 = resp.content.find(b => b.type === 'text');
  if (!textBlock1) {
    fs.writeFileSync(path.join(__dirname, 'debug_last_generation_response.txt'), JSON.stringify(resp, null, 2));
    throw new Error(`No text block in response for subtopic "${subtopic}" - stop_reason: ${resp.stop_reason}, full response dumped to scripts/debug_last_generation_response.txt`);
  }
  const text = textBlock1.text;
  const cleaned = stripCodeFences(text);
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    fs.writeFileSync(path.join(__dirname, 'debug_last_generation_response.txt'), cleaned);
    console.error(`JSON parse failed for subtopic "${subtopic}" - raw response written to scripts/debug_last_generation_response.txt`);
    throw err;
  }
}

async function checkCoverage(specContent, nodes) {
  // 6k (up from 4k): a thin margin above what a genuinely thorough
  // missing-concepts list for a dense subtopic could need - this call's
  // output is bounded by how much the FIRST pass actually missed, so it
  // rarely approaches this, but 4k was cutting it close on worst-case
  // subtopics with several dropped named theories at once.
  const stream2 = client.messages.stream({
    model: COVERAGE_MODEL,
    max_tokens: 16000,
    system: cachedSystem(KNOWLEDGE_MAP_COVERAGE_PROMPT),
    messages: [{
      role: 'user',
      content: `Specification text:\n${specContent}\n\nNode labels already generated from it:\n${JSON.stringify(nodes.map(n => n.label))}`,
    }],
  });
  const resp = await stream2.finalMessage();
  const textBlock2 = resp.content.find(b => b.type === 'text');
  if (!textBlock2) throw new Error(`Coverage check: no text block, stop_reason: ${resp.stop_reason}`);
  try {
    return JSON.parse(stripCodeFences(textBlock2.text)).missingConcepts || [];
  } catch (err) {
    fs.writeFileSync(path.join(__dirname, 'debug_last_coverage_response.txt'), textBlock2.text);
    console.error('Coverage JSON parse failed - raw response written to scripts/debug_last_coverage_response.txt');
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
  const stream3 = client.messages.stream({
    model: VERIFICATION_MODEL,
    max_tokens: 60000,
    system: cachedSystem(KNOWLEDGE_MAP_VERIFICATION_PROMPT),
    messages: [{
      role: 'user',
      content: `Subject: ${SUBJECT} (${QUALIFICATION}, ${EXAM_BOARD})\n\nNodes:\n${JSON.stringify(allNodes)}\n\nEdges:\n${JSON.stringify(allEdges)}`,
    }],
  });
  const resp = await stream3.finalMessage();
  console.error('verification stop_reason:', resp.stop_reason, ' usage:', JSON.stringify(resp.usage));
  const textBlock = resp.content.find(b => b.type === 'text');
  if (!textBlock) throw new Error(`Verification: no text block, stop_reason: ${resp.stop_reason}`);
  try {
    return JSON.parse(stripCodeFences(textBlock.text));
  } catch (err) {
    fs.writeFileSync(path.join(__dirname, 'debug_last_verification_response.txt'), textBlock.text);
    console.error('Verification JSON parse failed - raw response written to scripts/debug_last_verification_response.txt');
    throw err;
  }
}

function applyFixes(nodes, edges, issues) {
  const nodeIds = new Set(nodes.map(n => n.id));
  const edgeKey = ([a, b]) => a + '->' + b;
  const edgeSet = new Set(edges.map(edgeKey));

  issues.forEach(issue => {
    (issue.fix?.new_nodes || []).forEach(n => {
      if (!nodeIds.has(n.id)) { nodes.push(n); nodeIds.add(n.id); }
    });
    (issue.fix?.new_edges || []).forEach(e => {
      if (!edgeSet.has(edgeKey(e))) { edges.push(e); edgeSet.add(edgeKey(e)); }
    });
    (issue.fix?.remove_edges || []).forEach(e => {
      const k = edgeKey(e);
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
  const nodeIds = new Set(nodes.map(n => n.id));
  const dupes = {};
  nodes.forEach(n => dupes[n.id] = (dupes[n.id] || 0) + 1);
  Object.entries(dupes).forEach(([id, c]) => { if (c > 1) console.warn('DUPLICATE ID:', id); });

  const bad = edges.filter(([a, b]) => !nodeIds.has(a) || !nodeIds.has(b));
  bad.forEach(([a, b]) => console.warn('ORPHANED EDGE:', a, '->', b));

  const adj = {};
  nodes.forEach(n => adj[n.id] = []);
  edges.forEach(([a, b]) => { if (adj[a]) adj[a].push(b); });
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
async function withRetry(fn, label, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const transient = err?.cause?.code === 'ECONNRESET' || err?.status >= 500 || err?.name === 'APIConnectionError';
      if (!transient || attempt === maxRetries) throw err;
      const waitMs = 5000 * attempt;
      console.warn(`  ! ${label} failed (attempt ${attempt}/${maxRetries}: ${err.message}) - retrying in ${waitMs / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }
}

const CHECKPOINT_PATH = path.join(__dirname, `_checkpoint_${SUBJECT.toLowerCase()}_${QUALIFICATION.toLowerCase().replace(/[^a-z0-9]/g, '')}.json`);

function loadCheckpoint() {
  if (!fs.existsSync(CHECKPOINT_PATH)) return { completedSubtopics: [], allNodes: [], allEdges: [] };
  const data = JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf8'));
  console.log(`Resuming from checkpoint: ${data.completedSubtopics.length}/${SUBTOPICS.length} subtopics already done.`);
  return data;
}

function saveCheckpoint(state) {
  fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify(state));
}

async function main() {
  const state = loadCheckpoint();
  let { allNodes, allEdges } = state;
  const done = new Set(state.completedSubtopics);

  for (const { subtopic, specContent } of SUBTOPICS) {
    if (done.has(subtopic)) { console.log(`Skipping (already done): ${subtopic}`); continue; }

    console.log(`Generating: ${subtopic}...`);
    let { nodes, edges } = await withRetry(() => generateSubtopic(subtopic, specContent), `generate ${subtopic}`);
    console.log(`  -> ${nodes.length} nodes, ${edges.length} edges`);

    // Coverage check against the RAW spec text - the only check in this
    // pipeline that can catch a whole named theory/model dropped
    // entirely, since it's the only one that ever sees the source text
    // rather than just the nodes already produced from it (see the
    // comment above KNOWLEDGE_MAP_COVERAGE_PROMPT for why this is a
    // distinct failure mode from anything verifyBatch below can catch).
    for (let round = 0; round < MAX_COVERAGE_ROUNDS; round++) {
      console.log(`  Checking coverage against spec text (round ${round + 1})...`);
      const missing = await withRetry(() => checkCoverage(specContent, nodes), `coverage check ${subtopic}`);
      if (!missing.length) {
        console.log('  -> full coverage confirmed');
        break;
      }
      console.log(`  -> ${missing.length} concept(s) missing, regenerating:`);
      missing.forEach(m => console.log(`     - ${m.term}`));
      ({ nodes, edges } = await withRetry(() => generateSubtopic(subtopic, specContent, missing), `regenerate ${subtopic}`));
      console.log(`  -> ${nodes.length} nodes, ${edges.length} edges after regeneration`);
    }

    nodes.forEach(n => n.subtopic = subtopic);
    allNodes = allNodes.concat(nodes);
    allEdges = allEdges.concat(edges);
    done.add(subtopic);
    saveCheckpoint({ completedSubtopics: Array.from(done), allNodes, allEdges });
  }

  console.log(`\nVerifying batch of ${allNodes.length} nodes...`);
  const { issues } = await withRetry(() => verifyBatch(allNodes, allEdges), 'verification');
  console.log(`  -> ${issues.length} issue(s) found`);
  issues.forEach(i => console.log(`  [${i.type}] ${i.affected_node}: ${i.explanation}`));

  const fixed = applyFixes(allNodes, allEdges, issues);
  const result = validate(fixed.nodes, fixed.edges);
  console.log(`\nFinal: ${fixed.nodes.length} nodes, ${fixed.edges.length} edges, valid DAG: ${result.valid}`);

  const outPath = `knowledge_map_${SUBJECT.toLowerCase()}_${QUALIFICATION.toLowerCase().replace(/[^a-z0-9]/g, '')}.json`;
  fs.writeFileSync(outPath, JSON.stringify({ subject: SUBJECT, qualification: QUALIFICATION, examBoard: EXAM_BOARD, nodes: fixed.nodes, edges: fixed.edges }, null, 2));
  console.log(`Written to ${outPath}`);
}

main().catch(err => { console.error(err); process.exit(1); });
