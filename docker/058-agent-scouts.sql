-- Scout agents: each core agent has a fast, cheap scout that maps a repo and
-- points to the exact file and line to change. This keeps which model each
-- person's scout runs on, per agent. No row (or no model) means "the
-- cheapest fast model this person has a key for".

CREATE TABLE IF NOT EXISTS agent_scout_settings (
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id       TEXT NOT NULL CHECK (agent_id ~ '^[A-Za-z0-9._-]{1,64}$'),
  model_provider TEXT,
  model_name     TEXT,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, agent_id)
);
