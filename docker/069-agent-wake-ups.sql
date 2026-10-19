-- Wake-ups: a core agent can set itself a one-time or repeating wake-up
-- (a scheduled run with its own reason and plan). Off for every agent until
-- an owner or admin turns it on for that agent, and capped per day.

ALTER TABLE schedules ADD COLUMN IF NOT EXISTS set_by_agent TEXT;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS agent_reason TEXT;

CREATE TABLE IF NOT EXISTS workspace_agent_wake_ups (
  workspace_id       TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_id           TEXT NOT NULL CHECK (agent_id ~ '^[a-z0-9._-]{1,64}$'),
  enabled            BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, agent_id)
);

-- One row each time an agent's own wake-up actually ran (for the daily cap).
CREATE TABLE IF NOT EXISTS agent_wake_up_fires (
  id           BIGSERIAL PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_id     TEXT NOT NULL,
  schedule_id  UUID,
  fired_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_wake_up_fires_recent
  ON agent_wake_up_fires(workspace_id, agent_id, fired_at DESC);
CREATE INDEX IF NOT EXISTS idx_schedules_set_by_agent
  ON schedules(workspace_id, set_by_agent) WHERE set_by_agent IS NOT NULL;
