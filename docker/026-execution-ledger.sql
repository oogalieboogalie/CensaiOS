-- EXECUTION LEDGER (DURABLE RUNS) — P1-4 skeleton.
-- runs, run_steps, run_artifacts. tenant_id is NULLABLE on every
-- table (P1-3 lands workspaces.tenant_id). See brief:
-- .team/handoffs/2026-06-24-p1-execution-ledger-skeleton.md

BEGIN;

CREATE TABLE IF NOT EXISTS runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       TEXT,                              -- NULLABLE: tenant scoping lands with P1-3
  workspace_id    TEXT,                              -- references workspaces(id) (logical FK, additive)
  actor           TEXT,                              -- who initiated: user id, agent id, 'system'
  principal       TEXT,                              -- auth principal at time of run
  runtime_mode    TEXT NOT NULL DEFAULT 'sync'
                    CHECK (runtime_mode IN ('sync', 'async', 'background')),
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'cancelled')),
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_runs_tenant ON runs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_runs_workspace ON runs (workspace_id);
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs (status);

CREATE TABLE IF NOT EXISTS run_steps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  tenant_id       TEXT,                              -- denormalized from runs for tenant-scoped reads
  sequence        INTEGER NOT NULL,
  name            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'cancelled', 'skipped')),
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  error           JSONB,                             -- { message, stack?, code? } for failRun
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_run_steps_run_seq ON run_steps (run_id, sequence);
CREATE INDEX IF NOT EXISTS idx_run_steps_run ON run_steps (run_id);

CREATE TABLE IF NOT EXISTS run_artifacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  step_id         UUID REFERENCES run_steps(id) ON DELETE SET NULL,
  tenant_id       TEXT,                              -- denormalized from runs for tenant-scoped reads
  kind            TEXT NOT NULL,                     -- 'log' | 'file' | 'patch' | 'metric' | ...
  ref             TEXT NOT NULL,                     -- path, url, s3 key, or opaque handle
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_run_artifacts_run ON run_artifacts (run_id);
CREATE INDEX IF NOT EXISTS idx_run_artifacts_kind ON run_artifacts (kind);

COMMIT;
