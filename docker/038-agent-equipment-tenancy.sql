-- Workspace-owned persona attributes and operating mindsets.
-- The global agent_attributes and agent_equipped_items tables are preserved as
-- legacy quarantine; runtime equipment reads and writes use only this table.

CREATE TABLE IF NOT EXISTS workspace_agent_equipped_items (
  workspace_id       TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_id           TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  definition_id      TEXT NOT NULL REFERENCES attribute_definitions(id) ON DELETE CASCADE,
  equipped_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  equipped_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, agent_id, definition_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_agent_equipment_definition
  ON workspace_agent_equipped_items (definition_id, workspace_id);

CREATE INDEX IF NOT EXISTS idx_workspace_agent_equipment_user
  ON workspace_agent_equipped_items (equipped_by_user_id)
  WHERE equipped_by_user_id IS NOT NULL;
