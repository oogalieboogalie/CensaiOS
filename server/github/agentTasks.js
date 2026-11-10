// Coding jobs an agent hands to the repository's GitHub coding agent
// (docker/095-agent-github-tasks.sql). The create_github_issue tool files an
// issue that tags @grok or @claude; the workflows in .github/workflows build
// it and open a pull request. GitHub then calls /api/webhooks/github-agent,
// and this file matches the pull request back to the task, moves its status
// and tells the agent through the ordinary family mail wake-up
// (server/memory/core/messaging.js), so the notice lands in its chat.
import crypto from 'node:crypto';
import { isRepoName } from '../github.js';

export const AGENT_TASK_WORKERS = Object.freeze(['grok', 'claude']);
export const AGENT_TASK_LABELS = Object.freeze(['agent-task', 'auto-implement']);
export const NO_TASK_REPO = 'No repository for coding jobs: pass repo as owner/name, or set CENSAI_AGENT_TASK_REPO in .env.';

const clean = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : [value]).map(clean).filter(Boolean);

/** The worker the issue tags: grok unless the agent asked for claude. */
export function taskWorker(value) {
  const worker = clean(value).toLowerCase() || 'grok';
  if (!AGENT_TASK_WORKERS.includes(worker)) throw new Error('worker must be grok or claude.');
  return worker;
}

/** The repo named in the call, else CENSAI_AGENT_TASK_REPO; throws plain words when neither is set. */
export function taskRepo(repo, env = process.env) {
  const named = clean(repo) || clean(env.CENSAI_AGENT_TASK_REPO);
  if (!named) throw new Error(NO_TASK_REPO);
  if (!isRepoName(named)) throw new Error('repo must be owner/name.');
  return named;
}

/** Issue body: Goal / Steps / Done when, then the tag that starts the coding agent. */
export function buildTaskBody({ goal, steps, acceptance, worker = 'grok' }) {
  const numbered = list(steps).map((step, i) => `${i + 1}. ${step}`);
  const checks = list(acceptance).map((item) => `- [ ] ${item}`);
  return [
    '## Goal', clean(goal) || '(none given)', '',
    '## Steps', ...(numbered.length ? numbered : ['(none given)']), '',
    '## Done when', ...(checks.length ? checks : ['(none given)']), '',
    `@${taskWorker(worker)} please build this.`,
  ].join('\n');
}

export async function saveAgentTask(db, task) {
  const { rows } = await db.query(
    `INSERT INTO agent_github_tasks
       (repo, issue_number, issue_url, workspace_id, agent_id, conversation_id, created_by, worker)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (repo, issue_number) DO NOTHING
     RETURNING *`,
    [task.repo, task.issueNumber, task.issueUrl, task.workspaceId || null, task.agentId,
      task.conversationId || null, task.createdBy || null, task.worker],
  );
  return rows[0] || null;
}

/**
 * Checks GitHub's X-Hub-Signature-256 over the exact bytes it sent.
 * Returns false for anything missing or wrong; never throws.
 */
