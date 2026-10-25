// The setup ledger records which docker/*.sql files a database has. The fake
// database runs everywhere; the real Postgres part runs when
// LEDGER_TEST_ADMIN_URL points at a Postgres server's "postgres" database.
import { jest } from '@jest/globals';
import pg from 'pg';
import { APPLIED, FOUND, fingerprint, recordExisting, setupFiles } from '../server/boot/setupLedger.js';
import fs from 'node:fs';
import { applySqlFiles, bootstrapFreshDatabase, composeInitSqlFiles } from '../server/boot/freshDatabase.js';

const root = process.cwd();
const quietLog = { info: jest.fn() };

function fakeDb() {
  const rows = new Map();
  return {
    rows,
    query: jest.fn(async (sql, params = []) => {
      if (/^SELECT COUNT/.test(sql)) return { rows: [{ n: rows.size }] };
      if (/^INSERT INTO censai_setup_ledger/.test(sql)) {
        if (rows.has(params[0])) return { rowCount: 0 };
        rows.set(params[0], { fingerprint: params[1], how: params[2] });
        return { rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }),
  };
}

describe('setup ledger', () => {
  test('an existing install writes down every file once, then adds nothing', async () => {
    const db = fakeDb();
    const files = setupFiles(root);
    expect(files).toContain('docker/090-setup-ledger.sql');
    await expect(recordExisting(db, { root, log: quietLog })).resolves.toBe(files.length);
    expect([...db.rows.values()].every((r) => r.how === FOUND)).toBe(true);
    await expect(recordExisting(db, { root, log: quietLog })).resolves.toBe(0);
    expect(quietLog.info).toHaveBeenLastCalledWith('setup ledger', { recorded: files.length, new: 0 });
    expect(db.query.mock.calls.some(([sql]) => /CREATE TABLE IF NOT EXISTS users|ALTER TABLE users/i.test(sql))).toBe(false);
  });

  test('fingerprints are short and change with the text', () => {
    expect(fingerprint('a')).toHaveLength(16);
    expect(fingerprint('a')).not.toBe(fingerprint('b'));
  });
});

const admin = process.env.LEDGER_TEST_ADMIN_URL;
const maybe = admin ? describe : describe.skip;

maybe('setup ledger on a real Postgres', () => {
  const stamp = Date.now();
  const names = { fresh: `ledger_fresh_${stamp}`, existing: `ledger_existing_${stamp}` };
  const urlFor = (name) => admin.replace(/\/[^/]*$/, `/${name}`);
  let adminClient;

  beforeAll(async () => {
    adminClient = new pg.Client({ connectionString: admin });
    await adminClient.connect();
    for (const name of Object.values(names)) await adminClient.query(`CREATE DATABASE ${name}`);
  });
  afterAll(async () => {
    for (const name of Object.values(names)) await adminClient.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await adminClient.end();
  });

  async function withDb(name, fn) {
    const client = new pg.Client({ connectionString: urlFor(name) });
    await client.connect();
    try { return await fn(client); } finally { await client.end(); }
  }
  const tables = (c) => c.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1").then((r) => r.rows.map((x) => x.table_name));

  test('a fresh install records every file it ran as applied', async () => {
    await withDb(names.fresh, async (c) => {
      // What Postgres itself runs on a brand-new Docker volume.
      const compose = fs.readFileSync('docker-compose.yml', 'utf8');
      await applySqlFiles(c, composeInitSqlFiles(compose), (f) => fs.promises.readFile(f, 'utf8'));
      const result = await bootstrapFreshDatabase(c, { root, log: () => {}, ledgerLogger: quietLog });
      const { rows } = await c.query('SELECT file, how FROM censai_setup_ledger ORDER BY file');
      expect(rows.length).toBe(setupFiles(root).length - result.left.length);
      expect(rows.every((r) => r.how === APPLIED)).toBe(true);
    });
  }, 120000);

  test('an existing install gets "found already there" rows, no table changes, and a second start adds nothing', async () => {
    await withDb(names.existing, async (c) => {
      await c.query('CREATE TABLE users (id SERIAL PRIMARY KEY, email TEXT)');
      await c.query("INSERT INTO users (email) VALUES ('pat@example.invalid')");
      const before = await tables(c);
      await bootstrapFreshDatabase(c, { root, log: () => {}, ledgerLogger: quietLog });
      expect(await tables(c)).toEqual([...before, 'censai_setup_ledger'].sort());
      const { rows } = await c.query('SELECT how, COUNT(*)::int AS n FROM censai_setup_ledger GROUP BY how');
      expect(rows).toEqual([{ how: FOUND, n: setupFiles(root).length }]);
      await bootstrapFreshDatabase(c, { root, log: () => {}, ledgerLogger: quietLog });
      const again = await c.query('SELECT COUNT(*)::int AS n FROM censai_setup_ledger');
      expect(again.rows[0].n).toBe(setupFiles(root).length);
    });
  });
});
