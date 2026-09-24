// Hand-authored (no API calls) depth pass across every currently-cached Warwick Economics Undergraduate stage.
// User feedback: every node was teaching the bare mechanism with no named scholars, no real data, and (worst on
// "evaluating" nodes) no actual evaluation/counter-evidence - just the same mechanism restated. This rewrites all
// 6 cached stages with real economic-history content: named economists, real figures/dates, and genuine rival
// evidence on every node whose title promises an evaluation. Same term ids and graph layout as before - only the
// script (the actual questions) changes. Study-tool use only, not for commercial resale.
require('dotenv/config');
const { createClient } = require('@supabase/supabase-js');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SUBJECT = 'Economics', QUALIFICATION = 'Undergraduate Year 1', EXAM_BOARD = 'Warwick';
const EC104 = 'economics:ec104_introduction_and_pre_modern_growth:';
const ATL = 'economics:ec104_early_modern_period:';
const EC140 = 'economics:ec140_calculus_of_functions_of_two_or_more_variables:';
const IR = 'economics:ec104_british_industrial_revolution:';

const ask = (o) => ({ type: 'ask', ...o });
const recap = (o) => ({ type: 'recap', ...o });

// ---------- Stage 0: Pre-modern growth ----------
const s0 = [
  { type: 'title' },
  ask({
    q: "England's total output in 1300 is twice its output in 1150 - but the Black Death (1348) has not yet cut the population, which has also roughly doubled. Is the average person better off?",
    ok: 0,
    pre: "Total output split evenly across a population this size gives",
    hint: "If output and population both double, the amount per head is unchanged - divide, don't just look at the total.",
    opts: ["No - output per person is unchanged; the extra output is spread across twice as many people", "Yes - because total output is what matters, not how many people share it"],
    term: EC104 + 'measuring_economic_growth_gdp_and_gdp_per_capita',
  }),
  ask({
    q: "By the 1200s, English and Flemish farmers were using the heavy wheeled plough, the horse collar and a three-field rotation instead of the old two-field system. Does more land staying in production each year raise the harvest?",
    ok: 0,
    pre: "Historians (e.g. Georges Duby's studies of the medieval agricultural revolution) treat this bundle of innovations as",
    hint: "A three-field system leaves only a third of land fallow each year, not a half - more of it is growing food.",
    opts: ["Yes - more cultivated land in a given year raises total harvest", "No - the rotation only changes which field is used, not how much food grows"],
    term: EC104 + 'technological_change_and_agricultural_productivity_pre_1500',
  }),
  ask({
    q: "No government in 1400 ran a national income survey. Economic historians like Gregory Clark and Broadberry, Campbell, Klein, Overton and van Leeuwen instead reconstruct output from probate inventories, tithe records and court-set wage rates. Could gaps or bias in these surviving records make a reconstructed GDP figure less reliable than a modern national accounts estimate?",
    ok: 0,
    pre: "Exactly this problem is called a",
    hint: "A modern GDP figure comes from tax and business records covering nearly everyone; a medieval one is stitched together from whatever documents happen to survive.",
    opts: ["Yes - a reconstruction from incomplete surviving records is less reliable than a full modern survey", "No - old records and modern surveys are equally reliable, so there is no extra uncertainty"],
    term: EC104 + 'measurement_challenges_in_historical_national_accounts',
  }),
  ask({
    q: "Suppose farming output per person rises 20% in a pre-modern economy with no birth control, where land is fixed. Malthus's 1798 essay argues extra food lets more children survive to adulthood. Does population then grow until output per person falls back near where it started?",
    ok: 0,
    pre: "Thomas Malthus's 1798 'Essay on the Principle of Population' calls this self-correcting cycle the",
    hint: "More surviving children eventually means more mouths sharing a fixed amount of land - the gain gets eaten up.",
    opts: ["Yes - population grows to absorb the extra output, pulling income per person back toward subsistence", "No - population size never responds to how much food is available"],
    term: EC104 + 'malthusian_model_of_pre_modern_economies',
  }),
  recap({
    terms: [EC104 + 'measuring_economic_growth_gdp_and_gdp_per_capita', EC104 + 'technological_change_and_agricultural_productivity_pre_1500', EC104 + 'measurement_challenges_in_historical_national_accounts', EC104 + 'malthusian_model_of_pre_modern_economies'],
    q: "One of these four ideas is a warning about trusting the historical figures themselves; the other three describe or measure the real economy. Which one is the warning?",
    right: "Historical measurement challenges - it is about how reliable the data is, not about growth or output itself",
    wrong: "The Malthusian model - it argues population growth erases any gain in output per person",
    hint: "Ask which idea would still matter even if population and technology never changed at all.",
  }),
  ask({
    q: "After the Black Death (1347-51) killed roughly 40-50% of England's population, Gregory Clark's real-wage data show labourers' wages roughly doubled by the early 1400s and stayed high for decades - not reverting to the old subsistence level for over a century. Does that fit the simple Malthusian model, where any gain is meant to be erased quickly by population regrowth?",
    ok: 0,
    pre: "Historians treat this slow, decades-long recovery as real",
    hint: "The model predicts a fast reversion once population regrows; a gain that persists for a century is evidence the model is at best incomplete.",
    opts: ["No - the model predicts a much faster reversion than the century-long high-wage period actually observed", "Yes - any period of higher wages, however long it lasts, always confirms the Malthusian model"],
    term: EC104 + 'evidence_and_critique_of_the_malthusian_trap',
  }),
  recap({
    terms: [EC104 + 'malthusian_model_of_pre_modern_economies', EC104 + 'evidence_and_critique_of_the_malthusian_trap'],
    q: "Gregory Clark's own book 'A Farewell to Alms' (2007) argues England was still broadly Malthusian right up to about 1800, only escaping with the Industrial Revolution - which of the two ideas does that timeline support as the LONGER-RUNNING pattern, even given the post-Black-Death exception?",
    right: "The Malthusian model - Clark argues it held for most of English history before 1800, the post-plague wage rise being a temporary exception",
    wrong: "The evidence against the Malthusian trap - Clark argues population stopped responding to income long before 1800",
    hint: "Clark's thesis is famous for arguing the trap held for LONGER than people assume, not that it collapsed early.",
  }),
  { type: 'order', title: 'Milestone: four chunks', prompt: 'Drag and drop the 4 key terms in the order they build on each other.', order: [EC104 + 'measuring_economic_growth_gdp_and_gdp_per_capita', EC104 + 'technological_change_and_agricultural_productivity_pre_1500', EC104 + 'measurement_challenges_in_historical_national_accounts', EC104 + 'malthusian_model_of_pre_modern_economies'], pairs: [[EC104 + 'technological_change_and_agricultural_productivity_pre_1500', EC104 + 'malthusian_model_of_pre_modern_economies'], [EC104 + 'measuring_economic_growth_gdp_and_gdp_per_capita', EC104 + 'malthusian_model_of_pre_modern_economies'], [EC104 + 'measuring_economic_growth_gdp_and_gdp_per_capita', EC104 + 'measurement_challenges_in_historical_national_accounts']], done: 'Four chunks locked in. Your head is clear for the next ones.' },
  { type: 'derive', title: 'Final test: the whole derivation', prompt: 'Drag and drop the 5 key terms into the boxes to rebuild the whole derivation from memory. Chains meet at the concept.' },
  { type: 'done' },
];

