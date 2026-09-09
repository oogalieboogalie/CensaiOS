import { jest } from '@jest/globals';

jest.unstable_mockModule('../server/db.js', () => ({ default: {} }));

const { getCapabilityOwnershipSummary } = await import('../server/capabilities/tenancyStatus.js');

test('reports quarantined global rows separately from workspace module rows', async () => {
  const db = {
    query: jest.fn()
      .mockResolvedValueOnce({ rows: [{ present: true }] })
      .mockResolvedValueOnce({ rows: [
        'workspace_id', 'agent_id', 'module_id', 'capability_id', 'mode', 'equipped_slot',
        'source', 'equipped_by_user_id', 'created_at', 'updated_at',
      ].map(column_name => ({ column_name })) })
      .mockResolvedValueOnce({ rows: [
        { constraint_name: 'pk', constraint_type: 'PRIMARY KEY' },
        ...Array.from({ length: 3 }, (_, index) => ({
          constraint_name: `fk_${index}`, constraint_type: 'FOREIGN KEY',
        })),
      ] })
      .mockResolvedValueOnce({ rows: [{
        legacy: 2, scoped: 3, scoped_workspaces: 2, scoped_agents: 1,
      }] }),
  };

  await expect(getCapabilityOwnershipSummary(db)).resolves.toEqual({
    ready: true,
    legacyQuarantinedCount: 2,
    scopedCount: 3,
    scopedWorkspaceCount: 2,
    scopedAgentCount: 1,
  });
});

test('does not query row counts when the scoped schema is unavailable', async () => {
  const db = { query: jest.fn().mockResolvedValueOnce({ rows: [{ present: false }] }) };
  await expect(getCapabilityOwnershipSummary(db)).resolves.toMatchObject({
    ready: false,
    legacyQuarantinedCount: null,
    scopedCount: null,
  });
  expect(db.query).toHaveBeenCalledTimes(1);
});
