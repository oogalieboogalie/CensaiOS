-- ═══════════════════════════════════════════════════════════════════
--  AGENT TURNS: the conversation itself, word for word, with times.
--
--  agent_episodes (056) keeps one row per run with only the last question
--  and the final answer. This table keeps every message of a chat as its
--  own row: who said it, the exact words, and when, grouped by the chat
--  it belongs to (conversation_id) and the board it happened on. Agents
--  recall these real exchanges, with their times, instead of a summary.
--  The Recents list reads the same rows.
--
--  Kept per person (user_id) and per agent, like the rest of agent memory.
--  Plain Postgres full-text search. Additive and idempotent.
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS agent_turns (
  id               BIGSERIAL PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id         TEXT NOT NULL,
  workspace_id     TEXT,
  conversation_id  TEXT NOT NULL,
  window_id        TEXT,
  origin           TEXT NOT NULL DEFAULT 'chat',
  speaker          TEXT NOT NULL CHECK (speaker IN ('person', 'agent')),
  text             TEXT NOT NULL,
  at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recorded_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  search           TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', coalesce(text, ''))) STORED
);

CREATE INDEX IF NOT EXISTS idx_agent_turns_owner
  ON agent_turns (user_id, agent_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_turns_conversation
  ON agent_turns (user_id, conversation_id, at, id);
CREATE INDEX IF NOT EXISTS idx_agent_turns_recent
  ON agent_turns (user_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_turns_search
  ON agent_turns USING GIN (search);

COMMIT;
