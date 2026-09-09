-- Bind autonomous schedules to the authenticated user and workspace that created them.
-- Existing rows remain nullable and inert until an operator can assign them deliberately.

BEGIN;

ALTER TABLE schedules ADD COLUMN IF NOT EXISTS workspace_id TEXT;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'schedules_workspace_id_fkey'
  ) THEN
    ALTER TABLE schedules ADD CONSTRAINT schedules_workspace_id_fkey
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'schedules_created_by_user_id_fkey'
  ) THEN
    ALTER TABLE schedules ADD CONSTRAINT schedules_created_by_user_id_fkey
      FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_schedules_owner_workspace
  ON schedules (created_by_user_id, workspace_id, next_run_at DESC);
CREATE INDEX IF NOT EXISTS idx_schedules_unowned
  ON schedules (status, updated_at)
  WHERE workspace_id IS NULL OR created_by_user_id IS NULL;

COMMIT;
