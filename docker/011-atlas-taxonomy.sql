-- ═══════════════════════════════════════════════════════════════════
--  ATLAS AGENT TAXONOMY
--  Adds named class types (Scout/Builder/Auditor/Sentry), review
--  specialty tags, and audit log infrastructure to the agent system.
-- ═══════════════════════════════════════════════════════════════════

-- ─── Extended sub-agent taxonomy columns ────────────────────────────
ALTER TABLE sub_agents
  ADD COLUMN IF NOT EXISTS class TEXT CHECK (class IN ('scout','builder','auditor','sentry')),
  ADD COLUMN IF NOT EXISTS review_specialty TEXT CHECK (review_specialty IN ('code','schema','infra','security','api-design','test-coverage')),
  ADD COLUMN IF NOT EXISTS system_prompt_inject TEXT;

CREATE INDEX IF NOT EXISTS idx_sub_agents_class ON sub_agents(class);

-- ─── Tool audit log ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tool_audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      TEXT NOT NULL,
  tool_name     TEXT NOT NULL,
  args          JSONB,
  result_snippet TEXT,      -- first 500 chars of result
  scope         TEXT,
  destructive   BOOLEAN DEFAULT FALSE,
  duration_ms   INTEGER,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tool_audit_agent ON tool_audit_log(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tool_audit_tool  ON tool_audit_log(tool_name, created_at DESC);
