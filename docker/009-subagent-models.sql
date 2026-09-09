-- ═══════════════════════════════════════════════════════════════════
--  SUB-AGENT MODEL ROUTING
--  Adds per-sub-agent model selection so nano/worker/reviewer tiers
--  route to different backends (Ollama local vs cloud, etc).
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE sub_agents
  ADD COLUMN IF NOT EXISTS model_provider TEXT,
  ADD COLUMN IF NOT EXISTS model_name    TEXT;

-- Index for quick lookup by parent + model
CREATE INDEX IF NOT EXISTS idx_sub_agents_model ON sub_agents(parent_id, model_provider, model_name);