export function verifyGithubSignature(rawBody, header, secret) {
  if (!secret || !header || !Buffer.isBuffer(rawBody)) return false;
  const given = String(header).trim();
  if (!given.startsWith('sha256=')) return false;
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const BODY_LINK = /\b(?:fix(?:es|ed)?|close[sd]?|resolve[sd]?)\s*:?\s+#(\d+)\b/gi;
const BRANCH_LINK = /^(?:grok|claude)\/issue-(\d+)-/i;

/** Issue numbers a pull request belongs to: "Fixes #N" / "Closes #N" in its body, or a grok/issue-N- or claude/issue-N- branch. */
export function linkedIssueNumbers(pr = {}) {
  const found = new Set();
  for (const match of String(pr.body || '').matchAll(BODY_LINK)) found.add(Number(match[1]));
  const branch = BRANCH_LINK.exec(String(pr.head?.ref || ''));
  if (branch) found.add(Number(branch[1]));
  return [...found].filter((n) => Number.isInteger(n) && n > 0);
}

/** The status a pull_request delivery moves a task to, or null when it is not one we follow. */
export function nextStatus(action, pr = {}) {
  if (action === 'opened') return 'pr_open';
  if (action === 'closed') return pr.merged ? 'merged' : 'closed';
  return null;
}

// Only real changes come back from the UPDATE, so a re-sent delivery (GitHub
// retries) never moves a task twice or sends a second notice.
const MOVE_SQL = {
  pr_open: `status IN ('open','closed')`,
  merged: `status <> 'merged'`,
  closed: `status = 'pr_open' AND pr_number = $3`,
};

async function moveTask(db, { repo, issueNumber, status, prNumber, prUrl }) {
  const { rows } = await db.query(
    `UPDATE agent_github_tasks
        SET status = $4, pr_number = $3, pr_url = $5, updated_at = NOW()
      WHERE lower(repo) = lower($1) AND issue_number = $2 AND ${MOVE_SQL[status]}
      RETURNING *`,
    [repo, issueNumber, prNumber, status, prUrl],
  );
  return rows[0] || null;
}

export function noticeText(task) {
  const state = task.status === 'merged' ? 'merged' : 'open';
  return `Pull request #${task.pr_number} for task #${task.issue_number} is ${state}: ${task.pr_url}. Run read_app_log and check the fix.`;
}

// The mail comes from another family agent so it can wake the recipient
// (an agent never wakes itself). As an agent_report it wakes the agent
// without the agent mailing a reply back to the sender.
const noticeSender = (agentId) => (agentId === 'architect' ? 'censai' : 'architect');

/** Default notice: one wakeable family mail into the agent's chat. */
export async function sendTaskNotice(task, { sendMail } = {}) {
  const send = sendMail || (await import('../memory.js')).sendAgentMessage;
  return send(noticeSender(task.agent_id), task.agent_id, noticeText(task), {
    workspaceId: task.workspace_id,
    userId: task.created_by,
    messageType: 'agent_report',
    priority: 'high',
    subject: `GitHub task #${task.issue_number}: pull request ${task.status === 'merged' ? 'merged' : 'open'}`,
    importanceScore: 0.8,
    idempotencyKey: `github-agent-task:${task.id}:${task.status}:${task.pr_number}`,
  });
}

/**
 * One webhook delivery, already signature-checked. Returns
 * { handled, matched, linked, changed: [task rows], notices }; calls notify(task) once for
 * each task that moved to pr_open or merged. Never calls GitHub.
 */
export async function handleGithubAgentDelivery(db, { event, payload }, { notify = sendTaskNotice } = {}) {
  if (event !== 'pull_request') return { handled: false, matched: false, changed: [] };
  const pr = payload?.pull_request || {};
  const status = nextStatus(payload?.action, pr);
  const repo = clean(payload?.repository?.full_name);
  if (!status || !repo) return { handled: false, matched: false, changed: [] };
  // A pull request from a fork (or a deleted fork, head.repo null) can't claim a task:
  // the @grok / @claude workers push their branches to this repo.
  if (pr.head && 'repo' in pr.head && clean(pr.head.repo?.full_name).toLowerCase() !== repo.toLowerCase()) {
    return { handled: true, matched: false, linked: 0, changed: [], notices: [] };
  }
  const changed = [];
  const linked = linkedIssueNumbers(pr);
  for (const issueNumber of linked) {
    const task = await moveTask(db, {
      repo, issueNumber, status, prNumber: Number(pr.number) || null, prUrl: clean(pr.html_url) || null,
    });
    if (task) changed.push(task);
  }
  const notices = [];
  for (const task of changed) {
    if (task.status === 'pr_open' || task.status === 'merged') {
      notices.push(await notify(task).then(() => true, (err) => ({ err })));
    }
  }
  return { handled: true, matched: changed.length > 0, linked: linked.length, changed, notices };
}
