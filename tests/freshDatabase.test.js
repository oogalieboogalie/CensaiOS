import { jest } from '@jest/globals';
import {
  applySqlFiles,
  composeInitSqlFiles,
  isFreshDatabase,
  remainingSqlFiles,
} from '../server/boot/freshDatabase.js';
import fs from 'node:fs';

const compose = fs.readFileSync(new URL('../docker-compose.yml', import.meta.url), 'utf8');

describe('first start of the Docker install', () => {
  test('reads the SQL files Postgres runs on a new volume from docker-compose.yml', () => {
    const files = composeInitSqlFiles(compose);
    expect(files[0]).toBe('docker/init.sql');
    expect(files).toContain('docker/030-run-causality.sql');
  });

  test('applies every other SQL file in docker/, in name order', () => {
    const all = fs.readdirSync(new URL('../docker/', import.meta.url))
      .filter((f) => f.endsWith('.sql'))
      .map((f) => `docker/${f}`);
    const rest = remainingSqlFiles(compose, all);
    expect(rest).not.toContain('docker/init.sql');
    expect(rest).toContain('docker/023-policy-framework.sql');
    expect(rest).toContain('docker/043-workspace-state-revisions.sql');
    expect([...rest].sort()).toEqual(rest);
    expect(new Set([...rest, ...composeInitSqlFiles(compose)])).toEqual(new Set(all));
  });

  test('retries files that need a later one, and reports what never applied', async () => {
    const applied = new Set();
    const client = {
      query: jest.fn(async (sql) => {
        if (sql === 'ROLLBACK') return;
        if (sql === 'needs-b' && !applied.has('b')) throw new Error('missing table');
        if (sql === 'broken') throw new Error('syntax');
        applied.add(sql === 'needs-b' ? 'a' : sql);
      }),
    };
    const left = await applySqlFiles(client, ['needs-b', 'b', 'broken'], async (f) => f);
    expect(applied).toEqual(new Set(['a', 'b']));
    expect(left).toEqual(['broken']);
  });

  test('never touches a database that already has accounts', async () => {
    const db = (tables, users) => ({
      query: async (sql, params) => {
        if (sql.startsWith('SELECT to_regclass')) {
          return { rows: [{ t: tables.includes(params[0].replace('public.', '')) ? params[0] : null }] };
        }
        return { rows: [{ n: users }] };
      },
    });
    expect(await isFreshDatabase(db([], 0))).toBe(true);
    expect(await isFreshDatabase(db(['users'], 0))).toBe(true);
    expect(await isFreshDatabase(db(['users'], 2))).toBe(false);
    expect(await isFreshDatabase(db(['users', 'censai_fresh_install'], 0))).toBe(false);
  });
});
