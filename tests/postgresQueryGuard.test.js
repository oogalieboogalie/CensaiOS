// The read-only postgres_query tool must refuse a second statement and the
// commands that run code or end the transaction. These cases never open a
// connection. A normal read is one extended-protocol statement inside
// BEGIN READ ONLY ... ROLLBACK on a client checked out for that call.
import { jest } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import pg from 'pg';

const pool = {
  query: jest.fn(),
  connect: jest.fn(),
  on: jest.fn(),
  end: jest.fn(),
};

jest.unstable_mockModule('../server/db.js', () => ({
  default: pool,
  createDbPool: () => pool,
  createLazyPool: () => pool,
}));

const { postgresQuery, postgresExecFile } = await import('../server/tools/handlers/database/query.js');

const ROLE_CHANGE = "SELECT 1; COMMIT; DO $$ BEGIN EXECUTE 'UPD'||'ATE users SET role=''owner'' WHERE id = 2'; END $$";
const COPY_PROGRAM = "COPY (SELECT 1) TO PROGRAM 'touch /tmp/x'";
const COPY_AFTER_COMMIT = `SELECT 1; COMMIT; ${COPY_PROGRAM}`;
// Postgres ends a block comment at the matching nested closer, then ends a
// "--" comment at the carriage return, so the COPY is the real statement.
const NESTED_CR_COPY = `/* /* */ SELECT */ --\r${COPY_PROGRAM}`;
const CR_COPY = `--\r${COPY_PROGRAM}`;
// E'\'' is one quote character. The quote after it closes the string.
const E_STRING_COPY = `SELECT E'\\'' ; ${COPY_PROGRAM}`;
// A dollar tag does not start right after an identifier character.
const IDENT_DOLLAR_COPY = `SELECT x$a$; ${COPY_PROGRAM}; $a$`;

function fakeClient(result) {
  const calls = [];
  const client = {
    query: jest.fn(async (sql) => {
      calls.push(sql);
      const text = typeof sql === 'string' ? sql : sql.text;
      const control = text === 'ROLLBACK' || text === 'COMMIT' || text.startsWith('BEGIN') || text.startsWith('SET ');
      if (result instanceof Error && !control) throw result;
      if (result instanceof Error) return { rows: [] };
      return result;
    }),
    release: jest.fn(),
  };
  return { client, calls };
}

function extendedCall(calls) {
  return calls.find((sql) => sql && typeof sql === 'object' && sql.queryMode === 'extended');
}

beforeEach(() => {
  jest.clearAllMocks();
  pool.connect.mockReset();
  pool.query.mockResolvedValue({ rows: [] });
});

