// One-time invite tokens (server/tokens/store.js, docker/093-invite-tokens.sql).
// The store runs against a small in-memory stand-in for Postgres that keeps
// the one rule the feature rests on: the burning UPDATE checks and changes a
// row in one step, and a ROLLBACK puts the row back.
import { jest } from '@jest/globals';
import fs from 'node:fs';
import express from 'express';
import request from 'supertest';

const store = await import('../server/tokens/store.js');
const { __test__: schema } = await import('../server/tokens/schema.js');

const START = Date.parse('2026-11-05T12:00:00Z');
const tick = () => new Promise((resolve) => setImmediate(resolve));

function fakeDb({ roles = {} } = {}) {
  const state = {
    now: START,
    tokens: [],
    friendships: new Map(),
    members: new Set(),
    roles, // `${board}:${user}` -> role
    users: { 1: 'Alma', 2: 'Kim', 3: 'Noor' },
    params: [],
    failMembers: false,
  };
  const now = () => new Date(state.now);
  const byHash = (hash) => state.tokens.find((t) => t.token_hash === hash);

  async function run(sql, params = [], tx = null) {
    await tick();
    state.params.push(...params);
    const s = sql.replace(/\s+/g, ' ').trim();
    if (s === 'BEGIN' || s === 'COMMIT') { if (tx) tx.undo = []; return { rows: [] }; }
    if (s === 'ROLLBACK') { tx?.undo.reverse().forEach((fn) => fn()); return { rows: [] }; }
    if (s.startsWith('SELECT w.id, w.name, wm.role')) {
      const role = state.roles[`${params[0]}:${params[1]}`];
      return { rows: role ? [{ id: params[0], name: 'Board', role }] : [] };
    }
    if (s.startsWith('INSERT INTO invite_tokens')) {
      const [id, token_hash, creator_id, scope, target_id, expires_at] = params;
      state.tokens.push({ id, token_hash, creator_id, scope, target_id, expires_at, status: 'active', redeemed_at: null, redeemed_by: null, created_at: now() });
      return { rows: [], rowCount: 1 };
    }
    if (s.startsWith("UPDATE invite_tokens SET status = 'burned'")) {
      const [hash, user] = params;
      const row = byHash(hash);
      if (!row || row.status !== 'active' || !(row.expires_at > now()) || row.creator_id === user) return { rows: [] };
      const before = { ...row };
      Object.assign(row, { status: 'burned', redeemed_at: now(), redeemed_by: user });
      tx?.undo.push(() => Object.assign(row, before));
      return { rows: [{ ...row }] };
    }
    if (s.startsWith('SELECT id, status, creator_id')) {
      const row = byHash(params[0]);
      return { rows: row ? [{ ...row, past_due: row.expires_at <= now() }] : [] };
    }
    if (s.startsWith("UPDATE invite_tokens SET status = 'expired' WHERE id")) {
      state.tokens.filter((t) => t.id === params[0] && t.status === 'active').forEach((t) => { t.status = 'expired'; });
      return { rows: [] };
    }
    if (s.startsWith("UPDATE invite_tokens SET status = 'expired' WHERE creator_id")) {
      state.tokens.filter((t) => t.creator_id === params[0] && t.status === 'active' && t.expires_at <= now())
        .forEach((t) => { t.status = 'expired'; });
      return { rows: [] };
    }
    if (s.startsWith('INSERT INTO friendships')) {
      const [a, b, via] = params;
      if (!(a < b)) throw new Error('check user_a < user_b failed');
      const key = `${a}:${b}`;
      const old = state.friendships.get(key);
      if (old?.status === 'blocked') return { rows: [] };
      state.friendships.set(key, { status: 'accepted', via: old?.via ?? via });
      tx?.undo.push(() => (old ? state.friendships.set(key, old) : state.friendships.delete(key)));
      return { rows: [] };
    }
    if (s.startsWith('INSERT INTO workspace_members')) {
      if (state.failMembers) throw Object.assign(new Error('board is gone'), { code: '23503' });
      const key = `${params[0]}:${params[1]}`;
      const had = state.members.has(key);
      state.members.add(key);
      if (!had) tx?.undo.push(() => state.members.delete(key));
      return { rows: [] };
    }
    if (s.startsWith('SELECT t.scope, t.status')) {
      const row = byHash(params[0]);
      return { rows: row ? [{ scope: row.scope, status: row.status, past_due: row.expires_at <= now(), creator_name: state.users[row.creator_id] }] : [] };
    }
    if (s.startsWith('SELECT t.id, t.scope')) {
      const rows = state.tokens.filter((t) => t.creator_id === params[0])
        .sort((x, y) => y.created_at - x.created_at)
        .map((t) => ({ ...t, redeemed_by_name: state.users[t.redeemed_by] ?? null }));
      return { rows };
    }
    throw new Error(`fake db does not know: ${s.slice(0, 60)}`);
  }

  const db = {
    state,
    query: (sql, params) => run(sql, params),
    connect: async () => {
      const tx = { undo: [] };
      return { query: (sql, params) => run(sql, params, tx), release: () => undefined };
    },
  };
  return db;
}