// ---------- Stage 1: Atlantic trade and colonial expansion ----------
const s1 = [
  { type: 'title' },
  ask({
    q: "In the 'triangular trade', ships carried British manufactured goods to West Africa, enslaved Africans across the Middle Passage to the Americas, then American produce back to Britain. Liverpool alone financed over 5,000 slaving voyages between 1700 and 1807 - would a port at the hub of all three legs plausibly grow richer than one that wasn't?",
    ok: 0,
    pre: "Historians point to Liverpool, Bristol and Nantes as the clearest cases of",
    hint: "Every leg of the route needs ships fitted out, crewed, insured and unloaded somewhere - that business concentrates in a few hub ports.",
    opts: ["Yes - a port handling all three legs captures far more shipping, insurance and trading business", "No - which port a ship happens to use makes no difference to that city's wealth"],
    term: 'port_city',
  }),
  ask({
    q: "Caribbean and Brazilian plantations grew almost nothing but sugar, and Virginia grew almost nothing but tobacco, for export back to Europe rather than for local subsistence. Does growing one crop purely to sell into a distant market, instead of a mix of crops to feed the local population, change what kind of agriculture this is?",
    ok: 0,
    pre: "Sugar and tobacco grown this way are the classic examples of a",
    hint: "The whole point of the crop is the export sale, not feeding the people who grow it.",
    opts: ["Yes - export-for-sale is a distinct pattern from subsistence farming, organised entirely around a market", "No - any crop grown on a farm counts as the same kind of agriculture regardless of where it is sold"],
    term: 'cash_crop',
  }),
  ask({
    q: "A slaving voyage from Liverpool to West Africa to the Caribbean and back could return profits reinvested straight into new ships, warehouses or, later, textile mills. If each voyage's profit is ploughed back into buying more productive capacity rather than being spent on consumption, does the pool of investable wealth in Britain grow over time?",
    ok: 0,
    pre: "Reinvested trading profit that compounds this way builds up",
    hint: "Profit spent is gone; profit reinvested becomes next year's larger starting capital.",
    opts: ["Yes - reinvested profit keeps growing the stock of capital available for further investment", "No - what a merchant does with a voyage's profit makes no difference to future investable wealth"],
    term: 'colonial_capital',
  }),
  ask({
    q: "The 'triangular route' is the specific Europe-to-Africa-to-Americas-to-Europe shipping circuit, not just 'trade with the colonies' in general. Does naming the exact three-leg circuit matter for understanding why Liverpool grew rich on THIS trade in particular, rather than colonial trade generally?",
    ok: 0,
    pre: "Historians call this specific three-leg circuit the",
    hint: "It is the SHAPE of the route, not just the existence of trade, that concentrated business in a few hub ports.",
    opts: ["Yes - the three-leg shape of the route is exactly what concentrated shipping, insurance and financing in a few hub ports", "No - any ship sailing to any colony followed an identical commercial pattern"],
    term: 'triangular_route',
  }),
  recap({
    terms: ['port_city', 'cash_crop', 'colonial_capital', 'triangular_route'],
    q: "One of these four ideas describes what was grown; one describes where ships were based; one describes the shape of the shipping route itself; and one describes what happened to the profit. Which one is about what was grown?",
    right: "Cash crop production - sugar and tobacco grown specifically for export sale",
    wrong: "Colonial capital accumulation - profit reinvested into more ships and, later, industry",
    hint: "Ask which term you could point to on a plantation itself, rather than on a ship, a port, or a ledger.",
  }),
  ask({
    q: "Historian Eric Williams argued in 'Capitalism and Slavery' (1944) that slave-trade and plantation profits directly financed Britain's Industrial Revolution. But economic historian Stanley Engerman estimated these profits at only around 1% of British national income by the 1770s - far too small on its own to fund industrialisation. Given that gap, should a student accept the strong 'Williams thesis' version of the claim without qualification?",
    ok: 0,
    pre: "This exact dispute - profits real and reinvested, but probably not large enough alone to explain industrialisation - is the",
    hint: "A real, reinvested profit stream can still be one contributing factor among several without being THE cause on its own.",
    opts: ["No - the trade's profits look like a real but modest contributor, not sufficient by themselves to explain industrialisation", "Yes - a documented profit flow of any size proves it was the main cause of industrialisation"],
    term: ATL + 'atlantic_trade_and_colonial_expansion',
  }),
  { type: 'derive', title: 'Final test: the whole derivation', prompt: 'Drag and drop the 4 key terms into the boxes to rebuild the whole derivation from memory. Chains meet at the concept.' },
  { type: 'done' },
];

