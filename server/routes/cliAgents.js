/**
 * Agent Console routes — coding CLIs as teammates on the board.
 *
 * GET  /api/cli-agents/roster                 status chip per CLI (+ presence)
 * POST /api/cli-agents/install/:cli           first-use install (progress via roster)
 * GET  /api/cli-agents/folders                repos the console can work in
 * GET  /api/cli-agents/tasks                  every task, newest first
 * POST /api/cli-agents/tasks                  { cli, folder, prompt, model? } start
 * GET  /api/cli-agents/tasks/:id?since=<rev>  transcript items changed after rev (&board=1: as a teammate sees them)
 * GET  /api/cli-agents/tasks/:id/raw          raw output lines (power users)
 * GET  /api/cli-agents/tasks/:id/changes      files changed + unified diff
 * GET  /api/cli-agents/tasks/:id/file?path=   one file from the worktree
 * POST /api/cli-agents/tasks/:id/message      follow-up (resumes the session)
 * POST /api/cli-agents/tasks/:id/stop
 * POST /api/cli-agents/tasks/:id/handoff      { cli, instruction? }
 * POST /api/cli-agents/tasks/:id/permissions/:requestId  { allow }
 * DELETE /api/cli-agents/tasks/:id            discard task + worktree
 * GET  /api/cli-agents/permissions            pending requests (Action Approvals)
 * /api/cli-agents/grok-signin/*               the Grok chat on your own Grok sign-in (grokSignin.js)
 *
 * Reads are open to any signed-in member, so teammates see who is working.
 * Anything that runs a program on this machine (start, follow-up, install,
 * allow/deny, hand-off, discard) needs a system admin, and the whole router
 * sits behind requireLocalFilesystem: cloud_saas never runs CLIs on its host.
 */

import express from 'express';
import pool from '../db.js';
import { getCliTaskManager, cliRoster, forgetVersions } from '../cli-agents/index.js';
import { getAdapter } from '../cli-agents/adapters/index.js';
import { installCli } from '../cli-agents/install.js';
import { allowedRoots, assertAllowedFolder } from '../cli-agents/folders.js';
import { isComputerOwner, requireSystemAdmin } from '../security/systemAdmin.js';
import { diffWithoutSecrets } from '../security/secretFiles.js';
import { permissionForViewer, stepForTeammate, taskForTeammate } from '../cli-agents/ownerOnlySteps.js';
import { hiddenWordsOf, listedForTeammate } from '../cli-agents/taskHiddenWords.js';
import { withoutHiddenWords } from '../cli-agents/hiddenWords.js';
import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';
import { grokSigninRouter } from './grokSignin.js';

const log = createLogger('cli-agents-route');
export const cliAgentsRouter = express.Router();

/** Who is acting, by display name, for transcript lines like "Allowed by Alma". */
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
  if (status >= 500) log.error('cli agents request failed', { code: safeErrorCode(error) });
  res.status(status).json({ error: status >= 500 ? 'The Agent Console hit a server error.' : error.message, ...(error?.reason ? { reason: error.reason } : {}) });
}

const wrap = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (error) {
    send(res, error);
  }
};

// The Grok chat's "Use my Grok sign-in": each person on their own Grok account.
cliAgentsRouter.use('/grok-signin', grokSigninRouter);

cliAgentsRouter.get('/roster', wrap(async (req, res) => {
  res.json({ clis: await cliRoster({ userId: req.session?.userId, force: req.query.refresh === '1' }) });
}));

cliAgentsRouter.post('/install/:cli', requireSystemAdmin, wrap(async (req, res) => {
  const adapter = getAdapter(req.params.cli);
  if (!adapter) return res.status(404).json({ error: 'Unknown CLI.' });
  installCli(adapter.id).then(() => forgetVersions()).catch((err) => log.warn('install failed', { cli: adapter.id, code: safeErrorCode(err) }));
  res.status(202).json({ ok: true });
}));

cliAgentsRouter.get('/folders', wrap(async (_req, res) => {
  res.json({ folders: await allowedRoots() });
}));

