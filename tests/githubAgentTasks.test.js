import { jest } from '@jest/globals';
import crypto from 'node:crypto';
import request from 'supertest';

// Agents hand a coding job to the repo's GitHub coding agent and hear back
// when its pull request opens or merges (server/github/agentTasks.js,
// server/tools/handlers/git/agentTask.js, server/routes/githubAgentWebhook.js).
// GitHub and the database are made up; the signature check, matching and
// status rules are the real ones. Pat Example owns this computer (user 1),
// Sam Example is a teammate (user 2).

jest.unstable_mockModule('../server/db.js', () => ({ default: { query: jest.fn(), on: jest.fn(), end: jest.fn() } }));
const logged = [];
const record = (level) => (message, meta) => logged.push(`${level} ${message} ${meta ? JSON.stringify(meta) : ''}`);
const log = { error: record('error'), warn: record('warn'), info: record('info'), debug: record('debug'), trace: () => {}, startTimer: () => () => 0 };
jest.unstable_mockModule('../server/logger.js', () => ({
  createLogger: () => log,
  redactUrl: (url) => url,
  writeLogRecord: () => {},
  onLogRecord: () => () => {},
}));

const { createGithubTaskIssue } = await import('../server/tools/handlers/git/agentTask.js');
const { createGithubAgentWebhookRouter } = await import('../server/routes/githubAgentWebhook.js');
const { sendTaskNotice, NO_TASK_REPO, linkedIssueNumbers } = await import('../server/github/agentTasks.js');
const { assertHostToolAllowed, changesHost } = await import('../server/tools/rbac/hostOwnerOnly.js');
const { OWNER_ONLY_MESSAGE } = await import('../server/security/systemAdmin.js');
const express = (await import('express')).default;

const REPO = 'pat-example/made-up-repo';
const SECRET = 'made-up-webhook-secret';

// agent_github_tasks, kept in memory with the same move rules as the SQL.
function fakeTaskDb() {
  const rows = [];
  const query = jest.fn(async (sql, params = []) => {
    if (/^\s*INSERT INTO agent_github_tasks/i.test(sql)) {
      const [repo, issue_number, issue_url, workspace_id, agent_id, conversation_id, created_by, worker] = params;
      if (rows.some((r) => r.repo === repo && r.issue_number === issue_number)) return { rows: [] };
      const row = { id: rows.length + 1, repo, issue_number, issue_url, workspace_id, agent_id, conversation_id, created_by, worker, status: 'open', pr_number: null, pr_url: null };
      rows.push(row);
      return { rows: [row] };
    }
    if (/^\s*UPDATE agent_github_tasks/i.test(sql)) {
      const [repo, issueNumber, prNumber, status, prUrl] = params;
      const row = rows.find((r) => r.repo.toLowerCase() === repo.toLowerCase() && r.issue_number === issueNumber);
      const allowed = row && ({
        pr_open: () => ['open', 'closed'].includes(row.status),
        merged: () => row.status !== 'merged',
        closed: () => row.status === 'pr_open' && row.pr_number === prNumber,
      })[status]();
      if (!allowed) return { rows: [] };
      Object.assign(row, { status, pr_number: prNumber, pr_url: prUrl });
      return { rows: [{ ...row }] };
    }
    throw new Error(`unexpected query: ${sql}`);
  });
  return { rows, query };
}

beforeEach(() => {
  logged.length = 0;
  process.env.GITHUB_AGENT_WEBHOOK_SECRET = SECRET;
});
afterAll(() => { delete process.env.GITHUB_AGENT_WEBHOOK_SECRET; });

