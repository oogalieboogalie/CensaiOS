// ═══════════════════════════════════════════════════════════════════
//  INBOX
//  One list of everything that might need a person: pull requests
//  (red checks, conflicts, ready to land), coding agents (waiting for an
//  OK, working, stuck) and error reports. Each item says which group it
//  belongs in, a few plain numbers, and what one click can do about it.
//  Pure functions: the route feeds them, tests call them directly.
// ═══════════════════════════════════════════════════════════════════

import { errorItem } from '../../src/lib/inbox/errorItem.js';

export { errorItem };

export const GROUPS = [
  { id: 'needs', label: 'Needs you' },
  { id: 'working', label: 'In progress' },
  { id: 'ready', label: 'Ready' },
  { id: 'done', label: 'Done' },
];

const DAY = 24 * 60 * 60 * 1000;
export const TOKEN_WINDOW_DAYS = 3;

const fmt = (n) => Number(n || 0).toLocaleString('en-US');

/** One inbox item per open pull request. */
export function prItem(pr, repo) {
  const base = {
    id: `pr:${repo}#${pr.number}`,
    kind: 'pr',
    repo,
    number: pr.number,
    url: pr.url,
    by: pr.author,
    at: pr.updatedAt,
    summary: pr.summary,
  };
  const size = pr.size?.files != null ? `${pr.size.files} file${pr.size.files === 1 ? '' : 's'} · +${fmt(pr.size.additions)} −${fmt(pr.size.deletions)}` : '—';
  const stats = [
    { label: 'Checks', value: pr.checks.text, tone: pr.checks.state === 'failed' ? 'danger' : pr.checks.state === 'passed' ? 'success' : 'neutral' },
    { label: 'Size', value: size },
    { label: 'Branch', value: pr.headRef ? `${pr.headRef} → ${pr.baseRef}` : '—' },
  ];
  if (pr.checks.state === 'failed') {
    return { ...base, state: 'ci_failed', group: 'needs', tone: 'danger', title: `Checks failed on #${pr.number}`, subtitle: pr.title, stats, failing: pr.checks.failing, actions: ['fix_ci', 'open', 'acknowledge'] };
  }
  if (pr.conflicts) {
    return { ...base, state: 'conflict', group: 'needs', tone: 'warning', title: `Merge conflict on #${pr.number}`, subtitle: pr.title, stats, actions: ['fix_conflicts', 'open', 'acknowledge'] };
  }
  if (pr.checks.state === 'running' || !pr.mergeKnown) {
    return { ...base, state: 'checks_running', group: 'working', tone: 'accent', title: pr.title, subtitle: `#${pr.number} · checks running`, stats, actions: ['open', 'acknowledge'] };
  }
  return { ...base, state: pr.draft ? 'draft_green' : 'green', group: 'ready', tone: 'success', title: pr.title, subtitle: `#${pr.number} · ${pr.draft ? 'draft, checks passed' : 'checks passed'}`, stats, actions: ['open', 'acknowledge'] };
}

/** Where an agent task works, as a short repo name ("owner/repo" for kept GitHub clones). */
export function taskRepo(task) {
  const root = String(task.repoRoot || task.folder || '');
  // Split on both slashes: the server may run on Windows (D:\Repos\CensaiHub).
  const name = root.split(/[\\/]+/).filter(Boolean).pop() || 'this computer';
  return name.includes('__') ? name.replace('__', '/') : name;
}

const tokensOf = (task) => (task.usage ? (task.usage.input || 0) + (task.usage.output || 0) : 0);

/** One inbox item per coding agent task from the Agent Console. */
export function agentItem(task, now = Date.now()) {
  const repo = taskRepo(task);
  const base = {
    id: `agent:${task.id}`,
    kind: 'agent',
    taskId: task.id,
    repo,
    cli: task.cli,
    cliLabel: task.cliLabel,
    by: task.createdBy?.name || 'Someone',
    at: new Date(task.updatedAt || task.createdAt || now).toISOString(),
    title: task.title,
    summary: task.summary || task.lastError || '',
  };
  const minutes = task.createdAt ? Math.max(1, Math.round(((task.finishedAt || now) - task.createdAt) / 60000)) : null;
  const stats = [
    { label: 'Agent', value: task.cliLabel || task.cli },
    { label: 'Tokens', value: tokensOf(task) ? fmt(tokensOf(task)) : '—' },
    { label: task.running ? 'Running for' : 'Took', value: minutes ? `${minutes} min` : '—' },
  ];
  if (task.status === 'needs_approval') {
    return { ...base, state: 'needs_approval', group: 'needs', tone: 'warning', subtitle: `${task.cliLabel} wants your OK`, stats, actions: ['approve', 'open_agent', 'acknowledge'] };
  }
  if (task.status === 'failed') {
    return { ...base, state: 'agent_failed', group: 'needs', tone: 'danger', subtitle: `${task.cliLabel} stopped with an error`, stats, actions: ['open_agent', 'acknowledge'] };
  }
  if (task.running) {
    return { ...base, state: 'agent_running', group: 'working', tone: 'accent', subtitle: `${task.cliLabel} working · ${repo}`, stats, actions: ['open_agent', 'acknowledge'] };
  }
  return { ...base, state: task.status === 'stopped' ? 'agent_stopped' : 'agent_done', group: 'done', tone: 'neutral', subtitle: `${task.cliLabel} ${task.status === 'stopped' ? 'stopped' : 'finished'}`, stats, actions: ['open_agent', 'acknowledge'] };
}

const GROUP_ORDER = Object.fromEntries(GROUPS.map((g, i) => [g.id, i]));

export function sortItems(items) {
  return [...items].sort((a, b) => (GROUP_ORDER[a.group] - GROUP_ORDER[b.group]) || (Date.parse(b.at || 0) - Date.parse(a.at || 0)));
}

/**
 * What the side dock shows on hover: each running agent by repo, and how
 * many tokens each kind of agent used over the last few days.
 */
export function agentDock(tasks, now = Date.now()) {
  const since = now - TOKEN_WINDOW_DAYS * DAY;
  const byRepo = new Map();
  const tokens = new Map();
  for (const task of tasks) {
    if (task.running) {
      const repo = taskRepo(task);
      if (!byRepo.has(repo)) byRepo.set(repo, []);
      byRepo.get(repo).push({ taskId: task.id, cli: task.cli, cliLabel: task.cliLabel, title: task.title, state: task.status });
    }
    if ((task.createdAt || 0) >= since && tokensOf(task)) {
      tokens.set(task.cliLabel || task.cli, (tokens.get(task.cliLabel || task.cli) || 0) + tokensOf(task));
    }
  }
  return {
    repos: [...byRepo.entries()].map(([repo, list]) => ({ repo, tasks: list })),
    tokens: [...tokens.entries()].sort((a, b) => b[1] - a[1]).map(([label, total]) => ({ label, total })),
    days: TOKEN_WINDOW_DAYS,
  };
}

export function buildInbox({ desk = null, tasks = [], reports = [], now = Date.now() } = {}) {
  const items = sortItems([
    ...(desk ? desk.prs.map((pr) => prItem(pr, desk.repo)) : []),
    ...tasks.map((t) => agentItem(t, now)),
    ...reports.map(errorItem),
  ]);
  return { items, groups: GROUPS, dock: agentDock(tasks, now), fetchedAt: new Date(now).toISOString() };
}