const make = (db, opts) => store.createToken(db, { creatorId: 1, scope: 'friend', now: db.state.now, ...opts });

describe('one-time invite tokens', () => {
  test('a token looks like tk_ plus 32 characters and lasts 72 hours unless asked', async () => {
    const db = fakeDb();
    const made = await make(db);
    expect(made.token).toMatch(/^tk_[A-Za-z0-9_-]{32}$/);
    expect(made.expiresAt).toBe(new Date(START + 72 * 3600 * 1000).toISOString());
    const longer = await make(db, { expiresInHours: 720 });
    expect(longer.expiresAt).toBe(new Date(START + 720 * 3600 * 1000).toISOString());
    await expect(make(db, { expiresInHours: 721 })).rejects.toMatchObject({ code: 'BAD_EXPIRY', statusCode: 400 });
    await expect(make(db, { scope: 'party' })).rejects.toMatchObject({ code: 'BAD_SCOPE' });
  });

  test('the plain token is never stored, only its SHA-256 hash', async () => {
    const db = fakeDb();
    const made = await make(db);
    expect(db.state.params).not.toContain(made.token);
    expect(JSON.stringify(db.state.tokens)).not.toContain(made.token);
    expect(db.state.tokens[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(db.state.tokens[0].token_hash).toBe(store.hashToken(made.token));
  });

  test('a token is claimed once; the second try is told it was claimed', async () => {
    const db = fakeDb();
    const { token } = await make(db);
    expect(await store.redeemToken(db, { token, userId: 2 })).toEqual({ scope: 'friend', targetId: null });
    expect(db.state.tokens[0]).toMatchObject({ status: 'burned', redeemed_by: 2 });
    expect(await store.redeemToken(db, { token, userId: 3 })).toEqual({ error: 'claimed' });
    expect(await store.redeemToken(db, { token, userId: 2 })).toEqual({ error: 'claimed' });
  });

  test('two claims at the same time: exactly one wins', async () => {
    const db = fakeDb();
    const { token } = await make(db);
    const results = await Promise.all([2, 3].map((userId) => store.redeemToken(db, { token, userId })));
    expect(results.filter((r) => !r.error)).toHaveLength(1);
    expect(results.filter((r) => r.error === 'claimed')).toHaveLength(1);
  });

  test('a token past its time is expired, and is marked so', async () => {
    const db = fakeDb();
    const { token } = await make(db, { expiresInHours: 1 });
    db.state.now = START + 2 * 3600 * 1000;
    expect(await store.redeemToken(db, { token, userId: 2 })).toEqual({ error: 'expired' });
    expect(db.state.tokens[0].status).toBe('expired');
    expect(await store.redeemToken(db, { token, userId: 2 })).toEqual({ error: 'expired' });
  });

  test('your own token is refused and stays active; an unknown one is not found', async () => {
    const db = fakeDb();
    const { token } = await make(db);
    expect(await store.redeemToken(db, { token, userId: 1 })).toEqual({ error: 'own' });
    expect(db.state.tokens[0].status).toBe('active');
    expect(await store.redeemToken(db, { token: `tk_${'z'.repeat(32)}`, userId: 2 })).toEqual({ error: 'not_found' });
    expect(await store.redeemToken(db, { token: 'not-a-token', userId: 2 })).toEqual({ error: 'not_found' });
  });

  test('a friend token makes one accepted friendship, lower id first', async () => {
    const db = fakeDb();
    const first = await store.createToken(db, { creatorId: 3, scope: 'friend', now: START });
    await store.redeemToken(db, { token: first.token, userId: 2 });
    const second = await store.createToken(db, { creatorId: 2, scope: 'friend', now: START });
    await store.redeemToken(db, { token: second.token, userId: 3 });
    expect([...db.state.friendships.entries()]).toEqual([['2:3', { status: 'accepted', via: first.id }]]);
  });

  test('a friend token never undoes a block', async () => {
    const db = fakeDb();
    db.state.friendships.set('1:2', { status: 'blocked', via: null });
    const { token } = await make(db);
    await store.redeemToken(db, { token, userId: 2 });
    expect(db.state.friendships.get('1:2').status).toBe('blocked');
  });

  test('a board token adds the claimer as a member', async () => {
    const db = fakeDb({ roles: { 'board-a:1': 'owner' } });
    const made = await make(db, { scope: 'board', targetId: 'board-a' });
    expect(await store.redeemToken(db, { token: made.token, userId: 2 })).toEqual({ scope: 'board', targetId: 'board-a' });
    expect(db.state.members.has('board-a:2')).toBe(true);
  });

  test('a plain member of a board cannot make a board token', async () => {
    const db = fakeDb({ roles: { 'board-a:2': 'member' } });
    await expect(store.createToken(db, { creatorId: 2, scope: 'board', targetId: 'board-a' })).rejects.toMatchObject({ statusCode: 403 });
    await expect(store.createToken(db, { creatorId: 9, scope: 'board', targetId: 'board-a' })).rejects.toMatchObject({ statusCode: 403 });
    await expect(store.createToken(db, { creatorId: 2, scope: 'board' })).rejects.toMatchObject({ code: 'TARGET_REQUIRED' });
    expect(db.state.tokens).toHaveLength(0);
  });

  test('when joining the board fails, the token rolls back and stays active', async () => {
    const db = fakeDb({ roles: { 'board-a:1': 'admin' } });
    const made = await make(db, { scope: 'board', targetId: 'board-a' });
    db.state.failMembers = true;
    await expect(store.redeemToken(db, { token: made.token, userId: 2 })).rejects.toThrow('board is gone');
    expect(db.state.tokens[0]).toMatchObject({ status: 'active', redeemed_by: null });
    db.state.failMembers = false;
    expect(await store.redeemToken(db, { token: made.token, userId: 2 })).toEqual({ scope: 'board', targetId: 'board-a' });
  });

  test('a workshop seat token burns and adds nothing else', async () => {
    const db = fakeDb();
    const made = await make(db, { scope: 'workshop_seat', targetId: 'lesson-1' });
    expect(await store.redeemToken(db, { token: made.token, userId: 2 })).toEqual({ scope: 'workshop_seat', targetId: 'lesson-1' });
    expect(db.state.members.size + db.state.friendships.size).toBe(0);
  });

  test('preview says what a token is for and never changes it', async () => {
    const db = fakeDb();
    const { token } = await make(db, { expiresInHours: 1 });
    expect(await store.previewToken(db, token)).toEqual({ scope: 'friend', status: 'active', creatorName: 'Alma' });
    expect(await store.previewToken(db, token)).toEqual({ scope: 'friend', status: 'active', creatorName: 'Alma' });
    expect(db.state.tokens[0].status).toBe('active');
    db.state.now = START + 2 * 3600 * 1000;
    expect((await store.previewToken(db, token)).status).toBe('expired');
    expect(db.state.tokens[0].status).toBe('active');
    expect(await store.previewToken(db, 'nope')).toBeNull();
  });

  test('preview of a claimed token says claimed', async () => {
    const db = fakeDb();
    const { token } = await make(db);
    await store.redeemToken(db, { token, userId: 2 });
    expect((await store.previewToken(db, token)).status).toBe('claimed');
  });

  test('my tokens: newest first, no hashes, who claimed it, past-due ones marked expired', async () => {
    const db = fakeDb();
    const old = await make(db, { expiresInHours: 1 });
    db.state.now = START + 1000;
    const claimed = await make(db);
    await store.redeemToken(db, { token: claimed.token, userId: 3 });
    db.state.now = START + 2 * 3600 * 1000;
    const mine = await store.listMine(db, 1);
    expect(mine.map((t) => [t.id, t.status, t.redeemedByName])).toEqual([[claimed.id, 'burned', 'Noor'], [old.id, 'expired', null]]);
    expect(JSON.stringify(mine)).not.toMatch(/hash|tk_/);
    expect(await store.listMine(db, 2)).toEqual([]);
  });

  test('the migration keeps one row per pair and allows only the three scopes', () => {
    const sql = fs.readFileSync(schema.SQL_PATH, 'utf8');
    expect(schema.SQL_PATH).toMatch(/093-invite-tokens\.sql$/);
    expect(sql).toMatch(/^BEGIN;/m);
    expect(sql).toMatch(/^COMMIT;/m);
    expect(sql).toMatch(/token_hash\s+TEXT NOT NULL UNIQUE/);
    expect(sql).toMatch(/scope IN \('friend', 'board', 'workshop_seat'\)/);
    expect(sql).toMatch(/CHECK \(user_a < user_b\)/);
    expect(sql).toMatch(/PRIMARY KEY \(user_a, user_b\)/);
    expect(sql).toMatch(/ON invite_tokens \(creator_id, created_at\)/);
  });
});

describe('invite token routes', () => {
  const createToken = jest.fn();
  const redeemToken = jest.fn();
  const previewToken = jest.fn();
  const assertSystemAdmin = jest.fn();
  let routes;

  beforeAll(async () => {
    jest.resetModules();
    jest.unstable_mockModule('../server/db.js', () => ({ default: {} }));
    jest.unstable_mockModule('../server/dbState.js', () => ({ dbReady: () => true }));
    jest.unstable_mockModule('../server/security/systemAdmin.js', () => ({ assertSystemAdmin }));
    jest.unstable_mockModule('../server/tokens/store.js', () => ({
      createToken, redeemToken, previewToken, listMine: jest.fn(async () => []), TOKEN_SCOPES: ['friend', 'board', 'workshop_seat'],
    }));
    routes = await import('../server/routes/tokens.js');
  });
  afterEach(() => jest.clearAllMocks());

  function app(userId = null) {
    const a = express();
    a.use(express.json());
    a.use((req, _res, next) => { req.session = userId ? { userId } : {}; next(); });
    a.use('/api/tokens', routes.tokensPublicRouter);
    a.use('/api/tokens', routes.tokensRouter);
    return a;
  }

  test('making a token needs a sign-in and returns the claim link once', async () => {
    expect((await request(app()).post('/api/tokens/create').send({ scope: 'friend' })).status).toBe(401);
    createToken.mockResolvedValue({ id: 't1', token: `tk_${'a'.repeat(32)}`, expiresAt: '2026-11-08T12:00:00.000Z' });
    const res = await request(app(7)).post('/api/tokens/create').send({ scope: 'friend' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 't1', token: `tk_${'a'.repeat(32)}`, url: `/claim/tk_${'a'.repeat(32)}`, expiresAt: '2026-11-08T12:00:00.000Z' });
    expect(assertSystemAdmin).not.toHaveBeenCalled();
  });

  test('only the computer owner makes workshop seats', async () => {
    assertSystemAdmin.mockRejectedValue(Object.assign(new Error("Only this computer's owner can do this."), { statusCode: 403 }));
    const res = await request(app(7)).post('/api/tokens/create').send({ scope: 'workshop_seat', targetId: 'lesson-1' });
    expect(res.status).toBe(403);
    expect(createToken).not.toHaveBeenCalled();
  });

  test('claim answers: 200, 409 claimed, 410 expired, 400 own, 404 unknown', async () => {
    const cases = [
      [{ scope: 'board', targetId: 'board-a' }, 200],
      [{ error: 'claimed' }, 409, 'Token already claimed'],
      [{ error: 'expired' }, 410, 'Token expired'],
      [{ error: 'own' }, 400],
      [{ error: 'not_found' }, 404],
    ];
    for (const [result, status, message] of cases) {
      redeemToken.mockResolvedValueOnce(result);
      const res = await request(app(8)).post('/api/tokens/redeem').send({ token: 'tk_x' });
      expect(res.status).toBe(status);
      if (message) expect(res.body.error).toBe(message);
    }
    expect(redeemToken).toHaveBeenCalledWith({}, { token: 'tk_x', userId: 8 });
    expect((await request(app()).post('/api/tokens/redeem').send({ token: 'tk_x' })).status).toBe(401);
  });

  test('preview works without a sign-in and is a GET that never claims', async () => {
    previewToken.mockResolvedValueOnce({ scope: 'friend', status: 'active', creatorName: 'Alma' });
    const res = await request(app()).get('/api/tokens/preview?token=tk_x');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ scope: 'friend', status: 'active', creatorName: 'Alma' });
    previewToken.mockResolvedValueOnce(null);
    expect((await request(app()).get('/api/tokens/preview?token=tk_y')).status).toBe(404);
    expect(redeemToken).not.toHaveBeenCalled();
  });
});
