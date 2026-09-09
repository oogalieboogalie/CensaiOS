const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  owner_kind TEXT NOT NULL DEFAULT 'agent' CHECK (owner_kind IN ('user', 'agent', 'system')),
  owner_id TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'workspace' CHECK (visibility IN ('private', 'workspace', 'organization', 'public')),
  artifact_type TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_ref JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_artifacts_workspace_type ON artifacts (workspace_id, artifact_type, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_artifacts_owner ON artifacts (owner_kind, owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_artifacts_visibility ON artifacts (workspace_id, visibility);
CREATE INDEX IF NOT EXISTS idx_artifacts_data_gin ON artifacts USING GIN (data);
CREATE INDEX IF NOT EXISTS idx_artifacts_metadata_gin ON artifacts USING GIN (metadata);
CREATE INDEX IF NOT EXISTS idx_artifacts_source_ref_gin ON artifacts USING GIN (source_ref);
CREATE TABLE IF NOT EXISTS workspace_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor_kind TEXT NOT NULL DEFAULT 'agent' CHECK (actor_kind IN ('user', 'agent', 'system')),
  actor_id TEXT NOT NULL,
  artifact_id UUID REFERENCES artifacts(id) ON DELETE SET NULL,
  relationship_id UUID,
  correlation_id UUID,
  causation_event_id UUID REFERENCES workspace_events(id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_workspace_events_workspace_time ON workspace_events (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workspace_events_type ON workspace_events (workspace_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workspace_events_artifact ON workspace_events (artifact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workspace_events_correlation ON workspace_events (correlation_id);
CREATE INDEX IF NOT EXISTS idx_workspace_events_payload_gin ON workspace_events USING GIN (payload);
CREATE TABLE IF NOT EXISTS relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  source_artifact_id UUID NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  target_artifact_id UUID NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL,
  strength REAL NOT NULL DEFAULT 1.0 CHECK (strength >= 0 AND strength <= 1),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_event_id UUID REFERENCES workspace_events(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_relationships_source ON relationships (source_artifact_id, relationship_type);
CREATE INDEX IF NOT EXISTS idx_relationships_target ON relationships (target_artifact_id, relationship_type);
CREATE INDEX IF NOT EXISTS idx_relationships_workspace_type ON relationships (workspace_id, relationship_type, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_relationships_active_unique
  ON relationships (source_artifact_id, target_artifact_id, relationship_type)
  WHERE ended_at IS NULL;

/**
 * MLOps ARTIFACT TYPES:
 * - ml_model_deployment: Represents a deployed model with its baseline distributions.
 * - ml_drift_alert: Triggered when drift exceeds thresholds.
 *
 * MLOps EVENT TYPES:
 * - ml.telemetry_ingested: Recorded when new inference data is processed.
 * - ml.drift_detected: Recorded when a drift alert is created.
 * - ml.retraining_triggered: Recorded when an automated or manual retraining starts.
 */
`;

let ensured = false;

export async function ensureOperationalIntelligenceSchema(db) {
  if (ensured) return;
  await db.query(SCHEMA_SQL);
  ensured = true;
}
