-- Scoped API tokens for external integrations (e.g. Muse agent, external canvas connectors)

CREATE TABLE IF NOT EXISTS canvas_integration_tokens (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash            TEXT NOT NULL UNIQUE,
  token_prefix          TEXT NOT NULL,
  name                  TEXT NOT NULL,
  workspace_id          TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  scopes                TEXT[] NOT NULL DEFAULT '{canvas:write}',
  pre_approved          BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_canvas_integration_tokens_workspace
  ON canvas_integration_tokens (workspace_id);
