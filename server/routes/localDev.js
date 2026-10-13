import express from 'express';
import { dbReady } from '../dbState.js';
import { getPendingLocalDevRestartNotifications } from '../localDevRestarts.js';

export const localDevRouter = express.Router();

function requireDb(req, res, next) {
  if (!dbReady()) return res.status(503).json({ error: 'Database not connected' });
  next();
}

localDevRouter.get('/local-dev-restarts/notifications', requireDb, async (req, res) => {
  try {
    const notes = await getPendingLocalDevRestartNotifications({
      windowId: req.query.windowId || null,
      agentId: req.query.agentId || null,
    });
    res.json(notes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