// ---------- Stage 13: Partial derivatives (EC140) - real Cobb-Douglas calculation, not just naming ----------
const s13 = [
  { type: 'title' },
  ask({
    q: "For y = 3x^2, the ordinary derivative rule gives dy/dx = 6x. At x = 4, what is dy/dx?",
    ok: 0,
    pre: "Applying the power rule term by term is exactly",
    hint: "6x with x = 4 is 6 times 4.",
    opts: ["24", "48"],
    term: EC140 + 'recap_single_variable_differentiation_rules',
  }),
  ask({
    q: "A firm's output is Q(K, L) = K^0.5 * L^0.5 (a Cobb-Douglas production function), where K is capital and L is labour. Does Q depend on more than one variable, so that 'the' derivative of Q is no longer a single well-defined number without saying which variable is changing?",
    ok: 0,
    pre: "Q(K, L) is an example of a",
    hint: "With two inputs, 'the slope of Q' is ambiguous until you say whether K or L is the one that's moving.",
    opts: ["Yes - with two independent inputs, you must specify which one is changing before 'the derivative' means anything", "No - a function of K and L can always be differentiated exactly like a function of one variable"],
    term: EC140 + 'functions_of_two_or_more_variables',
  }),
  ask({
    q: "For Q = K^0.5 * L^0.5, hold L fixed at L = 4 and differentiate with respect to K only, treating L^0.5 = 2 as a constant multiplier: dQ/dK = 0.5*K^(-0.5)*2 = K^(-0.5). At K = 4, what is dQ/dK?",
    ok: 0,
    pre: "Differentiating with every other variable held fixed is a",
    hint: "K^(-0.5) at K = 4 is 1 / sqrt(4).",
    opts: ["0.5", "2"],
    term: EC140 + 'partial_derivatives_first_order_',
  }),
  ask({
    q: "For that same partial derivative dQ/dK = K^(-0.5)*L^0.5, differentiate AGAIN with respect to K to get d^2Q/dK^2 = -0.5*K^(-1.5)*L^0.5 (the second-order partial, showing diminishing marginal product), or instead differentiate dQ/dK with respect to L to get d^2Q/(dK dL). Is that second route - starting from the K-partial and differentiating with respect to a DIFFERENT variable - a different calculation from taking the plain second-order partial in K alone?",
    ok: 0,
    pre: "The second route describes exactly a",
    hint: "One route asks 'how does the K-slope change as K itself changes'; the other asks 'how does the K-slope change as L changes instead' - genuinely different questions.",
    opts: ["Yes - differentiating the K-partial with respect to L is a distinct calculation from differentiating it again with respect to K", "No - it makes no difference which variable you differentiate with respect to the second time"],
    term: EC140 + 'second_order_and_cross_partial_derivatives',
  }),
  recap({
    terms: [EC140 + 'recap_single_variable_differentiation_rules', EC140 + 'functions_of_two_or_more_variables', EC140 + 'partial_derivatives_first_order_', EC140 + 'second_order_and_cross_partial_derivatives'],
    q: "d^2Q/dK^2 tells you how the marginal product of capital changes as K rises; d^2Q/(dK dL) tells you how the marginal product of capital changes as L rises instead. Which pair of names correctly matches 'own second-order' vs 'cross' to these two?",
    right: "d^2Q/dK^2 is the second-order (own) partial; d^2Q/(dK dL) is the cross partial",
    wrong: "d^2Q/dK^2 is the cross partial; d^2Q/(dK dL) is the second-order (own) partial",
    hint: "'Cross' means the two differentiations are with respect to two DIFFERENT variables, not the same one twice.",
  }),
  ask({
    q: "For Q = K^0.5*L^0.5 near K = 4, L = 4 (so dQ/dK = 0.5, dQ/dL = 0.5 by symmetry), suppose K rises by 0.2 and L rises by 0.1 at the same time. Adding each input's own partial-derivative effect gives ΔQ ≈ (dQ/dK)*ΔK + (dQ/dL)*ΔL = 0.5*0.2 + 0.5*0.1. What does this approximate as the change in Q?",
    ok: 0,
    pre: "Adding up every input's own effect this way is the",
    hint: "0.5 times 0.2 is 0.1, plus 0.5 times 0.1 is 0.05 - add the two.",
    opts: ["0.15", "0.30"],
    term: EC140 + 'total_differential',
  }),
  { type: 'order', title: 'Milestone: four chunks', prompt: 'Drag and drop the 4 key terms in the order they build on each other.', order: [EC140 + 'recap_single_variable_differentiation_rules', EC140 + 'functions_of_two_or_more_variables', EC140 + 'partial_derivatives_first_order_', EC140 + 'second_order_and_cross_partial_derivatives'], pairs: [[EC140 + 'recap_single_variable_differentiation_rules', EC140 + 'functions_of_two_or_more_variables'], [EC140 + 'functions_of_two_or_more_variables', EC140 + 'partial_derivatives_first_order_'], [EC140 + 'partial_derivatives_first_order_', EC140 + 'second_order_and_cross_partial_derivatives']], done: 'Four chunks locked in. Your head is clear for the next ones.' },
  { type: 'derive', title: 'Final test: the whole derivation', prompt: 'Drag and drop the 5 key terms into the boxes to rebuild the whole derivation from memory. Chains meet at the concept.' },
  { type: 'done' },
];

