import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const logs = [];
jest.unstable_mockModule('../server/logger.js', () => ({
  createLogger: (name) => ({ info: (m) => logs.push(`[${name}] ${m}`), warn: (m) => logs.push(`[${name}] ${m}`), error: () => {}, debug: () => {} }),
}));
const { default: pool } = await import('../server/db.js');
const { requireSystemAdmin } = await import('../server/security/systemAdmin.js');
const { ownerNamesFor } = await import('../server/security/ownerNames.js');
const { authorizeTerminalConnection, OWNER_ONLY_HERE, rejectTerminalUpgrade } = await import('../server/terminal/access.js');
const { friendly } = await import('../src/lib/appUpdate/useTrayUpdate.js');

// "Only the owner" says which account is the owner and which one you're
// signed in with, on the desktop app only. Pretend people: Pat Example (1)
// owns this computer, Sam Example (2) is a teammate.
const USERS = { 1: { role: 'admin', name: 'Pat Example' }, 2: { role: 'user', name: 'Sam Example' } };
const fakeQuery = jest.fn(async (sql, params = []) => {
  if (sql.startsWith('SELECT role FROM users')) return { rows: USERS[params[0]] ? [{ role: USERS[params[0]].role }] : [] };
  if (sql.includes("role = 'admin'")) return { rows: [{ name: USERS[1].name }] };
  if (sql.includes('AS name FROM users WHERE id')) return { rows: USERS[params[0]] ? [{ name: USERS[params[0]].name }] : [] };
  return { rows: [] };
});

beforeEach(() => { pool.query = fakeQuery; logs.length = 0; });
afterEach(() => { delete process.env.CENSAI_MODE; });

function app(userId) {
  const a = express();
  a.use((req, _res, next) => { req.session = userId ? { userId } : {}; next(); });
  a.post('/api/app-update/check', requireSystemAdmin, (_req, res) => res.json({ ok: true }));
  return a;
}

describe('update censaiOS refusal', () => {
  test('on this computer: the answer names the owner and you; the toast says who to sign in as', async () => {
    process.env.CENSAI_MODE = 'local_desktop';
    const res = await request(app(2)).post('/api/app-update/check');
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ reason: 'owner-only', ownerName: 'Pat Example', yourName: 'Sam Example' });
    expect(friendly({ status: 403, ownerName: res.body.ownerName, yourName: res.body.yourName }))
      .toBe("Only the owner account (Pat Example) can update censaiOS. You're signed in as Sam Example. Sign in as Pat Example to update.");
  });

  test('signed out: says to sign in again, not that you are the wrong account', async () => {
    const res = await request(app(null)).post('/api/app-update/check');
    expect(res.status).toBe(401);
    expect(res.body.ownerName).toBeUndefined();
    expect(friendly({ status: 401 })).toBe("You're signed out. Sign in again to update censaiOS.");
  });

  test("on a shared server the owner's name is never shown", async () => {
    process.env.CENSAI_MODE = 'private_server';
    const res = await request(app(2)).post('/api/app-update/check');
    expect(res.status).toBe(403);
    expect(res.body.ownerName).toBeUndefined();
    expect(friendly({ status: 403 })).toBe('Only the owner of this censaiOS can update it.');
    expect(await ownerNamesFor(2, { db: { query: fakeQuery }, mode: 'cloud_saas' })).toBeNull();
  });

  test('each refusal leaves one log line with the feature and why, never a name', async () => {
    await request(app(2)).post('/api/app-update/check');
    await request(app(null)).post('/api/app-update/check');
    const lines = logs.filter((l) => l.includes('[owner-only]'));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/refused POST \/api\/app-update\/check for account 2: not the owner/);
    expect(lines[1]).toMatch(/refused POST \/api\/app-update\/check: signed out/);
    expect(lines.join(' ')).not.toMatch(/Pat|Sam/);
  });
});

describe('terminal refusal', () => {
  test('on this computer the message names the owner and you', async () => {
    const error = await authorizeTerminalConnection(new URL('http://x/api/terminal?workspaceId=w'), { userId: '2' },
      { db: { query: fakeQuery }, mode: 'local_desktop', env: {} }).catch((e) => e);
    expect(error.code).toBe('TERMINAL_OWNER_ONLY');
    const sent = [];
    const ws = { send: (m) => sent.push(JSON.parse(m)), close: () => {} };
    const wss = { handleUpgrade: (_r, _s, _h, done) => done(ws) };
    rejectTerminalUpgrade({}, error, { wss, request: { socket: { remoteAddress: '127.0.0.1' }, headers: { host: 'localhost' } }, head: null });
    expect(sent[0].message).toBe(`${OWNER_ONLY_HERE} The owner account is Pat Example; you're signed in as Sam Example.`);
    expect(logs.filter((l) => l.includes('[owner-only]')).join(' ')).toMatch(/refused terminal: not the owner/);
  });
});
