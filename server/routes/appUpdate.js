/**
 * App update routes (server/appUpdate/).
 *
 * GET  /api/app-update             is an update built and waiting? (admin)
 * GET  /api/app-update/idle        is a made build waiting, and is anyone working?
 *                                  The updater asks this at sign-in, before anyone
 *                                  is signed in, so it is not an admin route. It
 *                                  answers yes/no only.
 * GET  /api/app-update/in-flight   open changes and agents mid-task (admin)
 * POST /api/app-update/activity    a key or a click (header X-Censai-Client: 1)
 * POST /api/app-update/check       look for an update now (admin)
 * POST /api/app-update/start       start the updater, when this PC can (admin)
 * POST /api/app-update/restart     put it in now, once no agent is working (admin)
 *
 * The tray's "Update censaiOS" item opens the web app's update panel, which
 * calls these. Sits behind requireLocalFilesystem: only a copy running on
 * this PC updates.
 */

import express from 'express';
import { requireSystemAdmin } from '../security/systemAdmin.js';
import { updateStatus, requestCheck, updateDir } from '../appUpdate/index.js';
import { anyoneWorking } from '../appUpdate/anyoneWorking.js';
import { activityPost } from '../appUpdate/activityPost.js';
import { idleAnswer } from '../appUpdate/applyWhenIdle.js';
import { startUpdaterProcess } from '../appUpdate/startUpdater.js';
import { workInFlight } from '../appUpdate/inFlight.js';
import { pendingRestart, restartWhenIdle } from '../appUpdate/whenIdle.js';
import { selfRepo } from '../selfFix/patches.js';

export const appUpdateRouter = express.Router();

function sendError(res, error, fallback) {
  const status = Number(error?.statusCode) || 500;
  const body = { error: status >= 500 ? fallback : error.message };
  if (typeof error?.code === 'string' && /^[a-z0-9-]{1,40}$/.test(error.code)) body.code = error.code;
  res.status(status).json(body);
}

appUpdateRouter.get('/', requireSystemAdmin, async (_req, res) => {
  // inUse: a terminal, a console agent, or a key or click in the last
  // 10 minutes. The automatic install waits. Restart now stays on screen.
  // A failed check counts as in use, so that install does not go ahead
  // when censaiOS cannot tell.
  let inUse;
  try { inUse = (await anyoneWorking()).working; } catch { inUse = true; }
  res.json({ ...updateStatus(), pendingRestart: pendingRestart(), inUse });
});

appUpdateRouter.get('/idle', async (_req, res) => {
  const repo = selfRepo();
  res.json(await idleAnswer({ dir: updateDir(repo), repo }));
});

appUpdateRouter.get('/in-flight', requireSystemAdmin, async (_req, res) => {
  res.json(await workInFlight());
});

// The board calls this when someone types or clicks. Not an admin route:
// anyone on this PC counts. The handler rejects a post with no client
// header, so a page on another site cannot mark the app as in use.
appUpdateRouter.post('/activity', activityPost);

appUpdateRouter.post('/start', requireSystemAdmin, (_req, res) => {
  try {
    res.json(startUpdaterProcess());
  } catch (error) {
    sendError(res, error, 'Could not start the updater.');
  }
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
