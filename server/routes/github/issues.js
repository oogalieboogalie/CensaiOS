import {
  getGitHubClient,
  parseIssueState,
  parsePositiveInteger,
  parseRepository,
  sendGitHubError,
} from './client.js';

export async function createIssue(req, res) {
  const { repo: repository, title, body, labels } = req.body;
  if (!repository || !title) {
    return res.status(400).json({ error: 'Missing repo or title in request body' });
  }

  try {
    const { owner, repo } = parseRepository(repository);
    const octokit = getGitHubClient();
    const { data } = await octokit.rest.issues.create({
      owner,
      repo,
      title: String(title).slice(0, 256),
      body: body ? String(body) : '',
      labels: Array.isArray(labels) ? labels.map(String).slice(0, 50) : [],
    });
    return res.json({ ok: true, issueNumber: data.number, url: data.html_url });
  } catch (err) {
    return sendGitHubError(res, err);
  }
}

export async function listIssues(req, res) {
  try {
    const { owner, repo } = parseRepository(req.query.repo);
    const state = parseIssueState(req.query.state);
    const octokit = getGitHubClient();
    const { data } = await octokit.rest.issues.listForRepo({ owner, repo, state, per_page: 100 });
    return res.json(data.filter((item) => !item.pull_request));
  } catch (err) {
    return sendGitHubError(res, err);
  }
}

export async function addLabels(req, res) {
  const { repo: repository, number, labels } = req.body;
  if (!repository || !number || !Array.isArray(labels)) {
    return res.status(400).json({ error: 'Missing repo, number, or labels in request body' });
  }

  try {
    const { owner, repo } = parseRepository(repository);
    const issueNumber = parsePositiveInteger(number, 'number');
    const octokit = getGitHubClient();
    const { data } = await octokit.rest.issues.setLabels({
      owner,
      repo,
      issue_number: issueNumber,
      labels: labels.map(String).slice(0, 50),
    });
    return res.json(data);
  } catch (err) {
    return sendGitHubError(res, err);
  }
}
