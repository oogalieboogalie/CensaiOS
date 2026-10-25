import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// The Mailcow window works with the server's own Mailcow key, so its lists and
// every change are for this computer's owner only. Pretend people, never real
// ones: Pat Example (1, pat@example.test) owns this computer; Sam Example
// (2, sam@example.test) is a teammate. Mailcow itself is a stand-in.
const PEOPLE = {
  1: { role: 'admin', name: 'Pat Example', email: 'pat@example.test' },
  2: { role: 'user', name: 'Sam Example', email: 'sam@example.test' },
};
const pool = {
  query: jest.fn(async (sql, params = []) => {
    if (sql.startsWith('SELECT role FROM users')) return { rows: PEOPLE[params[0]] ? [{ role: PEOPLE[params[0]].role }] : [] };
    if (sql.includes("role = 'admin'")) return { rows: [{ name: PEOPLE[1].name }] };
    if (sql.includes('AS name FROM users WHERE id')) return { rows: PEOPLE[params[0]] ? [{ name: PEOPLE[params[0]].name }] : [] };
    return { rows: [] };
  }),
};
const logs = [];
const mailcowGet = jest.fn(async () => [{ domain: 'made-up.example.test' }]);
const mailcowPost = jest.fn(async () => [{ type: 'success', msg: 'done' }]);

jest.unstable_mockModule('../server/db.js', () => ({ default: pool }));
jest.unstable_mockModule('../server/logger.js', () => ({
  createLogger: (name) => ({
    info: (m) => logs.push(`[${name}] ${m}`),
    warn: (m) => logs.push(`[${name}] ${m}`),
    error: (m) => logs.push(`[${name}] ${m}`),
    debug: () => {},
  }),
}));
jest.unstable_mockModule('../server/mailcow.js', () => ({
  mailcowGet,
  mailcowPost,
  mailcowConfigured: () => true,
  getMailcowBaseUrl: () => 'https://mail.example.test',
}));

const { mailcowRouter } = await import('../server/routes/mailcow.js');
const { OWNER_ONLY_MESSAGE } = await import('../server/security/systemAdmin.js');

function app(userId) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => { req.session = userId ? { userId } : {}; next(); });
  a.use('/api/mailcow', mailcowRouter);
  return a;
}

const ROUTES = [
  ['list mail domains', 'get', '/api/mailcow/domains', null],
  ['add a mail domain', 'post', '/api/mailcow/domains', { domain: 'made-up.example.test' }],
  ['delete a mail domain', 'delete', '/api/mailcow/domains', { items: ['made-up.example.test'] }],
  ['list mailboxes', 'get', '/api/mailcow/mailboxes', null],
  ['add a mailbox', 'post', '/api/mailcow/mailboxes', { local_part: 'sam', domain: 'made-up.example.test' }],
  ['delete a mailbox', 'delete', '/api/mailcow/mailboxes', { items: ['sam@made-up.example.test'] }],
  ['list aliases', 'get', '/api/mailcow/aliases', null],
  ['add an alias', 'post', '/api/mailcow/aliases', { address: 'hi@made-up.example.test', goto: 'pat@example.test' }],
  ['delete an alias', 'delete', '/api/mailcow/aliases', { items: ['7'] }],
  ['list the mail queue', 'get', '/api/mailcow/queue', null],
  ['flush the mail queue', 'post', '/api/mailcow/queue/flush', null],
];

const send = (userId, method, url, body) => {
  const r = request(app(userId))[method](url);
  return body ? r.send(body) : r;
};

const PRIVATE = /Pat|Sam|example\.test|@/;

beforeEach(() => {
  logs.length = 0;
  mailcowGet.mockClear();
  mailcowPost.mockClear();
  delete process.env.CENSAI_MODE;
});

describe('Mailcow is for the computer owner only', () => {
  test.each(ROUTES)('a teammate cannot %s', async (_label, method, url, body) => {
    const res = await send(2, method, url, body);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe(OWNER_ONLY_MESSAGE);
    expect(res.body.code).toBe('computer_owner_only');
    expect(mailcowGet).not.toHaveBeenCalled();
    expect(mailcowPost).not.toHaveBeenCalled();
    const line = logs.find((l) => l.startsWith('[mailcow]'));
    expect(line).toBe(`[mailcow] refused ${method.toUpperCase()} ${url} for user 2: owner only`);
    for (const l of logs) expect(l).not.toMatch(PRIVATE);
  });

  test('someone signed out is turned away too', async () => {
    const res = await send(null, 'get', '/api/mailcow/mailboxes');
    expect(res.status).toBe(401);
    expect(mailcowGet).not.toHaveBeenCalled();
    expect(logs).toContain('[mailcow] refused GET /api/mailcow/mailboxes for user none: owner only');
  });

  test.each(ROUTES)('the owner can %s', async (_label, method, url, body) => {
    const res = await send(1, method, url, body);
    expect(res.status).toBe(200);
    expect(mailcowGet.mock.calls.length + mailcowPost.mock.calls.length).toBe(1);
    for (const l of logs) expect(l).not.toMatch(PRIVATE);
  });

  test('each change by the owner leaves one plain mailcow line', async () => {
    await send(1, 'post', '/api/mailcow/mailboxes', { local_part: 'sam', domain: 'made-up.example.test', password: 'pw' });
    expect(logs).toEqual(['[mailcow] add a mailbox for user 1: worked']);
    mailcowPost.mockResolvedValueOnce([{ type: 'error', msg: 'sam@made-up.example.test exists' }]);
    await send(1, 'delete', '/api/mailcow/domains', { items: ['made-up.example.test'] });
    expect(logs[1]).toBe('[mailcow] delete a mail domain for user 1: Mailcow said no');
    mailcowPost.mockRejectedValueOnce(new Error('mailcow API error 500: made-up.example.test'));
    await send(1, 'post', '/api/mailcow/queue/flush');
    expect(logs[2]).toBe('[mailcow] flush the mail queue for user 1: Mailcow could not be reached or answered with an error');
  });

  test('the health check tells a teammate only that Mailcow is set up', async () => {
    const res = await send(2, 'get', '/api/mailcow/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ configured: true, ownerOnly: true });
    expect(mailcowGet).not.toHaveBeenCalled();
  });

  test('the health check gives the owner the counts and address', async () => {
    const res = await send(1, 'get', '/api/mailcow/health');
    expect(res.body).toMatchObject({ configured: true, ok: true, domainCount: 1, baseUrl: 'https://mail.example.test' });
  });
});
