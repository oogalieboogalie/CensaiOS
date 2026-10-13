-- ═══════════════════════════════════════════════════════════════════
--  SOCIAL CANVAS — profiles, boards you show off, follows and a feed
--  A profile shows a person's best boards. Showing a board off makes a
--  view-only share link for it (spec 5), so the board itself is shared
--  the same way every other board is. Follows point at a person or one
--  board, on this censaiOS or on another one (address + key, like the
--  agent network). Nothing here needs a hosted server: another censaiOS
--  reads a profile through its owner's own outside door with a key the
--  owner handed out, and the follower keeps the last copy it saw.
--  Additive and idempotent.
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS social_profiles (
  user_id       INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  id            UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  display_name  TEXT NOT NULL,
  bio           TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Boards on a profile. share_token_encrypted is the view link's secret,
-- sealed with the owner's vault key, so people here can open the board.
CREATE TABLE IF NOT EXISTS social_showcase (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id           TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title                  TEXT NOT NULL,
  note                   TEXT,
  position               INTEGER NOT NULL DEFAULT 0,
  share_link_id          UUID REFERENCES share_links(id) ON DELETE SET NULL,
  share_token_encrypted  TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, workspace_id)
);

-- What a person posts ("post") and what their agents did on a shown board ("agent").
CREATE TABLE IF NOT EXISTS social_posts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id  TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL DEFAULT 'post' CHECK (kind IN ('post', 'agent')),
  agent_id      TEXT,
  agent_name    TEXT,
  body          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_posts_user
  ON social_posts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_posts_workspace
  ON social_posts (workspace_id, created_at DESC);

-- Keys a person hands to friends on another censaiOS. Only the hash is kept.
CREATE TABLE IF NOT EXISTS social_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_hash      TEXT NOT NULL UNIQUE,
  hint          TEXT NOT NULL,
  label         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at  TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS social_follows (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_kind        TEXT NOT NULL CHECK (target_kind IN ('person', 'board')),
  local_user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
  showcase_id        UUID REFERENCES social_showcase(id) ON DELETE CASCADE,
  remote_address     TEXT,
  remote_board_id    TEXT,
  remote_install_id  TEXT,
  key_encrypted      TEXT,
  label              TEXT,
  remote_cache       JSONB,
  fetched_at         TIMESTAMPTZ,
  fetch_error        TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_social_follows_target
  ON social_follows (user_id, target_kind, COALESCE(local_user_id, 0),
    COALESCE(showcase_id::text, ''), COALESCE(remote_address, ''), COALESCE(remote_board_id, ''));

COMMIT;
