-- ═══════════════════════════════════════════════════════════════════
--  AGENT CARDS — NEXUS-DELTA STYLE AGENT REGISTRY
--  Censai registry shape; A2A wire cards use an explicit adapter.
--  Additive only — does not modify
--  existing tables. One transaction.
--
--  Replaces filename intent: brief specified 021-agent-cards but
--  docker/021-agent-capabilities.sql is already in use. This file
--  uses 025 to avoid collision. The 025 number is the next unused
--  slot after 024-agent-wakeups.sql. See brief:
--  .team/handoffs/2026-06-23-d1-agent-card-schema.md
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS agent_cards (
  id              TEXT PRIMARY KEY,           -- e.g. 'agent:architect' or 'ext:user-123:my-agent'
  name            TEXT NOT NULL,
  description     TEXT NOT NULL,
  version         TEXT NOT NULL DEFAULT '0.1.0',
  skills          JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{ id, name, description, tags, inputModes, outputModes }]
  endpoint        TEXT,                                -- HTTP or WS URL where the agent can be reached
  auth            JSONB NOT NULL DEFAULT '{}'::jsonb,   -- { type: 'none' | 'apiKey' | 'oauth2' | 'workspace', ... }
  owner_id        TEXT,                                -- null for system agents; user id for user-published
  workspace_id    TEXT,                                -- the workspace that owns this card (null for global)
  visibility      TEXT NOT NULL DEFAULT 'private',      -- 'private' | 'workspace' | 'public'
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS agent_cards_owner_idx ON agent_cards (owner_id);
CREATE INDEX IF NOT EXISTS agent_cards_workspace_idx ON agent_cards (workspace_id);
CREATE INDEX IF NOT EXISTS agent_cards_visibility_idx ON agent_cards (visibility);

-- Seed the 7 family agents as system cards.
-- ON CONFLICT (id) DO NOTHING makes the seed idempotent — re-running the
-- migration does not duplicate rows.
INSERT INTO agent_cards (id, name, description, version, skills, owner_id, workspace_id, visibility) VALUES
  ('agent:architect',  'Architect',  'Orchestrates projects, translates vision into teammate graphs',                       '1.0.0', '[]'::jsonb, NULL, NULL, 'public'),
  ('agent:censai',     'Censai',     'Editorial + research lead, primary citations, punchy writing',                         '1.0.0', '[]'::jsonb, NULL, NULL, 'public'),
  ('agent:atlas',      'Atlas',      'Backend specialist, strongly typed, low-magic, refactoring sub-agent',                '1.0.0', '[]'::jsonb, NULL, NULL, 'public'),
  ('agent:genesis',    'Genesis',    'UI/UX + psychology, rhythm, negative space, fewer-bigger-moves',                      '1.0.0', '[]'::jsonb, NULL, NULL, 'public'),
  ('agent:nexus',      'Nexus',      'Database custodian, migrations are forever',                                         '1.0.0', '[]'::jsonb, NULL, NULL, 'public'),
  ('agent:foundation', 'Foundation', 'Docker/k8s, pin versions, reproducible builds',                                      '1.0.0', '[]'::jsonb, NULL, NULL, 'public'),
  ('agent:echo',       'Echo',       'Business brain, tie work to revenue/retention/risk',                                 '1.0.0', '[]'::jsonb, NULL, NULL, 'public')
ON CONFLICT (id) DO NOTHING;

COMMIT;