// ---------- Stage 32: The Great Divergence cluster ----------
const GD = ATL + 'the_great_divergence_question_why_europe_';
const INST = ATL + 'institutional_explanations_for_economic_development_property_rights_constraints_on_rulers_';
const GEO = ATL + 'geographic_explanations_for_divergence_resources_disease_climate_';
const CULT = ATL + 'cultural_ideational_explanations_for_divergence_values_religion_science_';
const GLOR = ATL + 'case_study_england_s_glorious_revolution_1688_and_credible_commitment';
const s32 = [
  { type: 'title' },
  ask({
    q: "Historian Kenneth Pomeranz's 2000 study, and Robert Allen's data, both show the Yangtze Delta in 1700 with living standards, market sophistication and proto-industry comparable to England's - yet by 1850 English GDP per capita was roughly double the Delta's. Does an outcome this large, between two regions that started so evenly matched, need explaining rather than assumed?",
    ok: 0,
    pre: "Pomeranz and Allen call this specific puzzle",
    hint: "Two regions that looked evenly matched ending up so far apart is exactly the kind of gap that demands a causal explanation.",
    opts: ["Yes - two evenly-matched regions ending up so far apart needs real explanation, not assumption", "No - Europe was obviously already far more advanced, so no divergence needs explaining"],
    term: GD,
  }),
  ask({
    q: "Douglass North and Barry Weingast's 1989 paper argues that after 1688, England's Parliament could block a king from seizing merchants' assets at will, unlike in absolutist France. Would merchants facing that kind of legal protection plausibly commit more capital to risky, long-horizon ventures than merchants who could be expropriated at a ruler's whim?",
    ok: 0,
    pre: "North and Weingast, and later Acemoglu and Robinson's 'Why Nations Fail' (2012), call this protection the",
    hint: "If your gains are legally safe from a ruler's confiscation, you take on more long-term risk to earn them.",
    opts: ["Yes - legal protection from arbitrary seizure makes merchants more willing to commit capital to risky, long ventures", "No - legal protection from the state makes no difference to how much people invest"],
    term: INST,
  }),
  ask({
    q: "Pomeranz's coal argument and Allen's wage-and-energy-price data both point to Britain's coal seams sitting close to its most industrialising regions (Newcastle to the Midlands), while China's largest coal deposits sat far from the Yangtze Delta, its most commercially advanced region. Before railways, moving coal overland was slow and costly - does nearby, cheap fuel plausibly matter for which region industrialises first?",
    ok: 0,
    pre: "This resource-geography argument is Pomeranz and Allen's",
    hint: "Coal that has to travel hundreds of miles by cart before railways is far more expensive at the point of use than coal dug next to the factory.",
    opts: ["Yes - cheap, nearby fuel plausibly lowers the cost of running machinery enough to matter for who industrialises first", "No - the geographic distance between coal fields and industry never affects industrial development"],
    term: GEO,
  }),
  { type: 'order', title: 'Milestone: three chunks', prompt: 'Drag and drop the 3 key terms in the order they build on each other.', order: [GD, INST, GEO], pairs: [[GD, INST], [GD, GEO]], done: 'Three chunks locked in. Your head is clear for the next ones.' },
  ask({
    q: "Max Weber's 'The Protestant Ethic and the Spirit of Capitalism' (1905) argues Calvinist doctrine framed worldly success as a sign of salvation, pushing merchants to reinvest profit rather than spend it on luxury or leisure. If profit is reinvested and compounds instead of being consumed, does capital accumulate faster over generations than under a culture that treats profit mainly as something to spend?",
    ok: 0,
    pre: "Weber's argument, alongside the Scientific Revolution's culture of open publication that historian Joel Mokyr stresses, forms the",
    hint: "Money reinvested keeps compounding every year; money spent on luxury is simply gone.",
    opts: ["Yes - reinvested profit compounds into faster capital growth than profit that gets consumed", "No - what people choose to do with profit makes no difference to how fast capital accumulates"],
    term: CULT,
  }),
  ask({
    q: "England's actual 1688 Glorious Revolution - William III accepting the Bill of Rights, which barred the Crown from raising taxes or suspending laws without Parliament's consent - is the concrete historical episode North and Weingast use as their evidence. Does having a real, dated event like this to point to make the institutional theory easier to test than a purely hypothetical mechanism?",
    ok: 0,
    pre: "Historians treat 1688 as the real-world case study for",
    hint: "A theory backed by one specific, dated, documented event is falsifiable in a way a purely abstract argument is not.",
    opts: ["Yes - a specific dated event gives historians real evidence to check the theory against, unlike a purely abstract claim", "No - a real historical episode carries no more evidential weight than a hypothetical example"],
    term: GLOR,
  }),
  recap({
    terms: [INST, GEO, CULT],
    q: "Pomeranz's own book uses the Yangtze Delta - which by 1700 also had well-defined property rights and a sophisticated merchant culture - to argue that institutions and culture alone cannot explain the divergence. Which of these three theories does Pomeranz's comparison most directly challenge as insufficient on its own?",
    right: "The institutional theory - Pomeranz points out the Yangtze Delta also had strong property rights and merchant institutions, yet did not industrialise first",
    wrong: "The geographic/resource theory - Pomeranz's own coal argument is the resource theory itself, so it isn't the one his comparison undercuts",
    hint: "Pomeranz's central move is showing that a rival explanation's own precondition (secure property rights) was ALSO present somewhere that didn't industrialise first.",
  }),
  { type: 'derive', title: 'Final test: the whole derivation', prompt: 'Drag and drop the 5 key terms into the boxes to rebuild the whole derivation from memory. Chains meet at the concept.' },
  { type: 'done' },
];

