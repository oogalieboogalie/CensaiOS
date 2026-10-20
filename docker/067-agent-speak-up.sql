-- Speak up (diagram 17): an agent can post one short note to the
-- Inbox on its own when a scheduled check finds something worth telling.
-- Off for every agent until an owner or admin turns it on for that agent:
-- no row (or enabled = false) means the agent stays quiet.

CREATE TABLE IF NOT EXISTS workspace_agent_speak_up (
  workspace_id       TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_id           TEXT NOT NULL CHECK (agent_id ~ '^[a-z0-9._-]{1,64}$'),
  enabled            BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, agent_id)
);

CREATE TABLE IF NOT EXISTS agent_speak_up_notes (
  id           BIGSERIAL PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_id     TEXT NOT NULL CHECK (agent_id ~ '^[a-z0-9._-]{1,64}$'),
  note         TEXT NOT NULL CHECK (char_length(note) BETWEEN 1 AND 280),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_speak_up_notes_recent
  ON agent_speak_up_notes(workspace_id, created_at DESC);
