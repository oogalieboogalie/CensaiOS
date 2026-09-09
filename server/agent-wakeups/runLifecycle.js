import pool from '../db.js';
import {
  completeRun,
  createRun,
  failRun,
  recordRunAction,
  startRun,
} from '../runs/lifecycle.js';
import { withRunTransaction } from '../runs/causality.js';

export async function beginWakeupRun(wake, db = pool) {
  const runId = await withRunTransaction(db, async (transactionDb) => {
    const { rows } = await transactionDb.query(
      'SELECT run_id FROM agent_wakeups WHERE id=$1 FOR UPDATE',
      [wake.id]
    );
    if (!rows[0]) throw new Error(`Wakeup "${wake.id}" no longer exists.`);
    if (rows[0].run_id) return rows[0].run_id;

    const created = await createRun({
      db: transactionDb,
      workspaceId: wake.workspace_id,
      actor: `agent:${wake.agent_id}`,
      principal: `user:${wake.created_by_user_id}`,
      runtimeMode: 'background',
      metadata: {
        kind: 'agent_wakeup',
        wakeId: wake.id,
        sourceMessageId: wake.message_id,
        senderId: wake.sender_id,
        userId: wake.created_by_user_id,
      },
      cause: { kind: 'agent_message', sourceMessageId: wake.message_id },
    });
    await transactionDb.query(
      'UPDATE agent_wakeups SET run_id=$1, updated_at=NOW() WHERE id=$2',
      [created.runId, wake.id]
    );
    return created.runId;
  });

  await startRun({ db, runId });
  return runId;
}

export async function recordWakeupPhase({ db = pool, runId, wake, outcome, name }) {
  await recordRunAction({
    db,
    runId,
    sequence: Math.max(1, Number(wake.attempts) || 1),
    name,
    status: 'succeeded',
    metadata: {
      wakeId: wake.id,
      phase: wake.phase,
      toolCalls: Array.isArray(outcome?.toolCalls) ? outcome.toolCalls : [],
    },
  });
}

export async function completeWakeupRun({ db = pool, runId, wake, outcome }) {
  await recordWakeupPhase({
    db,
    runId,
    wake,
    outcome,
    name: 'agent_wakeup.complete',
  });
  await completeRun({
    db,
    runId,
    metadata: {
      wakeId: wake.id,
      response: String(outcome?.text || ''),
      toolCalls: Array.isArray(outcome?.toolCalls) ? outcome.toolCalls : [],
    },
  });
}

export async function failWakeupRun({ db = pool, runId, wake, error }) {
  await recordRunAction({
    db,
    runId,
    sequence: Math.max(1, Number(wake.attempts) || 1),
    name: 'agent_wakeup.execute',
    status: 'failed',
    metadata: { wakeId: wake.id, phase: wake.phase },
  });
  await failRun({ db, runId, error });
}
