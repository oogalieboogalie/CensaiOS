import { jest } from '@jest/globals';

const lines = [];
jest.unstable_mockModule('../server/logger.js', () => ({
  createLogger: () => ({ info: (msg) => lines.push(msg), warn: () => {}, error: () => {}, debug: () => {} }),
}));
jest.unstable_mockModule('../server/db.js', () => ({ default: { query: async () => ({ rows: [{ role: 'member' }] }) } }));

const { requireSystemAdminForChanges } = await import('../server/security/systemAdmin.js');

function res() {
  return { statusCode: 0, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

test('a refused change logs the method, the route and the account number only', async () => {
  const out = res();
  const next = jest.fn();
  await requireSystemAdminForChanges({ method: 'POST', baseUrl: '/api/dev-servers', path: '/', session: { userId: 2 }, body: { folder: '/made-up/site' } }, out, next);
  expect(next).not.toHaveBeenCalled();
  expect(out.statusCode).toBe(403);
  expect(lines).toContain('refused POST /api/dev-servers for account 2: not the owner');
  expect(lines.join('\n')).not.toMatch(/made-up/);
});

test('looking is still allowed for a teammate', async () => {
  const next = jest.fn();
  await requireSystemAdminForChanges({ method: 'GET', baseUrl: '/api/dev-servers', path: '/', session: { userId: 2 } }, res(), next);
  expect(next).toHaveBeenCalled();
});
