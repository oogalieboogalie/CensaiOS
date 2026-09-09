BEGIN;

CREATE TABLE IF NOT EXISTS workspace_agent_card_installs (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  card_id TEXT NOT NULL REFERENCES agent_cards(id) ON DELETE CASCADE,
  installed_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, card_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_card_installs_user
  ON workspace_agent_card_installs (installed_by_user_id, installed_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_card_installs_card
  ON workspace_agent_card_installs (card_id, workspace_id);

COMMIT;
