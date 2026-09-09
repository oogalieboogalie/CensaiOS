-- ═══════════════════════════════════════════════════════════════════
--  JULES SESSIONS
--  Tracks Jules tasks submitted by Homebase agents so we can poll,
--  link to PRs, and watch the Codex review loop.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS jules_sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jules_session_name  TEXT UNIQUE,     -- "sessions/abc123" from Jules
  agent_id            TEXT NOT NULL,   -- who submitted (head or sub agent)
  project_id          TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  branch              TEXT,
  prompt              TEXT,
  title               TEXT,
  status              TEXT DEFAULT 'QUEUED',
  pr_number           INTEGER,
  pr_url              TEXT,
  jules_url           TEXT,            -- link to the session in jules.google.com
  last_polled_at      TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jules_agent ON jules_sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_jules_project ON jules_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_jules_status ON jules_sessions(status) WHERE status IN ('QUEUED','PLANNING','IN_PROGRESS');
