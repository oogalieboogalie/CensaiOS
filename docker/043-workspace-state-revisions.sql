-- Optimistic concurrency boundary for the server-authoritative canvas document.

ALTER TABLE workspace_client_state
  ADD COLUMN IF NOT EXISTS revision BIGINT;

UPDATE workspace_client_state
SET revision = 1
WHERE revision IS NULL;

ALTER TABLE workspace_client_state
  ALTER COLUMN revision SET DEFAULT 1,
  ALTER COLUMN revision SET NOT NULL;
