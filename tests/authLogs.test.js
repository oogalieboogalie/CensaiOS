import fs from 'node:fs';
import path from 'node:path';
import { onLogRecord } from '../server/logger.js';
import { PostgresSessionStore } from '../server/security/postgresSessionStore.js';

const SECRET = 'made-up-secret access_token=ya29.madeup /home/pat/private';

test('a failed session cleanup leaves one fixed session line with a code, never the error text', async () => {
  const records = [];
  const stop = onLogRecord((r) => records.push(r));
  const pool = { query: async () => { throw Object.assign(new Error(SECRET), { code: 'ECONNREFUSED' }); } };
  const store = new PostgresSessionStore(pool, { cleanupIntervalMs: 0, cleanupOnStart: false });
  await store.cleanupExpired().catch(store.onCleanupError);
  stop();
  const lines = records.filter((r) => JSON.stringify(r).includes('expired session cleanup failed'));
  expect(lines).toHaveLength(1);
  expect(JSON.stringify(lines[0])).toContain('ECONNREFUSED');
  expect(JSON.stringify(records)).not.toContain('ya29');
  expect(JSON.stringify(records)).not.toContain('/home/pat');
});

test('the sign-in, session and security files print nothing straight to the console', () => {
  const files = ['calendar.js', 'routes/webOs.js', 'middleware/security.js', 'middleware/rateLimiter.js',
    'security/postgresSessionStore.js', 'routes/files/clientState.js'];
  for (const file of files) {
    const source = fs.readFileSync(path.resolve('server', file), 'utf8');
    expect({ file, console: (source.match(/console\.(log|warn|error|info|debug)\(/g) || []).length }).toEqual({ file, console: 0 });
    expect(source).toContain('safeErrorCode(');
  }
});
