import crypto from 'crypto';
import pool from '../db.js';
import { createRun } from '../runs/lifecycle.js';
import {
  AGENT_CARD_RUN_KIND,
  agentCardExecutorFingerprint,
  normalizeCallRequest,
  normalizeClientTaskId,
  resolveAgentCardExecutor,
} from './contract.js';

export async function createAgentCardRun({
  db = pool,
  card,
  callerId,
  payload,
  options,
  clientTaskId,
  principal,
  cause,
  runMetadata = {},
  createRunFn = createRun,
} = {}) {
  const executor = resolveAgentCardExecutor(card);
  const agentId = executor.kind === 'builtin' ? executor.agentId : null;
  const request = normalizeCallRequest(payload, options);
  const correlationId = normalizeClientTaskId(clientTaskId, crypto.randomUUID());
  const dispatchRef = `agent-registry:${correlationId}`;
  const { runId } = await createRunFn({
    db,
    workspaceId: request.workspaceId,
    actor: executor.kind === 'builtin' ? `agent:${agentId}` : `agent-card:${card.id}`,
    principal: principal || `user:${callerId}`,
    runtimeMode: 'background',
    metadata: {
      ...runMetadata,
      kind: AGENT_CARD_RUN_KIND,
      cardId: card.id,
      agentId,
      executorKind: executor.kind,
      executorFingerprint: agentCardExecutorFingerprint(card),
      callerId: String(callerId),
      ownerId: card.owner_id == null ? null : String(card.owner_id),
      clientTaskId: correlationId,
      prompt: request.prompt,
      workspaceId: request.workspaceId,
      attempts: 0,
    },
    cause: cause || {
      kind: 'user_dispatch',
      userDispatchRef: dispatchRef,
      metadata: { cardId: card.id, callerId: String(callerId) },
    },
  });
  return { runId, taskId: correlationId, status: 'queued' };
}

export async function claimNextAgentCardRun(db = pool) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id FROM runs
       WHERE status='pending' AND metadata->>'kind'=$1
       ORDER BY created_at ASC
       FOR UPDATE SKIP LOCKED LIMIT 1`,
      [AGENT_CARD_RUN_KIND]
    );
    if (!rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }
    const claimed = await client.query(
      `UPDATE runs SET status='running', started_at=COALESCE(started_at, NOW()), updated_at=NOW(),
         metadata=jsonb_set(metadata, '{attempts}',
           to_jsonb(COALESCE(NULLIF(metadata->>'attempts','')::int, 0) + 1), true)
       WHERE id=$1 RETURNING *`,
      [rows[0].id]
    );
    await client.query('COMMIT');
    return claimed.rows[0] || null;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function recoverInProgressAgentCardRuns(db = pool) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const uncertain = await client.query(
      `UPDATE runs SET status='failed', completed_at=NOW(), updated_at=NOW(),
         metadata=jsonb_set(metadata, '{recovery}',
           '{"code":"external_result_uncertain","replayed":false}'::jsonb, true)
       WHERE status='running' AND metadata->>'kind'=$1
         AND COALESCE(metadata->>'executorKind', 'builtin') <> 'builtin'
       RETURNING id`,
      [AGENT_CARD_RUN_KIND]
    );
    await client.query(
      `INSERT INTO run_steps (run_id, sequence, name, status, completed_at, error)
       SELECT recovered.id, 0, 'system.failure', 'failed', NOW(),
         '{"message":"External agent result is uncertain after restart; the call was not replayed.","code":"external_result_uncertain"}'::jsonb
       FROM unnest($1::uuid[]) AS recovered(id)
       WHERE NOT EXISTS (
         SELECT 1 FROM run_steps rs WHERE rs.run_id=recovered.id AND rs.name='system.failure'
       )`,
      [uncertain.rows.map((row) => row.id)]
    );
    const requeued = await client.query(
      `UPDATE runs SET status='pending', started_at=NULL, updated_at=NOW()
       WHERE status='running' AND metadata->>'kind'=$1
         AND COALESCE(metadata->>'executorKind', 'builtin') = 'builtin'`,
      [AGENT_CARD_RUN_KIND]
    );
    await client.query('COMMIT');
    return { requeued: requeued.rowCount || 0, externalFailed: uncertain.rowCount || 0 };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function getAgentCardRun(runId, db = pool) {
  const { rows } = await db.query(
    `SELECT r.*, rc.cause_kind, rc.user_dispatch_ref,
       (SELECT error FROM run_steps WHERE run_id=r.id AND status='failed'
        ORDER BY created_at DESC LIMIT 1) AS failure
     FROM runs r
     LEFT JOIN run_causes rc ON rc.run_id=r.id
     WHERE r.id=$1 AND r.metadata->>'kind'=$2`,
    [runId, AGENT_CARD_RUN_KIND]
  );
  return rows[0] || null;
}
