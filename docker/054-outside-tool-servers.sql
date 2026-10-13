-- ═══════════════════════════════════════════════════════════════════
--  OUTSIDE TOOL SERVERS — MCP servers a person adds so their agents can
--  use outside tools (the mirror of 053 agent endpoints). Each server is
--  personal; it does nothing until its owner gives it to an agent. A key
--  for the server lives in the key vault (user_api_keys, provider
--  "mcp:<server id>"), never in this table or in a file. Every call an
--  agent makes is logged. Additive and idempotent.
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS outside_tool_servers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL,
  transport       TEXT NOT NULL CHECK (transport IN ('http', 'stdio')),
  url             TEXT,
  command         TEXT,
  args            JSONB NOT NULL DEFAULT '[]'::jsonb,
  secret_env      TEXT,
  has_secret      BOOLEAN NOT NULL DEFAULT FALSE,
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  tools           JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_checked_at TIMESTAMPTZ,
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, slug)
);

CREATE TABLE IF NOT EXISTS outside_tool_grants (
  server_id   UUID NOT NULL REFERENCES outside_tool_servers(id) ON DELETE CASCADE,
  agent_id    TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (server_id, agent_id)
);

CREATE TABLE IF NOT EXISTS outside_tool_calls (
  id           BIGSERIAL PRIMARY KEY,
  server_id    UUID NOT NULL REFERENCES outside_tool_servers(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id     TEXT NOT NULL,
  tool         TEXT NOT NULL,
  origin       TEXT NOT NULL,
  ok           BOOLEAN NOT NULL,
  duration_ms  INTEGER NOT NULL DEFAULT 0,
  result_chars INTEGER NOT NULL DEFAULT 0,
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outside_tool_calls_agent
  ON outside_tool_calls (user_id, agent_id, created_at DESC);

COMMIT;