cliAgentsRouter.get('/tasks', wrap(async (req, res) => {
  const manager = getCliTaskManager();
  const tasks = manager.list();
  res.json({ tasks: await ownerWatching(req) ? tasks : tasks.map(listedForTeammate(manager)) });
}));

cliAgentsRouter.post('/tasks', requireSystemAdmin, wrap(async (req, res) => {
  const folder = await assertAllowedFolder(req.body?.folder);
  const task = await getCliTaskManager().start({
    cli: req.body?.cli, folder, prompt: req.body?.prompt, model: req.body?.model || null, user: await actor(req),
  });
  res.status(201).json({ task });
}));

// Anyone on the board may watch a task; a teammate sees steps on a file only
// this computer's owner opens without its words (server/cli-agents/ownerOnlySteps.js),
// nor a key from one repeated anywhere else in the task (hiddenWordsOf), and no
// one while that cannot be checked.
const ownerWatching = (req) => isComputerOwner(req).catch(() => false);

cliAgentsRouter.get('/permissions', wrap(async (req, res) => {
  const status = req.query.status === 'all' ? null : 'pending';
  const owner = await ownerWatching(req);
  const manager = getCliTaskManager();
  const roots = new Map(manager.list().map((t) => [t.id, t.worktree?.dir]));
  const hidden = (id) => (owner ? [] : hiddenWordsOf(manager, id));
  res.json({ permissions: manager.permissions({ status }).map((p) => permissionForViewer(p, { owner, root: roots.get(p.taskId), hidden: hidden(p.taskId) })) });
}));

cliAgentsRouter.get('/tasks/:id', wrap(async (req, res) => {
  const manager = getCliTaskManager();
  const snapshot = manager.snapshot(req.params.id, req.query.since);
  // `board=1`: for a help card on the shared board, as a teammate sees it whoever asks.
  const owner = req.query.board !== '1' && await ownerWatching(req);
  const root = snapshot.task?.worktree?.dir;
  const hidden = owner ? [] : hiddenWordsOf(manager, req.params.id);
  res.json({
    ...snapshot,
    task: owner ? snapshot.task : taskForTeammate(snapshot.task, { hidden }),
    items: owner ? snapshot.items : snapshot.items.map((item) => stepForTeammate(item, { root, hidden })),
    permissions: snapshot.permissions.map((p) => permissionForViewer(p, { owner, root, hidden })),
  });
}));

// The CLI's raw output holds every file it read, keys included, so it is the owner's alone.
cliAgentsRouter.get('/tasks/:id/raw', wrap(async (req, res) => {
  const lines = getCliTaskManager().raw(req.params.id);
  res.json(await ownerWatching(req) ? { lines } : { lines: [], ownerOnly: true });
}));

cliAgentsRouter.get('/tasks/:id/changes', wrap(async (req, res) => {
  // What changed in a file that holds keys is never shown, so it cannot ride
  // into a review chat. A hidden folder's changes are left out for a teammate,
  // and for the board (`board=1`: the review chat sits on the shared board,
  // so it also gets the summary a teammate sees).
  const manager = getCliTaskManager();
  const changes = await manager.changes(req.params.id);
  const board = req.query.board === '1';
  const hidden = board || !(await ownerWatching(req));
  const words = hidden ? hiddenWordsOf(manager, req.params.id) : [];
  const summary = board ? { summary: taskForTeammate(manager.summary(manager.get(req.params.id)), { hidden: words }).summary ?? null } : {};
  res.json({ ...changes, patch: withoutHiddenWords(diffWithoutSecrets(changes.patch, { hidden }), words), ...summary });
}));

// A file only the owner opens shows only on the owner's screen: ownerOnly
// tells it to keep the words off the shared board.
cliAgentsRouter.get('/tasks/:id/file', wrap(async (req, res) => {
  const secrets = await ownerWatching(req);
  const manager = getCliTaskManager();
  const { content, secret } = manager.readFile(req.params.id, req.query.path, { secrets });
  const shown = secrets ? content : withoutHiddenWords(content, hiddenWordsOf(manager, req.params.id));
  res.json({ path: req.query.path, content: shown, ...(secret ? { ownerOnly: true } : {}) });
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
