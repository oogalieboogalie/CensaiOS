import express from 'express';
import pool from '../db.js';
import {
  createSchedule,
  deleteOwnedSchedule,
  getSchedules,
  updateOwnedSchedule,
} from '../memory/schedules.js';
import { resolveWorkspaceContext } from '../workspaces/context.js';

export const schedulesRouter = express.Router();

async function scheduleScope(req, { write = false } = {}) {
  const workspace = await resolveWorkspaceContext(pool, {
    userId: req.session.userId,
    workspaceId: req.query.workspaceId || req.body?.workspaceId || null,
  });
  if (write && workspace.role === 'viewer') {
    throw Object.assign(new Error('Workspace role does not allow this operation'), {
      statusCode: 403,
    });
  }
  return { userId: req.session.userId, workspaceId: workspace.id };
}

function routeError(res, error) {
  res.status(error.statusCode || 500).json({ error: error.message, code: error.code });
}

schedulesRouter.get('/schedules', async (req, res) => {
  try {
    const data = await getSchedules({ ...(await scheduleScope(req)), db: pool });
    res.json(data);
  } catch (err) {
    routeError(res, err);
  }
});

schedulesRouter.post('/schedules', async (req, res) => {
  try {
    const schedule = await createSchedule(req.body, {
      ...(await scheduleScope(req, { write: true })), db: pool,
    });
    res.json(schedule);
  } catch (err) {
    routeError(res, err);
  }
});

schedulesRouter.patch('/schedules/:id', async (req, res) => {
  try {
    const schedule = await updateOwnedSchedule(
      req.params.id,
      req.body,
      { ...(await scheduleScope(req, { write: true })), db: pool },
    );
    if (!schedule) return res.status(404).json({ error: 'Schedule not found.' });
    res.json(schedule);
  } catch (err) {
    routeError(res, err);
  }
});

schedulesRouter.delete('/schedules/:id', async (req, res) => {
  try {
    const deleted = await deleteOwnedSchedule(req.params.id, {
      ...(await scheduleScope(req, { write: true })), db: pool,
    });
    if (!deleted) return res.status(404).json({ error: 'Schedule not found.' });
    res.json({ ok: true });
  } catch (err) {
    routeError(res, err);
  }
});
