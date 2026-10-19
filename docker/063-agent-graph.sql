-- ═══════════════════════════════════════════════════════════════════
--  AGENT MEMORY GRAPH — the time-aware knowledge graph.
--
--  agent_facts (056) remembers single values ("favorite color: green").
--  This adds the connections between things, and when each was true:
--
--    agent_entities    the people, companies, places and things an agent
--                      knows about (one row per name, per person, per agent)
--    agent_relations   a connection between two of them ("Alex works at
--                      Iowa AI LLC"), with the same two clocks as facts:
--                        valid_from / valid_to       when it was true
--                        recorded_at / superseded_at when the agent believed it
--                      Ending or replacing a connection never deletes the
--                      row, so "what was true on a date" can be answered.
--
--  Plain Postgres, per person (user_id) and per agent. Additive and
--  idempotent; applied at boot by server/agentMemory/schema.js.
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS agent_entities (
  id          BIGSERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id    TEXT NOT NULL,
  entity_key  TEXT NOT NULL,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'thing',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_entities_key
  ON agent_entities (user_id, agent_id, entity_key);

CREATE TABLE IF NOT EXISTS agent_relations (
  id             BIGSERIAL PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id       TEXT NOT NULL,
  from_id        BIGINT NOT NULL REFERENCES agent_entities(id) ON DELETE CASCADE,
  relation       TEXT NOT NULL,
  relation_key   TEXT NOT NULL,
  to_id          BIGINT NOT NULL REFERENCES agent_entities(id) ON DELETE CASCADE,
  valid_from     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_to       TIMESTAMPTZ,
  recorded_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  superseded_at  TIMESTAMPTZ,
  superseded_by  BIGINT REFERENCES agent_relations(id) ON DELETE SET NULL,
  change_kind    TEXT NOT NULL DEFAULT 'new' CHECK (change_kind IN ('new', 'ended', 'replaced')),
  source         TEXT NOT NULL DEFAULT 'agent',
  episode_id     BIGINT REFERENCES agent_episodes(id) ON DELETE SET NULL,
  CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

-- One open, believed row per connection.
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_relations_open
  ON agent_relations (user_id, agent_id, from_id, relation_key, to_id)
  WHERE superseded_at IS NULL AND valid_to IS NULL;
CREATE INDEX IF NOT EXISTS idx_agent_relations_when
  ON agent_relations (user_id, agent_id, valid_from, valid_to);
CREATE INDEX IF NOT EXISTS idx_agent_relations_to
  ON agent_relations (user_id, agent_id, to_id);

COMMIT;
