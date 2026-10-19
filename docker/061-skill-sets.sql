-- Skill sets: a granular list of skills that together make an agent great
-- (not just good) at a position. Built-in sets live in code
-- (server/skillSets/builtins.js); a board's own sets and its edits of a
-- built-in live here. Each set keeps a log of what worked and what didn't,
-- and the Idea Foundry can grow a new set on a schedule.

CREATE TABLE IF NOT EXISTS workspace_skill_sets (
  workspace_id       TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id                 TEXT NOT NULL CHECK (id ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  name               TEXT NOT NULL,
  position           TEXT NOT NULL DEFAULT '',
  summary            TEXT NOT NULL DEFAULT '',
  skills             JSONB NOT NULL DEFAULT '[]'::jsonb,
  benchmark          TEXT NOT NULL DEFAULT '',
  origin             TEXT NOT NULL DEFAULT 'manual',
  sources            JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS workspace_skill_set_log (
  id            BIGSERIAL PRIMARY KEY,
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  skill_set_id  TEXT NOT NULL,
  outcome       TEXT NOT NULL CHECK (outcome IN ('worked', 'didnt')),
  note          TEXT NOT NULL,
  author_kind   TEXT NOT NULL CHECK (author_kind IN ('person', 'agent')),
  author_id     TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS workspace_skill_set_log_set_idx
  ON workspace_skill_set_log (workspace_id, skill_set_id, created_at DESC);

CREATE TABLE IF NOT EXISTS workspace_agent_skill_sets (
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_id      TEXT NOT NULL CHECK (agent_id ~ '^[a-z0-9._-]{1,64}$'),
  skill_set_id  TEXT NOT NULL,
  equipped_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, agent_id, skill_set_id)
);

-- Idea Foundry: one row per board. While on, every interval it researches
-- the next profession and files a new skill set in the library.
CREATE TABLE IF NOT EXISTS workspace_idea_foundry (
  workspace_id    TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  enabled         BOOLEAN NOT NULL DEFAULT FALSE,
  interval_hours  INTEGER NOT NULL DEFAULT 24 CHECK (interval_hours BETWEEN 1 AND 168),
  model_provider  TEXT,
  model_name      TEXT,
  professions     JSONB NOT NULL DEFAULT '[]'::jsonb,
  next_index      INTEGER NOT NULL DEFAULT 0,
  armed_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  next_run_at     TIMESTAMPTZ,
  last_run_at     TIMESTAMPTZ,
  last_result     TEXT,
  last_error      TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
