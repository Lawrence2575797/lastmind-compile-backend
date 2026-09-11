-- Adds the AI-estimated difficulty score (0-1, relative to the course
-- it's in) to knowledge_map_nodes and knowledge_map_edges. Nullable and
-- additive - existing rows (every already-ingested subject) get NULL
-- until regenerated; nothing currently reads this column, so this is
-- pure schema prep for the recall-scheduling model described in the
-- overnight spec (Rs/C/D formulas), not a behavior change on its own.
alter table knowledge_map_nodes add column if not exists difficulty numeric check (difficulty is null or (difficulty >= 0 and difficulty <= 1));
alter table knowledge_map_edges add column if not exists difficulty numeric check (difficulty is null or (difficulty >= 0 and difficulty <= 1));
