-- Trust mode: agents act on their own instead of waiting in Action Approvals.
-- One row per board (agent_id '*') and optional rows per agent that override
-- the board. No row means Trust mode is ON: agents act without asking.
-- Actions that leave censaiOS (sending to people, spending, signing) are not
-- covered here; they keep their own checks.

CREATE TABLE IF NOT EXISTS workspace_agent_trust (
  workspace_id       TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_id           TEXT NOT NULL CHECK (agent_id = '*' OR agent_id ~ '^[a-z0-9._-]{1,64}$'),
  trusted            BOOLEAN NOT NULL,
  updated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, agent_id)
);
