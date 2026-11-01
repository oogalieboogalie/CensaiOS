// GET /api/live-ops/workspaces/:workspaceId — the server half of the Live
// Operations window: recent workflow runs, workflows that start on their own,
// and the terminals open on this board. Any member (viewers too) can read it,
// so everyone on the board sees the same picture.
// GET /api/live-ops/workspaces/:workspaceId/agents — the Agent list's half:
// when each agent last chatted, background tasks still going, and agents
// added from other places (server/liveOps/agentPresence.js).
import express from 'express';
import pool from '../db.js';
import { requireWorkspaceMember } from '../workspaces/context.js';
import { collectLiveOps } from '../liveOps/collect.js';
import { collectAgentPresence } from '../liveOps/agentPresence.js';

export function createLiveOpsRouter({ db = pool, collect = collectLiveOps, presence = collectAgentPresence } = {}) {
  const router = express.Router();
  router.get('/workspaces/:workspaceId', async (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const workspace = await requireWorkspaceMember(db, { userId: req.session.userId, workspaceId: req.params.workspaceId });
      res.json(await collect(db, workspace.id));
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  });
  router.get('/workspaces/:workspaceId/agents', async (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const workspace = await requireWorkspaceMember(db, { userId: req.session.userId, workspaceId: req.params.workspaceId });
      res.json(await presence(db, workspace.id));
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Could not load the agent list' });
    }
  });
  return router;
}

export const liveOpsRouter = createLiveOpsRouter();
