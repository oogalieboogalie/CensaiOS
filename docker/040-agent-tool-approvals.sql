-- Durable human approval boundary for scoped agent tool modules.

ALTER TABLE workspace_agent_capabilities
  DROP CONSTRAINT IF EXISTS workspace_agent_capabilities_mode_check;
ALTER TABLE workspace_agent_capabilities
  ADD CONSTRAINT workspace_agent_capabilities_mode_check
  CHECK (mode IN ('autonomous', 'execute_with_approval'));

CREATE TABLE IF NOT EXISTS workspace_tool_approvals (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_id              TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  module_id             TEXT NOT NULL,
  tool_name             TEXT NOT NULL,
  arguments             JSONB NOT NULL CHECK (jsonb_typeof(arguments) = 'object'),
  request_hash          TEXT NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  status                TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'executing', 'succeeded', 'failed', 'denied', 'cancelled')),
  revision              INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  requested_by_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  decided_by_user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  decision_at           TIMESTAMPTZ,
  execution_started_at  TIMESTAMPTZ,
  execution_finished_at TIMESTAMPTZ,
  result_preview        TEXT,
  error_code            TEXT,
  cancellation_reason   TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_tool_approvals_active_request
  ON workspace_tool_approvals (workspace_id, agent_id, request_hash)
  WHERE status IN ('pending', 'executing');
CREATE INDEX IF NOT EXISTS idx_workspace_tool_approvals_inbox
  ON workspace_tool_approvals (workspace_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workspace_tool_approvals_stale_execution
  ON workspace_tool_approvals (status, execution_started_at)
  WHERE status = 'executing';