describe('create_github_issue', () => {
  const job = {
    title: 'Add a dark mode switch',
    goal: 'The Settings window has a dark mode switch.',
    steps: ['Add the switch', 'Save the choice'],
    acceptance: ['The switch flips the board dark', 'The choice survives a reload'],
  };
  const context = { userId: 1, workspaceId: 'made-up-board', conversationId: 'conv-7' };

  test('files the issue with the tag and labels, and saves the task for this agent', async () => {
    const db = fakeTaskDb();
    const createIssue = jest.fn(async () => ({ number: 41, html_url: 'https://made-up.example/issues/41' }));
    const out = await createGithubTaskIssue('atlas', job, context, { db, createIssue, env: { CENSAI_AGENT_TASK_REPO: REPO } });

    expect(JSON.parse(out)).toEqual({ issue_number: 41, issue_url: 'https://made-up.example/issues/41' });
    const [repo, title, body, labels] = createIssue.mock.calls[0];
    expect(repo).toBe(REPO);
    expect(title).toBe(job.title);
    expect(labels).toEqual(['agent-task', 'auto-implement']);
    expect(body).toContain('## Goal\nThe Settings window has a dark mode switch.');
    expect(body).toContain('## Steps\n1. Add the switch\n2. Save the choice');
    expect(body).toContain('## Done when\n- [ ] The switch flips the board dark\n- [ ] The choice survives a reload');
    expect(body.trim().endsWith('@grok please build this.')).toBe(true);
    expect(db.rows).toEqual([expect.objectContaining({
      repo: REPO, issue_number: 41, agent_id: 'atlas', workspace_id: 'made-up-board',
      conversation_id: 'conv-7', created_by: 1, worker: 'grok', status: 'open',
    })]);
  });

  test('tags @claude when asked, and the named repo wins over the default', async () => {
    const createIssue = jest.fn(async () => ({ number: 5, html_url: 'u' }));
    await createGithubTaskIssue('atlas', { ...job, worker: 'claude', repo: 'pat-example/other-repo' }, context,
      { db: fakeTaskDb(), createIssue, env: { CENSAI_AGENT_TASK_REPO: REPO } });
    expect(createIssue.mock.calls[0][0]).toBe('pat-example/other-repo');
    expect(createIssue.mock.calls[0][2].trim().endsWith('@claude please build this.')).toBe(true);
  });

  test('refuses clearly with no repo named and none set, without calling GitHub', async () => {
    const createIssue = jest.fn();
    const out = await createGithubTaskIssue('atlas', job, context, { db: fakeTaskDb(), createIssue, env: {} });
    expect(out).toBe(`Error: ${NO_TASK_REPO}`);
    expect(createIssue).not.toHaveBeenCalled();
  });

  test('only the computer owner may use it', async () => {
    expect(changesHost('create_github_issue')).toBe(true);
    const roles = { 1: 'admin', 2: 'user' };
    const db = { query: jest.fn(async (_sql, [id]) => ({ rows: roles[id] ? [{ role: roles[id] }] : [] })) };
    const ask = (userId) => assertHostToolAllowed(db, { name: 'create_github_issue', args: {}, context: { userId }, mode: 'private_server' });
    await expect(ask(1)).resolves.toEqual({ enforced: true, userId: 1 });
    await expect(ask(2)).rejects.toMatchObject({ code: 'COMPUTER_OWNER_ONLY', message: OWNER_ONLY_MESSAGE });
  });
});

