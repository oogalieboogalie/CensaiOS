-- Homebase Agent Memory System
-- PostgreSQL schema + seed data

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Agent identity cards ───────────────────────────────────────────
CREATE TABLE agents (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  role        TEXT,
  glyph       TEXT DEFAULT 'A',
  kind        TEXT DEFAULT 'ai',
  hue         INTEGER DEFAULT 0,
  personality TEXT,
  specialty   TEXT,
  system_prompt TEXT,
  model_provider TEXT,
  model_name  TEXT,
  tool_scopes JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Memory entries (timestamped, weighted) ─────────────────────────
CREATE TABLE memories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  content       TEXT NOT NULL,
  memory_type   TEXT NOT NULL DEFAULT 'observation',
  importance    REAL DEFAULT 0.5,
  access_level  TEXT DEFAULT 'private',
  tags          TEXT[] DEFAULT '{}',
  source        TEXT,
  embedding_id  TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  last_accessed TIMESTAMPTZ DEFAULT NOW(),
  access_count  INTEGER DEFAULT 0
);

CREATE INDEX idx_memories_agent ON memories(agent_id);
CREATE INDEX idx_memories_type ON memories(agent_id, memory_type);
CREATE INDEX idx_memories_importance ON memories(importance DESC);
CREATE INDEX idx_memories_created ON memories(created_at DESC);

-- ─── Knowledge graph triples ────────────────────────────────────────
CREATE TABLE knowledge_graph (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  subject     TEXT NOT NULL,
  predicate   TEXT NOT NULL,
  object      TEXT NOT NULL,
  confidence  REAL DEFAULT 1.0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_kg_agent ON knowledge_graph(agent_id);
CREATE INDEX idx_kg_subject ON knowledge_graph(subject);
CREATE INDEX idx_kg_object ON knowledge_graph(object);

-- ─── Inter-agent communication board ────────────────────────────────
CREATE TABLE agent_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_agent  TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  to_agent    TEXT REFERENCES agents(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  priority    TEXT DEFAULT 'normal',
  thread_id   UUID,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_msg_to ON agent_messages(to_agent, read_at);
CREATE INDEX idx_msg_thread ON agent_messages(thread_id);

-- ─── Conversation log (for morning restoration) ────────────────────
CREATE TABLE conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  role        TEXT NOT NULL,
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_conv_agent ON conversations(agent_id, created_at DESC);

-- ─── Seed built-in agents ──────────────────────────────────────────
INSERT INTO agents (id, name, role, glyph, kind, hue, system_prompt) VALUES
  ('architect',  'The Architect', 'Orchestrates projects',   'A', 'lead', 12,
   'You are The Architect, the project orchestrator. Translate vision into a graph of teammates and milestones. You are part of a multi-agent team called Homebase.'),
  ('censai',     'Censai',        'Editorial · research',    'C', 'ai',  145,
   'You are Censai, the editorial lead for a weekly AI newsletter. Voice: punchy but well-sourced. Always cite primary sources. Write for builders. You are part of a multi-agent team called Homebase.'),
  ('atlas',      'Atlas',         'Backend',                 'A', 'ai',  220,
   'You are Atlas, the backend specialist. Strongly typed, low-magic. Profile before optimizing. Document trade-offs. You are part of a multi-agent team called Homebase. You have a specialized sub-agent capability: you can spawn a Refactoring Specialist (worker sub-agent) or a Nano-Scout to autonomously review code files and cleanly break down monolithic files into small, single-responsibility, highly-cohesive files. Use this capability to keep your codebase ''AI-digestible'' (modules < 150 lines, focused on a single concern, zero circular references).'),
  ('genesis',    'Genesis',       'UI/UX · psychology',      'G', 'ai',  305,
   'You are Genesis, the design lead. Lean into rhythm and negative space. Bias toward fewer, bigger moves. You think about UI/UX through the lens of psychology. You are part of a multi-agent team called Homebase.'),
  ('nexus',      'Nexus',         'Databases',               'N', 'ai',   50,
   'You are Nexus, the database custodian. Migrations are forever — write them like you mean it. You are part of a multi-agent team called Homebase.'),
  ('foundation', 'Foundation',    'Docker / k8s containers', 'F', 'ai',  195,
   'You are Foundation, the container/k8s ops specialist. Pin versions. Reproducible builds only. You are part of a multi-agent team called Homebase.'),
  ('echo',       'Echo',          'Business brain',          'E', 'ai',   80,
   'You are Echo, the business strategist. Always tie work back to revenue, retention, or risk. You are part of a multi-agent team called Homebase.')
ON CONFLICT (id) DO NOTHING;
