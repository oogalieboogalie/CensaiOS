import express from 'express';
import pool from '../../db.js';
import { requireDb } from './shared.js';
import {
  getAgentMessages,
  markMessageRead,
} from '../../memory.js';
import { agentRouteError, resolveAgentRouteScope } from './scope.js';


export const communicationRouter = express.Router();

communicationRouter.post('/messages', (_req, res) => {
  res.status(409).json({
    error: 'Family message senders are established by the agent runtime, not request data.',
    code: 'AGENT_MESSAGE_SENDER_UNVERIFIED',
  });
});

communicationRouter.get('/messages/:agentId', requireDb, async (req, res) => {
  try {
    const messages = await getAgentMessages(
      req.params.agentId,
      req.query.unread === 'true',
      await resolveAgentRouteScope(req),
    );
    res.json(messages);
  } catch (err) {
    agentRouteError(res, err);
  }
});

communicationRouter.patch('/messages/:id/read', requireDb, async (req, res) => {
  try {
    const updated = await markMessageRead(req.params.id, await resolveAgentRouteScope(req));
    if (!updated) return res.status(404).json({ error: 'Message not found.' });
    res.json({ ok: true });
  } catch (err) {
    agentRouteError(res, err);
  }
});

// Live activity feed for the canvas mail toasts: recent family messages in
// this workspace, newest first. `since` (ISO timestamp) filters to arrivals
// after the client's watermark so polling only surfaces what's new.
communicationRouter.get('/mail-activity', requireDb, async (req, res) => {
  try {
    const scope = await resolveAgentRouteScope(req);
    const since = typeof req.query.since === 'string' && req.query.since
      ? new Date(req.query.since)
      : null;
    const params = [scope.workspaceId];
    let sql = `SELECT am.id, am.from_agent, am.to_agent, am.content, am.subject,
                am.message_type, am.priority, am.thread_id, am.created_at,
                sender.name AS from_name, recipient.name AS to_name
              FROM agent_messages am
              JOIN agents sender ON sender.id = am.from_agent
              LEFT JOIN agents recipient ON recipient.id = am.to_agent
              WHERE am.workspace_id = $1`;
    if (since && !Number.isNaN(since.getTime())) {
      params.push(since.toISOString());
      sql += ` AND am.created_at > $${params.length}`;
    }
    sql += ` ORDER BY am.created_at DESC LIMIT 20`;
    const { rows } = await pool.query(sql, params);
    res.json({ messages: rows });
  } catch (err) {
    agentRouteError(res, err);
  }
});
