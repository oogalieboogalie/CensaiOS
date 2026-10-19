// API Bar: one front door with a doorman. Pins the rules: one note shape,
// the bar passes the note to the existing route (with that route's own
// guards), pages once, signs every answer, and a bar key opens only the
// branches its owner picked, never lends its sign-in past one call, and
// cannot spend or change anything when it is look only.
import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

jest.unstable_mockModule('../server/db.js', () => ({ default: { query: jest.fn(), on: jest.fn() } }));

const keyStore = await import('../server/apiBar/keys.js');
const { createApiBarRouter } = await import('../server/routes/apiBar.js');
const { generateIdentity, identitySigner } = await import('../server/agentNetwork/installIdentity.js');
const { checkStamp, agentIdentity } = await import('../server/apiBar/signing.js');
const { pageAnswer } = await import('../server/apiBar/paging.js');
const { describeMenu, BRANCH_NAMES } = await import('../server/apiBar/catalog.js');

const signer = identitySigner(generateIdentity());

function memoryKeys() {
  const keys = new Map();
  const calls = [];
  return {
    calls,
    ...keyStore,
    async createKey(_db, { userId, label, branches, lookOnly = true }) {
      const token = keyStore.createBarToken();
      const row = {
        id: `00000000-0000-4000-8000-00000000000${keys.size + 1}`, user_id: userId, label: keyStore.cleanLabel(label),
        branches: keyStore.cleanBranches(branches), look_only: lookOnly !== false, token_hint: token.slice(-4),
        hash: keyStore.hashBarToken(token), revoked_at: null, user_email: `u${userId}@example.com`, user_role: 'user', user_name: null,
      };
      keys.set(row.id, row);
      return { token, row };
    },
    async listKeys(_db, { userId }) { return [...keys.values()].filter((k) => k.user_id === userId); },
    async revokeKey(_db, { userId, keyId }) {
      const row = keys.get(keyId);
      if (!row || row.user_id !== userId) return null;
      row.revoked_at = new Date();
      return row;
    },
    async findKeyByToken(_db, token) {
      return [...keys.values()].find((k) => k.hash === keyStore.hashBarToken(token)) || null;
    },
    async touchKey() {},
    async logCall(_db, call) { calls.push(call); },
    async listCalls(_db, { userId }) { return calls.filter((c) => c.userId === userId); },
  };
}

const LEADS = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, name: `Lead ${i + 1}` }));
const BOOKS_WIN = {
  id: 'w1', kind: 'yorBooks', title: 'Studio books',
  'ba.main': { name: 'Checking', type: 'checking', at: 1 },
  'bt.t1': { date: '2026-03-02', desc: 'Coffee beans', amt: -1250, acct: 'main', cat: 'supplies', at: 1 },
  'bt.t2': { date: '2026-03-05', desc: 'Client payment', amt: 50000, acct: 'main', cat: 'gross_receipts', at: 2 },
  'bt.t3': { date: '2025-12-30', desc: 'Coffee with client', amt: -900, acct: 'main', cat: 'meals', at: 3 },
};

function makeApp(keys = memoryKeys()) {
  const seen = [];
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    // Like express-session: a request that already has a session keeps it.
    if (req.session) return next();
    const user = req.get('x-test-user');
    req.session = user ? { userId: Number(user) } : {};
    next();
  });
  app.use('/api/bar', createApiBarRouter({
    db: null, keys, getSigner: async () => signer, testSession: false,
    agentCalls: { cleanQuestion: (m) => String(m), performOutsideCall: jest.fn(), deps: {} },
  }));
  // Stand-in for the real sign-in guard and the routes behind the branches.
  app.use('/api', (req, res, next) => (req.session?.userId ? next() : res.status(401).json({ error: 'Unauthorized' })));
  app.get('/api/sales-leads', (req, res) => {
    seen.push({ userId: req.session.userId, status: req.query.status });
    res.json({ leads: LEADS });
  });
  app.post('/api/research/search', (req, res) => res.json({ ok: true, results: [{ url: 'https://a', q: req.body.query }] }));
  app.get('/api/client-state/homebase.workspace.v1', (_req, res) => res.json({ value: { wins: [BOOKS_WIN, { id: 'n', kind: 'note' }] }, revision: 3 }));
  return { app, keys, seen };
}

