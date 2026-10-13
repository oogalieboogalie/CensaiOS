// Board history: who changed the board and when, a preview of any earlier
// point still in the update log, and rolling the board back to it.
import express from 'express';
import pool from '../db.js';
import { requireWorkspaceMember } from '../workspaces/context.js';
import { boardAt, listBoardHistory, restoreBoard } from '../collab/boardHistory.js';
import { publishWorkspaceEvent } from '../collaboration/workspaceHub.js';

export function createBoardHistoryRouter({ db = pool, history = { listBoardHistory, boardAt, restoreBoard }, publish = publishWorkspaceEvent } = {}) {
  const router = express.Router();

  const seqOf = (req) => {
    const seq = Number(req.params.seq);
    if (!Number.isSafeInteger(seq) || seq < 1) {
      const error = new Error('Unknown point in history');
      error.statusCode = 400;
      throw error;
    }
    return seq;
  };

  const handle = (roles, work) => async (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const workspace = await requireWorkspaceMember(db, {
        userId: req.session.userId, workspaceId: req.params.workspaceId, ...(roles ? { roles } : {}),
      });
      res.json(await work(req, workspace));
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  };

  router.get('/workspaces/:workspaceId/history', handle(null, (req, workspace) => (
    history.listBoardHistory(db, workspace.id)
  )));

  router.get('/workspaces/:workspaceId/history/:seq', handle(null, async (req, workspace) => ({
    seq: seqOf(req), board: await history.boardAt(workspace.id, seqOf(req)),
  })));

  router.post('/workspaces/:workspaceId/history/:seq/restore', handle(['owner', 'admin', 'member'], async (req, workspace) => {
    const result = await history.restoreBoard(workspace.id, seqOf(req), { actor: `user:${req.session.userId}` });
    publish(workspace.id, { type: 'board.history.restored', workspaceId: workspace.id, restoredTo: result.restoredTo });
    return { ok: true, ...result };
  }));

  return router;
}

export const boardHistoryRouter = createBoardHistoryRouter();
