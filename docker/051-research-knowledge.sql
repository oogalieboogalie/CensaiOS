BEGIN;

-- Board knowledge base: Tavily searches saved from the Research window,
-- fetched in full, chunked and (when the saver has an embedding key)
-- embedded. One board = one workspace.
CREATE TABLE IF NOT EXISTS research_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  saved_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  url TEXT,
  title TEXT NOT NULL,
  query TEXT,
  published_at TEXT,
  embed_model TEXT,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  char_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_research_sources_url
  ON research_sources (workspace_id, url);

CREATE TABLE IF NOT EXISTS research_chunks (
  id BIGSERIAL PRIMARY KEY,
  source_id UUID NOT NULL REFERENCES research_sources(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL,
  ord INTEGER NOT NULL,
  text TEXT NOT NULL,
  embed_model TEXT,
  embedding REAL[]
);

CREATE INDEX IF NOT EXISTS idx_research_chunks_workspace
  ON research_chunks (workspace_id, source_id, ord);

COMMIT;
