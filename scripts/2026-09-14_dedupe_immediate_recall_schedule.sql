-- Prevents the exact-duplicate-row bug reported live: a concept's
-- immediate recall (scheduleImmediateRecall, and the cascade's own
-- "schedule the next step" insert in POST /immediate-recalls/:id/submit)
-- was a plain INSERT with nothing stopping two identical rows for the
-- same (user, concept, cascade step) - unlike day1_checks, which already
-- has this same protection via its upsert+ignoreDuplicates. Confirmed
-- live: a byte-for-byte duplicate insert currently succeeds silently.

-- Safety net in case any duplicates exist by the time this runs - keeps
-- the earliest row per (user_id, concept_id, recall_number), drops the
-- rest. No-op if there are none (confirmed clean as of 2026-09-14).
DELETE FROM immediate_recall_schedule a
USING immediate_recall_schedule b
WHERE a.user_id = b.user_id
  AND a.concept_id = b.concept_id
  AND a.recall_number = b.recall_number
  AND a.id > b.id;

ALTER TABLE immediate_recall_schedule
  ADD CONSTRAINT immediate_recall_schedule_user_concept_recall_unique
  UNIQUE (user_id, concept_id, recall_number);
