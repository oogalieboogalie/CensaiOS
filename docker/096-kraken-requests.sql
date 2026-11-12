-- A Kraken Request: one report (a review, an audit, a list of things to fix)
-- split into arms, one finding each, and handed out to the family through
-- Censai's plans (docker/073-censai-plans.sql). Each arm names who has it and
-- the plan that carries it; the report's own text is not kept. The arms and
-- how far each one got live in `arms` (server/kraken/arms.js).

CREATE TABLE IF NOT EXISTS kraken_requests (
  id           UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  project      TEXT CHECK (project IS NULL OR length(project) <= 200),
  mode         TEXT NOT NULL DEFAULT 'writeup' CHECK (mode IN ('writeup', 'fix')),
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'stopped')),
  arms         JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_kraken_requests_person
  ON kraken_requests(workspace_id, user_id, created_at DESC);
-- One request out at a time for each person on a board.
CREATE UNIQUE INDEX IF NOT EXISTS idx_kraken_requests_one_open
  ON kraken_requests(workspace_id, user_id) WHERE status = 'open';
