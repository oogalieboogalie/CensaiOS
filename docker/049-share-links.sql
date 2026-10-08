-- ═══════════════════════════════════════════════════════════════════
--  GUEST LINKS (spec 5) — share a board by link, no account needed
--  A share link is a capability token: the random secret in the URL is
--  the permission, so only its SHA-256 is stored. Revoking a link (or
--  letting it expire) disconnects every guest who joined through it.
--  share_link_joins is the audit list; canvas_comments holds the
--  comment pins and their threaded replies. Additive and idempotent.
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS share_links (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  token_hash           TEXT NOT NULL UNIQUE,
  role                 TEXT NOT NULL CHECK (role IN ('view', 'comment', 'edit')),
  scope_kind           TEXT NOT NULL DEFAULT 'board' CHECK (scope_kind IN ('board', 'group', 'window')),
  scope_id             TEXT,
  mode                 TEXT NOT NULL DEFAULT 'link' CHECK (mode IN ('link', 'live')),
  stage                BOOLEAN NOT NULL DEFAULT FALSE,
  label                TEXT,
  passcode_hash        TEXT,
  expires_at           TIMESTAMPTZ,
  agent_budget_tokens  INTEGER NOT NULL DEFAULT 0 CHECK (agent_budget_tokens >= 0),
  agent_tokens_used    INTEGER NOT NULL DEFAULT 0 CHECK (agent_tokens_used >= 0),
  created_by_user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at           TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_share_links_workspace
  ON share_links (workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS share_link_joins (
  id            BIGSERIAL PRIMARY KEY,
  link_id       UUID NOT NULL REFERENCES share_links(id) ON DELETE CASCADE,
  guest_id      TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  color         TEXT,
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_share_link_joins_link
  ON share_link_joins (link_id, joined_at DESC);

CREATE TABLE IF NOT EXISTS canvas_comments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  thread_id     UUID REFERENCES canvas_comments(id) ON DELETE CASCADE,
  link_id       UUID REFERENCES share_links(id) ON DELETE SET NULL,
  author_kind   TEXT NOT NULL CHECK (author_kind IN ('user', 'guest', 'agent')),
  author_id     TEXT NOT NULL,
  author_name   TEXT NOT NULL,
  author_color  TEXT,
  body          TEXT NOT NULL,
  x             DOUBLE PRECISION,
  y             DOUBLE PRECISION,
  window_id     TEXT,
  mentions      JSONB NOT NULL DEFAULT '[]'::jsonb,
  resolved_at   TIMESTAMPTZ,
  resolved_by   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_canvas_comments_workspace
  ON canvas_comments (workspace_id, created_at);
CREATE INDEX IF NOT EXISTS idx_canvas_comments_thread
  ON canvas_comments (thread_id, created_at);

COMMIT;
