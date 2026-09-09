-- Workspace-owned, read-only Exo-Skeleton tool modules.
-- The global agent_capabilities table remains preserved as legacy quarantine.

CREATE TABLE IF NOT EXISTS workspace_agent_capabilities (
  workspace_id         TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_id             TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  module_id            TEXT NOT NULL,
  capability_id        TEXT NOT NULL,
  mode                 TEXT NOT NULL CHECK (mode = 'autonomous'),
  equipped_slot        TEXT NOT NULL CHECK (equipped_slot IN ('head', 'mainHand', 'offHand', 'trinket')),
  source               TEXT NOT NULL DEFAULT 'exoskeleton' CHECK (source = 'exoskeleton'),
  equipped_by_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, agent_id, module_id),
  UNIQUE (workspace_id, agent_id, capability_id),
  UNIQUE (workspace_id, agent_id, equipped_slot)
);

CREATE INDEX IF NOT EXISTS idx_workspace_agent_capabilities_user
  ON workspace_agent_capabilities (equipped_by_user_id)
  WHERE equipped_by_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_workspace_agent_capabilities_runtime
  ON workspace_agent_capabilities (workspace_id, agent_id, capability_id);
