import pool from '../db.js';
import {
  THREAD_COOLDOWN_WINDOW_MINUTES,
  PAIRWISE_VELOCITY_WINDOW_MINUTES,
} from './threadGuards.js';

const WAKEABLE_TYPES = new Set(['agent-to-agent', 'work_request', 'agent_report']);

export function shouldWakeForMessage(fromAgent, toAgent, opts = {}) {
  if (opts.wake === false || !toAgent || fromAgent === toAgent) return false;
  return WAKEABLE_TYPES.has(opts.messageType || 'general');
}

export async function enqueueAgentWakeup(messageId, agentId, senderId) {
  const { rows } = await pool.query(
    `INSERT INTO agent_wakeups(message_id, agent_id, sender_id)
     VALUES($1, $2, $3)
     ON CONFLICT(message_id) DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [messageId, agentId, senderId]
  );
  return rows[0];
}

export async function claimAgentWakeup() {
  const { rows } = await pool.query(
    `UPDATE agent_wakeups SET status='in_progress', started_at=NOW(),
       updated_at=NOW(), attempts=attempts+1
     WHERE id = (
       SELECT aw.id FROM agent_wakeups aw
       JOIN agent_messages am ON am.id=aw.message_id
       WHERE (aw.status='queued'
          OR (aw.status='waiting_children' AND NOT EXISTS (
            SELECT 1 FROM agent_tasks t
            WHERE t.wake_id=aw.id AND t.status IN ('queued','in_progress','blocked')
          )))
       AND am.workspace_id IS NOT NULL AND am.created_by_user_id IS NOT NULL
       ORDER BY aw.created_at ASC
       FOR UPDATE SKIP LOCKED LIMIT 1
     )
     RETURNING *`
  );
  return rows[0] || null;
}

export async function requeueInProgressAgentWakeups() {
  const completed = await pool.query(
    `UPDATE agent_wakeups aw
     SET status='completed', response=COALESCE(aw.response, r.metadata->>'response'),
         completed_at=COALESCE(aw.completed_at, r.completed_at, NOW()), updated_at=NOW()
     FROM runs r, agent_messages am
     WHERE aw.status='in_progress' AND aw.run_id=r.id AND r.status='succeeded'
       AND am.id=aw.message_id AND am.workspace_id IS NOT NULL AND am.created_by_user_id IS NOT NULL`
  );
  const failed = await pool.query(
    `UPDATE agent_wakeups aw
     SET status='failed', error=COALESCE(aw.error, 'Linked wakeup run failed before status persisted.'),
         completed_at=COALESCE(aw.completed_at, r.completed_at, NOW()), updated_at=NOW()
     FROM runs r, agent_messages am
     WHERE aw.status='in_progress' AND aw.run_id=r.id AND r.status IN ('failed','cancelled')
       AND am.id=aw.message_id AND am.workspace_id IS NOT NULL AND am.created_by_user_id IS NOT NULL`
  );
  const queued = await pool.query(
    `UPDATE agent_wakeups aw
     SET status='queued', started_at=NULL, updated_at=NOW()
     FROM agent_messages am
     WHERE aw.status='in_progress' AND am.id=aw.message_id
       AND am.workspace_id IS NOT NULL AND am.created_by_user_id IS NOT NULL`
  );
  return {
    completed: completed.rowCount || 0,
    failed: failed.rowCount || 0,
    requeued: queued.rowCount || 0,
  };
}

export async function loadWakeupContext(wakeId) {
  const { rows } = await pool.query(
    `SELECT aw.*, am.content, am.subject, am.message_type, am.thread_id,
            am.workspace_id, am.created_by_user_id,
            sender.name AS sender_name
     FROM agent_wakeups aw
     JOIN agent_messages am ON am.id=aw.message_id
     JOIN agents sender ON sender.id=aw.sender_id
     WHERE aw.id=$1`,
    [wakeId]
  );
  return rows[0] || null;
}

export async function getWakeupTasks(wakeId, workspaceId) {
  const { rows } = await pool.query(
    `SELECT id, title, status, result, error, completion_receipt
     FROM agent_tasks WHERE wake_id=$1 AND workspace_id=$2 ORDER BY created_at`,
    [wakeId, workspaceId]
  );
  return rows;
}

export async function updateWakeup(id, patch) {
  const allowed = ['status', 'phase', 'response', 'error'];
  const fields = [];
  const values = [];
  for (const key of allowed) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    values.push(patch[key]);
    fields.push(`${key}=$${values.length}`);
  }
  if (patch.status === 'completed' || patch.status === 'failed') {
    fields.push('completed_at=NOW()');
  }
  fields.push('updated_at=NOW()');
  values.push(id);
  const { rows } = await pool.query(
    `UPDATE agent_wakeups SET ${fields.join(', ')} WHERE id=$${values.length} RETURNING *`,
    values
  );
  return rows[0] || null;
}

/**
 * Loop-guard stats for one mail thread. threadKey is the thread starter's
 * message id; every message in the thread shares it via thread_id (the
 * starter itself matches by id). One round trip, three counters:
 * - messageCount: total messages in the thread
 * - wakeCount: wakeups already enqueued for thread messages (the round cap input)
 * - recentSenderCount: messages from this sender in the cooldown window
 */
export async function getThreadStats(threadKey, { workspaceId, senderId } = {}) {
  const { rows } = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM agent_messages
         WHERE (thread_id = $1 OR id = $1) AND workspace_id = $2) AS message_count,
       (SELECT COUNT(*)::int FROM agent_wakeups aw
         JOIN agent_messages am ON am.id = aw.message_id
         WHERE (am.thread_id = $1 OR am.id = $1) AND am.workspace_id = $2) AS wake_count,
       (SELECT COUNT(*)::int FROM agent_messages
         WHERE (thread_id = $1 OR id = $1) AND workspace_id = $2
           AND from_agent = $3
           AND created_at > NOW() - make_interval(mins => $4)) AS recent_sender_count`,
    [threadKey, workspaceId, senderId, THREAD_COOLDOWN_WINDOW_MINUTES]
  );
  const row = rows[0] || {};
  return {
    hasThread: true,
    messageCount: row.message_count ?? 0,
    wakeCount: row.wake_count ?? 0,
    recentSenderCount: row.recent_sender_count ?? 0,
    pairwiseRecentCount: 0,
  };
}

/**
 * Velocity check for fresh (thread-less) sends: how many wakeable messages
 * has this sender fired at this recipient recently, across all threads?
 * Catches ping-pong loops that mint a new thread per message.
 */
export async function getPairwiseRecentCount(fromAgent, toAgent, { workspaceId } = {}) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM agent_messages
      WHERE from_agent = $1 AND to_agent = $2 AND workspace_id = $3
        AND message_type IN ('agent-to-agent', 'work_request', 'agent_report')
        AND created_at > NOW() - make_interval(mins => $4)`,
    [fromAgent, toAgent, workspaceId, PAIRWISE_VELOCITY_WINDOW_MINUTES]
  );
  return rows[0]?.count ?? 0;
}

/**
 * Resolve any message id to its thread root (starter id). Returns null when
 * the message does not exist or is outside the workspace.
 */
export async function getMessageThreadRoot(messageId, { workspaceId } = {}) {
  const { rows } = await pool.query(
    `SELECT id, thread_id FROM agent_messages WHERE id = $1 AND workspace_id = $2`,
    [messageId, workspaceId]
  );
  const row = rows[0];
  if (!row) return null;
  return row.thread_id || row.id;
}
