import express from 'express';
import pool from '../../db.js';
import { parsePositiveInteger, parseRepository, sendGitHubError } from './client.js';
import {
  buildDesk,
  createOctokit,
  loadOnePr,
  mergePr,
  resolveGithubToken,
} from '../../github/mergeDesk.js';
import { fixApprovals, getFixJob, rawFixJob, startFix } from '../../github/conflictFixer.js';
import { requireLocalFilesystem } from '../../middleware/runtimeMode.js';
import { assertSystemAdmin, requireSystemAdmin } from '../../security/systemAdmin.js';

/**
 * GitHub window: the merge desk.
 *
 * GET  /api/github/desk?repo=o/r          open PRs in plain words + recent merges
 * GET  /api/github/desk/status            is a token connected (never returns it)
 * GET  /api/github/desk/pr?repo=&number=  one PR, refreshed
 * POST /api/github/desk/merge             { repo, number }  ready + merge, one tap
 * POST /api/github/desk/fix               { repo, number }  update branch / agent fix
 * GET  /api/github/desk/fix/:id           fix progress + pending agent approvals
 * POST /api/github/desk/fix/:id/approve   { approvalId, allow }
 *
 * GitHub's own Update branch runs for anyone signed in. The agent part runs
 * a program on this machine, so it needs the Agent Console's guards (local
 * filesystem mode, system admin); without them the job explains why.
 */
export const mergeDeskRouter = express.Router();

async function octokitFor(req) {
  const { token } = await resolveGithubToken(req.session?.userId);
  return { octokit: createOctokit(token), token };
}

async function actorName(req) {
  const userId = req.session?.userId;
  const email = String(req.session?.userEmail || '');
  let name = email ? email.split('@')[0] : 'Someone';
  if (userId) {
    try {
      const { rows } = await pool.query('SELECT name FROM users WHERE id = $1', [userId]);
      if (rows[0]?.name) name = rows[0].name;
    } catch { /* keep the email-based name */ }
  }
  return { userId: userId ?? null, name };
}

let managerLoader = async () => (await import('../../cli-agents/index.js')).getCliTaskManager();
export function setFixManagerLoader(fn) { managerLoader = fn; }

const wrap = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    sendGitHubError(res, err);
  }
};

mergeDeskRouter.get('/desk/status', wrap(async (req, res) => {
  const { source } = await resolveGithubToken(req.session?.userId);
  res.json({ connected: Boolean(source), source, me: (await actorName(req)).name });
}));

mergeDeskRouter.get('/desk', wrap(async (req, res) => {
  const target = parseRepository(req.query.repo);
  const { octokit } = await octokitFor(req);
  res.json(await buildDesk(octokit, target));
}));

mergeDeskRouter.get('/desk/pr', wrap(async (req, res) => {
  const target = parseRepository(req.query.repo);
  const number = parsePositiveInteger(req.query.number);
  const { octokit } = await octokitFor(req);
  res.json(await loadOnePr(octokit, { ...target, number }));
}));

mergeDeskRouter.post('/desk/merge', wrap(async (req, res) => {
  const target = parseRepository(req.body?.repo);
  const number = parsePositiveInteger(req.body?.number);
  const { octokit } = await octokitFor(req);
  const result = await mergePr(octokit, { ...target, number });
  res.json({ ...result, by: (await actorName(req)).name, mergedAt: new Date().toISOString() });
}));

/** Agents may run here: local filesystem allowed and the caller is a system admin. */
async function canRunAgents(req) {
  let allowed = true;
  requireLocalFilesystem(req, { status: () => ({ json: () => { allowed = false; } }) }, () => {});
  if (!allowed) return false;
  return assertSystemAdmin(req).then(() => true, () => false);
}

mergeDeskRouter.post('/desk/fix', wrap(async (req, res) => {
  const target = parseRepository(req.body?.repo);
  const number = parsePositiveInteger(req.body?.number);
  const { octokit, token } = await octokitFor(req);
  const agents = await canRunAgents(req);
  const manager = agents ? await managerLoader().catch(() => null) : null;
  const job = await startFix({ octokit, token, ...target, number, user: await actorName(req) }, { manager, canRunAgents: agents });
  res.status(202).json({ job });
}));

mergeDeskRouter.get('/desk/fix/:id', wrap(async (req, res) => {
  const job = getFixJob(req.params.id);
  const manager = await managerLoader().catch(() => null);
  res.json({ job, approvals: manager ? fixApprovals(rawFixJob(job.id), manager) : [] });
}));

mergeDeskRouter.post('/desk/fix/:id/approve', requireLocalFilesystem, requireSystemAdmin, wrap(async (req, res) => {
  const job = getFixJob(req.params.id);
  const manager = await managerLoader();
  if (!job.taskId) return res.status(409).json({ error: 'Nothing is waiting for approval.' });
  manager.decide(job.taskId, String(req.body?.approvalId || ''), { allow: Boolean(req.body?.allow), user: await actorName(req) });
  res.json({ ok: true });
}));
