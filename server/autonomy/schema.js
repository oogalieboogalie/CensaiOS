const AUTONOMY_TENANCY_SQL = `
ALTER TABLE agent_messages ADD COLUMN IF NOT EXISTS workspace_id TEXT;
ALTER TABLE agent_messages ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER;
ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS workspace_id TEXT;
ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_messages_workspace_id_fkey') THEN
    ALTER TABLE agent_messages ADD CONSTRAINT agent_messages_workspace_id_fkey
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_messages_created_by_user_id_fkey') THEN
    ALTER TABLE agent_messages ADD CONSTRAINT agent_messages_created_by_user_id_fkey
      FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_tasks_workspace_id_fkey') THEN
    ALTER TABLE agent_tasks ADD CONSTRAINT agent_tasks_workspace_id_fkey
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_tasks_created_by_user_id_fkey') THEN
    ALTER TABLE agent_tasks ADD CONSTRAINT agent_tasks_created_by_user_id_fkey
      FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_agent_messages_owner_workspace
  ON agent_messages (created_by_user_id, workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_messages_unowned
  ON agent_messages (created_at DESC)
  WHERE workspace_id IS NULL OR created_by_user_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_agent_tasks_owner_workspace
  ON agent_tasks (created_by_user_id, workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_unowned
  ON agent_tasks (status, updated_at)
  WHERE workspace_id IS NULL OR created_by_user_id IS NULL;
`;

export async function ensureAutonomyTenancySchema(db) {
  await db.query(AUTONOMY_TENANCY_SQL);
}

export async function readAutonomyTenancySchema(db) {
  const [columns, constraints, indexes] = await Promise.all([
    db.query(`SELECT table_name, column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema='public'
        AND table_name IN ('agent_messages', 'agent_tasks')
        AND column_name IN ('workspace_id', 'created_by_user_id')
      ORDER BY table_name, column_name`),
    db.query(`SELECT conrelid::regclass::text AS table_name, conname,
        pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conname IN (
        'agent_messages_workspace_id_fkey', 'agent_messages_created_by_user_id_fkey',
        'agent_tasks_workspace_id_fkey', 'agent_tasks_created_by_user_id_fkey'
      ) ORDER BY conname`),
    db.query(`SELECT tablename, indexname, indexdef FROM pg_indexes
      WHERE schemaname='public' AND indexname IN (
        'idx_agent_messages_owner_workspace', 'idx_agent_messages_unowned',
        'idx_agent_tasks_owner_workspace', 'idx_agent_tasks_unowned'
      ) ORDER BY indexname`),
  ]);
  return { columns: columns.rows, constraints: constraints.rows, indexes: indexes.rows };
}
