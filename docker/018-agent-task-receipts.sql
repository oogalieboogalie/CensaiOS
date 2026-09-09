-- ═══════════════════════════════════════════════════════════════════
--  AGENT TASK COMPLETION RECEIPTS
--  Compact structured summary shown in live operations when delegated
--  work, handoffs, or Jules-backed tasks finish.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE agent_tasks
  ADD COLUMN IF NOT EXISTS completion_receipt JSONB;

CREATE INDEX IF NOT EXISTS idx_agent_tasks_receipts
  ON agent_tasks(completed_at DESC)
  WHERE completion_receipt IS NOT NULL;
