-- Censai the orchestrator: a plan Censai hands out to the family from a person's
-- chat. Each job goes to one family agent, runs in the background, and has a
-- checklist Censai checks off item by item (the file looked for, the project's
-- tests run, the answer read) before the person hears about it. The jobs,
-- their steps and checklists live in `jobs` (server/censaiOrchestrator/shape.js).
-- reported_at is set once the result line is in the person's chat.

CREATE TABLE IF NOT EXISTS censai_plans (
  id           UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal         TEXT NOT NULL CHECK (length(goal) BETWEEN 1 AND 500),
  project      TEXT CHECK (project IS NULL OR length(project) <= 200),
  status       TEXT NOT NULL DEFAULT 'queued'
               CHECK (status IN ('queued', 'running', 'done', 'stuck', 'stopped')),
  summary      TEXT,
  jobs         JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at  TIMESTAMPTZ,
  reported_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_censai_plans_person
  ON censai_plans(workspace_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_censai_plans_unfinished
  ON censai_plans(status) WHERE status IN ('queued', 'running');