test('the menu lists every branch with an example note', async () => {
  const { app } = makeApp();
  const res = await request(app).get('/api/bar').set('x-test-user', '1');
  expect(res.status).toBe(200);
  expect(res.body.branches.map((b) => b.branch)).toEqual(BRANCH_NAMES);
  const search = res.body.branches.find((b) => b.branch === 'finance').actions.find((a) => a.action === 'search');
  expect(search.example.api_bar).toEqual({ branch: 'finance', action: 'search', paginate: true });
  expect(describeMenu({ allowed: ['leads'] })).toHaveLength(1);
});

test('nobody gets in without a sign-in or a key', async () => {
  const { app } = makeApp();
  expect((await request(app).get('/api/bar')).status).toBe(401);
  expect((await request(app).get('/api/bar').set('Authorization', 'Bearer cbk_wrong')).status).toBe(401);
});

test('one note shape: the bar passes it to the route, pages once and signs the answer', async () => {
  const { app, seen } = makeApp();
  const res = await request(app).post('/api/bar').set('x-test-user', '7')
    .send({ api_bar: { branch: 'leads', action: 'saved', paginate: 'true', page: 2, page_size: 10 }, status: 'new' });
  expect(res.status).toBe(200);
  expect(res.body.answer.leads.map((l) => l.id)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  expect(res.body.api_bar).toMatchObject({ branch: 'leads', action: 'saved', page: 2, page_size: 10, total: 30, has_more: true, next_page: 3 });
  expect(seen).toEqual([{ userId: 7, status: 'new' }]);
  expect(res.body.signed.install_id).toBe(signer.installId);
  expect(checkStamp(res.body.signed, res.body.answer)).toBe(true);
  expect(checkStamp(res.body.signed, { ...res.body.answer, leads: [] })).toBe(false);
});

test('the same note works at /api/bar/<branch>/<action> with GET, POST or PUT', async () => {
  const { app } = makeApp();
  const get = await request(app).get('/api/bar/leads/saved?paginate=false').set('x-test-user', '1');
  expect(get.body.answer.leads).toHaveLength(30);
  const put = await request(app).put('/api/bar/research/search').set('x-test-user', '1').send({ query: 'crm' });
  expect(put.body.answer.results[0].q).toBe('crm');
  const getSpend = await request(app).get('/api/bar/research/search?query=crm').set('x-test-user', '1');
  expect(getSpend.status).toBe(405);
});

test('a bar key opens only its branches, look only blocks spending, and the sign-in is lent for one call', async () => {
  const { app, keys, seen } = makeApp();
  const made = await request(app).post('/api/bar/keys').set('x-test-user', '5')
    .send({ label: 'My script', branches: ['leads', 'finance'] });
  expect(made.status).toBe(200);
  expect(made.body.key.lookOnly).toBe(true);
  const auth = `Bearer ${made.body.token}`;

  const ok = await request(app).post('/api/bar').set('Authorization', auth).send({ api_bar: { branch: 'leads', action: 'saved' } });
  expect(ok.status).toBe(200);
  expect(seen.at(-1).userId).toBe(5);
  expect(ok.headers['set-cookie']).toBeUndefined();

  const otherBranch = await request(app).post('/api/bar').set('Authorization', auth).send({ api_bar: { branch: 'research', action: 'search' }, query: 'x' });
  expect(otherBranch.status).toBe(403);
  const spend = await request(app).post('/api/bar').set('Authorization', auth).send({ api_bar: { branch: 'leads', action: 'hunt' } });
  expect(spend.status).toBe(403);
  expect((await request(app).get('/api/bar/keys').set('Authorization', auth)).status).toBe(403);

  const menu = await request(app).get('/api/bar').set('Authorization', auth);
  expect(menu.body.branches.map((b) => b.branch)).toEqual(['finance', 'leads']);

  expect(keys.calls.map((c) => [c.branch, c.action, c.status, c.keyId ? 'key' : 'board'])).toEqual([
    ['leads', 'saved', 200, 'key'], ['research', 'search', 403, 'key'], ['leads', 'hunt', 403, 'key'],
  ]);

  await request(app).delete(`/api/bar/keys/${made.body.key.id}`).set('x-test-user', '5').expect(200);
  expect((await request(app).post('/api/bar').set('Authorization', auth).send({ api_bar: { branch: 'leads', action: 'saved' } })).status).toBe(401);
});

test('someone else cannot revoke your key', async () => {
  const { app } = makeApp();
  const made = await request(app).post('/api/bar/keys').set('x-test-user', '5').send({ label: 'Mine', branches: ['leads'] });
  expect((await request(app).delete(`/api/bar/keys/${made.body.key.id}`).set('x-test-user', '6')).status).toBe(404);
  expect((await request(app).post('/api/bar/keys').set('x-test-user', '5').send({ label: 'x', branches: ['nope'] })).status).toBe(400);
});

test('finance reads the Open Books windows on the board', async () => {
  const { app } = makeApp();
  const res = await request(app).post('/api/bar').set('x-test-user', '1')
    .send({ api_bar: { branch: 'finance', action: 'search', paginate: true }, query: 'coffee' });
  expect(res.status).toBe(200);
  expect(res.body.answer.books_found).toBe(1);
  expect(res.body.answer.transactions.map((t) => [t.date, t.amount])).toEqual([['2026-03-02', -12.5], ['2025-12-30', -9]]);
  const sum = await request(app).post('/api/bar').set('x-test-user', '1').send({ api_bar: { branch: 'finance', action: 'summary' }, year: 2026 });
  expect(sum.body.answer).toMatchObject({ year: 2026, money_in: 500, money_out: -12.5, net: 487.5 });
});

test('unknown branches get the menu back in words', async () => {
  const { app } = makeApp();
  const res = await request(app).post('/api/bar').set('x-test-user', '1').send({ api_bar: { branch: 'api9', action: 'go' } });
  expect(res.status).toBe(404);
  expect(res.body.error).toMatch(/Branches: finance, leads/);
});

test('paging leaves answers without a list alone, and agent ID cards are stable', () => {
  expect(pageAnswer({ ok: true }, 'leads', { paginate: true })).toEqual({ data: { ok: true }, paging: null });
  expect(agentIdentity('ci_abc', 'e1')).toBe(agentIdentity('ci_abc', 'e1'));
  expect(agentIdentity('ci_abc', 'e1')).not.toBe(agentIdentity('ci_abc', 'e2'));
});

test('the doorman puts the borrowed sign-in and the request back after one call', async () => {
  const { dispatchInternal } = await import('../server/apiBar/dispatch.js');
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { if (!req.session) req.session = {}; next(); });
  app.get('/probe', async (req, res) => {
    const inner = await dispatchInternal(req, res, { method: 'GET', path: '/api/who', query: { a: 1 }, asUser: { userId: 9, userEmail: 'n@example.com' } });
    res.json({ inner, after: req.session.userId ?? null, email: req.session.userEmail ?? null, url: req.url, method: req.method });
  });
  app.get('/api/who', (req, res) => res.status(201).json({ userId: req.session.userId, a: req.query.a }));
  const res = await request(app).get('/probe');
  expect(res.body).toEqual({ inner: { status: 201, data: { userId: 9, a: '1' } }, after: null, email: null, url: '/probe', method: 'GET' });
});
