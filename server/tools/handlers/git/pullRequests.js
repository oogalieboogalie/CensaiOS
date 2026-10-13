import { getSubAgentById } from '../../../memory.js';
import { logProjectActivity, isGithubProject } from '../../../workspaces.js';
import { fetchGithub, resolveProjectForCall } from '../../helpers.js';

export async function prStatus(agentId, args, context = {}) {
  const { project } = await resolveProjectForCall(agentId, args.project, context);
  if (!isGithubProject(project)) return 'Error: not a GitHub project.';
  const pr = await fetchGithub(`/repos/${project.repo}/pulls/${args.pr_number}`);
  const reviews = await fetchGithub(`/repos/${project.repo}/pulls/${args.pr_number}/reviews`);
  const checks = await fetchGithub(`/repos/${project.repo}/commits/${pr.head.sha}/check-runs`).catch(() => ({ check_runs: [] }));
  const reviewSummary = Array.isArray(reviews) && reviews.length
    ? reviews.map(r => `  - ${r.user?.login}: ${r.state}`).join('\n')
    : '  (none yet)';
  const checkSummary = (checks.check_runs || []).slice(0, 8).map(c =>
    `  - ${c.name}: ${c.status}${c.conclusion ? ` (${c.conclusion})` : ''}`
  ).join('\n') || '  (no checks)';
  return [
    `PR #${pr.number}: ${pr.title}`,
    `State: ${pr.state}${pr.draft ? ' (draft)' : ''}${pr.merged ? ' MERGED' : ''}`,
    `Mergeable: ${pr.mergeable === null ? 'computing' : pr.mergeable}`,
    `Head: ${pr.head.ref} → Base: ${pr.base.ref}`,
    `URL: ${pr.html_url}`,
    'Reviews:',
    reviewSummary,
    'Checks:',
    checkSummary,
  ].join('\n');
}

export async function prComments(agentId, args, context = {}) {
  const { project } = await resolveProjectForCall(agentId, args.project, context);
  if (!isGithubProject(project)) return 'Error: not a GitHub project.';
  const repo = project.repo;
  const [reviewComments, issueComments, reviews] = await Promise.all([
    fetchGithub(`/repos/${repo}/pulls/${args.pr_number}/comments?per_page=50`).catch(() => []),
    fetchGithub(`/repos/${repo}/issues/${args.pr_number}/comments?per_page=50`).catch(() => []),
    fetchGithub(`/repos/${repo}/pulls/${args.pr_number}/reviews?per_page=20`).catch(() => []),
  ]);
  const items = [];
  for (const r of reviews) {
    if (r.body) items.push({ kind: 'review', author: r.user?.login, state: r.state, body: r.body, when: r.submitted_at });
    else if (r.state && r.state !== 'COMMENTED') items.push({ kind: 'review', author: r.user?.login, state: r.state, body: `(${r.state})`, when: r.submitted_at });
  }
  for (const c of reviewComments) items.push({ kind: 'inline', author: c.user?.login, path: c.path, body: c.body, when: c.created_at });
  for (const c of issueComments) items.push({ kind: 'comment', author: c.user?.login, body: c.body, when: c.created_at });
  items.sort((a, b) => (a.when || '').localeCompare(b.when || ''));
  if (items.length === 0) return 'No comments or reviews yet.';
  return items.map(it => {
    const head = it.kind === 'inline'
      ? `[${it.kind} on ${it.path}] ${it.author}`
      : `[${it.kind}${it.state ? ` ${it.state}` : ''}] ${it.author}`;
    return `${head}\n${(it.body || '').trim()}`;
  }).join('\n\n---\n\n');
}

export async function mergePr(agentId, args, context = {}) {
  const sub = context.workspaceId ? await getSubAgentById(agentId, context) : null;
  if (sub && sub.permission !== 'worker') {
    return `Error: ${sub.permission} sub-agents cannot merge PRs.`;
  }
  const { project } = await resolveProjectForCall(agentId, args.project, context);
  if (!isGithubProject(project)) return 'Error: not a GitHub project.';

  const pr = await fetchGithub(`/repos/${project.repo}/pulls/${args.pr_number}`);
  if (pr.merged) return `PR #${args.pr_number} is already merged.`;
  if (pr.state !== 'open') return `PR #${args.pr_number} is ${pr.state}, cannot merge.`;
  if (pr.draft) return `PR #${args.pr_number} is a draft. Mark ready for review first.`;
  if (pr.mergeable === false) return `PR #${args.pr_number} has conflicts and cannot be merged.`;

  const body = { merge_method: args.method || 'squash' };
  if (args.commit_title) body.commit_title = args.commit_title;
  if (args.commit_message) body.commit_message = args.commit_message;

  const res = await fetchGithub(`/repos/${project.repo}/pulls/${args.pr_number}/merge`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  await logProjectActivity(project.id, agentId, 'merge_pr', `#${args.pr_number} via ${body.merge_method}`);
  return res?.merged
    ? `Merged PR #${args.pr_number} (${body.merge_method}). SHA: ${res.sha}`
    : `Merge attempt result: ${JSON.stringify(res).slice(0, 200)}`;
}
