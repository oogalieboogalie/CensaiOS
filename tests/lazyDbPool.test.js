import { jest } from '@jest/globals';
import { createLazyPool } from '../server/db.js';

describe('test database lazy-pool lifecycle', () => {
  test('coalesces repeated end calls and can reopen for a later suite', async () => {
    const pools = [];
    const factory = jest.fn(() => {
      const pool = {
        ended: false,
        query: jest.fn().mockResolvedValue({ rows: [] }),
        end: jest.fn(async () => { pool.ended = true; }),
      };
      pools.push(pool);
      return pool;
    });
    const lazy = createLazyPool(factory);

    await lazy.query('SELECT 1');
    await lazy.end();
    await lazy.end();
    await lazy.query('SELECT 2');

    expect(factory).toHaveBeenCalledTimes(2);
    expect(pools[0].end).toHaveBeenCalledTimes(1);
    expect(pools[1].query).toHaveBeenCalledWith('SELECT 2');
  });
});
