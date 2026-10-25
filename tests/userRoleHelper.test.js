import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const { userRole } = await import('../server/security/systemAdmin.js');

const dbWith = (rows) => ({ query: jest.fn(async () => ({ rows })) });

describe('userRole, the one home for "what is this account\'s role"', () => {
  test('reads admin and user', async () => {
    await expect(userRole(1, { db: dbWith([{ role: 'admin' }]) })).resolves.toBe('admin');
    await expect(userRole(2, { db: dbWith([{ role: 'user' }]) })).resolves.toBe('user');
  });

  test('an unknown id is undefined, an account with no role is null', async () => {
    await expect(userRole(99, { db: dbWith([]) })).resolves.toBeUndefined();
    await expect(userRole(3, { db: dbWith([{ role: null }]) })).resolves.toBeNull();
  });

  test('a database error is passed to the caller', async () => {
    const db = { query: jest.fn(async () => { throw new Error('connection refused'); }) };
    await expect(userRole(1, { db })).rejects.toThrow('connection refused');
  });

  test('no file outside server/security asks for the role itself (chatContext.js is the one copy left)', () => {
    const hits = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { if (entry.name !== 'node_modules') walk(full); continue; }
        if (!/\.(m?js)$/.test(entry.name) || /\.test\./.test(entry.name)) continue;
        if (/SELECT role FROM users/i.test(fs.readFileSync(full, 'utf8'))) hits.push(full.split(path.sep).join('/'));
      }
    };
    walk('server');
    const outside = hits.filter((f) => !f.startsWith('server/security/') && f !== 'server/routes/chat/chatContext.js');
    expect(outside).toEqual([]);
  });
});
