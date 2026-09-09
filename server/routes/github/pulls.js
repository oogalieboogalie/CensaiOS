import {
  getGitHubClient,
  parsePositiveInteger,
  parsePullState,
  parseRepository,
  sendGitHubError,
} from './client.js';

export async function listPulls(req, res) {
  try {
    const { owner, repo } = parseRepository(req.query.repo);
    const state = parsePullState(req.query.state);
    const octokit = getGitHubClient();
    const { data } = await octokit.rest.pulls.list({ owner, repo, state, per_page: 100 });
    return res.json(data);
  } catch (err) {
    return sendGitHubError(res, err);
  }
}

export async function getPullDetails(req, res) {
  try {
    const { owner, repo } = parseRepository(req.query.repo);
    const pullNumber = parsePositiveInteger(req.query.number, 'number');
    const octokit = getGitHubClient();
    const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: pullNumber });
    const sha = pr.head?.sha;

    let statuses = null;
    let checkRuns = null;
    if (sha) {
      const [statusResult, checksResult] = await Promise.allSettled([
        octokit.rest.repos.getCombinedStatusForRef({ owner, repo, ref: sha }),
        octokit.rest.checks.listForRef({ owner, repo, ref: sha }),
      ]);
      if (statusResult.status === 'fulfilled') statuses = statusResult.value.data;
      if (checksResult.status === 'fulfilled') checkRuns = checksResult.value.data;
    }

    return res.json({ pr, statuses, checkRuns });
  } catch (err) {
    return sendGitHubError(res, err);
  }
}

export async function mergePull(req, res) {
  const { repo: repository, number, commit_title, commit_message, merge_method } = req.body;
  if (!repository || !number) {
    return res.status(400).json({ error: 'Missing repo or number in request body' });
  }

  try {
    const { owner, repo } = parseRepository(repository);
    const pullNumber = parsePositiveInteger(number, 'number');
    const method = merge_method || 'merge';
    if (!['merge', 'squash', 'rebase'].includes(method)) {
      return res.status(400).json({ error: 'Invalid merge method.' });
    }
    const octokit = getGitHubClient();
    const { data } = await octokit.rest.pulls.merge({
      owner,
      repo,
      pull_number: pullNumber,
      commit_title: commit_title || undefined,
      commit_message: commit_message || undefined,
      merge_method: method,
    });
    return res.json(data);
  } catch (err) {
    return sendGitHubError(res, err);
  }
}
