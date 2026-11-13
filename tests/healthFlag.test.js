import { healthFlag } from '../src/lib/healthFlag.js';

describe('healthFlag', () => {
  test('uses a boolean the detailed answer actually carries', () => {
    const health = { ok: true, taskWorker: { ready: false }, databaseStatus: { ready: true } };
    expect(healthFlag(health, (row) => row.taskWorker?.ready)).toBe(false);
    expect(healthFlag(health, (row) => row.databaseStatus?.ready)).toBe(true);
  });

  test('falls back to ok when the public answer has no detail', () => {
    expect(healthFlag({ ok: true }, (row) => row.taskWorker?.ready)).toBe(true);
    expect(healthFlag({ ok: false }, (row) => row.databaseStatus?.ready)).toBe(false);
  });

  test('a missing or failed read is not ready', () => {
    expect(healthFlag(null, (row) => row.ok)).toBe(false);
    expect(healthFlag({ error: 'HTTP 500', ok: true }, (row) => row.taskWorker?.ready)).toBe(false);
  });
});