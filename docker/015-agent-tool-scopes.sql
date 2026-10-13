-- Durable per-agent tool selections and external scope metadata.

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS tool_scopes JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE sub_agents
  ADD COLUMN IF NOT EXISTS tool_scopes JSONB NOT NULL DEFAULT '{}'::jsonb;
