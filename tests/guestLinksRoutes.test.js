import { jest } from '@jest/globals';
import request from 'supertest';
import crypto from 'node:crypto';

// In-memory stand-ins for Postgres: share links, joins, comments, agents.
const links = new Map();
const joins = [];
const comments = [];
const sha = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

const pool = {
  query: jest.fn(async (sql, params = []) => {
    if (/FROM users/.test(sql)) return { rows: [{ id: params[0], name: 'Alex', email: 'alex@example.com' }] };
    if (/SELECT id, name FROM agents/.test(sql)) return { rows: [{ id: 'censai', name: 'Censai' }, { id: 'architect', name: 'The Architect' }] };
    if (/FROM agents WHERE id/.test(sql)) return { rows: [{ id: params[0], name: 'Censai', role: 'researcher' }] };
    throw new Error(`unexpected query: ${sql}`);
  }),
  on: jest.fn(),
};

const realTokens = await import('../server/shareLinks/tokens.js');
const linkIsActive = (link) => Boolean(link && !link.revoked_at && (!link.expires_at || new Date(link.expires_at) > new Date()));
const publicView = (row) => (row ? { ...row, active: linkIsActive(row) } : null);

jest.unstable_mockModule('../server/db.js', () => ({ default: pool }));
jest.unstable_mockModule('../server/workspaces/context.js', () => ({
  requireWorkspaceMember: jest.fn(async (_db, { workspaceId, userId, roles }) => {
    const role = Number(userId) === 7 ? 'owner' : 'member';
    if (roles && !roles.includes(role)) throw Object.assign(new Error('Workspace role does not allow this operation'), { statusCode: 403 });
    return { id: workspaceId, name: 'Rivera kitchen', role };
  }),
}));
jest.unstable_mockModule('../server/state/clientStateStore.js', () => ({
  WORKSPACE_STATE_KEY: 'homebase.workspace.v1',
  getWorkspaceState: jest.fn(async () => ({
    found: true,
    value: { wins: [{ id: 'brief', kind: 'doc', x: 0, y: 0, w: 10, h: 10 }, { id: 'shell', kind: 'terminal', x: 0, y: 0, w: 10, h: 10 }] },
  })),
}));
const callModel = jest.fn(async () => ({ choices: [{ message: { content: 'About 48k is realistic.' } }], usage: { total_tokens: 150 } }));
jest.unstable_mockModule('../server/aiGateway/index.js', () => ({
  callModel,
  createModelAccessContext: (value) => value,
}));
jest.unstable_mockModule('../server/shareLinks/store.js', () => ({
  ShareLinkError: class ShareLinkError extends Error {},
  linkIsActive,
  createShareLink: jest.fn(async (_db, { workspaceId, userId, input }) => {
    const token = realTokens.createShareToken();
    const link = {
      id: `link-${links.size + 1}`, workspace_id: workspaceId, workspace_name: 'Rivera kitchen', token_hash: sha(token),
      role: input.role, mode: input.mode || 'link', scope_kind: input.scopeKind || 'board', scope_id: input.scopeId || null,
      stage: Boolean(input.stage), passcode_hash: input.passcode ? realTokens.hashPasscode(input.passcode) : null,
      has_passcode: Boolean(input.passcode), expires_at: null, agent_budget_tokens: input.agentBudgetTokens || 0,
      agent_tokens_used: 0, created_by_user_id: userId, revoked_at: null,
    };
    links.set(link.id, link);
    return { link, token };
  }),
  listShareLinks: jest.fn(async () => [...links.values()]),
  getShareLinkById: jest.fn(async (_db, id) => links.get(String(id)) || null),
  findShareLinkByToken: jest.fn(async (_db, token) => [...links.values()].find((link) => link.token_hash === sha(token)) || null),
  revokeShareLink: jest.fn(async (_db, { linkId }) => {
    const link = links.get(linkId);
    if (link) link.revoked_at = new Date();
    return link || null;
  }),
  revokeLiveLinks: jest.fn(async () => []),
  setLinkStage: jest.fn(async () => null),
  recordShareLinkJoin: jest.fn(async (_db, row) => { joins.push(row); }),
  listShareLinkJoins: jest.fn(async () => joins.map((row) => ({ guest_id: row.guestId, display_name: row.name, color: row.color, joined_at: new Date() }))),
  linkHasAgentBudget: jest.fn(async (_db, id) => {
    const link = links.get(id);
    return link.agent_tokens_used < link.agent_budget_tokens;
  }),
  chargeAgentBudget: jest.fn(async (_db, id, tokens) => { links.get(id).agent_tokens_used += tokens; }),
  listComments: jest.fn(async () => comments),
  getComment: jest.fn(async (_db, { commentId }) => comments.find((row) => row.id === commentId) || null),
  insertComment: jest.fn(async (_db, input) => {
    const row = {
      id: `c${comments.length + 1}`, thread_id: input.threadId, author_kind: input.authorKind, author_id: input.authorId,
      author_name: input.authorName, author_color: input.authorColor, body: input.body, x: input.x, y: input.y,
      window_id: input.windowId, mentions: input.mentions, resolved_at: null, created_at: new Date().toISOString(),
    };
    comments.push(row);
    return row;
  }),
  setCommentResolved: jest.fn(async (_db, { commentId, resolved }) => {
    const row = comments.find((entry) => entry.id === commentId);
    if (row) row.resolved_at = resolved ? new Date() : null;
    return row || null;
  }),
  publicShareLink: publicView,
  publicComment: (row) => ({ id: row.id, threadId: row.thread_id, body: row.body, author: { kind: row.author_kind, name: row.author_name }, windowId: row.window_id, resolvedAt: row.resolved_at }),
}));

