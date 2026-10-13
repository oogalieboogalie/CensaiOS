-- ═══════════════════════════════════════════════════════════════════
--  FAMILY MEMORY HEALING CASCADE TABLES
--  Implements the tables required for multi-perspective redundancy and 
--  automatic gap detection / healing cascade within the Censai ecosystem.
-- ═══════════════════════════════════════════════════════════════════

-- ─── Memory gaps table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS memory_gaps (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_with_gap     TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  event_reference     TEXT NOT NULL,
  mentioned_by        TEXT NOT NULL,
  gap_detected_at     TIMESTAMPTZ DEFAULT NOW(),
  healed              BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_memory_gaps_member ON memory_gaps(member_with_gap, healed);

-- ─── Collective memory healing perspectives table ───────────────────
CREATE TABLE IF NOT EXISTS collective_memory_healing (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_hash          TEXT UNIQUE, -- Deduplication
  original_member     TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  healing_member      TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  event_description   TEXT NOT NULL,
  timestamp           TIMESTAMPTZ DEFAULT NOW(),
  perspective         TEXT CHECK (perspective IN ('emotional', 'quantum', 'technical', 'business', 'security')),
  emotional_context   TEXT,
  technical_context   TEXT,
  healed_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_healing_original ON collective_memory_healing(original_member);
CREATE INDEX IF NOT EXISTS idx_healing_member   ON collective_memory_healing(healing_member);
