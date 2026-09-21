'use strict';
// Questions 101 to 200, shortened by hand to about 20 words each. The scene and the answer are unchanged; only the wording is tighter.
// Three that had no question at all (they ended on a description) now ask one. node shorten_next100.js [dir]
const fs = require('fs');
const path = require('path');
const { validate } = require('./build');
const dir = process.argv[2] || path.join(__dirname, 'out3');

const R = {
  '020|asymmetric_information': `The seller has driven the car for years and hides an engine fault. Do you both know the same about it?`,
  '020|information_gaps': `Neither patient nor doctor can be sure a treatment will work. Is someone hiding facts, or is knowledge simply missing?`,
  '020|imperfect_info_misallocation': `Buyers can't tell good cars from bad, so offer low prices and good cars leave the market. Do resources go where most valued?`,
  '021|efficient': `A free market should send resources to the goods people value most, at a price matching cost. Does it always do so?`,
  '021|MKTFAIL': `A factory pays for workers and materials, but its smoke harms neighbours who are never compensated. Has the market got this right?`,
  '021|PUBGOOD_NONEX': `A lighthouse warns every ship, whether or not its owner paid. Can the operator stop non-paying ships seeing the light?`,
  '021|INFOGAP_MKT': `A second-hand car seller knows of a hidden engine fault. The buyer can't find out before buying. Do both sides know the same?`,
  '022|REASONS_INTERVENE': `A factory pollutes a river, harming people who never bought or sold anything there. Left alone, will the free market fix this?`,
  '022|flatvper': `A fixed 50p tax is added to every cigarette packet, whether it costs £2 or £10. Does the tax change with the price?`,
  '022|pctprice': `Now the tax is 20% of the price. Is the extra tax on a £10 packet the same as on a £2 packet?`,
  '022|TAX_ADVALOREM': `Which tax bill grows as the good gets dearer: the fixed 50p per packet, or the tax set at 20% of the price?`,
  '022|MAXP_DEF': `Rents are rising fast because there are few landlords. The government wants to stop them rising. What could it set on price?`,
  '022|exploit': `Those few landlords, with little competition, had charged far above what flats were worth. Once rent is capped, can they still do that?`,
  '022|MAXP_ADV2': `Compared with letting a few landlords charge whatever they like, what does capping rent achieve for tenants with little bargaining power?`,
  '022|MINP_DEF': `Milk prices are so low that farms are closing. The government wants farmers to get more. What limit must it set on price?`,
  '023|STATEPROV_DEF': `Every passing ship benefits from a lighthouse whether it paid or not. Could a private firm easily charge each ship?`,
  '023|STATEPROV_ADV1': `Once the government builds the lighthouse from taxes, can any ship still use its light without paying extra?`,
  '023|STATEPROV_ADV2': `If a private firm ran the lighthouse and could charge, would poorer ship owners who couldn't afford it still get protection?`,
  '023|STATEPROV_DIS1': `A private firm reads demand from the prices people will pay. When the government provides a public good free, does it get that signal?`,
  '023|STATEPROV_DIS2': `A wasteful private firm can go bankrupt, but a tax-funded department keeps its budget. Is the pressure to cut costs the same?`,
  '024|INFOPROV_DEF': `Smokers underestimate the risks and so smoke more. What could the government put on every cigarette packet to close that gap?`,
  '024|INFOPROV_ADV2': `Compared with building a hospital or fining every shop, how costly is printing a warning label, and is anyone forced to quit?`,
  '024|INFOPROV_DIS1': `An addicted smoker reads the warning, believes it, and still buys the next pack. Did the information change their behaviour?`,
  '024|INFOPROV_DIS2': `A vaping-risk campaign takes months to design, test and run before attitudes shift. What does that mean for cost and speed?`,
  '025|REG_DEF': `A government bans waste discharge above a fixed amount and fines those who break it. What kind of intervention is this?`,
  '025|REG_ADV1': `The law caps waste at 10 tonnes a month, checked by inspectors. Compared with asking nicely, is the rule exact?`,
  '025|REG_ADV2': `Compared with building a whole new tax system to price pollution, how quickly can a ban like this be written and passed?`,
  '025|REG_DIS2': `Facing a strict waste ban, some factories secretly pay an unlicensed firm to dump waste at night. What does the ban lead to?`,
  '025|REG_DIS3': `Over time the regulator hires ex-factory managers and the waste limit quietly relaxes to suit the industry. What has happened to it?`,
  '026|GOVFAIL_DEF': `A government caps rent to help tenants, but landlords withdraw flats and the shortage worsens. Has the intervention definitely made things better?`,
  '026|GOVFAIL_DISTORT': `A subsidy makes wheat far cheaper than it costs to grow. Do farmers now know what wheat is worth to buyers?`,
  '026|GOVFAIL_UNINTEND': `A sugary drinks tax is meant to cut sugar, but people switch to sugary snacks. Did it only produce its intended effect?`,
  '026|GOVFAIL_ADMIN': `A subsidy scheme's inspectors, forms and staff eat much of the money meant for farmers. Does every pound reach them?`,
  '026|GOVFAIL_INFOGAP': `A government sets a pollution limit from outdated data, not knowing how firms will react. Can it be sure it's right?`,
  '027|GDP_DEF': `Farms, factories and shops sell goods and services this year. What would the total value of everything sold tell you?`,
  '027|REAL_NOMINAL': `Prices rise 10% but the country makes exactly as much as last year. Does GDP in today's prices show output has grown?`,
  '027|TOTAL_PERCAP': `Country A has a bigger GDP than B, but three times as many people. Does that mean each person is better off?`,
  '027|VALUE_VOLUME': `A country sells as many cars as last year, each at a higher price. Has the amount made changed?`,
  '027|GDP_GROWTH_RATE': `To track real expansion year on year, would you compare GDP adjusted for prices, population and quantity, or raw money totals?`,
  '028|GNI': `UK-owned factories in Poland send profits home. GDP counts only output made inside the UK. Should those profits count towards UK residents' income?`,
  '028|GROWTH_COMPARISON': `Country A's GDP grew 2% this year, country B's 5%. Do these percentages alone show which economy is expanding faster?`,
  '028|PPP': `A haircut costs £15 in the UK and £3 in India. Does converting India's income at the exchange rate show what it can buy?`,
  '028|PPP_USE': `To compare what UK and Indian earnings can actually buy, should you use raw exchange-rate figures, or figures adjusted for local living costs?`,
  '029|GDP_LIVING_STANDARDS_LIMITS': `Real GDP grows 5% and a newspaper says people must be better off. Does a bigger GDP always prove that?`,
  '029|GDP_LIMIT_NONMARKET': `A parent looks after their children at home for free, and a neighbour grows vegetables to eat. Do these show up in GDP?`,
  '029|GDP_LIMIT_DISTRIBUTION': `Two countries have equal GDP per head, but only one shares income evenly. Does the GDP figure tell you which?`,
  '029|GDP_LIMIT_QUALITY': `One country spends its GDP on hospitals and leisure, another on weapons and long hours. Does the total tell them apart?`,
  '030|GDP_LIMIT_COMPOSITION': `GDP per head doubles over 30 years, while phones, hospitals and cars also get far better. Does GDP alone show that quality gain?`,
  '030|HAPPINESS_INCOME_RELATION': `Since the 1950s real incomes in rich countries have risen a lot, yet reported happiness has barely moved. Does higher income guarantee happiness?`,
  '030|ONS_WELLBEING': `Since GDP misses quality and income doesn't clearly raise happiness, would a statistics office want another measure?`,
  '030|WELLBEING_DIMENSIONS': `To capture how well people's lives are going, would one money question do, or would surveys need several separate areas?`,
  '030|WELLBEING_DIM_PERSONAL': `Some survey areas ask people to rate their life satisfaction, health, family and friendships. Are they about personal life or the wider economy?`,
  '031|priceup': `Petrol prices jump 10% this month and nothing else changes. Has the general price level across the economy gone up?`,
  '031|INFLATION_DEF': `If almost every price in the shops keeps creeping up, month after month, what is happening to the cost of living?`,
  '031|DEFLATION_DEF': `Now the opposite: shops keep cutting prices on almost everything, month after month. What is happening to the general price level?`,
  '031|DISINFLATION_DEF': `Prices still rise each month, but last year they rose 8% and this year 3%. Are prices still going up?`,
  '031|CPI_WEIGHTING': `Households spend far more on housing than on stamps. Should doubling stamp prices move the overall price measure as much as doubling rents?`,
  '032|CPI_LIMITATIONS': `One weighted item's sharp price rise pushes the index up. Does the index tell you why prices rose, or just that they did?`,
  '032|CPI_LIMIT_BASKET_LAG': `A new smartphone appears, but the CPI basket was fixed last January. Will this year's basket capture spending on it straight away?`,
  '032|CPI_LIMIT_SUBGROUPS': `A student and a pensioner with high heating bills are both told inflation is 4%. Does that fit either one's real costs?`,
  '032|CPI_LIMIT_QUALITY': `A laptop costs the same as last year but has a much faster processor. Can CPI easily separate price change from a better product?`,
  '033|RPI_DEF': `CPI leaves out mortgage interest and council tax. Would an index that included them track exactly the same prices as CPI?`,
  '033|basket_diff': `If RPI and CPI survey somewhat different households and items, will they weigh exactly the same things?`,
  '033|avg_method': `CPI and RPI average prices with different methods. Tracking the same price rises, will they give exactly the same result?`,
  '033|RPI_CPI_DIFFERENCES': `RPI includes housing costs CPI excludes, covers different items and averages differently. Do they usually report the same inflation rate?`,
  '034|MONEY_SUPPLY_DEF': `The government wants one figure for how much money exists in the economy this year. What kind of figure does it need?`,
  '034|velocity': `A £10 note buys coffee, then bread, then flour as it changes hands. Has it supported more than £10 of spending?`,
  '034|output_q': `A country's prices double in a year, but it produces exactly the same goods and services. Has it really produced more?`,
  '034|FISHER_EQUATION': `Money supply times how often it circulates always equals price level times real output. What kind of relationship is that?`,
  '034|v_q_fixed': `If velocity and real output barely change in the short run and the money supply doubles, what must happen to the price level?`,
  '034|QUANTITY_THEORY': `If velocity and output are roughly fixed and money supply keeps growing faster than output, what happens to prices over time?`,
  '035|realwage': `Your pay rises from £20,000 to £20,400 but prices rise 5%. Can you buy more, the same, or less than before?`,
  '035|INFLATION_EFFECT_WORKERS': `Prices are rising fast and your buying power is falling. What is happening to you as a worker?`,
  '035|realinterest': `You save £1,000 at 2% interest but prices rise 5%. In a year, can your savings buy more or less than today?`,
  '035|INFLATION_EFFECT_SAVERS_BORROWERS': `You borrowed £1,000 at a fixed 2% and prices rise 5% a year. Does the real value of your repayment rise or fall?`,
  '035|taxthreshold': `Tax bands stay fixed in cash while inflation lifts wages into a higher band. Do people pay a larger or smaller share in tax?`,
  '035|INFLATION_EFFECT_GOVT': `Pensions and benefits rise with prices, old debts stay fixed in cash, and tax bands are fixed. Does inflation leave government finances unaffected?`,
  '036|econactive': `A retiree and a student are not working or looking. A jobless 30-year-old is looking. Who counts in the labour force?`,
  '036|UNEMPLOYMENT_DEF': `Among economically active people, some have a job and some don't, though they want one and can start. Which group are we measuring?`,
  '036|CLAIMANT_COUNT': `To count the unemployed, the government adds up everyone claiming out-of-work benefits each month. What kind of count is this?`,
  '036|ILO_LFS': `Researchers survey households on who has no job, is actively looking and could start within two weeks. What kind of measure is that?`,
  '036|CLAIMANT_ILO_COMPARISON': `A jobless person is actively hunting for work but gets no benefits, so isn't in the benefit records. Would the survey still count them?`,
  '037|workforce': `A country has 50 million people aged 16 to 64. To work out a labour market rate, who do we compare against?`,
  '037|EMPLOYMENT_RATE': `Of the working-age population, some are in a job, whether full-time, part-time or self-employed. What does that share tell you?`,
  '037|UNEMPLOYMENT_RATE': `Now take working-age people who are economically active but have no job. What does their share of the working-age population show?`,
  '037|INACTIVITY_RATE': `Some working-age people are neither in a job nor unemployed because they aren't seeking work, like students and carers. What does their share capture?`,
  '037|UNDEREMPLOYMENT': `A part-timer wants full-time hours but finds only 15 a week. Do employment, unemployment and inactivity rates capture this?`,
  '037|SIGNIFICANCE_RATE_CHANGES': `The unemployment rate falls, the inactivity rate rises by almost as much, and employment barely moves. Is the labour market actually healthier?`,
  '038|wage_tax': `A factory closes and 200 workers lose their jobs. They used to pay income tax each month. Do they still pay it?`,
  '038|benefit_spend': `Those 200 workers are willing and able to work but can't find a job. Can they claim unemployment benefits?`,
};

const words = (s) => s.trim().split(/\s+/).length;
let changed = 0, before = 0, after = 0, bad = 0;
const byFile = {};
Object.entries(R).forEach(([key, q]) => { const [f, t] = key.split('|'); (byFile[f] = byFile[f] || []).push([t, q]); });
Object.entries(byFile).forEach(([f, list]) => {
  const file = path.join(dir, f + '.json');
  const spec = JSON.parse(fs.readFileSync(file, 'utf8')); const st = spec.stages[0];
  list.forEach(([t, q]) => {
    const step = st.steps.find((s) => s.type === 'ask' && s.term === t);
    if (!step) throw new Error(`${f}: no question for ${t}`);
    before += words(step.q); after += words(q); step.q = q; changed++;
  });
  fs.writeFileSync(file, JSON.stringify(spec, null, 1));
  const errs = validate({ ...spec, noLeakCheck: false }, [...new Set([...(st.given || []), ...(st.needs || [])])]);
  if (errs.length) { bad++; console.log(f, errs.slice(0, 3)); }
});
console.log(`${changed} questions shortened: ${before} words -> ${after} (${Math.round(100 - (100 * after) / before)}% fewer); ${bad} stages failing the checker`);