const { guestRouter, shareLinksRouter, __resetGuestJoinLimitForTests } = await import('../server/routes/shareLinks.js');
const express = (await import('express')).default;

function appWith(session) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = session;
    session.save = (cb) => cb();
    next();
  });
  app.use('/api/guest', guestRouter);
  app.use('/api', shareLinksRouter);
  return app;
}

async function makeLink(input) {
  const res = await request(appWith({ userId: 7 })).post('/api/workspaces/board-a/share-links').send(input);
  expect(res.status).toBe(201);
  return res.body;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 20));

beforeEach(() => {
  links.clear();
  joins.length = 0;
  comments.length = 0;
  callModel.mockClear();
  __resetGuestJoinLimitForTests();
});

test('only owners and admins manage links; the raw token is returned once', async () => {
  const denied = await request(appWith({ userId: 8 })).post('/api/workspaces/board-a/share-links').send({ role: 'view' });
  expect(denied.status).toBe(403);
  const { token, link } = await makeLink({ role: 'comment' });
  expect(token).toHaveLength(43);
  expect(JSON.stringify(link)).not.toContain(token);
});

test('a guest joins with a name, sees only shareable windows, and the join is audited', async () => {
  const { token } = await makeLink({ role: 'comment' });
  const session = {};
  const app = appWith(session);
  const preview = await request(app).get(`/api/guest/links/${token}`);
  expect(preview.body).toMatchObject({ workspaceName: 'Rivera kitchen', role: 'comment', needsPasscode: false });
  expect((await request(app).post(`/api/guest/links/${token}/join`).send({ name: '  ' })).status).toBe(400);
  const joined = await request(app).post(`/api/guest/links/${token}/join`).send({ name: 'Maria', color: '#4f7cac' });
  expect(joined.status).toBe(201);
  expect(session.guest).toMatchObject({ name: 'Maria', color: '#4f7cac' });
  expect(session.userId).toBeUndefined();
  expect(joins).toHaveLength(1);
  const board = await request(app).get('/api/guest/board');
  expect(board.body.board.wins.map((win) => win.id)).toEqual(['brief']);
});

