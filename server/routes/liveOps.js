// GET /api/live-ops/workspaces/:workspaceId — the server half of the Live
// Operations window: recent workflow runs, workflows that start on their own,
// and the terminals open on this board. Any member (viewers too) can read it,
// so everyone on the board sees the same picture.
import express from 'express';
import pool from '../db.js';
import { requireWorkspaceMember } from '../workspaces/context.js';
import { collectLiveOps } from '../liveOps/collect.js';

export function createLiveOpsRouter({ db = pool, collect = collectLiveOps } = {}) {
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
  return router;
}

export const liveOpsRouter = createLiveOpsRouter();
