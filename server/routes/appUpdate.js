/**
 * App update routes (server/appUpdate/).
 *
 * GET  /api/app-update             is an update built and waiting? (admin)
 * GET  /api/app-update/in-flight   open changes and agents mid-task (admin)
 * POST /api/app-update/check       look for an update now (admin)
 * POST /api/app-update/restart     put it in now, once no agent is working (admin)
 *
 * The tray's "Update censaiOS" item opens the web app's update panel, which
 * calls these. Sits behind requireLocalFilesystem: only a copy running on
 * this PC updates.
 */

import express from 'express';
import { requireSystemAdmin } from '../security/systemAdmin.js';
import { updateStatus, requestCheck } from '../appUpdate/index.js';
import { workInFlight } from '../appUpdate/inFlight.js';
import { pendingRestart, restartWhenIdle } from '../appUpdate/whenIdle.js';

export const appUpdateRouter = express.Router();

function sendError(res, error, fallback) {
  const status = Number(error?.statusCode) || 500;
  res.status(status).json({ error: status >= 500 ? fallback : error.message });
}

appUpdateRouter.get('/', requireSystemAdmin, (_req, res) => {
  res.json({ ...updateStatus(), pendingRestart: pendingRestart() });
});

appUpdateRouter.get('/in-flight', requireSystemAdmin, async (_req, res) => {
  res.json(await workInFlight());
});

appUpdateRouter.post('/check', requireSystemAdmin, (_req, res) => {
  try {
    res.json(requestCheck());
  } catch (error) {
    sendError(res, error, 'Could not ask for an update check.');
  }
});

appUpdateRouter.post('/restart', requireSystemAdmin, async (_req, res) => {
  try {
    res.json(await restartWhenIdle());
  } catch (error) {
    sendError(res, error, 'Could not ask for the update.');
  }
});
