import fs from 'node:fs';
import { jest } from '@jest/globals';

jest.unstable_mockModule('../server/db.js', () => ({ default: { query: jest.fn() } }));
const { inspectToolApprovalSchema } = await import('../server/approvals/tenancySchema.js');

test('approval migration is scoped, additive, and permits only reviewed modes', () => {
  const sql = fs.readFileSync('docker/040-agent-tool-approvals.sql', 'utf8');
  expect(sql).toContain('CREATE TABLE IF NOT EXISTS workspace_tool_approvals');
  expect(sql).toContain("mode IN ('autonomous', 'execute_with_approval')");
  expect(sql).toContain("status IN ('pending', 'executing', 'succeeded', 'failed', 'denied', 'cancelled')");
  expect(sql).toContain('idx_workspace_tool_approvals_active_request');
  expect(sql).not.toMatch(/ALTER TABLE\s+agent_capabilities/i);
  expect(sql).not.toMatch(/INSERT INTO\s+workspace_tool_approvals[\s\S]*SELECT/i);
});

test('schema inspector requires all columns, a primary key, and four foreign keys', async () => {
  const columns = [
    'id', 'workspace_id', 'agent_id', 'module_id', 'tool_name', 'arguments', 'request_hash',
    'status', 'revision', 'requested_by_user_id', 'decided_by_user_id', 'decision_at',
    'execution_started_at', 'execution_finished_at', 'result_preview', 'error_code',
    'cancellation_reason', 'created_at', 'updated_at',
  ];
  const query = jest.fn()
    .mockResolvedValueOnce({ rows: [{ present: true }] })
    .mockResolvedValueOnce({ rows: columns.map(column_name => ({ column_name })) })
    .mockResolvedValueOnce({ rows: [
      { constraint_name: 'pk', constraint_type: 'PRIMARY KEY' },
      ...Array.from({ length: 4 }, (_, index) => ({ constraint_name: `fk${index}`, constraint_type: 'FOREIGN KEY' })),
    ] });
  await expect(inspectToolApprovalSchema({ query })).resolves.toMatchObject({ ready: true, present: true });
});

test('boot applies approval mode migration after scoped capabilities', () => {
  const boot = fs.readFileSync('server/boot/capabilitySchema.js', 'utf8');
  expect(boot.indexOf('039-agent-capability-tenancy.sql')).toBeLessThan(boot.indexOf('040-agent-tool-approvals.sql'));
});