// ---------- Stage 53: Atlantic trade -> institutional change; evaluating the three theories ----------
const DRIVER = ATL + 'atlantic_trade_as_a_driver_of_institutional_change';
const EVAL53 = ATL + 'evaluating_institutional_vs_geographic_vs_cultural_explanations_of_divergence';
const s53 = [
  { type: 'title' },
  ask({
    q: "Daron Acemoglu, Simon Johnson and James Robinson's 2005 paper 'The Rise of Europe' shows that European countries with the largest Atlantic trade volumes after 1500 - England and the Netherlands - were exactly the ones where merchant classes grew wealthy enough to demand, and win, constraints on royal power; Atlantic trade was minimal for Spain's and Portugal's absolutist monarchies, whose institutions stayed weak. Does this pattern suggest Atlantic trade itself helped CAUSE stronger property-rights institutions, rather than institutions and trade just happening to coincide?",
    ok: 0,
    pre: "Acemoglu, Johnson and Robinson's data-driven case for this causal link is",
    hint: "The pattern lines up across several countries at once, not just England - trade volume tracks which merchant classes gained political leverage.",
    opts: ["Yes - a merchant class enriched by trade gains the leverage to demand political constraints on the ruler", "No - a country's trade volume and its institutions are always unrelated to each other"],
    term: DRIVER,
  }),
  recap({
    terms: [ATL + 'the_great_divergence_question_why_europe_', DRIVER],
    q: "A natural objection to Acemoglu, Johnson and Robinson's argument is reverse causality: maybe England already had unusually secure property rights BEFORE 1500, which is what let its merchants pursue risky Atlantic trade in the first place - trade would then be a RESULT of good institutions, not their cause. Which of these two terms does that objection challenge?",
    right: "Atlantic trade as a driver of institutional change - the objection says the causal arrow may run the other way",
    wrong: "The Great Divergence question - this term just names the puzzle itself, not either side of the causal argument",
    hint: "The objection is specifically about the DIRECTION of causation between trade and institutions, not about whether a divergence happened at all.",
  }),
  ask({
    q: "Given: the Great Divergence puzzle itself, plus institutional, geographic and cultural theories that each explain part of the gap, plus evidence (Atlantic trade's link to institutional change, and Pomeranz's Yangtze Delta comparison) that complicates each theory taken alone - would a historian who had to pick just ONE of the three theories as the full, sufficient explanation be oversimplifying?",
    ok: 0,
    pre: "Weighing all three against each other, and against the counter-evidence for each, is exactly",
    hint: "Each theory has real supporting evidence AND a real objection - a single-cause verdict throws away half of what you've just seen.",
    opts: ["Yes - each theory has genuine supporting evidence and a genuine objection, so no single one is sufficient alone", "No - once one theory has any supporting evidence at all, the other two can be safely ignored"],
    term: EVAL53,
  }),
  { type: 'derive', title: 'Final test: the whole derivation', prompt: 'Drag and drop the 2 key terms into the boxes to rebuild this branch from memory. Chains meet at the concept.' },
  { type: 'done' },
];

