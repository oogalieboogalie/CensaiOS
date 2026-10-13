-- ═══════════════════════════════════════════════════════════════════
--  DURABLE AGENT TASKS
--  Parent agents can delegate concrete work to sub-agents and track
--  progress/results without relying on a single chat transcript.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS agent_tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id     TEXT NOT NULL,
  assignee_id   TEXT NOT NULL REFERENCES sub_agents(id) ON DELETE CASCADE,
  project_id    TEXT REFERENCES projects(id) ON DELETE SET NULL,
  project       TEXT,
  title         TEXT NOT NULL,
  prompt        TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'in_progress', 'blocked', 'completed', 'failed', 'cancelled')),
  priority      TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  result        TEXT,
  error         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_parent ON agent_tasks(parent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_assignee ON agent_tasks(assignee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_status ON agent_tasks(status, priority, created_at DESC);
