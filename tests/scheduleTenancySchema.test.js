import fs from 'node:fs/promises';
import { jest } from '@jest/globals';
import {
  ensureScheduleTenancySchema,
  readScheduleTenancySchema,
} from '../server/scheduler/schema.js';

describe('schedule tenancy schema', () => {
  test('boot assurance is additive and fail-closed for legacy rows', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    await ensureScheduleTenancySchema(db);
    const sql = db.query.mock.calls[0][0];
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS workspace_id TEXT/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER/);
    expect(sql).toMatch(/REFERENCES workspaces\(id\) ON DELETE CASCADE/);
    expect(sql).toMatch(/REFERENCES users\(id\) ON DELETE CASCADE/);
    expect(sql).toMatch(/WHERE workspace_id IS NULL OR created_by_user_id IS NULL/);
  });

  test('schema reader covers columns, constraints, and indexes', async () => {
    const db = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ column_name: 'created_by_user_id' }] })
        .mockResolvedValueOnce({ rows: [{ conname: 'schedules_created_by_user_id_fkey' }] })
        .mockResolvedValueOnce({ rows: [{ indexname: 'idx_schedules_owner_workspace' }] }),
    };
    await expect(readScheduleTenancySchema(db)).resolves.toEqual({
      columns: [{ column_name: 'created_by_user_id' }],
      constraints: [{ conname: 'schedules_created_by_user_id_fkey' }],
      indexes: [{ indexname: 'idx_schedules_owner_workspace' }],
    });
  });

  test('migration preserves the same ownership contract', async () => {
    const sql = await fs.readFile(new URL('../docker/033-schedule-tenancy.sql', import.meta.url), 'utf8');
    for (const fragment of [
      'ADD COLUMN IF NOT EXISTS workspace_id TEXT',
      'ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER',
      'schedules_workspace_id_fkey',
      'schedules_created_by_user_id_fkey',
      'idx_schedules_owner_workspace',
      'idx_schedules_unowned',
    ]) expect(sql).toContain(fragment);
  });
});
