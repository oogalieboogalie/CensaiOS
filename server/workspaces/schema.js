const WORKSPACE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  name TEXT NOT NULL,
  created_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS workspace_client_state (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB,
  revision BIGINT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (workspace_id, key)
);

CREATE TABLE IF NOT EXISTS workspace_agent_projects (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  permission TEXT NOT NULL DEFAULT 'work'
    CHECK (permission IN ('read', 'work')),
  source_kind TEXT NOT NULL DEFAULT 'canvas'
    CHECK (source_kind IN ('canvas', 'manual', 'task')),
  source_id TEXT,
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_prewarmed_at TIMESTAMPTZ,
  PRIMARY KEY (workspace_id, project_id, agent_id, source_kind)
);

CREATE INDEX IF NOT EXISTS idx_workspace_agent_projects_agent
  ON workspace_agent_projects (workspace_id, agent_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_workspace_agent_projects_project
  ON workspace_agent_projects (workspace_id, project_id, permission);

ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER;
ALTER TABLE workspace_client_state ADD COLUMN IF NOT EXISTS revision BIGINT;
UPDATE workspace_client_state SET revision = 1 WHERE revision IS NULL;
ALTER TABLE workspace_client_state ALTER COLUMN revision SET DEFAULT 1;
ALTER TABLE workspace_client_state ALTER COLUMN revision SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workspaces' AND column_name = 'title'
  ) THEN
    UPDATE workspaces SET name = COALESCE(name, title, 'Workspace');
  ELSE
    UPDATE workspaces SET name = COALESCE(name, 'Workspace');
  END IF;
END $$;

UPDATE workspaces w
SET created_by_user_id = COALESCE(
  (SELECT wm.user_id FROM workspace_members wm
    WHERE wm.workspace_id = w.id
    ORDER BY CASE WHEN wm.role = 'admin' THEN 0 ELSE 1 END, wm.created_at
    LIMIT 1),
  (SELECT u.id FROM users u ORDER BY CASE WHEN u.role = 'admin' THEN 0 ELSE 1 END, u.id LIMIT 1)
)
WHERE created_by_user_id IS NULL;

ALTER TABLE workspace_members DROP CONSTRAINT IF EXISTS workspace_members_role_check;
ALTER TABLE workspace_members ALTER COLUMN role TYPE TEXT;
UPDATE workspace_members SET role = 'member' WHERE role = 'collaborator';
ALTER TABLE workspace_members ALTER COLUMN role SET DEFAULT 'member';
ALTER TABLE workspace_members ADD CONSTRAINT workspace_members_role_check
  CHECK (role IN ('owner', 'admin', 'member', 'viewer'));

INSERT INTO workspace_members (workspace_id, user_id, role)
SELECT id, created_by_user_id, 'owner'
FROM workspaces
WHERE created_by_user_id IS NOT NULL
ON CONFLICT (workspace_id, user_id) DO NOTHING;

ALTER TABLE workspaces ALTER COLUMN name SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workspaces_created_by_user_id_fkey'
  ) THEN
    ALTER TABLE workspaces
      ADD CONSTRAINT workspaces_created_by_user_id_fkey
      FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;
`;

export async function ensureWorkspaceSchema(db) {
  await db.query(WORKSPACE_SCHEMA_SQL);
}
