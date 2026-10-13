-- Yjs update log (canvas core: the shared document is the only board state).
--
-- Every change to a workspace's Yjs document is appended here as one row.
-- workspace_yjs_docs (045) becomes the compacted base: it holds every update
-- up to compacted_seq folded together, and the board is rebuilt as
-- base + every log row with seq > compacted_seq. Compaction folds only old
-- rows, so recent history stays replayable ("rewind the board to 3pm").
-- Never edited by hand.

BEGIN;

ALTER TABLE workspace_yjs_docs
  ADD COLUMN IF NOT EXISTS compacted_seq BIGINT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS workspace_yjs_updates (
  seq BIGSERIAL PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  yupdate BYTEA NOT NULL,
  actor TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS workspace_yjs_updates_workspace_seq
  ON workspace_yjs_updates (workspace_id, seq);

COMMIT;
