-- Friends: people the owner of this censaiOS added with a friend code
-- (server/friends/). A friend is known by the public half of their own
-- censaiOS identity (friend_key, 64 hex). The secret half never leaves
-- their computer, so holding a friend code lets nobody in.
--
-- user_id is the friend's own account on this copy: when they join a board
-- the owner shares with them, they come in as that account, never as the
-- owner. Removing a friend deletes the row; server/friends/store.js also
-- takes that account off every board.

CREATE TABLE IF NOT EXISTS friends (
  id            UUID PRIMARY KEY,
  owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_key    TEXT NOT NULL CHECK (friend_key ~ '^[0-9a-f]{64}$'),
  name          TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_user_id, friend_key)
);
