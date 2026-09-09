import { fetchGithub } from '../../helpers.js';
import { recordProvenance } from '../../../operational-intelligence/provenance.js';

export async function githubReadFile(args) {
  const res = await fetchGithub(`/repos/${args.repo}/contents/${args.path}`);
  if (res.type === 'file' && res.content) {
    return Buffer.from(res.content, 'base64').toString('utf8');
  }
  return JSON.stringify(res);
}

export async function githubWriteFile(args) {
  let sha = null;
  try {
    const fileInfo = await fetchGithub(`/repos/${args.repo}/contents/${args.path}`);
    if (fileInfo && fileInfo.sha) sha = fileInfo.sha;
  } catch (e) {
    // intentional: 404 means the file is new, so we PUT without an existing sha to create it.
  }

  const body = {
    message: args.message,
    content: Buffer.from(args.content).toString('base64'),
  };
  if (sha) body.sha = sha;

  const res = await fetchGithub(`/repos/${args.repo}/contents/${args.path}`, {
    method: 'PUT',
    body: JSON.stringify(body)
  });

  if (args.__provenance) {
    await recordProvenance({
      workspace_id: args.repo,
      agent_id: args.__provenance.agent_id,
      prompt: args.__provenance.prompt,
      model: args.__provenance.model,
      code_snippet: args.content,
      file_path: args.path,
      metadata: { repo: args.repo, commit: res?.commit?.sha }
    }).catch(err => console.error('[Provenance] Failed to record:', err.message));
  }

  return `Successfully wrote file. Commit: ${res?.commit?.html_url || 'Unknown'}`;
}

export async function githubListIssues(args) {
  const state = args.state || 'open';
  const res = await fetchGithub(`/repos/${args.repo}/issues?state=${state}&per_page=10`);
  if (!Array.isArray(res)) return 'Failed to list issues.';
  if (res.length === 0) return `No ${state} issues found.`;
  return res.map(i => `#${i.number} [${i.state}] ${i.title} (by ${i.user.login})`).join('\n');
}

export async function githubCreateIssue(args) {
  const body = { title: args.title, body: args.body };
  if (args.assignees && args.assignees.length > 0) body.assignees = args.assignees;
  if (args.labels && args.labels.length > 0) body.labels = args.labels;
  const res = await fetchGithub(`/repos/${args.repo}/issues`, {
    method: 'POST',
    body: JSON.stringify(body)
  });
  return `Created issue #${res.number}: ${res.html_url}`;
}

export async function githubCommentIssue(args) {
  const body = { body: args.body };
  const res = await fetchGithub(`/repos/${args.repo}/issues/${args.issue_number}/comments`, {
    method: 'POST',
    body: JSON.stringify(body)
  });
  return `Added comment to issue #${args.issue_number}: ${res.html_url}`;
}
