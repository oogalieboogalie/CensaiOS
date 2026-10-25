// /api/legion — a team of agents that keeps working on a goal until Echo
// says OK (server/legion/loop.js).
//   POST /runs             start one (one running Legion per person)
//   GET  /runs             your recent runs
//   GET  /runs/:id?after=n a run and its events after n (the window polls)
//   POST /runs/:id/answer  answer the team's questions (empty = let the team decide)
//   POST /runs/:id/stop    stop it
//   GET  /runs/:id/shots/:name   a screenshot the browser took
// and GET /api/legion-view/:id/:token/*  a file the Legion built (the run's secret link)
import express from 'express';
import fs from 'node:fs';
import pool from '../db.js';
import { dbReady } from '../dbState.js';
import { answerRun, listRuns, viewFilePath, parseStart, readRun, runFilePath, runningFor, startRun, stopRun } from '../legion/runs.js';
import { findBrowser } from '../legion/browser.js';
import { userRole } from '../security/systemAdmin.js';

export const legionRouter = express.Router();
// Mounted before the sign-in guard (server/boot/routers.js) at /api/legion-view.
export const legionViewRouter = express.Router();
// What the Legion built opens in a sandbox (an opaque origin that sends no
// cookies), so this one route is reached by the run's secret token instead
// of the sign-in, and the page never runs with this app's rights.
legionViewRouter.get('/:id/:token/*rest', async (req, res) => {
  const file = await viewFilePath({ id: req.params.id, token: req.params.token, rel: [].concat(req.params.rest || []).join('/') });
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.status(404).end();
  res.setHeader('Content-Security-Policy', 'sandbox allow-scripts');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  return res.sendFile(file, { dotfiles: 'allow' });
});


async function roleOf(userId) {
  if (!dbReady()) return 'user';
  try {
    return (await userRole(userId, { db: pool })) || 'user';
  } catch {
    return 'user';
  }
}

legionRouter.use((req, res, next) => {
  if (!req.session?.userId) return res.status(401).json({ error: 'Unauthorized' });
  return next();
});

legionRouter.post('/runs', async (req, res) => {
  const userId = req.session.userId;
  const request = parseStart(req.body);
  if (request.error) return res.status(400).json({ error: request.error });
  if (runningFor(userId)) return res.status(409).json({ error: 'A Legion is already working for you. Stop it or let it finish first.' });
  try {
    const run = await startRun({ userId, account: { userId, role: await roleOf(userId) }, ...request });
    return res.status(201).json({ run, browser: Boolean(findBrowser()) });
  } catch (error) {
    return res.status(500).json({ error: `The Legion could not start: ${String(error.message || error).slice(0, 200)}` });
  }
});

legionRouter.get('/runs', async (req, res) => {
  res.json({ runs: await listRuns({ userId: req.session.userId }), browser: Boolean(findBrowser()) });
});

legionRouter.get('/runs/:id', async (req, res) => {
  const after = Math.max(0, Number.parseInt(req.query.after, 10) || 0);
  const run = await readRun({ userId: req.session.userId, id: req.params.id, after });
  if (!run) return res.status(404).json({ error: 'That Legion run was not found.' });
  return res.json(run);
});

legionRouter.post('/runs/:id/answer', (req, res) => {
  const answered = answerRun({ userId: req.session.userId, id: req.params.id, text: req.body?.text });
  res.status(answered ? 200 : 409).json({ answered });
});

legionRouter.post('/runs/:id/stop', (req, res) => {
  const stopped = stopRun({ userId: req.session.userId, id: req.params.id });
  res.status(stopped ? 200 : 404).json({ stopped });
});

legionRouter.get('/runs/:id/shots/:name', (req, res) => {
  const file = runFilePath({ userId: req.session.userId, id: req.params.id, kind: 'shot', rel: req.params.name });
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.status(404).end();
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // The state folder is .homebase-state, so allow the dot in the path.
  return res.sendFile(file, { dotfiles: 'allow' });
});
