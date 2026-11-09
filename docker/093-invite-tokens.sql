-- One-time invite tokens: someone makes a code for a friend, a board or a
-- workshop seat. The first signed-in person to claim it gets in, and the code
-- is burned for good. Only a SHA-256 hash of the code is kept here.
--  * friend         claiming makes an accepted friendship with the creator
--  * board          claiming adds the claimer to that board as a member
--                   (target_id is the board's workspace id)
--  * workshop_seat  the burned token is the seat (target_id is the lesson id)
-- server/tokens/store.js reads and writes these rows; server/tokens/schema.js
-- applies this file at start-up. Safe to run twice.

BEGIN;

CREATE TABLE IF NOT EXISTS invite_tokens (
  id           TEXT PRIMARY KEY,
  token_hash   TEXT NOT NULL UNIQUE,
  creator_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope        TEXT NOT NULL CHECK (scope IN ('friend', 'board', 'workshop_seat')),
  target_id    TEXT,
  expires_at   TIMESTAMPTZ NOT NULL,
  redeemed_at  TIMESTAMPTZ,
  redeemed_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'burned', 'expired')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS invite_tokens_by_creator
  ON invite_tokens (creator_id, created_at);

-- A pair of people is stored once, lower user id first.
CREATE TABLE IF NOT EXISTS friendships (
  user_a               INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b               INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status               TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'blocked')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_via_token_id TEXT REFERENCES invite_tokens(id) ON DELETE SET NULL,
  PRIMARY KEY (user_a, user_b),
  CHECK (user_a < user_b)
);

COMMIT;
