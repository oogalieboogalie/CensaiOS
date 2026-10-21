import express from 'express';
import { parsePositiveInteger, parseRepository, sendGitHubError } from './client.js';
import { createOctokit, deskError } from '../../github/mergeDesk.js';
import { resolveGithubWriteToken } from '../../github/writeToken.js';
import { getReview, postReview, publicReview, refreshReview, reviewApprovals, startReview } from '../../github/reviewTeam.js';
import { requireLocalFilesystem } from '../../middleware/runtimeMode.js';
import { requireSystemAdmin } from '../../security/systemAdmin.js';
import { actorName, canRunAgents } from './mergeDesk.js';

/**
 * GitHub window: the review team.
 *
 * GET  /api/github/desk/reviewers             which coding CLIs can review here
 * POST /api/github/desk/review                { repo, number, reviewers: ['claudecode','grok'] }
 * GET  /api/github/desk/review/:id            progress, merged findings, pending approvals
 * POST /api/github/desk/review/:id/approve    { taskId, approvalId, allow }
 * POST /api/github/desk/review/:id/post       post the findings to the PR as one review
 *
 * Reviewers are the Agent Console's CLIs running on this machine with the
 * person's own sign-ins, so the agent parts need its guards (local
 * filesystem mode, system admin).
 */
export const reviewTeamRouter = express.Router();

let managerLoader = async () => (await import('../../cli-agents/index.js')).getCliTaskManager();
let rosterLoader = async (userId) => (await import('../../cli-agents/index.js')).cliRoster({ userId });
export function setReviewLoaders({ manager, roster } = {}) {
  if (manager) managerLoader = manager;
  if (roster) rosterLoader = roster;
}

// A review is seen, posted and answered only by the person who started it.
function ownReview(req) {
  const job = getReview(req.params.id);
  if (job.userId != null && String(job.userId) !== String(req.session?.userId)) {
    throw deskError('That review is no longer here. Tap Review again.', 404);
  }
  return job;
}

const wrap = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    sendGitHubError(res, err);
  }
};

reviewTeamRouter.get('/desk/reviewers', wrap(async (req, res) => {
  if (!(await canRunAgents(req))) return res.json({ available: false, reviewers: [] });
  const roster = await rosterLoader(req.session?.userId);
  res.json({
    available: true,
    reviewers: roster.filter((r) => r.id !== 'opencode').map((r) => ({ id: r.id, label: r.label, vendor: r.vendor, installed: r.installed, signedIn: r.signedIn, ready: r.installed && r.signedIn })),
  });
}));

reviewTeamRouter.post('/desk/review', wrap(async (req, res) => {
  const target = parseRepository(req.body?.repo);
  const number = parsePositiveInteger(req.body?.number);
  const { token } = await resolveGithubWriteToken(req, { feature: 'github desk review' });
  const agents = await canRunAgents(req);
  const manager = agents ? await managerLoader().catch(() => null) : null;
  const review = await startReview(
    { octokit: createOctokit(token), token, ...target, number, reviewers: req.body?.reviewers, user: await actorName(req) },
    { manager, canRunAgents: agents },
  );
  res.status(202).json({ review });
}));

reviewTeamRouter.get('/desk/review/:id', wrap(async (req, res) => {
  const job = ownReview(req);
  const manager = await managerLoader().catch(() => null);
  if (manager && job.status === 'reviewing') refreshReview(job, manager);
  res.json({ review: publicReview(job), approvals: manager ? reviewApprovals(job, manager) : [] });
}));

reviewTeamRouter.post('/desk/review/:id/approve', requireLocalFilesystem, requireSystemAdmin, wrap(async (req, res) => {
  const job = ownReview(req);
  const taskId = String(req.body?.taskId || '');
  if (!job.reviewers.some((r) => r.taskId === taskId)) return res.status(404).json({ error: 'That reviewer is not part of this review.' });
  const manager = await managerLoader();
  manager.decide(taskId, String(req.body?.approvalId || ''), { allow: Boolean(req.body?.allow), user: await actorName(req) });
  res.json({ ok: true });
}));

reviewTeamRouter.post('/desk/review/:id/post', wrap(async (req, res) => {
  const job = ownReview(req);
  const { token } = await resolveGithubWriteToken(req, { feature: 'github desk review post' });
  res.json({ review: await postReview(job, { octokit: createOctokit(token) }) });
}));