describe('postgres_query rejects statements that escape a read', () => {
  test('a select, a commit, and a do block that builds an update are rejected', async () => {
    const result = await postgresQuery({ sql: ROLE_CHANGE });
    expect(result).toMatch(/rejected/i);
    expect(pool.connect).not.toHaveBeenCalled();
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('copy to program after a commit is rejected', async () => {
    const result = await postgresQuery({ sql: COPY_AFTER_COMMIT });
    expect(result).toMatch(/rejected/i);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  test('copy to program is rejected even when writes are allowed', async () => {
    const result = await postgresQuery({ sql: COPY_PROGRAM, allow_write: true, allow_unsafe: true });
    expect(result).toMatch(/rejected/i);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  test('call is rejected even when writes are allowed', async () => {
    const result = await postgresQuery({ sql: 'CALL takeover()', allow_write: true });
    expect(result).toMatch(/DO, COPY, CALL/);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  test('two statements in one string are rejected', async () => {
    const result = await postgresQuery({ sql: 'SELECT 1; SELECT 2' });
    expect(result).toMatch(/one statement/i);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  test('a commit hidden after a select is rejected', async () => {
    const result = await postgresQuery({ sql: 'SELECT 1; COMMIT' });
    expect(result).toMatch(/rejected/i);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  test('explain analyze cannot hide copy by splitting the word with a comment', async () => {
    const result = await postgresQuery({
      sql: "EXPLAIN ANALYZE C/**/OPY (SELECT 1) TO PROGRAM 'touch /tmp/x'",
    });
    expect(result).toMatch(/rejected/i);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  test('a nested comment and a carriage return cannot hide copy', async () => {
    const result = await postgresQuery({ sql: NESTED_CR_COPY });
    expect(result).toMatch(/rejected/i);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  test('a carriage return ends a line comment before copy, even when writes are allowed', async () => {
    const result = await postgresQuery({ sql: CR_COPY, allow_write: true, allow_unsafe: true });
    expect(result).toMatch(/rejected/i);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  test('an escape string does not hide a later copy', async () => {
    const result = await postgresQuery({ sql: E_STRING_COPY, allow_write: true });
    expect(result).toMatch(/rejected/i);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  test('a dollar tag does not start in the middle of an identifier', async () => {
    const result = await postgresQuery({ sql: IDENT_DOLLAR_COPY });
    expect(result).toMatch(/rejected/i);
    expect(pool.connect).not.toHaveBeenCalled();
  });
});

describe('postgres_query still runs one ordinary statement', () => {
  test('a semicolon inside a string, a dollar quote, or a comment is not a second statement', async () => {
    const rows = [{ label: 'a;b' }];
    const { client, calls } = fakeClient({
      command: 'SELECT',
      rowCount: 1,
      fields: [{ name: 'label' }],
      rows,
    });
    pool.connect.mockResolvedValue(client);

    for (const sql of [
      "SELECT 'a;b' AS label",
      'SELECT $$ a; b $$ AS label',
      'SELECT $tag$ a; b $tag$ AS label',
      'SELECT "col;name" AS label',
      'SELECT 1 AS label -- note;',
      'SELECT 1 AS label /* ; */',
      "SELECT 'DO NOT CALL' AS label",
      "SELECT $$ COPY (SELECT 1) TO PROGRAM 'touch /tmp/x' $$ AS label",
      "SELECT E'it\\'s; ok' AS label",
      '-- note\rSELECT 1 AS label',
    ]) {
      calls.length = 0;
      const result = JSON.parse(await postgresQuery({ sql }));
      expect(result.rows).toEqual(rows);
      expect(extendedCall(calls).text).toBe(sql);
    }
  });

  test('a read uses the extended protocol inside BEGIN READ ONLY and then rolls back', async () => {
    const { client, calls } = fakeClient({
      command: 'SELECT',
      rowCount: 2,
      fields: [{ name: 'n' }],
      rows: [{ n: 1 }, { n: 2 }, { n: 3 }],
    });
    pool.connect.mockResolvedValue(client);

    const result = JSON.parse(await postgresQuery({ sql: 'SELECT 1 AS n', limit: 2 }));

    expect(pool.query).not.toHaveBeenCalled();
    expect(pool.connect).toHaveBeenCalledTimes(1);
    expect(calls.map((sql) => (typeof sql === 'string' ? sql : sql.queryMode))).toEqual([
      'BEGIN READ ONLY',
      'SET LOCAL statement_timeout = 15000',
      'extended',
      'ROLLBACK',
    ]);
    const query = extendedCall(calls);
    expect(query).toEqual({ text: 'SELECT 1 AS n', values: [], queryMode: 'extended' });
    expect(new pg.Query(query).requiresPreparation()).toBe(true);
    expect(new pg.Query({ text: query.text, values: [] }).requiresPreparation()).toBe(false);
    expect(result.rows).toEqual([{ n: 1 }, { n: 2 }]);
    expect(client.release).toHaveBeenCalledTimes(1);
    expect(calls.some((sql) => sql === 'COMMIT' || sql === 'SET TRANSACTION READ ONLY')).toBe(false);
  });

  test('parameters are always passed as an array', async () => {
    const { client, calls } = fakeClient({
      command: 'SELECT',
      rowCount: 1,
      fields: [{ name: 'n' }],
      rows: [{ n: 4 }],
    });
    pool.connect.mockResolvedValue(client);

    await postgresQuery({ sql: 'SELECT $1::int AS n', params: [4] });
    expect(extendedCall(calls).values).toEqual([4]);

    calls.length = 0;
    await postgresQuery({ sql: 'SELECT 1 AS n' });
    expect(extendedCall(calls).values).toEqual([]);
  });

  test('a write still commits one extended statement on its own client', async () => {
    const { client, calls } = fakeClient({
      command: 'UPDATE',
      rowCount: 1,
      fields: [],
      rows: [],
    });
    pool.connect.mockResolvedValue(client);

    const result = JSON.parse(await postgresQuery({
      sql: 'UPDATE notes SET body = $1 WHERE id = $2',
      params: ['hello', 7],
      allow_write: true,
    }));

    expect(calls.map((sql) => (typeof sql === 'string' ? sql : 'QUERY'))).toEqual([
      'BEGIN',
      'SET LOCAL statement_timeout = 15000',
      'QUERY',
      'COMMIT',
    ]);
    expect(extendedCall(calls)).toEqual({
      text: 'UPDATE notes SET body = $1 WHERE id = $2',
      values: ['hello', 7],
      queryMode: 'extended',
    });
    expect(result.command).toBe('UPDATE');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  test('a failed statement rolls back and releases the client', async () => {
    const { client, calls } = fakeClient(new Error('relation "missing" does not exist'));
    pool.connect.mockResolvedValue(client);

    const result = await postgresQuery({ sql: 'SELECT * FROM missing' });

    expect(result).toMatch(/does not exist/);
    expect(calls[0]).toBe('BEGIN READ ONLY');
    expect(calls.at(-1)).toBe('ROLLBACK');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  test('a nested comment is removed before the first word is chosen', async () => {
    const { client, calls } = fakeClient({
      command: 'SELECT',
      rowCount: 1,
      fields: [{ name: 'n' }],
      rows: [{ n: 1 }],
    });
    pool.connect.mockResolvedValue(client);

    const result = JSON.parse(await postgresQuery({
      sql: '/* /* */ DELETE FROM users */ SELECT 1 AS n',
    }));

    expect(result.rows).toEqual([{ n: 1 }]);
    expect(result.classification.readOnly).toBe(true);
    expect(result.classification.first).toBe('select');
    expect(calls[0]).toBe('BEGIN READ ONLY');
  });

  test('values and table are reads', async () => {
    const { client, calls } = fakeClient({
      command: 'SELECT',
      rowCount: 1,
      fields: [{ name: 'n' }],
      rows: [{ n: 1 }],
    });
    pool.connect.mockResolvedValue(client);

    for (const sql of ['VALUES (1)', 'TABLE notes']) {
      calls.length = 0;
      const result = JSON.parse(await postgresQuery({ sql }));
      expect(result.classification.readOnly).toBe(true);
      expect(calls[0]).toBe('BEGIN READ ONLY');
    }
  });
});

describe('postgres_exec_file reads use the same guard', () => {
  async function withSqlFile(contents, run) {
    const name = `.tmp-pg-guard-${process.pid}-${Date.now()}.sql`;
    const file = path.join(process.cwd(), name);
    await fs.writeFile(file, contents);
    try {
      return await run(name);
    } finally {
      await fs.unlink(file).catch(() => {});
    }
  }

  test('a file with the nested copy bypass is rejected before a connection opens', async () => {
    const result = await withSqlFile(NESTED_CR_COPY, (name) => postgresExecFile({ file_path: name }));
    expect(result).toMatch(/rejected/i);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  test('a file with the original multi-statement attack is rejected', async () => {
    const result = await withSqlFile(ROLE_CHANGE, (name) => postgresExecFile({ file_path: name }));
    expect(result).toMatch(/rejected/i);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  test('a file with one read uses the extended protocol and rolls back', async () => {
    const { client, calls } = fakeClient({
      command: 'SELECT',
      rowCount: 1,
      fields: [{ name: 'n' }],
      rows: [{ n: 1 }],
    });
    pool.connect.mockResolvedValue(client);

    const result = await withSqlFile('SELECT 1 AS n', (name) => postgresExecFile({ file_path: name }));

    expect(result).toMatch(/Executed /);
    expect(calls.map((sql) => (typeof sql === 'string' ? sql : sql.queryMode))).toEqual([
      'BEGIN READ ONLY',
      'SET LOCAL statement_timeout = 15000',
      'extended',
      'ROLLBACK',
    ]);
    expect(extendedCall(calls)).toEqual({
      text: 'SELECT 1 AS n',
      values: [],
      queryMode: 'extended',
    });
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
