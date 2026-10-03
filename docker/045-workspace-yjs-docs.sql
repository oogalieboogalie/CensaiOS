-- Yjs collaboration document blobs (Phase 2: debounced Y-update persistence).
-- One row per workspace; writers upsert the full encoded Y update, readers
-- apply it in Hocuspocus onLoadDocument. Never edited by hand.

BEGIN;

CREATE TABLE IF NOT EXISTS workspace_yjs_docs (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  yupdate BYTEA NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