describe('POST /api/webhooks/github-agent', () => {
  function setup() {
    const db = fakeTaskDb();
    db.rows.push({ id: 1, repo: REPO, issue_number: 41, issue_url: 'i41', workspace_id: 'made-up-board', agent_id: 'atlas', created_by: 1, worker: 'grok', status: 'open', pr_number: null, pr_url: null });
    db.rows.push({ id: 2, repo: REPO, issue_number: 42, issue_url: 'i42', workspace_id: 'made-up-board', agent_id: 'nexus', created_by: 1, worker: 'claude', status: 'open', pr_number: null, pr_url: null });
    const notify = jest.fn(async () => 'mail-1');
    const app = express();
    // Same order as the real server: the raw body first, then the JSON parser for everything else.
    app.use('/api/webhooks/github-agent', express.raw({ type: '*/*', limit: '2mb' }));
    app.use(express.json());
    app.use('/api/webhooks', createGithubAgentWebhookRouter({ db, notify }));
    return { db, notify, app };
  }
  const sign = (body, secret = SECRET) => `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
  const send = (app, event, payload, signature) => {
    const body = JSON.stringify(payload);
    return request(app).post('/api/webhooks/github-agent')
      .set('Content-Type', 'application/json')
      .set('X-GitHub-Event', event)
      .set('X-Hub-Signature-256', signature === undefined ? sign(body) : signature)
      .send(body);
  };
  const pr = (action, { number = 77, body = '', ref = 'feature/x', merged = false } = {}) => ({
    action,
    repository: { full_name: REPO },
    pull_request: { number, html_url: `https://made-up.example/pull/${number}`, body, merged, head: { ref } },
  });

  test('a pull request from a fork cannot claim a task', async () => {
    const { app, db, notify } = setup();
    const fork = pr('opened', { body: 'Fixes #41' });
    fork.pull_request.head.repo = { full_name: 'someone-else/fork' };
    const res = await send(app, 'pull_request', fork);
    expect(res.status).toBe(200);
    expect(db.query).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  test('answers 503 to everything while no secret is set', async () => {
    delete process.env.GITHUB_AGENT_WEBHOOK_SECRET;
    const { app, db } = setup();
    const res = await send(app, 'pull_request', pr('opened', { body: 'Fixes #41' }));
    expect(res.status).toBe(503);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('rejects a bad or missing signature', async () => {
    const { app, db, notify } = setup();
    expect((await send(app, 'pull_request', pr('opened', { body: 'Fixes #41' }), sign('{}', 'wrong-secret'))).status).toBe(401);
    expect((await send(app, 'pull_request', pr('opened', { body: 'Fixes #41' }), '')).status).toBe(401);
    expect(db.query).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  test('matches by "Fixes #N", marks the task pr_open and posts one notice', async () => {
    const { app, db, notify } = setup();
    const res = await send(app, 'pull_request', pr('opened', { body: 'Builds the switch.\n\nFixes #41' }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, matched: true });
    expect(db.rows[0]).toMatchObject({ status: 'pr_open', pr_number: 77, pr_url: 'https://made-up.example/pull/77' });
    expect(db.rows[1].status).toBe('open');
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toMatchObject({ agent_id: 'atlas', issue_number: 41, status: 'pr_open' });
  });

  test('matches by branch name, and marks it merged when the pull request merges', async () => {
    const { app, db, notify } = setup();
    await send(app, 'pull_request', pr('opened', { number: 80, ref: 'claude/issue-42-dark-mode' }));
    expect(db.rows[1]).toMatchObject({ status: 'pr_open', pr_number: 80 });
    await send(app, 'pull_request', pr('closed', { number: 80, ref: 'claude/issue-42-dark-mode', merged: true }));
    expect(db.rows[1].status).toBe('merged');
    expect(notify.mock.calls.map(([task]) => task.status)).toEqual(['pr_open', 'merged']);
  });

  test('posts exactly one notice per state change, even when GitHub sends a delivery twice', async () => {
    const { app, notify } = setup();
    const opened = pr('opened', { body: 'Closes #41' });
    const merged = pr('closed', { body: 'Closes #41', merged: true });
    for (const payload of [opened, opened, merged, merged]) {
      expect((await send(app, 'pull_request', payload)).status).toBe(200);
    }
    expect(notify.mock.calls.map(([task]) => task.status)).toEqual(['pr_open', 'merged']);
  });

  test('a pull request closed without merging marks the task closed and sends no notice', async () => {
    const { app, db, notify } = setup();
    await send(app, 'pull_request', pr('opened', { body: 'Fixes #41' }));
    await send(app, 'pull_request', pr('closed', { body: 'Fixes #41', merged: false }));
    expect(db.rows[0].status).toBe('closed');
    expect(notify).toHaveBeenCalledTimes(1);
  });

  test('ignores other events and other pull request actions with 204', async () => {
    const { app, db, notify } = setup();
    expect((await send(app, 'ping', { zen: 'made up' })).status).toBe(204);
    expect((await send(app, 'issues', { action: 'opened', repository: { full_name: REPO } })).status).toBe(204);
    expect((await send(app, 'pull_request', pr('synchronize', { body: 'Fixes #41' }))).status).toBe(204);
    expect(db.query).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  test('logs each delivery by event, action and match, never its body', async () => {
    const { app } = setup();
    await send(app, 'pull_request', pr('opened', { body: 'Secret plan words. Fixes #41' }));
    await send(app, 'pull_request', pr('opened', { body: 'Fixes #999' }));
    const lines = logged.filter((l) => l.includes('github agent webhook delivery'));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('"event":"pull_request"');
    expect(lines[0]).toContain('"action":"opened"');
    expect(lines[0]).toContain('"matched":true');
    expect(lines[1]).toContain('"matched":false');
    expect(logged.join('\n')).not.toContain('Secret plan words');
  });
});

describe('the notice', () => {
  test('is one wakeable family mail into that agent\'s chat, with the pull request link', async () => {
    const sendMail = jest.fn(async () => 'mail-1');
    const task = { id: 3, agent_id: 'atlas', workspace_id: 'made-up-board', created_by: 1, issue_number: 41, pr_number: 77, pr_url: 'https://made-up.example/pull/77', status: 'merged' };
    await sendTaskNotice(task, { sendMail });
    expect(sendMail).toHaveBeenCalledTimes(1);
    const [from, to, text, opts] = sendMail.mock.calls[0];
    expect(from).not.toBe(to);
    expect(to).toBe('atlas');
    expect(text).toBe('Pull request #77 for task #41 is merged: https://made-up.example/pull/77. Run read_app_log and check the fix.');
    expect(opts).toMatchObject({ workspaceId: 'made-up-board', userId: 1, messageType: 'agent_report' });
    expect(opts.wake).not.toBe(false);
  });

  test('reads issue links from the body and the coding agents\' branch names', () => {
    expect(linkedIssueNumbers({ body: 'fixes #3 and Closes #4', head: { ref: 'grok/issue-5-x' } }).sort()).toEqual([3, 4, 5]);
    expect(linkedIssueNumbers({ body: 'see #3', head: { ref: 'someone/issue-6-x' } })).toEqual([]);
  });
});
