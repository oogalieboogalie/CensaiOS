import fs from 'node:fs';
import { jest } from '@jest/globals';

jest.unstable_mockModule('../server/db.js', () => ({ default: { query: jest.fn() } }));

const { inspectEquipmentTenancySchema } = await import('../server/attributes/tenancySchema.js');

describe('workspace agent equipment schema', () => {
  test('is additive and leaves both legacy equipment tables untouched', () => {
    const sql = fs.readFileSync('docker/038-agent-equipment-tenancy.sql', 'utf8');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS workspace_agent_equipped_items');
    expect(sql).toContain('PRIMARY KEY (workspace_id, agent_id, definition_id)');
    expect(sql).toContain('equipped_by_user_id INTEGER REFERENCES users(id)');
    expect(sql).not.toMatch(/ALTER TABLE\s+(agent_equipped_items|agent_attributes)/i);
    expect(sql).not.toMatch(/INSERT INTO\s+(agent_equipped_items|agent_attributes)/i);
  });

  test('requires all scoped columns, a primary key, and four foreign keys', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [{ present: true }] })
      .mockResolvedValueOnce({ rows: [
        'workspace_id', 'agent_id', 'definition_id', 'equipped_by_user_id', 'equipped_at',
      ].map(column_name => ({ column_name })) })
      .mockResolvedValueOnce({ rows: [
        { constraint_type: 'PRIMARY KEY' },
        ...Array.from({ length: 4 }, () => ({ constraint_type: 'FOREIGN KEY' })),
      ] });
    await expect(inspectEquipmentTenancySchema({ query })).resolves.toMatchObject({
      ready: true,
      present: true,
      table: 'workspace_agent_equipped_items',
    });
  });

  test('reports a missing scoped table as not ready without extra queries', async () => {
    const query = jest.fn().mockResolvedValueOnce({ rows: [{ present: false }] });
    await expect(inspectEquipmentTenancySchema({ query })).resolves.toMatchObject({
      ready: false,
      present: false,
    });
    expect(query).toHaveBeenCalledTimes(1);
  });

  test('health includes equipment schema readiness in the top-level gate', () => {
    const health = fs.readFileSync('server/health.js', 'utf8');
    const ownership = fs.readFileSync('server/healthOwnership.js', 'utf8');
    expect(ownership).toContain('getEquipmentOwnershipSummary');
    expect(health).toContain('&& equipmentOwnership.ready');
    expect(health).toContain("'agent_equipment_ownership_unavailable'");
  });
});
