const SCHEDULE_TENANCY_SQL = `
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
`;

export async function ensureScheduleTenancySchema(db) {
  await db.query(SCHEDULE_TENANCY_SQL);
}

export async function readScheduleTenancySchema(db) {
  const [columns, constraints, indexes] = await Promise.all([
    db.query(
      `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
        WHERE table_schema='public' AND table_name='schedules'
          AND column_name IN ('workspace_id', 'created_by_user_id')
        ORDER BY column_name`
    ),
    db.query(
      `SELECT conname, pg_get_constraintdef(oid) AS definition
         FROM pg_constraint
        WHERE conrelid='public.schedules'::regclass
          AND conname IN ('schedules_workspace_id_fkey', 'schedules_created_by_user_id_fkey')
        ORDER BY conname`
    ),
    db.query(
      `SELECT indexname, indexdef
         FROM pg_indexes
        WHERE schemaname='public' AND tablename='schedules'
          AND indexname IN ('idx_schedules_owner_workspace', 'idx_schedules_unowned')
        ORDER BY indexname`
    ),
  ]);
  return {
    columns: columns.rows,
    constraints: constraints.rows,
    indexes: indexes.rows,
  };
}
