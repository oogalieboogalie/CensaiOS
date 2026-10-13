-- ═══════════════════════════════════════════════════════════════════
--  SQUAD DISPATCH BATCHES
--  Adds batch grouping to agent_tasks so Atlas can dispatch multiple
--  sub-agents as a named squad and track them collectively.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE agent_tasks
  ADD COLUMN IF NOT EXISTS batch_id    UUID,
  ADD COLUMN IF NOT EXISTS batch_label TEXT;

CREATE INDEX IF NOT EXISTS idx_agent_tasks_batch ON agent_tasks(batch_id);
