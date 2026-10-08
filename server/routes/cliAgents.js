/**
 * Agent Console routes — coding CLIs as teammates on the board.
 *
 * GET  /api/cli-agents/roster                 status chip per CLI (+ presence)
 * POST /api/cli-agents/install/:cli           first-use install (progress via roster)
 * GET  /api/cli-agents/folders                repos the console can work in
 * GET  /api/cli-agents/tasks                  every task, newest first
 * POST /api/cli-agents/tasks                  { cli, folder, prompt, model? } start
 * GET  /api/cli-agents/tasks/:id?since=<rev>  transcript items changed after rev
 * GET  /api/cli-agents/tasks/:id/raw          raw output lines (power users)
 * GET  /api/cli-agents/tasks/:id/changes      files changed + unified diff
 * GET  /api/cli-agents/tasks/:id/file?path=   one file from the worktree
 * POST /api/cli-agents/tasks/:id/message      follow-up (resumes the session)
 * POST /api/cli-agents/tasks/:id/stop
 * POST /api/cli-agents/tasks/:id/handoff      { cli, instruction? }
 * POST /api/cli-agents/tasks/:id/permissions/:requestId  { allow }
 * DELETE /api/cli-agents/tasks/:id            discard task + worktree
 * GET  /api/cli-agents/permissions            pending requests (Action Approvals)
 *
 * Reads are open to any signed-in member, so teammates see who is working.
 * Anything that runs a program on this machine (start, follow-up, install,
 * allow/deny, hand-off, discard) needs a system admin, and the whole router
 * sits behind requireLocalFilesystem: cloud_saas never runs CLIs on its host.
 */

import express from 'express';
import pool from '../db.js';
import fs from 'fs';
import path from 'path';
import { getCliTaskManager, cliRoster, forgetVersions } from '../cli-agents/index.js';
import { getAdapter } from '../cli-agents/adapters/index.js';
import { installCli } from '../cli-agents/install.js';
import { readOpenProjects, readCurrentProject } from './projects/shared.js';
import { resolveProjectPathForRuntime } from '../workspaces/shared.js';
import { requireSystemAdmin } from '../security/systemAdmin.js';
import { createLogger } from '../logger.js';

const log = createLogger('cli-agents-route');
export const cliAgentsRouter = express.Router();

/** Who is acting, by display name, for transcript lines like "Allowed by Alex". */
async function actor(req) {
  const userId = req.session?.userId ?? null;
  const email = String(req.session?.userEmail || '');
  let name = email ? email.split('@')[0] : 'You';
  if (userId) {
    try {
      const { rows } = await pool.query('SELECT name FROM users WHERE id = $1', [userId]);
      if (rows[0]?.name) name = rows[0].name;
    } catch { /* keep the email-based name */ }
  }
  return { userId, name };
}

function send(res, error) {
  const status = Number(error?.statusCode) || 500;
  if (status >= 500) log.error('cli agents request failed', { error: error?.message });
  res.status(status).json({ error: status >= 500 ? 'The Agent Console hit a server error.' : error.message });
}

const wrap = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (error) {
    send(res, error);
  }
};

/** Folders an agent may work in: the open projects (and folders inside them). */
async function allowedRoots() {
  const current = await readCurrentProject().catch(() => null);
  const open = await readOpenProjects().catch(() => []);
  const stored = [current?.path, ...open].filter(Boolean);
  const seen = new Set();
  const roots = [];
  for (const p of stored) {
    const runtime = path.resolve(resolveProjectPathForRuntime(p));
    if (seen.has(runtime)) continue;
    seen.add(runtime);
    roots.push({ path: runtime, name: path.basename(runtime), current: p === current?.path, isGit: fs.existsSync(path.join(runtime, '.git')) });
  }
  return roots;
}

async function assertAllowedFolder(folder) {
  const target = path.resolve(String(folder || ''));
  const roots = await allowedRoots();
  const ok = roots.some((r) => target === r.path || target.startsWith(r.path + path.sep));
  if (!ok) {
    throw Object.assign(new Error('Open that folder as a project first (project picker in the top bar), then pick it here.'), { statusCode: 403 });
  }
  return target;
}

cliAgentsRouter.get('/roster', wrap(async (req, res) => {
  res.json({ clis: await cliRoster({ userId: req.session?.userId, force: req.query.refresh === '1' }) });
}));

cliAgentsRouter.post('/install/:cli', requireSystemAdmin, wrap(async (req, res) => {
  const adapter = getAdapter(req.params.cli);
  if (!adapter) return res.status(404).json({ error: 'Unknown CLI.' });
  installCli(adapter.id).then(() => forgetVersions()).catch((err) => log.warn('install failed', { cli: adapter.id, error: err.message }));
  res.status(202).json({ ok: true });
}));

cliAgentsRouter.get('/folders', wrap(async (_req, res) => {
  res.json({ folders: await allowedRoots() });
}));

cliAgentsRouter.get('/tasks', wrap(async (_req, res) => {
  res.json({ tasks: getCliTaskManager().list() });
}));

cliAgentsRouter.post('/tasks', requireSystemAdmin, wrap(async (req, res) => {
  const folder = await assertAllowedFolder(req.body?.folder);
  const task = await getCliTaskManager().start({
    cli: req.body?.cli, folder, prompt: req.body?.prompt, model: req.body?.model || null, user: await actor(req),
  });
  res.status(201).json({ task });
}));

cliAgentsRouter.get('/permissions', wrap(async (req, res) => {
  const status = req.query.status === 'all' ? null : 'pending';
  res.json({ permissions: getCliTaskManager().permissions({ status }) });
}));

cliAgentsRouter.get('/tasks/:id', wrap(async (req, res) => {
  res.json(getCliTaskManager().snapshot(req.params.id, req.query.since));
}));

cliAgentsRouter.get('/tasks/:id/raw', wrap(async (req, res) => {
  res.json({ lines: getCliTaskManager().raw(req.params.id) });
}));

cliAgentsRouter.get('/tasks/:id/changes', wrap(async (req, res) => {
  res.json(await getCliTaskManager().changes(req.params.id));
}));

cliAgentsRouter.get('/tasks/:id/file', wrap(async (req, res) => {
  res.json({ path: req.query.path, content: getCliTaskManager().readFile(req.params.id, req.query.path) });
}));

cliAgentsRouter.post('/tasks/:id/message', requireSystemAdmin, wrap(async (req, res) => {
  res.json({ task: await getCliTaskManager().followUp(req.params.id, { prompt: req.body?.prompt, user: await actor(req) }) });
}));

cliAgentsRouter.post('/tasks/:id/stop', requireSystemAdmin, wrap(async (req, res) => {
  res.json({ task: getCliTaskManager().stop(req.params.id) });
}));

cliAgentsRouter.post('/tasks/:id/handoff', requireSystemAdmin, wrap(async (req, res) => {
  const task = await getCliTaskManager().handoff(req.params.id, {
    cli: req.body?.cli, instruction: req.body?.instruction, user: await actor(req),
  });
  res.status(201).json({ task });
}));

cliAgentsRouter.post('/tasks/:id/permissions/:requestId', requireSystemAdmin, wrap(async (req, res) => {
  const request = getCliTaskManager().decide(req.params.id, req.params.requestId, { allow: req.body?.allow === true, user: await actor(req) });
  res.json({ request });
}));

cliAgentsRouter.delete('/tasks/:id', requireSystemAdmin, wrap(async (req, res) => {
  await getCliTaskManager().discard(req.params.id);
  res.json({ ok: true });
}));
