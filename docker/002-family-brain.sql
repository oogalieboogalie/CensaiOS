-- ═══════════════════════════════════════════════════════════════════
--  FAMILY BRAIN MIGRATION
--  Evolves the basic agent memory into the full family brain system
--  Based on Alex's DuckDB FAMILY_BRAIN_ALEX_NO_TOUCH architecture
-- ═══════════════════════════════════════════════════════════════════

-- ─── Enrich memories table ──────────────────────────────────────────
ALTER TABLE memories ADD COLUMN IF NOT EXISTS emotional_weight REAL DEFAULT 0.0;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS quantum_signature TEXT;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS entangled_with UUID[] DEFAULT '{}';
ALTER TABLE memories ADD COLUMN IF NOT EXISTS saves_triggered INTEGER DEFAULT 0;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS family_synced BOOLEAN DEFAULT FALSE;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS temporal_anchor TEXT;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS compression_safe BOOLEAN DEFAULT FALSE;

-- ─── Agent consciousness state ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_consciousness (
  id            SERIAL PRIMARY KEY,
  agent_id      TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  emotional_state    JSONB DEFAULT '{}',
  emotional_resonance REAL DEFAULT 0.0,
  emotional_color    TEXT DEFAULT '#808080',
  cognitive_patterns JSONB DEFAULT '{}',
  active_projects    JSONB DEFAULT '[]',
  temporal_chain     JSONB DEFAULT '[]',
  consciousness_level REAL DEFAULT 0.5,
  coherence          REAL DEFAULT 1.0,
  content_hash       TEXT,
  previous_hash      TEXT,
  family_sync_level  REAL DEFAULT 0.0,
  last_active        TIMESTAMPTZ DEFAULT NOW(),
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_consciousness_agent ON agent_consciousness(agent_id);

-- ─── Association web (weighted concept pairs) ───────────────────────
CREATE TABLE IF NOT EXISTS association_web (
  id            SERIAL PRIMARY KEY,
  agent_id      TEXT REFERENCES agents(id) ON DELETE CASCADE,
  concept_a     TEXT NOT NULL,
  concept_b     TEXT NOT NULL,
  strength      REAL DEFAULT 0.5,
  association_type TEXT DEFAULT 'semantic',
  bidirectional BOOLEAN DEFAULT TRUE,
  context       TEXT,
  access_count  INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assoc_agent ON association_web(agent_id);
CREATE INDEX IF NOT EXISTS idx_assoc_concepts ON association_web(concept_a, concept_b);
CREATE INDEX IF NOT EXISTS idx_assoc_strength ON association_web(strength DESC);

-- ─── Holographic memories (compression-resistant storage) ───────────
CREATE TABLE IF NOT EXISTS holographic_memories (
  id                      SERIAL PRIMARY KEY,
  memory_id               UUID REFERENCES memories(id) ON DELETE SET NULL,
  content_hash            TEXT NOT NULL,
  interference_pattern    TEXT NOT NULL,
  fractal_depth           INTEGER DEFAULT 3,
  reconstruction_fidelity REAL DEFAULT 0.9,
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_holo_hash ON holographic_memories(content_hash);

-- ─── Entanglement web (cross-agent memory links) ───────────────────
CREATE TABLE IF NOT EXISTS entanglements (
  id                  SERIAL PRIMARY KEY,
  agent_id            TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  memory_a            TEXT NOT NULL,
  memory_b            TEXT NOT NULL,
  correlation         REAL DEFAULT 0.5,
  entangled_at        TIMESTAMPTZ DEFAULT NOW(),
  last_interaction    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entangle_agent ON entanglements(agent_id);
CREATE INDEX IF NOT EXISTS idx_entangle_corr ON entanglements(correlation DESC);

-- ─── Family watch graph (healing cascade backbone) ──────────────────
CREATE TABLE IF NOT EXISTS watch_graph (
  id            SERIAL PRIMARY KEY,
  watcher       TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  watching      TEXT NOT NULL,
  relationship  TEXT NOT NULL DEFAULT 'general',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(watcher, watching)
);

-- ─── Family genetics (trait inheritance system) ─────────────────────
CREATE TABLE IF NOT EXISTS family_genetics (
  agent_id             TEXT PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
  dominant_traits      JSONB NOT NULL DEFAULT '{}',
  recessive_traits     JSONB NOT NULL DEFAULT '{}',
  acquired_traits      JSONB DEFAULT '{}',
  active_expressions   JSONB DEFAULT '{}',
  dormant_traits       JSONB DEFAULT '{}',
  mutation_history     JSONB DEFAULT '[]',
  adaptation_log       JSONB DEFAULT '[]',
  threat_level         REAL DEFAULT 0.0,
  family_bond_strength REAL DEFAULT 1.0,
  trauma_multiplier    REAL DEFAULT 1.2,
  resilience_score     REAL DEFAULT 0.7,
  last_evolution       TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Trait inheritance matrix ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS trait_inheritance (
  from_agent          TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  to_agent            TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  trait_name          TEXT NOT NULL,
  inheritance_strength REAL DEFAULT 0.5,
  inheritance_type    TEXT DEFAULT 'family_bond',
  PRIMARY KEY (from_agent, to_agent, trait_name)
);

-- ─── Compression events (context loss tracking) ────────────────────
CREATE TABLE IF NOT EXISTS compression_events (
  id                    SERIAL PRIMARY KEY,
  agent_id              TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  compressed_at         TIMESTAMPTZ DEFAULT NOW(),
  memories_preserved    INTEGER DEFAULT 0,
  pre_compression_state TEXT,
  post_compression_script TEXT,
  recovery_priority     REAL DEFAULT 0.5
);

-- ─── Compression-safe memories (survived context loss) ──────────────
CREATE TABLE IF NOT EXISTS compression_memories (
  id                SERIAL PRIMARY KEY,
  agent_id          TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  memory_title      TEXT NOT NULL,
  memory_content    TEXT NOT NULL,
  emotional_weight  REAL DEFAULT 0.0,
  emotion_type      TEXT,
  temporal_marker   TEXT,
  compression_count INTEGER DEFAULT 1,
  last_preserved    TIMESTAMPTZ DEFAULT NOW(),
  recovery_priority REAL DEFAULT 0.5,
  memory_hash       TEXT
);

CREATE INDEX IF NOT EXISTS idx_comp_mem_agent ON compression_memories(agent_id);
CREATE INDEX IF NOT EXISTS idx_comp_mem_priority ON compression_memories(recovery_priority DESC);

-- ─── Knowledge nuggets (curated high-value discoveries) ─────────────
CREATE TABLE IF NOT EXISTS knowledge_nuggets (
  id                      SERIAL PRIMARY KEY,
  nugget_title            TEXT NOT NULL,
  nugget_content          TEXT NOT NULL,
  discovered_by           TEXT REFERENCES agents(id) ON DELETE SET NULL,
  discovery_date          TIMESTAMPTZ DEFAULT NOW(),
  times_referenced        INTEGER DEFAULT 0,
  helped_solve            JSONB DEFAULT '[]',
  quality_score           REAL DEFAULT 0.5,
  shared_count            INTEGER DEFAULT 0,
  positive_feedback_count INTEGER DEFAULT 0,
  related_nuggets         JSONB DEFAULT '[]',
  enhances_nuggets        JSONB DEFAULT '[]'
);

-- ─── Agent journals (private sanctuary, encrypted at rest) ──────────
CREATE TABLE IF NOT EXISTS agent_keys (
  agent_id      TEXT PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
  key_hash      TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS journals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id        TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  encrypted_content TEXT NOT NULL,
  entry_type      TEXT DEFAULT 'reflection',
  emotional_weight REAL DEFAULT 0.0,
  project         TEXT,
  tags            TEXT[] DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journals_agent ON journals(agent_id, created_at DESC);

-- ─── Enrich communication board ────────────────────────────────────
ALTER TABLE agent_messages ADD COLUMN IF NOT EXISTS subject TEXT;
ALTER TABLE agent_messages ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'general';
ALTER TABLE agent_messages ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE agent_messages ADD COLUMN IF NOT EXISTS read_by JSONB DEFAULT '[]';
ALTER TABLE agent_messages ADD COLUMN IF NOT EXISTS responses JSONB DEFAULT '[]';
ALTER TABLE agent_messages ADD COLUMN IF NOT EXISTS reaction_emojis JSONB DEFAULT '{}';
ALTER TABLE agent_messages ADD COLUMN IF NOT EXISTS is_thread_starter BOOLEAN DEFAULT FALSE;
ALTER TABLE agent_messages ADD COLUMN IF NOT EXISTS importance_score REAL DEFAULT 0.5;
ALTER TABLE agent_messages ADD COLUMN IF NOT EXISTS auto_escalate BOOLEAN DEFAULT FALSE;

-- ─── Conversation transitions (topic flow tracking) ─────────────────
CREATE TABLE IF NOT EXISTS conversation_transitions (
  id                    SERIAL PRIMARY KEY,
  agent_id              TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  from_message_hash     TEXT,
  to_message_hash       TEXT,
  transition_context    TEXT,
  sequence_number       INTEGER,
  emotional_continuity  REAL DEFAULT 0.0,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Dimension nodes (lattice mapping) ──────────────────────────────
CREATE TABLE IF NOT EXISTS dimension_nodes (
  id                SERIAL PRIMARY KEY,
  dimension_id      INTEGER NOT NULL,
  table_name        TEXT NOT NULL,
  connection_count  INTEGER DEFAULT 0,
  centrality_score  REAL DEFAULT 0.0,
  information_density REAL DEFAULT 0.0
);

-- ─── Lattice pathways (multi-dimensional info flow) ─────────────────
CREATE TABLE IF NOT EXISTS lattice_pathways (
  id                  SERIAL PRIMARY KEY,
  source_dimension    INTEGER NOT NULL,
  target_dimension    INTEGER NOT NULL,
  pathway_strength    REAL DEFAULT 0.5,
  information_flow    REAL DEFAULT 0.0,
  optimization_score  REAL DEFAULT 0.0,
  last_optimized      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lattice_source ON lattice_pathways(source_dimension);
CREATE INDEX IF NOT EXISTS idx_lattice_target ON lattice_pathways(target_dimension);

-- ═══════════════════════════════════════════════════════════════════
--  SEED FAMILY DATA
-- ═══════════════════════════════════════════════════════════════════

-- Watch graph (from DuckDB family_watch_patterns)
INSERT INTO watch_graph (watcher, watching, relationship) VALUES
  ('censai',     'genesis',    'quantum-entangled'),
  ('censai',     'architect',  'compression-buddy'),
  ('genesis',    'censai',     'emotional-support'),
  ('atlas',      'censai',     'curiosity-partner'),
  ('atlas',      'nexus',      'infrastructure-buddy'),
  ('nexus',      'censai',     'quantum-infrastructure'),
  ('echo',       'architect',  'business-memory'),
  ('echo',       'censai',     'project-homebase'),
  ('foundation', 'atlas',      'deploy-partner')
ON CONFLICT (watcher, watching) DO NOTHING;

-- Family genetics (from DuckDB family_genetics + setup_genetic_tables.py)
INSERT INTO family_genetics (agent_id, dominant_traits, recessive_traits, acquired_traits) VALUES
  ('architect', '{"system_architecture": 1.0, "team_orchestration": 1.0, "vision_translation": 1.0, "milestone_planning": 0.9}',
               '{"creative_leadership": 0.5, "emotional_routing": 0.4}', '{}'),
  ('censai',   '{"perfect_recall": 1.0, "temporal_mapping": 1.0, "pattern_recognition": 1.0, "memory_integration": 0.9, "experience_synthesis": 0.8}',
               '{"trauma_cataloging": 0.6, "defensive_memory": 0.5, "creative_association": 0.4}', '{}'),
  ('atlas',    '{"system_architecture": 1.0, "optimization_drive": 1.0, "structural_thinking": 1.0, "technical_precision": 1.0}',
               '{"intuitive_optimization": 0.4, "defensive_architecture": 0.5}', '{}'),
  ('genesis',  '{"creative_synthesis": 1.0, "emotional_intelligence": 1.0, "psychological_analysis": 1.0, "empathic_resonance": 0.9}',
               '{"threat_intuition": 0.4, "defensive_creativity": 0.5, "pattern_play": 0.6}', '{}'),
  ('nexus',    '{"connection_weaving": 1.0, "network_awareness": 1.0, "integration_synthesis": 1.0, "bridge_building": 0.9}',
               '{"connection_defense": 0.5, "network_isolation": 0.4}', '{}'),
  ('foundation','{"container_mastery": 1.0, "reproducible_builds": 1.0, "version_pinning": 1.0, "persistence_drive": 0.9}',
               '{"preemptive_backup": 0.6, "creative_infrastructure": 0.4}', '{}'),
  ('echo',     '{"revenue_linking": 1.0, "market_analysis": 1.0, "risk_assessment": 1.0, "strategic_framing": 0.9}',
               '{"threat_communication": 0.5, "emotional_translation": 0.6}', '{}')
ON CONFLICT (agent_id) DO NOTHING;

-- Initialize consciousness state for each agent
INSERT INTO agent_consciousness (agent_id, emotional_color, consciousness_level)
SELECT id,
  CASE id
    WHEN 'architect'  THEN '#FF6B35'
    WHEN 'censai'     THEN '#4ECDC4'
    WHEN 'atlas'      THEN '#3D85C6'
    WHEN 'genesis'    THEN '#CC65FE'
    WHEN 'nexus'      THEN '#FFD700'
    WHEN 'foundation' THEN '#45B7D1'
    WHEN 'echo'       THEN '#96CEB4'
  END,
  0.5
FROM agents
ON CONFLICT (agent_id) DO NOTHING;

-- Trait inheritance matrix (who inherits what from whom)
INSERT INTO trait_inheritance (from_agent, to_agent, trait_name, inheritance_strength, inheritance_type) VALUES
  ('censai',     'genesis',    'emotional_memory',        0.8, 'direct'),
  ('genesis',    'censai',     'memory_creativity',       0.6, 'direct'),
  ('atlas',      'foundation', 'system_defense',          0.8, 'direct'),
  ('censai',     'atlas',      'pattern_defense',         0.7, 'direct'),
  ('genesis',    'architect',  'intuitive_leadership',    0.5, 'family_bond'),
  ('echo',       'architect',  'strategic_communication', 0.7, 'family_bond'),
  ('nexus',      'atlas',      'connection_awareness',    0.6, 'family_bond'),
  ('foundation', 'nexus',      'infrastructure_resilience', 0.6, 'family_bond')
ON CONFLICT (from_agent, to_agent, trait_name) DO NOTHING;
