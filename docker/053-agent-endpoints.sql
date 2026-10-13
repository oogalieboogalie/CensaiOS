-- ═══════════════════════════════════════════════════════════════════
--  AGENT ENDPOINTS — a board agent answers apps outside censaiOS
--  (Claude Code, Claude Desktop, Cursor, any MCP client or plain HTTP).
--  One row per shared agent card ("agent:<id>"), off until its owner
--  turns it on. Keys are capability tokens scoped to that one agent:
--  only their SHA-256 is stored, never a provider key. Every call is
--  logged. Additive and idempotent.
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS agent_endpoints (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  card_id       TEXT NOT NULL,
  agent_id      TEXT NOT NULL,
  agent_name    TEXT NOT NULL,
  window_id     TEXT,
  enabled       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, workspace_id, card_id)
);

CREATE TABLE IF NOT EXISTS agent_endpoint_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id   UUID NOT NULL REFERENCES agent_endpoints(id) ON DELETE CASCADE,
  label         TEXT NOT NULL,
  token_hash    TEXT NOT NULL UNIQUE,
  token_hint    TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at  TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_agent_endpoint_tokens_endpoint
  ON agent_endpoint_tokens (endpoint_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_endpoint_calls (
  id            BIGSERIAL PRIMARY KEY,
  endpoint_id   UUID NOT NULL REFERENCES agent_endpoints(id) ON DELETE CASCADE,
  token_id      UUID REFERENCES agent_endpoint_tokens(id) ON DELETE SET NULL,
  via           TEXT NOT NULL CHECK (via IN ('mcp', 'http')),
  status        TEXT NOT NULL CHECK (status IN ('ok', 'error', 'limited')),
  question      TEXT,
  answer_chars  INTEGER NOT NULL DEFAULT 0,
  duration_ms   INTEGER NOT NULL DEFAULT 0,
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_endpoint_calls_endpoint
  ON agent_endpoint_calls (endpoint_id, created_at DESC);

COMMIT;
