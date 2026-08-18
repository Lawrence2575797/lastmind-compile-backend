-- Repurposes tutoring_sessions for the async (write, moderate, hold,
-- release) delivery model chosen after Phase 1 shipped, replacing the
-- original live-scheduled-session design. scheduled_time was "the time
-- a helper agreed to hold a live session"; it becomes release_time, "the
-- time the REQUESTER booked to see the (already-moderated) response" —
-- same shape (a timestamp the student picks), different owner and
-- meaning. completed_at becomes released_at for the same reason.
-- submitted_at is new: when the helper's written response landed.
alter table tutoring_sessions rename column scheduled_time to release_time;
alter table tutoring_sessions rename column completed_at to released_at;
alter table tutoring_sessions add column submitted_at timestamptz;
