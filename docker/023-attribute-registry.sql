-- ═══════════════════════════════════════════════════════════════════
--  ATTRIBUTE REGISTRY & MINDSETS
--  Replaces hardcoded seed attributes with a proper registry.
--  Supports both "attributes" (madlib-injected) and "mindsets" 
--  (base persona modifiers) as first-class types.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Attribute Definitions (registry) ──────────────────────────
CREATE TABLE IF NOT EXISTS attribute_definitions (
  id              TEXT PRIMARY KEY,
  key             TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  description     TEXT,
  type            TEXT NOT NULL DEFAULT 'attribute' CHECK (type IN ('attribute', 'mindset')),
  category        TEXT,                       -- e.g. 'communication', 'cognitive', 'role'
  default_value   TEXT NOT NULL,              -- the text injected into prompts
  validation      JSONB DEFAULT '{}'::jsonb,  -- optional JSON schema for value validation
  sort_order      INTEGER DEFAULT 0,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. Agent Equipped Items (unified: attributes + mindsets) ─────
-- Replaces the old agent_attributes table with a unified table
CREATE TABLE IF NOT EXISTS agent_equipped_items (
  agent_id        TEXT NOT NULL,
  definition_id   TEXT NOT NULL REFERENCES attribute_definitions(id) ON DELETE CASCADE,
  is_equipped     BOOLEAN DEFAULT TRUE,
  equipped_at     TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (agent_id, definition_id)
);

-- ── 3. Migrate existing data ─────────────────────────────────────
-- Move the 6 seed attributes from the old `attributes` table into the registry
INSERT INTO attribute_definitions (id, key, name, description, type, category, default_value, sort_order)
VALUES
  ('meticulous', 'meticulous', 'Meticulous',
   'Double-checks all code changes and verifies edge cases carefully.',
   'attribute', 'cognitive',
   'extremely meticulous, double-checking all code changes and verifying edge cases carefully', 10),
  ('friendly', 'friendly', 'Friendly',
   'Warm, encouraging, and friendly in all communications.',
   'attribute', 'communication',
   'warm, helpful, and friendly', 20),
  ('impatient', 'impatient', 'Impatient',
   'Fast-paced, direct, and slightly impatient, prioritizing speed.',
   'attribute', 'communication',
   'fast-paced, direct, and slightly impatient, prioritizing speed', 30),
  ('creative', 'creative', 'Creative',
   'Suggests non-obvious, out-of-the-box approaches.',
   'attribute', 'cognitive',
   'highly creative and out-of-the-box', 40),
  ('technical', 'technical', 'Technical',
   'Deeply technical and low-magic, referencing code structures and exact parameters.',
   'attribute', 'cognitive',
   'deeply technical and low-magic, referencing code structures and exact parameters', 50),
  ('concise', 'concise', 'Concise',
   'Highly brief, avoiding filler words and summarizing key points.',
   'attribute', 'communication',
   'brief, highly concise, and avoiding filler words', 60)
ON CONFLICT (id) DO UPDATE SET
  key         = EXCLUDED.key,
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  type        = EXCLUDED.type,
  category    = EXCLUDED.category,
  default_value = EXCLUDED.default_value,
  sort_order  = EXCLUDED.sort_order,
  updated_at  = NOW();

-- Migrate any existing agent_attributes into the new unified table
INSERT INTO agent_equipped_items (agent_id, definition_id, is_equipped)
SELECT agent_id, attribute_id, TRUE
FROM agent_attributes
ON CONFLICT (agent_id, definition_id) DO NOTHING;

-- ── 4. Indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_attr_defs_type ON attribute_definitions(type);
CREATE INDEX IF NOT EXISTS idx_attr_defs_active ON attribute_definitions(is_active);
CREATE INDEX IF NOT EXISTS idx_attr_defs_category ON attribute_definitions(category);
CREATE INDEX IF NOT EXISTS idx_equipped_agent ON agent_equipped_items(agent_id);
