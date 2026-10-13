-- Explicit workspace -> project -> agent authorization for bounded context prewarming.

BEGIN;

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

COMMIT;
