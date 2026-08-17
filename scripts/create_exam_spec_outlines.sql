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
1. How economists think - scarcity, opportunity cost, positive vs normative statements, production possibility frontiers, specialisation and economic systems
2. How markets work - demand, supply, price determination, elasticities, consumer/producer surplus
3. Market failure - externalities, public goods, information failure
4. Government intervention - taxes, subsidies, regulation, price controls, and the limits of intervention

Theme 2 - The UK economy: performance and policies (macroeconomics)
1. Measuring economic performance - GDP, inflation, unemployment, balance of payments
2. Aggregate demand
3. Aggregate supply
4. National income
5. Economic growth
6. Macroeconomic objectives and policy (fiscal, monetary, supply-side)

Theme 3 - Business behaviour and the labour market
1. How and why businesses grow
2. Business objectives
3. Revenue, costs and profit
4. Market structures (perfect competition through to monopoly)
5. The labour market - wage determination and labour market failure
6. Government intervention in business and labour markets

Theme 4 - A global perspective
1. International trade and the global economy
2. Poverty and inequality
3. Emerging and developing economies
4. The financial sector - banking, financial markets, regulation
5. The role of the state in the macroeconomy',
  'Pearson Edexcel A_Level_Econ_A_Spec.pdf, Issue 2 Oct 2016, fetched from qualifications.pearson.com - read for topic scope only, independently restated, not reproduced verbatim'
)
on conflict (outline_key) do update set outline = excluded.outline, source_note = excluded.source_note;
