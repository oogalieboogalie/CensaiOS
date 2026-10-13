import pool from '../../db.js';
import crypto from 'crypto';
import { enqueueAgentWakeup, getPairwiseRecentCount, getThreadStats, shouldWakeForMessage } from '../../agent-wakeups/store.js';
import { createLogger } from '../../logger.js';
import { decideThreadWake, isAckMessage, WAKE_SUPPRESSED_DESCRIPTIONS } from '../../agent-wakeups/threadGuards.js';
import { requireAutonomyOwnership } from '../../autonomy/ownership.js';
import {
  FAMILY_BLUEPRINT_AGENT_IDS,
  getFamilyBlueprintAgent,
} from '../../agents/familyBlueprint.js';

const log = createLogger('agent-mail');

/**
 * Generate an idempotency key for a message based on sender, recipient, and content.
 * @param {string} fromAgent - Sender agent ID
 * @param {string|null} toAgent - Recipient agent ID (can be null for broadcasts)
 * @param {string} content - Message content
 * @returns {string} - A SHA-256 hash used as idempotency key
 */
function generateMessageKey(fromAgent, toAgent, content) {
  const payload = `${fromAgent}:${toAgent || 'broadcast'}:${content}`;
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 32);
}

/**
 * Send an agent message with idempotency protection.
 * If a message with the same idempotency key was sent recently (within 5 minutes),
 * returns the existing message ID instead of creating a duplicate.
 *
 * Wake loop-guards: the message is always stored, but the recipient is only
 * woken when decideThreadWake() allows it (no bare acks, thread wake cap,
 * reply cooldown, pairwise velocity). Pass { verbose: true } to get
 * { id, woke, wakeSuppressed, threadKey, wakeCount } instead of a bare id.
 */
export async function sendAgentMessage(fromAgent, toAgent, content, opts = {}) {
  const ownership = requireAutonomyOwnership(opts);
  const priority = opts.priority || 'normal';
  const threadId = opts.threadId || null;
  const subject = opts.subject || null;
  const messageType = opts.messageType || 'general';
  const importanceScore = opts.importanceScore || 0.5;
  const autoEscalate = opts.autoEscalate || false;
  const idempotencyKey = opts.idempotencyKey || generateMessageKey(fromAgent, toAgent, content);

  // Check for existing message with same idempotency key (within last 5 minutes)
  const existing = await pool.query(
    `SELECT id FROM agent_messages 
     WHERE idempotency_key = $1 
       AND from_agent = $2 
       AND workspace_id = $3
       AND created_at > NOW() - INTERVAL '5 minutes'`,
    [idempotencyKey, fromAgent, ownership.workspaceId]
  );

  if (existing.rows.length > 0) {
    // Message already sent recently, return existing ID to prevent duplicate
    return existing.rows[0].id;
  }

  const { rows } = await pool.query(
    `INSERT INTO agent_messages (from_agent, to_agent, content, priority, thread_id,
       subject, message_type, importance_score, auto_escalate, is_thread_starter, idempotency_key,
       workspace_id, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
    [fromAgent, toAgent, content, priority, threadId, subject, messageType,
     importanceScore, autoEscalate, !threadId, idempotencyKey,
     ownership.workspaceId, ownership.userId]
  );
  const messageId = rows[0].id;
  const threadKey = threadId || messageId;
  const finish = (woke, wakeSuppressed, wakeCount) => (
    opts.verbose
      ? { id: messageId, woke, wakeSuppressed, threadKey, wakeCount }
      : messageId
  );

  // Cheap synchronous gates first: type never wakes, explicit opt-out, or
  // self-message. No extra queries on this path.
  if (!shouldWakeForMessage(fromAgent, toAgent, opts)) {
    return finish(false, 'not_wakeable', 0);
  }

  // Bare acknowledgements are stored but never wake and never need stats.
  if (isAckMessage(content)) {
    log.info('wake suppressed', { messageId, fromAgent, toAgent, threadKey, reason: 'ack' });
    return finish(false, 'ack', 0);
  }

  // Loop-guard stats: thread-scoped when replying, pairwise when minting a
  // fresh thread (catches ping-pong loops that never share a thread id).
  let stats;
  if (threadId) {
    const thread = await getThreadStats(threadId, { workspaceId: ownership.workspaceId, senderId: fromAgent });
    stats = thread;
  } else {
    stats = {
      hasThread: false,
      messageCount: 1,
      wakeCount: 0,
      recentSenderCount: 0,
      pairwiseRecentCount: await getPairwiseRecentCount(fromAgent, toAgent, { workspaceId: ownership.workspaceId }),
    };
  }
  const decision = decideThreadWake(
    { messageType, wake: opts.wake, content },
    stats
  );
  if (!decision.wake) {
    log.info('wake suppressed', {
      messageId, fromAgent, toAgent, threadKey,
      reason: decision.reason,
      detail: WAKE_SUPPRESSED_DESCRIPTIONS[decision.reason] || decision.reason,
      wakeCount: stats.wakeCount,
    });
    return finish(false, decision.reason, stats.wakeCount);
  }
  await enqueueAgentWakeup(messageId, toAgent, fromAgent);
  return finish(true, null, stats.wakeCount);
}

export async function getAgentMessages(agentId, unreadOnly = false, opts = {}) {
  const workspaceId = String(opts.workspaceId || '').trim();
  if (!workspaceId) throw new Error('workspaceId is required to read family messages.');
  let sql = `SELECT am.*, a.name AS from_name FROM agent_messages am
             JOIN agents a ON am.from_agent = a.id
             WHERE (am.to_agent = $1 OR am.to_agent IS NULL)
               AND am.workspace_id = $2`;
  const params = [agentId, workspaceId];
  if (getFamilyBlueprintAgent(agentId)?.id === agentId) {
    sql += ' AND am.from_agent = ANY($3)';
    params.push(FAMILY_BLUEPRINT_AGENT_IDS);
  }
  if (unreadOnly) sql += ' AND am.read_at IS NULL';
  sql += ' ORDER BY am.importance_score DESC, am.created_at DESC LIMIT 50';
  const { rows } = await pool.query(sql, params);
  return rows;
}

export async function markMessageRead(messageId, opts = {}) {
  const workspaceId = String(opts.workspaceId || '').trim();
  if (!workspaceId) throw new Error('workspaceId is required to update a family message.');
  const result = await pool.query(
    'UPDATE agent_messages SET read_at = NOW() WHERE id = $1 AND workspace_id = $2 RETURNING id',
    [messageId, workspaceId]
  );
  return Boolean(result.rows[0]);
}
