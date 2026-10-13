-- Anchor user-published AgentCards to an existing workspace. Historical custom
-- cards remain nullable and are quarantined by the application layer.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agent_cards_workspace_id_fkey'
  ) THEN
    ALTER TABLE agent_cards ADD CONSTRAINT agent_cards_workspace_id_fkey
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_agent_cards_legacy_unscoped
  ON agent_cards (created_at)
  WHERE owner_id IS NOT NULL AND workspace_id IS NULL AND deleted_at IS NULL;
