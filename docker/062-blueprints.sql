-- Blueprints (Alex's diagram 08): a board's shelf of named recipes that
-- worked, each with an ID like 14h7*skyFs^2026 (shelf 1 = Finance, the 4th
-- blueprint on that shelf, a random code, the year). Asking an agent
-- "Do we have ..." looks on this shelf first (server/blueprints/phrases.js).

CREATE TABLE IF NOT EXISTS workspace_blueprints (
  workspace_id       TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id                 TEXT NOT NULL CHECK (id ~ '^[1-9][0-9]{1,6}[a-z][A-Za-z0-9*]{7}\^[0-9]{4}$'),
  title              TEXT NOT NULL,
  category           SMALLINT NOT NULL CHECK (category BETWEEN 1 AND 9),
  type               TEXT NOT NULL DEFAULT '',
  purpose            TEXT NOT NULL DEFAULT '',
  body               TEXT NOT NULL DEFAULT '',
  author_kind        TEXT NOT NULL DEFAULT 'person' CHECK (author_kind IN ('person', 'agent')),
  author_id          TEXT NOT NULL DEFAULT '',
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, id)
);
CREATE INDEX IF NOT EXISTS workspace_blueprints_category_idx
  ON workspace_blueprints (workspace_id, category, created_at);

-- The board's own "Do we have ..." phrase list. No row = the phrases from
-- the drawing (server/blueprints/phrases.js DEFAULT_BLUEPRINT_PHRASES).
CREATE TABLE IF NOT EXISTS workspace_blueprint_phrases (
  workspace_id  TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  phrases       JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
