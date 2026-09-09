import { createArtifact } from './factories.js';
import { sanitizeTraceArtifact, sanitizeTraceEvent } from './tracePrivacy.js';

const DEFAULT_TRACE_LIMIT = 50;
const MAX_TRACE_LIMIT = 200;

export async function listAuthorizedTraces(db, {
  workspaceId,
  limit = DEFAULT_TRACE_LIMIT,
} = {}) {
  const { rows } = await db.query(
    `SELECT * FROM artifacts
      WHERE workspace_id = $1
        AND artifact_type = 'agent_session_trace'
        AND deleted_at IS NULL
      ORDER BY created_at DESC LIMIT $2`,
    [workspaceId, traceLimit(limit)]
  );
  return rows.map(sanitizeTraceArtifact);
}

export async function findAuthorizedTrace(db, { workspaceId, traceId } = {}) {
  const { rows } = await db.query(
    `SELECT * FROM artifacts
      WHERE id = $1
        AND workspace_id = $2
        AND artifact_type = 'agent_session_trace'
        AND deleted_at IS NULL
      LIMIT 1`,
    [traceId, workspaceId]
  );
  return rows[0] ? sanitizeTraceArtifact(rows[0]) : null;
}

export async function listAuthorizedTraceEvents(db, { workspaceId, traceId } = {}) {
  const { rows } = await db.query(
    `SELECT * FROM workspace_events
      WHERE artifact_id = $1 AND workspace_id = $2
      ORDER BY created_at ASC`,
    [traceId, workspaceId]
  );
  return rows.map(event => sanitizeTraceEvent(event, { strict: true }));
}

export async function convertAuthorizedTraceToTest(db, {
  workspaceId,
  trace,
  events,
} = {}) {
  const safeTrace = sanitizeTraceArtifact(trace);
  const safeEvents = events.map(event => sanitizeTraceEvent(event, { strict: true }));
  return createArtifact({ db }, {
    workspaceId,
    type: 'regression_test_case',
    title: `Regression Test: ${safeTrace.title}`,
    owner: { kind: 'system', id: 'observability' },
    data: {
      traceId: safeTrace.id,
      initialContext: safeTrace.data?.initialContext,
      events: safeEvents.map(event => ({ type: event.event_type, payload: event.payload })),
      finalTextLength: safeTrace.data?.finalTextLength,
    },
    metadata: { convertedFrom: safeTrace.id },
  });
}

function traceLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_TRACE_LIMIT;
  return Math.min(MAX_TRACE_LIMIT, Math.max(1, parsed));
}
