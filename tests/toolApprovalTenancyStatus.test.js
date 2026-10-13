import { jest } from '@jest/globals';

jest.unstable_mockModule('../server/db.js', () => ({ default: {} }));
const { getToolApprovalOwnershipSummary } = await import('../server/approvals/tenancyStatus.js');

const columns = [
  'id', 'workspace_id', 'agent_id', 'module_id', 'tool_name', 'arguments', 'request_hash',
  'status', 'revision', 'requested_by_user_id', 'decided_by_user_id', 'decision_at',
  'execution_started_at', 'execution_finished_at', 'result_preview', 'error_code',
  'cancellation_reason', 'created_at', 'updated_at',
];

test('reports pending, executing, and stale uncertain action counts', async () => {
  const db = { query: jest.fn()
    .mockResolvedValueOnce({ rows: [{ present: true }] })
    .mockResolvedValueOnce({ rows: columns.map(column_name => ({ column_name })) })
    .mockResolvedValueOnce({ rows: [
      { constraint_name: 'pk', constraint_type: 'PRIMARY KEY' },
      ...Array.from({ length: 4 }, (_, index) => ({ constraint_name: `fk${index}`, constraint_type: 'FOREIGN KEY' })),
    ] })
    .mockResolvedValueOnce({ rows: [{ total: 8, pending: 2, executing: 1, stale: 1 }] }) };
  await expect(getToolApprovalOwnershipSummary(db)).resolves.toEqual({
    ready: true, totalCount: 8, pendingCount: 2, executingCount: 1, staleExecutingCount: 1,
  });
});

test('fails closed without querying counts when the table is absent', async () => {
  const db = { query: jest.fn().mockResolvedValueOnce({ rows: [{ present: false }] }) };
  await expect(getToolApprovalOwnershipSummary(db)).resolves.toMatchObject({
    ready: false, totalCount: null, pendingCount: null, executingCount: null,
  });
  expect(db.query).toHaveBeenCalledTimes(1);
});
