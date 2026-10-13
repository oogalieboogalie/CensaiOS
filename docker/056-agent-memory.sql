-- ═══════════════════════════════════════════════════════════════════
--  AGENT MEMORY — part 5 of the frontier plan
--  (docs/architecture/ideas-catalog-and-frontier-architecture.md).
--
--  Three kinds of memory, each kept per person (user_id) and per agent,
--  so the same built-in agent remembers different things for different
--  people on one install:
--
--    agent_episodes   what happened: one row per run (a chat turn, a help
--                     request, an outside call), with a short summary that
--                     plain-words search can find later.
--    agent_facts      what is true, since when, and when the agent learned
--                     it. Two clocks: valid_from / valid_to is when the fact
--                     was true in the world; recorded_at / superseded_at is
--                     when the agent believed it. A change or a correction
--                     never deletes a row, so the history stays readable.
--    agent_identity   who the agent is: a stable self-description that does
--                     not change when the model behind the agent changes.
--                     Versioned the same way as facts.
--
--  Plain Postgres (no extensions beyond the built-in full-text search), so
--  it works on every censaiOS install. Additive and idempotent.
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS agent_episodes (
  id            BIGSERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id      TEXT NOT NULL,
  workspace_id  TEXT,
  origin        TEXT NOT NULL DEFAULT 'chat',
  model         TEXT,
  question      TEXT NOT NULL,
  answer        TEXT NOT NULL DEFAULT '',
  summary       TEXT NOT NULL,
  tools         JSONB NOT NULL DEFAULT '[]'::jsonb,
  search        TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', coalesce(summary, ''))) STORED,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_episodes_owner
  ON agent_episodes (user_id, agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_episodes_search
  ON agent_episodes USING GIN (search);

CREATE TABLE IF NOT EXISTS agent_facts (
  id             BIGSERIAL PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id       TEXT NOT NULL,
  subject        TEXT NOT NULL,
  attribute      TEXT NOT NULL,
  fact_key       TEXT NOT NULL,
  value          TEXT NOT NULL,
  valid_from     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_to       TIMESTAMPTZ,
  recorded_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  superseded_at  TIMESTAMPTZ,
  superseded_by  BIGINT REFERENCES agent_facts(id) ON DELETE SET NULL,
  change_kind    TEXT NOT NULL DEFAULT 'new' CHECK (change_kind IN ('new', 'change', 'correction', 'history')),
  source         TEXT NOT NULL DEFAULT 'agent',
  episode_id     BIGINT REFERENCES agent_episodes(id) ON DELETE SET NULL,
  CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

-- What the agent believes right now: one row per fact key.
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_facts_current
  ON agent_facts (user_id, agent_id, fact_key)
  WHERE superseded_at IS NULL AND valid_to IS NULL;
CREATE INDEX IF NOT EXISTS idx_agent_facts_history
  ON agent_facts (user_id, agent_id, fact_key, recorded_at);

CREATE TABLE IF NOT EXISTS agent_identity (
  id             BIGSERIAL PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id       TEXT NOT NULL,
  core           TEXT NOT NULL,
  recorded_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  superseded_at  TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_identity_current
  ON agent_identity (user_id, agent_id)
  WHERE superseded_at IS NULL;

COMMIT;
