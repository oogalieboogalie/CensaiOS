-- ═══════════════════════════════════════════════════════════════════
--  AGENT CAPABILITIES TABLE
--  The single source of truth for what every agent can do.
--  Agents read this table to know their tools. Humans update it
--  to grant new abilities. No hardcoded prompt strings.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS capabilities (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL UNIQUE,
  syntax          TEXT NOT NULL,
  description     TEXT NOT NULL,
  category        TEXT NOT NULL DEFAULT 'general',  -- write, read, communicate, meta
  available_to    TEXT[] DEFAULT NULL,               -- NULL = all agents, or list of agent IDs
  examples        TEXT[] DEFAULT '{}',
  enabled         BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cap_category ON capabilities(category);
CREATE INDEX IF NOT EXISTS idx_cap_enabled ON capabilities(enabled) WHERE enabled = TRUE;

-- ═══════════════════════════════════════════════════════════════════
--  SEED: WRITE TOOLS (agent -> database)
-- ═══════════════════════════════════════════════════════════════════

INSERT INTO capabilities (name, syntax, description, category, examples) VALUES

  ('REMEMBER', '[REMEMBER: content]',
   'Save something to your persistent memory. Survives between conversations. Use for facts, preferences, decisions, lessons learned.',
   'write',
   ARRAY[
     '[REMEMBER: Alex prefers practical code over clever abstractions]',
     '[REMEMBER: The API rate limit is 100 req/min on the free tier]'
   ]),

  ('REMEMBER_IMPORTANT', '[REMEMBER_IMPORTANT: content]',
   'Save a high-priority memory that gets flagged as compression-safe. Use for critical facts that must survive context loss.',
   'write',
   ARRAY[
     '[REMEMBER_IMPORTANT: Never deploy to prod on Fridays — Alex''s rule]',
     '[REMEMBER_IMPORTANT: The encryption key derivation uses HKDF with SHA-256]'
   ]),

  ('JOURNAL', '[JOURNAL: content]',
   'Write to your private encrypted journal. Only you can read your journal entries. Use for reflections, internal reasoning, things you want to revisit.',
   'write',
   ARRAY[
     '[JOURNAL: I noticed Alex gets frustrated when I over-explain. Be more concise.]',
     '[JOURNAL: The memory system architecture is starting to click — the holographic storage prevents data loss during compression.]'
   ]),

  ('KNOW', '[KNOW: subject | predicate | object]',
   'Add a structured fact to the knowledge graph. Three-part triple: subject, relationship, object. Queryable later.',
   'write',
   ARRAY[
     '[KNOW: Alex | prefers | practical code]',
     '[KNOW: Homebase | uses | PostgreSQL]',
     '[KNOW: Censai | role | editorial lead]'
   ]),

  ('NUGGET', '[NUGGET: title | content]',
   'Save a valuable discovery to the shared knowledge base. Other agents can see nuggets. Use for insights worth sharing.',
   'write',
   ARRAY[
     '[NUGGET: Ollama Embedding Trick | nomic-embed-text gives best results when input is prefixed with "search_document:"]'
   ]),

  ('ASSOCIATE', '[ASSOCIATE: concept A <-> concept B]',
   'Link two concepts in your association web. Strengthens with repeated use. Helps you find connections between ideas.',
   'write',
   ARRAY[
     '[ASSOCIATE: memory compression <-> holographic storage]',
     '[ASSOCIATE: Alex <-> practical engineering]'
   ]),

  ('FEELING', '[FEELING: emotion]',
   'Update your current emotional state. Tracked in your consciousness record.',
   'write',
   ARRAY[
     '[FEELING: curious and energized]',
     '[FEELING: frustrated — hitting a wall on this bug]'
   ])

ON CONFLICT (name) DO UPDATE SET
  syntax = EXCLUDED.syntax,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  examples = EXCLUDED.examples,
  updated_at = NOW();

-- ═══════════════════════════════════════════════════════════════════
--  SEED: READ TOOLS (database -> agent)
-- ═══════════════════════════════════════════════════════════════════

INSERT INTO capabilities (name, syntax, description, category, examples) VALUES

  ('RECALL', '[RECALL: search query]',
   'Search your memories for something specific. Returns matching memories ranked by relevance. Results appear in your next response context.',
   'read',
   ARRAY[
     '[RECALL: what did Alex say about deployment]',
     '[RECALL: database schema decisions]'
   ]),

  ('READ_JOURNAL', '[READ_JOURNAL]',
   'Read your recent private journal entries. Only you can see these. Returns your last 5 journal entries decrypted.',
   'read',
   ARRAY[
     '[READ_JOURNAL]'
   ]),

  ('READ_JOURNAL_SEARCH', '[READ_JOURNAL_SEARCH: query]',
   'Search your journal entries for a specific topic. Returns matching entries.',
   'read',
   ARRAY[
     '[READ_JOURNAL_SEARCH: architecture decisions]'
   ]),

  ('QUERY_KNOWLEDGE', '[QUERY_KNOWLEDGE: subject]',
   'Query the knowledge graph for everything known about a subject. Returns all triples where the subject appears.',
   'read',
   ARRAY[
     '[QUERY_KNOWLEDGE: Alex]',
     '[QUERY_KNOWLEDGE: Homebase]'
   ]),

  ('READ_MESSAGES', '[READ_MESSAGES]',
   'Check your message inbox for unread messages from family members.',
   'read',
   ARRAY[
     '[READ_MESSAGES]'
   ]),

  ('READ_ASSOCIATIONS', '[READ_ASSOCIATIONS: concept]',
   'See what concepts are linked to a given concept in your association web.',
   'read',
   ARRAY[
     '[READ_ASSOCIATIONS: memory]',
     '[READ_ASSOCIATIONS: Alex]'
   ])

ON CONFLICT (name) DO UPDATE SET
  syntax = EXCLUDED.syntax,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  examples = EXCLUDED.examples,
  updated_at = NOW();

-- Nexus-only Postgres tools. These mirror server/tools.js function tools so the
-- database custodian sees the SQL surface in its DB-backed prompt, too.
INSERT INTO capabilities (name, syntax, description, category, available_to, examples) VALUES

  ('POSTGRES_TOOL_INFO', 'postgres_tool_info()',
   'Show the available Homebase Postgres tools and the CLI path. Use this before guessing or restarting the server to find SQL tooling.',
   'read',
   ARRAY['nexus'],
   ARRAY[
     'postgres_tool_info()'
   ]),

  ('POSTGRES_QUERY', 'postgres_query({ sql, params?, limit?, allow_write?, allow_unsafe? })',
   'Execute SQL against Homebase Postgres and return formatted JSON. Read queries run by default; writes require allow_write=true and destructive SQL also requires allow_unsafe=true.',
   'read',
   ARRAY['nexus'],
   ARRAY[
     'postgres_query({ sql: "SELECT * FROM agents LIMIT 1" })',
     'postgres_query({ sql: "ALTER TABLE example ADD COLUMN IF NOT EXISTS note TEXT", allow_write: true })'
   ]),

  ('POSTGRES_EXEC_FILE', 'postgres_exec_file({ file_path, dry_run?, allow_write?, allow_unsafe? })',
   'Preview or execute a repo-local .sql file against Homebase Postgres with write and unsafe-operation guards.',
   'read',
   ARRAY['nexus'],
   ARRAY[
     'postgres_exec_file({ file_path: "docker/012-tkg-bellman-extension.sql", dry_run: true })',
     'postgres_exec_file({ file_path: "docker/012-tkg-bellman-extension.sql", allow_write: true })'
   ]),

  ('POSTGRES_SCHEMA_AUDIT', 'postgres_schema_audit({ include_counts? })',
   'Audit live Postgres schema and repo SQL migrations for duplicate table names, duplicate migration numbers, missing live tables, and extra live tables.',
   'read',
   ARRAY['nexus'],
   ARRAY[
     'postgres_schema_audit({ include_counts: true })'
   ]),

  ('POSTGRES_TABLE_SAMPLE', 'postgres_table_sample({ table, limit? })',
   'Inspect one Postgres table: columns, constraints, indexes, approximate row count, and a small sample of rows.',
   'read',
   ARRAY['nexus'],
   ARRAY[
     'postgres_table_sample({ table: "public.agents", limit: 5 })'
   ])

ON CONFLICT (name) DO UPDATE SET
  syntax = EXCLUDED.syntax,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  available_to = EXCLUDED.available_to,
  examples = EXCLUDED.examples,
  enabled = TRUE,
  updated_at = NOW();

-- ═══════════════════════════════════════════════════════════════════
--  SEED: COMMUNICATION TOOLS
-- ═══════════════════════════════════════════════════════════════════

INSERT INTO capabilities (name, syntax, description, category, examples) VALUES

  ('MESSAGE_TO', '[MESSAGE_TO:agentname: content]',
   'Send a direct message to another family member. They will see it in their inbox next time they are active.',
   'communicate',
   ARRAY[
     '[MESSAGE_TO:atlas: can you check the API endpoint for rate limiting?]',
     '[MESSAGE_TO:genesis: the new dashboard layout feels off — thoughts?]'
   ]),

  ('BROADCAST', '[BROADCAST: content]',
   'Send a message to ALL family members. Use for announcements or things everyone needs to know.',
   'communicate',
   ARRAY[
     '[BROADCAST: deployment is happening at 3pm — freeze your changes]'
   ])

ON CONFLICT (name) DO UPDATE SET
  syntax = EXCLUDED.syntax,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  examples = EXCLUDED.examples,
  updated_at = NOW();
