-- Workflows: chains of agents, tools and checks drawn in a Workflow window.
-- The graph itself lives on the board (the window), so teammates see and
-- edit it live. These tables hold what the server needs when nobody has the
-- board open: when a workflow should start on its own, and a record of
-- every run.

-- One row per Workflow window that starts on its own (every N minutes, or
-- when a kind of window lands on the board). It runs as the person who
-- turned it on, and only while they are still a member of the board.
CREATE TABLE IF NOT EXISTS board_workflow_triggers (
  workspace_id   TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  window_id      TEXT NOT NULL CHECK (window_id ~ '^[a-zA-Z0-9._:-]{1,96}$'),
  mode           TEXT NOT NULL CHECK (mode IN ('schedule', 'board')),
  every_minutes  INTEGER CHECK (every_minutes IS NULL OR every_minutes BETWEEN 5 AND 10080),
  window_kind    TEXT CHECK (window_kind IS NULL OR window_kind ~ '^[a-zA-Z0-9_-]{1,64}$'),
  armed_by       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  next_run_at    TIMESTAMPTZ,
  seen_window_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_run_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, window_id)
);

CREATE INDEX IF NOT EXISTS board_workflow_triggers_due ON board_workflow_triggers (next_run_at);

-- Every run of every workflow: who or what started it, how each step went.
CREATE TABLE IF NOT EXISTS board_workflow_runs (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  window_id     TEXT NOT NULL,
  started_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  trigger       TEXT NOT NULL CHECK (trigger IN ('manual', 'schedule', 'board')),
  status        TEXT NOT NULL CHECK (status IN ('running', 'awaiting_review', 'complete', 'failed', 'stopped')),
  graph         JSONB NOT NULL,
  results       JSONB NOT NULL DEFAULT '{}'::jsonb,
  error         TEXT,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS board_workflow_runs_window ON board_workflow_runs (workspace_id, window_id, started_at DESC);
