-- Workspace ownership for every mutable store that can enter agent prompt memory.
DO $$
DECLARE
  memory_table TEXT;
BEGIN
  FOREACH memory_table IN ARRAY ARRAY[
    'memories', 'conversations', 'journals', 'knowledge_graph', 'knowledge_nuggets',
    'association_web', 'compression_memories', 'compression_events',
    'agent_consciousness', 'conversation_transitions', 'entanglements',
    'memory_gaps', 'collective_memory_healing'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS workspace_id TEXT', memory_table);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER', memory_table);

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = memory_table || '_workspace_id_fkey'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE',
        memory_table, memory_table || '_workspace_id_fkey'
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = memory_table || '_created_by_user_id_fkey'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL',
        memory_table, memory_table || '_created_by_user_id_fkey'
      );
    END IF;

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %I (workspace_id, created_by_user_id)',
      'idx_' || memory_table || '_tenancy', memory_table
    );
  END LOOP;
END $$;

DROP INDEX IF EXISTS idx_consciousness_agent;
CREATE UNIQUE INDEX IF NOT EXISTS idx_consciousness_workspace_agent
  ON agent_consciousness (workspace_id, agent_id) WHERE workspace_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_consciousness_legacy_agent
  ON agent_consciousness (agent_id) WHERE workspace_id IS NULL;

CREATE TABLE IF NOT EXISTS journal_key_scopes (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL,
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_memories_workspace_agent
  ON memories (workspace_id, agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_workspace_agent
  ON conversations (workspace_id, agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_journals_workspace_agent
  ON journals (workspace_id, agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_graph_workspace_agent
  ON knowledge_graph (workspace_id, agent_id, created_at DESC);
