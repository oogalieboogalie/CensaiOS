import { jest } from '@jest/globals';
import { ensureWorkspaceSchema } from '../server/workspaces/schema.js';

describe('workspace schema compatibility', () => {
  test('includes the legacy workspace upgrade in the boot schema', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };

    await ensureWorkspaceSchema(db);

    const sql = db.query.mock.calls[0][0];
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS name TEXT');
    expect(sql).toContain("column_name = 'title'");
    expect(sql).toContain("SET role = 'member' WHERE role = 'collaborator'");
    expect(sql).toContain("SELECT id, created_by_user_id, 'owner'");
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS workspace_agent_projects');
    expect(sql).toContain("CHECK (permission IN ('read', 'work'))");
  });
});