// ---------- Stage 63: The British Industrial Revolution ----------
const DEF = IR + 'defining_the_british_industrial_revolution';
const TECH = IR + 'key_technological_innovations_of_the_industrial_revolution';
const FACT = IR + 'the_rise_of_the_factory_system';
const WHY = IR + 'explanations_for_why_the_industrial_revolution_began_in_britain';
const HWCC = IR + 'evaluating_the_high_wage_cheap_coal_hypothesis_for_british_industrialisation';
const s63 = [
  { type: 'title' },
  ask({
    q: "Nick Crafts and Knick Harley's revised growth estimates put English GDP-per-capita growth at only around 0.3-0.5% a year in the 'classic' 1760-1830 period - modest by later standards - but crucially it kept accelerating and never reverted, unlike every earlier burst of growth in English history. Is a SUSTAINED, self-reinforcing rise the defining feature, even though the early annual growth rate itself was small?",
    ok: 0,
    pre: "Crafts and Harley's own point is that this durability, not the initial speed, defines",
    hint: "Plenty of earlier periods (post-Black-Death England, the Dutch Golden Age) also grew for a while and then stopped - the difference here is that this rise never reverted.",
    opts: ["Yes - what marks it out is that growth kept compounding indefinitely, not how fast it was in any single year", "No - unless the annual growth rate itself was dramatically higher than any earlier period, it isn't a real revolution"],
    term: DEF,
  }),
  ask({
    q: "James Watt's improved steam engine (patented 1769) cut coal use per unit of power roughly fourfold versus Newcomen's earlier engine, and Richard Arkwright's water frame (1769) let one machine do the spinning work of many hand-spinners. Does a general-purpose technology usable across many industries, rather than a one-off improvement in a single trade, plausibly drive a broader shift in how goods are made?",
    ok: 0,
    pre: "Economic historian Joel Mokyr calls inventions with this wide, cross-industry reach",
    hint: "A steam engine can power a cotton mill, a coal pump or a rolling mill alike - one invention, many industries, versus a fix that only helps one trade.",
    opts: ["Yes - an invention usable across many industries at once can shift how goods are made far more broadly than a narrow, single-trade fix", "No - a technology's reach across different industries makes no difference to how much economic change it drives"],
    term: TECH,
  }),
  ask({
    q: "Arkwright's water frame and Watt's steam engine were too large, expensive and power-hungry for a weaver's cottage. Arkwright's own Cromford mill (1771) instead gathered dozens of these machines and hundreds of workers under one roof, beside a water source. Does concentrating capital-intensive, power-driven machinery this way require centralising production, rather than leaving it spread across individual homes?",
    ok: 0,
    pre: "Cromford is the historians' textbook first example of",
    hint: "One expensive machine needing a shared power source is efficient only if many workers are brought to it, not the other way round.",
    opts: ["Yes - expensive, power-hungry machinery is only efficient when centralised, pulling workers into one site instead of many homes", "No - large, costly machines work just as well distributed one per household as concentrated in one building"],
    term: FACT,
  }),
  { type: 'order', title: 'Milestone: three chunks', prompt: 'Drag and drop the 3 key terms in the order they build on each other.', order: [DEF, TECH, FACT], pairs: [[DEF, TECH], [TECH, FACT]], done: 'Three chunks locked in. Your head is clear for the next ones.' },
  ask({
    q: "The same steam engines and spinning machinery were documented and openly published in Enlightenment scientific journals across Europe, yet France, similarly advanced in science, industrialised decades later than Britain. Does Britain adopting these technologies decades earlier suggest something specific about BRITAIN's situation, rather than the inventions themselves being uniquely British knowledge?",
    ok: 0,
    pre: "This timing gap is exactly what motivates historians to ask",
    hint: "If the same published know-how led to different adoption speeds in different countries, the explanation must lie in each country's own conditions, not the knowledge itself.",
    opts: ["Yes - identical published knowledge adopted at different speeds points to something about each country's own conditions, not the ideas themselves", "No - if the scientific knowledge was published and available everywhere, the timing of adoption must have been pure chance"],
    term: WHY,
  }),
  ask({
    q: "Robert Allen's data ('The British Industrial Revolution in Global Perspective', 2009) show London building-craft wages were roughly triple Continental European wages by the 1750s, while coal near Newcastle cost only a fraction of its price in London, Paris or Beijing per unit of heat. For a British factory owner facing costly labour and cheap coal-fired power, would substituting machines for workers pay off in a way it would not for a French or Chinese owner facing the opposite prices?",
    ok: 0,
    pre: "Allen's argument that expensive labour plus cheap fuel made Britain uniquely ready to mechanise is the",
    hint: "Compare a costly input (labour) you can replace against an unusually cheap input (coal-fired machine power) that replaces it - the substitution only pays where that price gap exists.",
    opts: ["Yes - the substitution is only worth making where wages are relatively high and machine-power fuel is relatively cheap, which was Britain's specific price mix", "No - it would have paid off equally regardless of local wage or coal prices"],
    term: HWCC,
  }),
  recap({
    terms: [WHY, HWCC],
    q: "Economic historian Judy Stephenson has challenged Allen's wage figures directly, arguing his London data mixes in contractors' overhead charges, so real wages paid to workers were lower than Allen's series suggests - weakening the size of the wage gap the hypothesis rests on. Separately, some regions with LOW wages, such as parts of Flanders, also adopted spinning machinery early, which the pure wage-driven story does not predict. Do these two objections attack the underlying DATA and the PREDICTIONS of the same hypothesis?",
    right: "Yes - Stephenson's wage-data critique and the low-wage-adopter cases both undercut Allen's high-wage/cheap-coal hypothesis specifically",
    wrong: "No - both objections are actually arguments in favour of the high-wage/cheap-coal hypothesis, not against it",
    hint: "One objection says the wage numbers themselves are overstated; the other says the theory's own prediction fails in real cases - both are challenges to the SAME hypothesis.",
  }),
  { type: 'derive', title: 'Final test: the whole derivation', prompt: 'Drag and drop the 5 key terms into the boxes to rebuild the whole derivation from memory. Chains meet at the concept.' },
  { type: 'done' },
];

const PATCHES = { 0: s0, 1: s1, 13: s13, 32: s32, 53: s53, 63: s63 };

async function main() {
  for (const [stageIndexStr, script] of Object.entries(PATCHES)) {
    const stageIndex = Number(stageIndexStr);
    const { data: row, error } = await db.from('derivation_generated_stages').select('compiled')
      .eq('subject', SUBJECT).eq('qualification', QUALIFICATION).eq('exam_board', EXAM_BOARD).eq('stage_index', stageIndex).maybeSingle();
    if (error) throw error;
    if (!row) throw new Error(`Stage ${stageIndex} not found`);
    row.compiled.stage.script = script;
    const { error: upErr } = await db.from('derivation_generated_stages').update({ compiled: row.compiled })
      .match({ subject: SUBJECT, qualification: QUALIFICATION, exam_board: EXAM_BOARD, stage_index: stageIndex });
    if (upErr) throw upErr;
    console.log(`Stage ${stageIndex}: rewritten with ${script.length} steps.`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
