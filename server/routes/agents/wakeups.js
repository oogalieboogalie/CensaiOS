import express from 'express';
import pool from '../../db.js';
import { requireDb } from './shared.js';

export const wakeupsRouter = express.Router();

wakeupsRouter.get('/agent-wakeups/:agentId', requireDb, async (req, res) => {
  try {
    const [wakeups, unread] = await Promise.all([
      pool.query(
        `SELECT aw.id, aw.status, aw.phase, aw.updated_at, aw.error,
                am.subject, sender.name AS sender_name
         FROM agent_wakeups aw
         JOIN agent_messages am ON am.id=aw.message_id
         JOIN agents sender ON sender.id=aw.sender_id
         WHERE aw.agent_id=$1
         ORDER BY aw.updated_at DESC LIMIT 5`,
        [req.params.agentId]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS count FROM agent_messages
         WHERE to_agent=$1 AND read_at IS NULL`,
        [req.params.agentId]
      ),
    ]);
    res.json({ wakeups: wakeups.rows, unread: unread.rows[0]?.count || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

wakeupsRouter.post('/agent-wakeups/:id/retry', requireDb, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE agent_wakeups SET status='queued', error=NULL, completed_at=NULL,
         updated_at=NOW()
       WHERE id=$1 AND status='failed'
       RETURNING *`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(409).json({ error: 'Only failed wakeups can be retried' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