test('wrong passcodes are refused and repeated failures are rate limited', async () => {
  const { token } = await makeLink({ role: 'view', passcode: 'rivera' });
  const app = appWith({});
  const wrong = await request(app).post(`/api/guest/links/${token}/join`).send({ name: 'M', passcode: 'nope' });
  expect(wrong.status).toBe(403);
  for (let i = 0; i < 9; i += 1) await request(app).post(`/api/guest/links/${token}/join`).send({ name: 'M', passcode: 'nope' });
  const blocked = await request(app).post(`/api/guest/links/${token}/join`).send({ name: 'M', passcode: 'rivera' });
  expect(blocked.status).toBe(429);
});

test('successful joins never count toward the limit (a whole classroom can join)', async () => {
  const { token } = await makeLink({ role: 'view' });
  for (let i = 0; i < 25; i += 1) {
    expect((await request(appWith({})).post(`/api/guest/links/${token}/join`).send({ name: `Student ${i}` })).status).toBe(201);
  }
});

test('a view link cannot comment; revoking ends the guest pass everywhere', async () => {
  const { token, link } = await makeLink({ role: 'view' });
  const session = {};
  const app = appWith(session);
  await request(app).post(`/api/guest/links/${token}/join`).send({ name: 'Maria' });
  const comment = await request(app).post('/api/guest/comments').send({ body: 'hi', x: 1, y: 1 });
  expect(comment.status).toBe(403);
  await request(appWith({ userId: 7 })).delete(`/api/workspaces/board-a/share-links/${link.id}`);
  expect((await request(app).get('/api/guest/board')).status).toBe(410);
  expect((await request(app).get(`/api/guest/links/${token}`)).status).toBe(404);
  expect((await request(app).get('/api/guest/session')).body).toMatchObject({ guest: null, ended: true });
});

test('a commenter pins, the owner replies, and @agent answers within the link budget', async () => {
  const { token, link } = await makeLink({ role: 'comment', agentBudgetTokens: 200 });
  const guestApp = appWith({});
  await request(guestApp).post(`/api/guest/links/${token}/join`).send({ name: 'Maria' });
  const pin = await request(guestApp).post('/api/guest/comments').send({ body: 'Budget? @censai', x: 10, y: 20, windowId: 'brief' });
  expect(pin.status).toBe(201);
  await flush();
  expect(callModel).toHaveBeenCalledTimes(1);
  expect(callModel.mock.calls[0][0].accessContext).toMatchObject({ userId: '7', workspaceId: 'board-a' });
  expect(comments.at(-1)).toMatchObject({ author_kind: 'agent', body: 'About 48k is realistic.', thread_id: pin.body.comment.id });
  expect(links.get(link.id).agent_tokens_used).toBe(150);

  const reply = await request(appWith({ userId: 7 })).post('/api/workspaces/board-a/comments').send({ body: 'Yes', threadId: pin.body.comment.id });
  expect(reply.status).toBe(201);

  await request(guestApp).post('/api/guest/comments').send({ body: '@censai again', threadId: pin.body.comment.id });
  await flush();
  await request(guestApp).post('/api/guest/comments').send({ body: '@censai and again', threadId: pin.body.comment.id });
  await flush();
  expect(callModel).toHaveBeenCalledTimes(2);
  expect(comments.at(-1).body).toMatch(/used up its agent budget/);

  const list = await request(guestApp).get('/api/guest/comments');
  expect(list.body.agents.map((agent) => agent.handle)).toEqual(['censai', 'architect']);
});

test('a link with no agent budget never reaches the agents', async () => {
  const { token } = await makeLink({ role: 'comment' });
  const guestApp = appWith({});
  await request(guestApp).post(`/api/guest/links/${token}/join`).send({ name: 'Maria' });
  await request(guestApp).post('/api/guest/comments').send({ body: '@censai hello', x: 1, y: 1 });
  await flush();
  expect(callModel).not.toHaveBeenCalled();
  expect((await request(guestApp).get('/api/guest/comments')).body.agents).toEqual([]);
});
