-- Splits the Woolf reforms node into 11 atomic ones and uncaches its old lesson so it regenerates under the new rules.
-- Paste into the Supabase SQL editor and run once (safe to re-run). One transaction: any error changes nothing.
-- 1. Uncache: the old lesson (explanation and questions) no longer matches the narrowed node, so it is removed here.
--    The original node keeps its id and concept_id, so nobody's progress on it is lost.
delete from knowledge_map_node_lessons where node_id in (select id from knowledge_map_nodes where subject = 'Law' and node_key = 'LS_WOOLF');

-- 2. The split (same routine as the earlier node split).
do $do$
declare
  splits jsonb := $json$[["Woolf reforms and the Civil Procedure Rules 1998: overriding objective", ["Woolf reforms: the problems Lord Woolf found with the old civil justice system (slow, costly and complex)", "The Civil Procedure Rules 1998: the new code, in force from 1999, that put Woolf's reforms into practice", "The overriding objective of the CPR: courts must deal with cases justly and at proportionate cost", "Dealing with a case justly: ensuring the parties are on an equal footing and saving expense", "Dealing with a case justly: dealing with it proportionately, expeditiously and fairly", "Dealing with a case justly: an appropriate share of the court's resources and enforcing compliance with rules, practice directions and orders", "Woolf reform: judges take active case management, controlling the timetable and progress of a case", "Woolf reform: the three allocation tracks for civil claims (small claims, fast track and multi-track)", "Woolf reform: pre-action protocols requiring the parties to exchange information and try to settle before issuing a claim", "Woolf reform: encouraging settlement through Part 36 offers and alternative dispute resolution", "Enforcing the reforms: Practice Directions and court sanctions for non-compliance (costs penalties and striking out)"]]]$json$::jsonb;
  s jsonb; parts jsonb; pre text; orig record; head text; lbl text; newid uuid; ids uuid[]; i int; j int; n_split int := 0; n_new int := 0;
begin
  for s in select * from jsonb_array_elements(splits) loop
    pre := s->>0; parts := s->1;
    for orig in
      select n.* from knowledge_map_nodes n
      where n.subject = 'Law' and left(n.label, length(pre)) = pre
        and not exists (select 1 from knowledge_map_node_lessons l where l.node_id = n.id)
        and not exists (select 1 from knowledge_map_nodes x where x.subject = n.subject and x.qualification = n.qualification and x.exam_board = n.exam_board and x.node_key = n.node_key || '_p2')
    loop
      head := split_part(orig.concept_id, ':', 1) || ':' || split_part(orig.concept_id, ':', 2);
      ids := array[orig.id];
      update knowledge_map_nodes set label = parts->>0 where id = orig.id;
      for i in 1 .. jsonb_array_length(parts) - 1 loop
        lbl := parts->>i;
        insert into knowledge_map_nodes (concept_id, subject, qualification, exam_board, node_key, label, subtopic, theme, difficulty)
        values (head || ':' || regexp_replace(lower(trim(lbl)), '[^a-z0-9]+', '_', 'g'), orig.subject, orig.qualification, orig.exam_board, orig.node_key || '_p' || (i + 1), lbl, orig.subtopic, orig.theme, orig.difficulty)
        returning id into newid;
        ids := ids || newid; n_new := n_new + 1;
      end loop;
      for j in 2 .. array_length(ids, 1) loop
        insert into knowledge_map_edges (from_node_id, to_node_id, difficulty)
        select ids[j], e.to_node_id, e.difficulty from knowledge_map_edges e where e.from_node_id = orig.id
        on conflict (from_node_id, to_node_id) do nothing;
      end loop;
      for j in 1 .. array_length(ids, 1) - 1 loop
        insert into knowledge_map_edges (from_node_id, to_node_id, difficulty) values (ids[j], ids[j + 1], 0.25)
        on conflict (from_node_id, to_node_id) do nothing;
      end loop;
      update knowledge_map_node_spec_order so
      set node_order = (
        select jsonb_agg(v order by k) from (
          select v, o * 100.0 as k from jsonb_array_elements(so.node_order) with ordinality t(v, o)
          union all
          select to_jsonb(ids[jj]::text), (select o from jsonb_array_elements(so.node_order) with ordinality t2(v2, o) where v2 = to_jsonb(orig.id::text)) * 100.0 + jj
          from generate_series(2, array_length(ids, 1)) jj
        ) z)
      where so.subject = orig.subject and so.qualification = orig.qualification and so.exam_board = orig.exam_board and so.subtopic = orig.subtopic
        and so.node_order @> to_jsonb(orig.id::text);
      n_split := n_split + 1;
    end loop;
  end loop;
  raise notice 'Split % nodes, created % new nodes', n_split, n_new;
end
$do$;
