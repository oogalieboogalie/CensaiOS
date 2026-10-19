-- Board invites: ask someone to join one board (workspace).
--  * Someone with an account on this censaiOS: invited_user_id is set. The
--    invite shows in their Inbox and as a toast until they open the board.
--  * Someone without an account: code_hash is set. The link (?invite=<code>)
--    makes their own account, adds them to the board and signs them in.
--    It works once and runs out after 7 days. Only a hash of the code is kept.
-- server/invites/store.js reads and writes these rows.

CREATE TABLE IF NOT EXISTS board_invites (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  invited_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  invited_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  code_hash       TEXT UNIQUE,
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'opened', 'dismissed', 'used')),
  used_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((invited_user_id IS NULL) <> (code_hash IS NULL))
);

-- One waiting invite per person per board.
CREATE UNIQUE INDEX IF NOT EXISTS board_invites_one_pending
  ON board_invites (workspace_id, invited_user_id)
  WHERE status = 'pending' AND invited_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS board_invites_for_user
  ON board_invites (invited_user_id, created_at DESC)
  WHERE status = 'pending';
