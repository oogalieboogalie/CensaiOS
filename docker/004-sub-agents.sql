-- ═══════════════════════════════════════════════════════════════════
--  SUB-AGENTS + PROJECT SCRATCHPADS
--  Lightweight specialized agents belonging to a parent agent,
--  with per-project temporary storage.
-- ═══════════════════════════════════════════════════════════════════

-- ─── Sub-agent definitions ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sub_agents (
  id          TEXT PRIMARY KEY,
  parent_id   TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  role        TEXT,
  specialty   TEXT,
  system_prompt TEXT,
  hue         INTEGER DEFAULT 0,
  active      BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sub_agents_parent ON sub_agents(parent_id);

-- ─── Per-project scratchpad (key-value store per sub-agent) ────────
CREATE TABLE IF NOT EXISTS sub_agent_scratchpad (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_agent_id  TEXT NOT NULL REFERENCES sub_agents(id) ON DELETE CASCADE,
  project       TEXT NOT NULL DEFAULT 'default',
  key           TEXT NOT NULL,
  value         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(sub_agent_id, project, key)
);

CREATE INDEX IF NOT EXISTS idx_scratchpad_sub_agent ON sub_agent_scratchpad(sub_agent_id, project);

-- ─── Group milestones ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS group_milestones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_name  TEXT NOT NULL,
  title       TEXT NOT NULL,
  description TEXT,
  completed   BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_milestones_group ON group_milestones(group_name);

-- ─── Group goals ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS group_goals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_name  TEXT NOT NULL,
  title       TEXT NOT NULL,
  description TEXT,
  status      TEXT DEFAULT 'active',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_goals_group ON group_goals(group_name);
