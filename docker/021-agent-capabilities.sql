-- ═══════════════════════════════════════════════════════════════════
--  EXOSKELETON AGENT CAPABILITIES TABLE
--  Maps visual exoskeleton slots and permissions to LLM tools.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS agent_capabilities (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id       TEXT NOT NULL,
  capability_id  TEXT NOT NULL,
  mode           TEXT NOT NULL DEFAULT 'read',
  scope_type     TEXT NOT NULL DEFAULT 'workspace',
  scope_id       TEXT,
  source         TEXT NOT NULL DEFAULT 'manual',
  equipped_slot  TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Unique index to prevent duplicate capabilities for an agent/slot
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_capabilities_uniq ON agent_capabilities (
  agent_id,
  capability_id,
  scope_type,
  (COALESCE(scope_id, '')),
  (COALESCE(equipped_slot, ''))
);
