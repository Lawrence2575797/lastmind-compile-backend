create table exam_spec_outlines (
  outline_key text primary key,
  subject text not null,
  qualification text not null,
  exam_board text not null,
  outline text not null,
  source_note text,
  created_at timestamptz not null default now()
);

insert into exam_spec_outlines (outline_key, subject, qualification, exam_board, outline, source_note)
values (
  'economics::a_level::edexcel',
  'Economics',
  'A Level',
  'Edexcel',
  'Theme 1 - Introduction to markets and market failure (microeconomics foundations)
1.1 Nature of economics - economics as a social science, positive vs normative statements, the economic problem (scarcity and opportunity cost), production possibility frontiers, specialisation and division of labour, free market/mixed/command economies
1.2 How markets work - rational decision making, demand, price/income/cross elasticities of demand, supply, elasticity of supply, price determination, the price mechanism, consumer and producer surplus, indirect taxes and subsidies, behavioural (non-rational) views of consumer behaviour
1.3 Market failure - types of market failure, externalities, public goods, information gaps
1.4 Government intervention - government intervention in markets, government failure

Theme 2 - The UK economy: performance and policies (macroeconomics)
2.1 Measures of economic performance - economic growth, inflation, employment and unemployment, balance of payments
2.2 Aggregate demand (AD) - characteristics of AD, consumption, investment, government expenditure, net trade
2.3 Aggregate supply (AS) - characteristics of AS, short-run AS, long-run AS
2.4 National income - national income and the circular flow, injections and withdrawals, equilibrium national output, the multiplier
2.5 Economic growth - causes of growth, output gaps, the trade (business) cycle, the impact of economic growth
2.6 Macroeconomic objectives and policies - possible macroeconomic objectives, demand-side (fiscal and monetary) policies, supply-side policies, conflicts and trade-offs between objectives and policies

Theme 3 - Business behaviour and the labour market
3.1 Business growth - sizes and types of firms, how businesses grow, demergers
3.2 Business objectives - alternative business objectives (profit, revenue, sales maximisation, satisficing)
3.3 Revenues, costs and profits - revenue, costs, economies and diseconomies of scale, normal/supernormal profit and losses
3.4 Market structures - efficiency, perfect competition, monopolistic competition, oligopoly, monopoly, monopsony, contestability
3.5 Labour market - demand for labour, supply of labour, wage determination in competitive and non-competitive markets
3.6 Government intervention in business/labour markets - intervention to promote competition and protect consumers/suppliers, the impact of government intervention

Theme 4 - A global perspective
4.1 International economics - globalisation, specialisation and trade, pattern of trade, terms of trade, trading blocs and the WTO, restrictions on free trade, balance of payments, exchange rates, international competitiveness
4.2 Poverty and inequality - absolute and relative poverty, income/wealth inequality
4.3 Emerging and developing economies - measures of development, factors influencing growth and development, strategies influencing growth and development
4.4 The financial sector - role of financial markets, market failure in the financial sector, role of central banks
4.5 Role of the state in the macroeconomy - public expenditure (including its significance for crowding out, taxation levels, and equality), taxation, public sector finances (fiscal deficits and national debt), macroeconomic policies in a global context

Note: individual mechanisms discussed WITHIN a sub-topic (e.g. crowding out within public expenditure, credit creation as part of how banks/central banks and the money supply function within the financial sector) are not always separately named as their own heading here even though a student may reasonably want a dedicated lesson on one specifically - use this outline to calibrate depth and placement, not as an exhaustive checklist of every teachable concept.',
  'Pearson Edexcel A_Level_Econ_A_Spec.pdf, Issue 2 Oct 2016, fetched from qualifications.pearson.com - read for topic scope down to the specification''s own numbered sub-topics, independently restated, not reproduced verbatim'
)
on conflict (outline_key) do update set outline = excluded.outline, source_note = excluded.source_note;
