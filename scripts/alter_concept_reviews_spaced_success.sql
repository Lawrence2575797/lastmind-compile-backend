-- Successive relearning: a durability signal LAYERED ON TOP of FSRS, not a
-- replacement for it. FSRS still decides WHEN a concept is due; this tracks
-- whether correct answers have actually landed on separate, correctly-timed
-- sessions — the specific thing plain reps/stability can't tell apart (two
-- correct answers in one sitting look identical to reps=2 as two correct
-- answers three weeks apart, but only the second is what the successive-
-- relearning research actually tested).
alter table concept_reviews add column spaced_success_count integer not null default 0;
alter table concept_reviews add column last_spaced_success_date date;
