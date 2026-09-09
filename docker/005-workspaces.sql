-- ═══════════════════════════════════════════════════════════════════
--  WORKSPACES + PROJECTS + SUB-AGENT PERMISSIONS
--  Head agents own projects. Sub-agents are bound to one project and
--  carry a permission tier that controls which tools they can use.
-- ═══════════════════════════════════════════════════════════════════

-- ─── Projects owned by a head agent ────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id              TEXT PRIMARY KEY,
  owner_agent_id  TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  path            TEXT NOT NULL,
  repo            TEXT,
  summary         TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(owner_agent_id, name)
);

CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_agent_id);

-- ─── Sub-agent permission tier + project binding ───────────────────
-- 'permission' controls which tools a sub-agent can call:
--   worker     = read + write + edit + report
--   reviewer   = read + report (no writes to project files)
--   researcher = read + web_search + report
ALTER TABLE sub_agents
  ADD COLUMN IF NOT EXISTS permission TEXT
    DEFAULT 'worker'
    CHECK (permission IN ('worker', 'reviewer', 'researcher'));

ALTER TABLE sub_agents
  ADD COLUMN IF NOT EXISTS project_id TEXT
    REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sub_agents_project ON sub_agents(project_id);

-- ─── Project activity log (for the brief's "recent activity" section)
CREATE TABLE IF NOT EXISTS project_activity (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_id    TEXT NOT NULL,
  action      TEXT NOT NULL,
  detail      TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_activity_project ON project_activity(project_id, created_at DESC);
