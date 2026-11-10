-- Coding jobs an agent hands to the repository's GitHub coding agent (the
-- @grok / @claude workflows). The agent files an issue with the
-- create_github_issue tool; GitHub calls /api/webhooks/github-agent back when
-- the pull request for that issue opens or merges, and the agent hears about it.
-- Applied at start-up by server/github/agentTaskSchema.js. Safe to run twice.

BEGIN;

CREATE TABLE IF NOT EXISTS agent_github_tasks (
  id              BIGSERIAL PRIMARY KEY,
  repo            TEXT NOT NULL,
  issue_number    INTEGER NOT NULL,
  issue_url       TEXT NOT NULL,
  workspace_id    TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_id        TEXT NOT NULL,
  conversation_id TEXT NULL,
  created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  worker          TEXT NOT NULL DEFAULT 'grok' CHECK (worker IN ('grok', 'claude')),
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pr_open', 'merged', 'closed')),
  pr_number       INTEGER NULL,
  pr_url          TEXT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (repo, issue_number)
);

CREATE INDEX IF NOT EXISTS idx_agent_github_tasks_agent
  ON agent_github_tasks (workspace_id, agent_id, created_at DESC);

COMMIT;
