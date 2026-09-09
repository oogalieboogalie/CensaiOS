-- Phase 1 run causality: each durable run has one immutable origin.

BEGIN;

CREATE TABLE IF NOT EXISTS run_causes (
  run_id            UUID PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
  cause_kind        TEXT NOT NULL
                    CHECK (cause_kind IN ('parent_run', 'workspace_event', 'user_dispatch')),
  parent_run_id     UUID REFERENCES runs(id) ON DELETE RESTRICT,
  workspace_event_id UUID REFERENCES workspace_events(id) ON DELETE RESTRICT,
  user_dispatch_ref TEXT,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (cause_kind = 'parent_run' AND parent_run_id IS NOT NULL
      AND workspace_event_id IS NULL AND user_dispatch_ref IS NULL)
    OR (cause_kind = 'workspace_event' AND parent_run_id IS NULL
      AND workspace_event_id IS NOT NULL AND user_dispatch_ref IS NULL)
    OR (cause_kind = 'user_dispatch' AND parent_run_id IS NULL
      AND workspace_event_id IS NULL AND user_dispatch_ref IS NOT NULL)
  ),
  CHECK (parent_run_id IS NULL OR parent_run_id <> run_id)
);

CREATE INDEX IF NOT EXISTS idx_run_causes_parent_run
  ON run_causes (parent_run_id)
  WHERE parent_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_run_causes_workspace_event
  ON run_causes (workspace_event_id)
  WHERE workspace_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_run_causes_user_dispatch
  ON run_causes (user_dispatch_ref)
  WHERE user_dispatch_ref IS NOT NULL;

COMMIT;
