import pool from '../db.js';

const POLICY_SCHEMA_SQL = `
-- ═══════════════════════════════════════════════════════════════════
--  POLICY AND EVIDENCE FRAMEWORK
--  Unified security gates as code and immutable evidence trails.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  provider TEXT NOT NULL DEFAULT 'global' CHECK (provider IN ('global', 'aws', 'azure', 'gcp', 'kubernetes')),
  rego_code TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS policy_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID REFERENCES policies(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_kind TEXT NOT NULL DEFAULT 'agent',
  resource_id TEXT,
  input_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  decision TEXT NOT NULL CHECK (decision IN ('allow', 'deny', 'manual_approval_required')),
  evidence_artifact_id UUID REFERENCES artifacts(id) ON DELETE SET NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_policy_evaluations_policy ON policy_evaluations (policy_id);
CREATE INDEX IF NOT EXISTS idx_policy_evaluations_actor ON policy_evaluations (actor_id, actor_kind);
CREATE INDEX IF NOT EXISTS idx_policy_evaluations_decision ON policy_evaluations (decision);

-- Seed basic policies
INSERT INTO policies (name, description, provider, rego_code) VALUES
('prevent-unauthorized-writes', 'Restrict filesystem writes to specific directories', 'global', 'package authz\ndefault allow = false\nallow { input.path == "/app/scratch" }'),
('cloud-resource-limit', 'Limit cloud resource creation cost', 'aws', 'package cloud\ndefault allow = true\ndeny { input.cost > 100 }')
ON CONFLICT (name) DO NOTHING;
`;

export async function ensurePolicySchema() {
  await pool.query(POLICY_SCHEMA_SQL);
}
