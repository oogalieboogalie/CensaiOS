-- ═══════════════════════════════════════════════════════════════════
--  JULES ↔ AGENT TASK SYNC
--  Links Jules sessions back to delegated agent_tasks and stores PR
--  state needed by the live operations board.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE jules_sessions
  ADD COLUMN IF NOT EXISTS agent_task_id UUID REFERENCES agent_tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pr_state TEXT,
  ADD COLUMN IF NOT EXISTS review_state TEXT,
  ADD COLUMN IF NOT EXISTS review_author TEXT,
  ADD COLUMN IF NOT EXISTS review_submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pr_merged_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_jules_agent_task ON jules_sessions(agent_task_id);
CREATE INDEX IF NOT EXISTS idx_jules_pr_state ON jules_sessions(pr_state);
