-- A schedule that has run can be deleted, and its run record stays.
-- 031 tied run_causes.schedule_id to schedules with a link that refused
-- deletes, so Delete failed once a schedule had run. The run keeps the schedule's id as
-- a plain value instead of a hard link. Applied at start-up by
-- server/runs/schema.js after 031, so existing databases pick it up too.
-- The card's Last run line reads last_result and last_run_at.

BEGIN;

ALTER TABLE run_causes DROP CONSTRAINT IF EXISTS run_causes_schedule_id_fkey;

ALTER TABLE schedules ADD COLUMN IF NOT EXISTS last_result TEXT;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMPTZ;

COMMIT;
