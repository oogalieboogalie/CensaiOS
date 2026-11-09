-- The graph a workflow's own start was turned on with. The run uses that
-- graph only. An edit no longer matches, so the start turns off until
-- someone turns it on again (and the run then goes as that person).

ALTER TABLE board_workflow_triggers
  ADD COLUMN IF NOT EXISTS graph_hash TEXT;

ALTER TABLE board_workflow_triggers
  ADD COLUMN IF NOT EXISTS disarmed_reason TEXT;
