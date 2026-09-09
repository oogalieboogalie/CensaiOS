import { createDbPool } from './db.js';

// This suite performs a live TCP connection to Postgres and must only run when
// the full stack (Docker) is up.  Set INTEGRATION_TESTS=1 explicitly to opt in
// (e.g. in CI after `docker compose up`). Relying on DATABASE_URL alone is not
// sufficient because .env always exports it, even when Docker isn't running.
const describeDb = process.env.INTEGRATION_TESTS ? describe : describe.skip;

describeDb('Database Connection Test', () => {
  let pool;

  beforeEach(() => {
    pool = createDbPool(process.env.DATABASE_URL);
  });

  afterEach(async () => {
    await pool?.end();
  });

  test('should connect to the database and execute a simple query', async () => {
    const client = await pool.connect();
    try {
      const result = await client.query('SELECT 1 as "result"');
      expect(result.rows[0].result).toBe(1);
    } finally {
      client.release();
    }
  });

  test('should keep the shared app pool out of test cleanup', () => {
    expect(pool.ended).toBe(false);
  });
});
