-- ═══════════════════════════════════════════════════════════════════
--  AGENT SCHEDULES
--  Allows agents to schedule tasks for future execution.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS schedules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      TEXT NOT NULL,
  project_id    TEXT REFERENCES projects(id) ON DELETE SET NULL,
  project_name  TEXT,
  project_path  TEXT,
  project_repo  TEXT,
  project_ref   TEXT,
  task_text     TEXT NOT NULL,
  document_target TEXT,
  scheduled_time TEXT NOT NULL, -- Original time string from UI (e.g., "12:45 PM")
  scheduled_date DATE NOT NULL, -- Original date from UI
  repeat_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  repeat_days   JSONB, -- { s: bool, m: bool, ... }
  repeat_freq   TEXT CHECK (repeat_freq IN ('weekly', 'monthly')),
  status        TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'running', 'completed', 'inactive', 'failed')),
  next_run_at   TIMESTAMPTZ,
  github_url    TEXT,
  github_number INTEGER,
  last_error    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE schedules ADD COLUMN IF NOT EXISTS project_id TEXT REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS project_path TEXT;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS project_repo TEXT;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS project_ref TEXT;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS document_target TEXT;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS last_error TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'schedules'::regclass
      AND conname = 'schedules_status_check'
  ) THEN
    ALTER TABLE schedules DROP CONSTRAINT schedules_status_check;
  END IF;
END $$;

ALTER TABLE schedules
  ADD CONSTRAINT schedules_status_check
  CHECK (status IN ('active', 'running', 'completed', 'inactive', 'failed'));

CREATE INDEX IF NOT EXISTS idx_schedules_status_next_run ON schedules(status, next_run_at) WHERE status = 'active';
