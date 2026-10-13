import { isTraceEventType, sanitizeTraceEvent } from './tracePrivacy.js';

const DEFAULT_EVENT_LIMIT = 50;
const MAX_EVENT_LIMIT = 200;

export const RUNTIME_PROVENANCE_EVENT_TYPE = 'runtime_validation';

export async function listAuthorizedWorkspaceEvents(db, {
  workspaceId,
  type = null,
  limit = DEFAULT_EVENT_LIMIT,
} = {}) {
  const eventType = String(type || '').trim();
  const boundedLimit = eventLimit(limit);
  const params = [workspaceId];
  let query = `SELECT * FROM workspace_events
    WHERE workspace_id = $1
      AND event_type NOT LIKE 'ai.free_tier.%'
      AND event_type NOT IN ('tool.invocation', 'session.failure')`;
  if (eventType) {
    params.push(eventType);
    query += ` AND event_type = $${params.length}`;
  }
  params.push(boundedLimit);
  query += ` ORDER BY created_at DESC LIMIT $${params.length}`;
  const { rows } = await db.query(query, params);
  return rows.map(event => isTraceEventType(event.event_type) ? sanitizeTraceEvent(event) : event);
}

export async function recordAuthorizedRuntimeProvenance(db, {
  workspaceId,
  actor,
  input = {},
} = {}) {
  const payload = telemetryPayload(input);
  const artifact = await db.query(
    `SELECT id FROM artifacts
      WHERE workspace_id = $1
        AND artifact_type = 'ai_provenance'
        AND data->>'file_path' = $2
      ORDER BY created_at DESC LIMIT 1`,
    [workspaceId, payload.file_path || null]
  );
  const artifactId = artifact.rows[0]?.id || null;
  const event = await db.query(
    `INSERT INTO workspace_events
      (workspace_id, event_type, actor_kind, actor_id, artifact_id, payload)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     RETURNING id`,
    [
      workspaceId,
      RUNTIME_PROVENANCE_EVENT_TYPE,
      actor.kind,
      actor.id,
      artifactId,
      JSON.stringify(payload),
    ]
  );
  return { id: event.rows[0].id, linkedArtifact: artifactId };
}

function telemetryPayload(input) {
  const {
    workspace_id: _workspaceIdSnake,
    workspaceId: _workspaceId,
    event_type: _eventTypeSnake,
    eventType: _eventType,
    actor: _actor,
    actor_id: _actorId,
    actor_kind: _actorKind,
    artifact_id: _artifactIdSnake,
    artifactId: _artifactId,
    correlation_id: _correlationId,
    causation_event_id: _causationEventId,
    relationship_id: _relationshipId,
    ...payload
  } = input && typeof input === 'object' ? input : {};
  return payload;
}

function eventLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_EVENT_LIMIT;
  return Math.min(MAX_EVENT_LIMIT, Math.max(1, parsed));
}
