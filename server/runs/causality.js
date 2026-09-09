import pool from '../db.js';

const CAUSE_KINDS = new Set([
  'parent_run',
  'workspace_event',
  'user_dispatch',
  'agent_message',
  'schedule',
]);

function requiredText(value, label) {
  const text = String(value || '').trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function cleanMetadata(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function chainDepth(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 50;
  return Math.min(parsed, 100);
}

export function normalizeRunCause(cause) {
  if (!cause || typeof cause !== 'object') throw new Error('cause is required');
  const kind = requiredText(cause.kind, 'cause.kind');
  if (!CAUSE_KINDS.has(kind)) throw new Error(`Unsupported cause kind: ${kind}`);

  const normalized = {
    kind,
    parentRunId: null,
    workspaceEventId: null,
    userDispatchRef: null,
    sourceMessageId: null,
    scheduleId: null,
    metadata: cleanMetadata(cause.metadata),
  };
  if (kind === 'parent_run') normalized.parentRunId = requiredText(cause.parentRunId, 'cause.parentRunId');
  if (kind === 'workspace_event') normalized.workspaceEventId = requiredText(cause.workspaceEventId, 'cause.workspaceEventId');
  if (kind === 'user_dispatch') normalized.userDispatchRef = requiredText(cause.userDispatchRef, 'cause.userDispatchRef');
  if (kind === 'agent_message') normalized.sourceMessageId = requiredText(cause.sourceMessageId, 'cause.sourceMessageId');
  if (kind === 'schedule') normalized.scheduleId = requiredText(cause.scheduleId, 'cause.scheduleId');
  return normalized;
}

export async function createRunCause({ db = pool, runId, cause } = {}) {
  const normalized = normalizeRunCause(cause);
  const { rows } = await db.query(
    `INSERT INTO run_causes
       (run_id, cause_kind, parent_run_id, workspace_event_id, user_dispatch_ref,
        source_message_id, schedule_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      requiredText(runId, 'runId'), normalized.kind, normalized.parentRunId,
      normalized.workspaceEventId, normalized.userDispatchRef, normalized.sourceMessageId,
      normalized.scheduleId, normalized.metadata,
    ]
  );
  return rows[0];
}

export async function loadRunCausalChain({ db = pool, runId, maxDepth } = {}) {
  const { rows } = await db.query(
    `WITH RECURSIVE causal_chain AS (
       SELECT 0 AS depth, cause.*, ARRAY[cause.run_id::text] AS path
         FROM run_causes cause
        WHERE cause.run_id = $1
       UNION ALL
       SELECT causal_chain.depth + 1, cause.*, causal_chain.path || cause.run_id::text
         FROM causal_chain
         JOIN run_causes cause ON cause.run_id = causal_chain.parent_run_id
        WHERE causal_chain.parent_run_id IS NOT NULL
          AND causal_chain.depth < $2
          AND NOT cause.run_id::text = ANY(causal_chain.path)
     )
     SELECT depth, run_id, cause_kind, parent_run_id, workspace_event_id,
            user_dispatch_ref, source_message_id, schedule_id, metadata, created_at
       FROM causal_chain
      ORDER BY depth ASC`,
    [requiredText(runId, 'runId'), chainDepth(maxDepth)]
  );
  return rows;
}

export async function withRunTransaction(db, work) {
  // pg PoolClient exposes both connect() and release(); it is already inside
  // its caller's transaction and must not be connected a second time.
  if (typeof db.connect !== 'function' || typeof db.release === 'function') return work(db);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
