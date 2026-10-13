-- Typed autonomous origins and durable links for family wakeups and schedules.

BEGIN;

ALTER TABLE run_causes
  ADD COLUMN IF NOT EXISTS source_message_id UUID REFERENCES agent_messages(id) ON DELETE RESTRICT;
ALTER TABLE run_causes
  ADD COLUMN IF NOT EXISTS schedule_id UUID REFERENCES schedules(id) ON DELETE RESTRICT;

ALTER TABLE run_causes DROP CONSTRAINT IF EXISTS run_causes_cause_kind_check;
ALTER TABLE run_causes DROP CONSTRAINT IF EXISTS run_causes_check;
ALTER TABLE run_causes DROP CONSTRAINT IF EXISTS run_causes_origin_check;

ALTER TABLE run_causes
  ADD CONSTRAINT run_causes_cause_kind_check
  CHECK (cause_kind IN ('parent_run', 'workspace_event', 'user_dispatch', 'agent_message', 'schedule'));

ALTER TABLE run_causes
  ADD CONSTRAINT run_causes_origin_check
  CHECK (
    (cause_kind = 'parent_run' AND parent_run_id IS NOT NULL
      AND workspace_event_id IS NULL AND user_dispatch_ref IS NULL
      AND source_message_id IS NULL AND schedule_id IS NULL)
    OR (cause_kind = 'workspace_event' AND parent_run_id IS NULL
      AND workspace_event_id IS NOT NULL AND user_dispatch_ref IS NULL
      AND source_message_id IS NULL AND schedule_id IS NULL)
    OR (cause_kind = 'user_dispatch' AND parent_run_id IS NULL
      AND workspace_event_id IS NULL AND user_dispatch_ref IS NOT NULL
      AND source_message_id IS NULL AND schedule_id IS NULL)
    OR (cause_kind = 'agent_message' AND parent_run_id IS NULL
      AND workspace_event_id IS NULL AND user_dispatch_ref IS NULL
      AND source_message_id IS NOT NULL AND schedule_id IS NULL)
    OR (cause_kind = 'schedule' AND parent_run_id IS NULL
      AND workspace_event_id IS NULL AND user_dispatch_ref IS NULL
      AND source_message_id IS NULL AND schedule_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_run_causes_source_message
  ON run_causes (source_message_id) WHERE source_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_run_causes_schedule
  ON run_causes (schedule_id) WHERE schedule_id IS NOT NULL;

ALTER TABLE agent_wakeups
  ADD COLUMN IF NOT EXISTS run_id UUID UNIQUE REFERENCES runs(id) ON DELETE SET NULL;
ALTER TABLE schedules
  ADD COLUMN IF NOT EXISTS last_run_id UUID REFERENCES runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agent_wakeups_run
  ON agent_wakeups (run_id) WHERE run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_schedules_last_run
  ON schedules (last_run_id) WHERE last_run_id IS NOT NULL;

COMMIT;
