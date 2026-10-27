import express from 'express';
import pool from '../../db.js';
import { requireDb } from './shared.js';
import { agentRouteError, resolveAgentRouteScope } from './scope.js';
import { can, memberPrincipal } from '../../access/policy.js';

export const wakeupsRouter = express.Router();

// Wakeups are scoped through their agent_messages row, which carries the board.
wakeupsRouter.get('/agent-wakeups/:agentId', requireDb, async (req, res) => {
  let scope;
  try {
    scope = await resolveAgentRouteScope(req);
  } catch (err) {
    return agentRouteError(res, err);
  }
  try {
    const [wakeups, unread] = await Promise.all([
      pool.query(
        `SELECT aw.id, aw.agent_id, aw.status, aw.phase, aw.updated_at, aw.error, aw.response,
                am.subject, am.content, am.message_type, am.thread_id, sender.name AS sender_name
         FROM agent_wakeups aw
         JOIN agent_messages am ON am.id=aw.message_id
         JOIN agents sender ON sender.id=aw.sender_id
         WHERE aw.agent_id=$1 AND am.workspace_id=$2
         ORDER BY aw.updated_at DESC LIMIT 5`,
        [req.params.agentId, scope.workspaceId]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS count FROM agent_messages
         WHERE to_agent=$1 AND workspace_id=$2 AND read_at IS NULL`,
        [req.params.agentId, scope.workspaceId]
      ),
    ]);
    res.json({ wakeups: wakeups.rows, unread: unread.rows[0]?.count || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

wakeupsRouter.post('/agent-wakeups/:id/retry', requireDb, async (req, res) => {
  let scope;
  try {
    scope = await resolveAgentRouteScope(req);
  } catch (err) {
    return agentRouteError(res, err);
  }
  // A retry asks the agent again, so view-only members can't do it.
  if (!can(memberPrincipal(scope.role), 'agent.ask')) {
    return res.status(403).json({ error: 'Workspace role does not allow asking agents' });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE agent_wakeups SET status='queued', error=NULL, completed_at=NULL,
         updated_at=NOW()
       WHERE id=$1 AND status='failed'
         AND message_id IN (SELECT id FROM agent_messages WHERE workspace_id=$2)
       RETURNING *`,
      [req.params.id, scope.workspaceId]
    );
    if (!rows[0]) return res.status(409).json({ error: 'Only failed wakeups can be retried' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
