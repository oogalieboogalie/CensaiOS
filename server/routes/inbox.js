import express from 'express';
import { parsePositiveInteger, parseRepository, sendGitHubError } from './github/client.js';
import { actorName, canRunAgents } from './github/mergeDesk.js';
import { buildDesk, createOctokit, resolveGithubToken } from '../github/mergeDesk.js';
import { buildInbox } from '../inbox/collect.js';
import { fixReport, listReports } from '../inbox/sources.js';
import { startCiFix } from '../inbox/ciFix.js';
import { requireLocalFilesystem } from '../middleware/runtimeMode.js';
import { assertSystemAdmin } from '../security/systemAdmin.js';
import { registerSelfFixSource } from '../inbox/selfFixSource.js';
import { registerJulesStuckSource } from '../inbox/julesStuckSource.js';
import { registerSpeakUpSource } from '../inbox/speakUpSource.js';
import { registerMyTodosSource, myTodos } from '../inbox/myTodosSource.js';
import { registerAuctionWatcherSource } from '../inbox/auctionWatcherSource.js';
import { registerInviteInboxSource } from '../invites/inboxSource.js';

// The self-fixing error reports show up as Inbox items for the owner.
registerSelfFixSource();
// Jules tasks the overnight runner parked, so a stuck task reaches a person.
registerJulesStuckSource();
// Short notes agents posted on their own (diagram 17, speak up).
registerSpeakUpSource();
// To-dos someone assigned to you, on every board you belong to.
registerMyTodosSource();
// New Auction Watcher matches, until the person opens that watch.
registerAuctionWatcherSource();
// Boards someone invited you to ("Invite to this board").
registerInviteInboxSource();

/**
 * The Inbox window: pull requests, coding agents and error reports in one list.
 *
 * GET  /api/inbox?repo=o/r          every item, grouped, plus the agent dock
 * POST /api/inbox/fix-ci            { repo, number }  an agent fixes red checks
 * POST /api/inbox/fix-error         { source, reportId } hand a report to its source
 * GET  /api/inbox/my-todos          open to-dos assigned to me on every board (bottom-bar reminder)
 *
 * `serverErrors` tells the window that this browser's errors already reach
 * the server's self-fix reports, so it shows those instead of its own copy.
 *
 * Merge conflicts reuse the GitHub window's /api/github/desk/fix, and every
 * fix job (conflicts or checks) is followed at /api/github/desk/fix/:id.
 */
export function createInboxRouter({
  loadManager = async () => (await import('../cli-agents/index.js')).getCliTaskManager(),
  desk = buildDesk,
  agentsAllowed = canRunAgents,
  isOwner = (req) => assertSystemAdmin(req).then(() => true, () => false),
  listMine = myTodos,
} = {}) {
  const router = express.Router();

  const localFiles = (req) => {
    let allowed = true;
    requireLocalFilesystem(req, { status: () => ({ json: () => { allowed = false; } }) }, () => {});
    return allowed;
  };

  router.get('/', async (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ error: 'Sign in first.' });
    const userId = req.session.userId;
    const out = { repo: null, github: { connected: false, error: null }, agents: { available: false } };

    let deskData = null;
    const repoText = String(req.query.repo || '').trim();
    const { token, source } = await resolveGithubToken(userId);
    out.github.connected = Boolean(source);
    if (repoText && token) {
      try {
        const target = parseRepository(repoText);
        out.repo = `${target.owner}/${target.repo}`;
        deskData = await desk(createOctokit(token), target);
      } catch (err) {
        out.github.error = err?.status === 401 ? 'GitHub rejected the token. Paste a fresh one in the GitHub window.' : (err?.message || 'Could not reach GitHub.');
      }
    }

    let tasks = [];
    if (localFiles(req)) {
      const manager = await loadManager().catch(() => null);
      if (manager) {
        out.agents.available = true;
        tasks = manager.list();
      }
    }

    const ctx = { userId, isOwner: await isOwner(req), localFiles: localFiles(req) };
    const { reports, sourceErrors } = await listReports(ctx);
    const serverErrors = ctx.isOwner && ctx.localFiles && process.env.CENSAI_SELF_FIX !== 'off';
    res.json({ ...out, ...buildInbox({ desk: deskData, tasks, reports }), sourceErrors, serverErrors });
  });

  router.get('/my-todos', async (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ error: 'Sign in first.' });
    try {
      res.json({ userId: req.session.userId, todos: await listMine({ userId: req.session.userId }) });
    } catch {
      res.status(500).json({ error: 'Could not read your to-dos.' });
    }
  });

  router.post('/fix-ci', async (req, res) => {
    try {
      const target = parseRepository(req.body?.repo);
      const number = parsePositiveInteger(req.body?.number);
      const { token } = await resolveGithubToken(req.session?.userId);
      const octokit = createOctokit(token);
      const allowed = await agentsAllowed(req);
      const manager = allowed ? await loadManager().catch(() => null) : null;
      const job = await startCiFix({ octokit, token, ...target, number, user: await actorName(req) }, { manager, canRunAgents: allowed });
      res.status(202).json({ job });
    } catch (err) {
      sendGitHubError(res, err);
    }
  });

  router.post('/fix-error', async (req, res) => {
    try {
      const user = await actorName(req);
      const result = await fixReport(req.body?.source, {
        userId: req.session?.userId, user, reportId: String(req.body?.reportId || ''),
        isOwner: await isOwner(req), localFiles: localFiles(req),
      });
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(err?.status || 500).json({ error: err?.message || 'Could not start the fix.' });
    }
  });

  return router;
}

export const inboxRouter = createInboxRouter();
