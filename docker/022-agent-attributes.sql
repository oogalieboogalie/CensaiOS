-- ═══════════════════════════════════════════════════════════════════
--  PERSONA ATTRIBUTES TABLE
--  Stores dynamic madlib attributes that can be equipped by agents.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS attributes (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  description  TEXT,
  value        TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_attributes (
  agent_id     TEXT NOT NULL,
  attribute_id TEXT NOT NULL REFERENCES attributes(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (agent_id, attribute_id)
);

-- Seed initial attributes
INSERT INTO attributes (id, name, description, value) VALUES
  ('meticulous', 'Meticulous', 'Double-checks all code changes and verifies edge cases carefully.', 'extremely meticulous, double-checking all code changes and verifying edge cases carefully'),
  ('friendly',   'Friendly',   'Warm, encouraging, and friendly in all communications.', 'warm, helpful, and highly friendly'),
  ('impatient',  'Impatient',  'Fast-paced, direct, and slightly impatient, prioritizing speed.', 'fast-paced, direct, and slightly impatient, prioritizing speed'),
  ('creative',   'Creative',   'Suggests non-obvious, out-of-the-box approaches.', 'highly creative and out-of-the-box'),
  ('technical',  'Technical',  'Deeply technical and low-magic, referencing code structures and exact parameters.', 'deeply technical and low-magic, referencing code structures and exact parameters'),
  ('concise',    'Concise',    'Highly brief, avoiding filler words and summarizing key points.', 'brief, highly concise, and avoiding filler words')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  value = EXCLUDED.value,
  updated_at = NOW();
