-- Bind custom sub-agents and scratchpads to an authorized workspace. Historical
-- rows remain nullable and are quarantined by the application layer.
ALTER TABLE sub_agents
  ADD COLUMN IF NOT EXISTS workspace_id TEXT,
  ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER;
ALTER TABLE sub_agent_scratchpad
  ADD COLUMN IF NOT EXISTS workspace_id TEXT,
  ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sub_agents_workspace_id_fkey') THEN
    ALTER TABLE sub_agents ADD CONSTRAINT sub_agents_workspace_id_fkey
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sub_agents_created_by_user_id_fkey') THEN
    ALTER TABLE sub_agents ADD CONSTRAINT sub_agents_created_by_user_id_fkey
      FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sub_agent_scratchpad_workspace_id_fkey') THEN
    ALTER TABLE sub_agent_scratchpad ADD CONSTRAINT sub_agent_scratchpad_workspace_id_fkey
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sub_agent_scratchpad_created_by_user_id_fkey') THEN
    ALTER TABLE sub_agent_scratchpad ADD CONSTRAINT sub_agent_scratchpad_created_by_user_id_fkey
      FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sub_agents_workspace_parent
  ON sub_agents (workspace_id, parent_id, active, created_at);
CREATE INDEX IF NOT EXISTS idx_sub_agents_legacy_unscoped
  ON sub_agents (created_at) WHERE workspace_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_sub_agent_scratchpad_workspace
  ON sub_agent_scratchpad (workspace_id, sub_agent_id, project, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_sub_agent_scratchpad_legacy_unscoped
  ON sub_agent_scratchpad (created_at) WHERE workspace_id IS NULL;
