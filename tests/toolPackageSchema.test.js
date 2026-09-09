import fs from 'node:fs';
import { jest } from '@jest/globals';
import { REVIEWED_TOOL_PACKAGES } from '../server/capabilities/packageCatalog.js';
import { inspectToolPackageSchema } from '../server/capabilities/packageSchema.js';

test('migration creates an additive workspace package boundary from scoped capabilities only', () => {
  const sql = fs.readFileSync('docker/042-workspace-tool-package-installs.sql', 'utf8');
  expect(sql).toContain('CREATE TABLE IF NOT EXISTS workspace_tool_package_installs');
  expect(sql).toContain('PRIMARY KEY (workspace_id, package_id)');
  expect(sql).toContain('UNIQUE (workspace_id, module_id)');
  expect(sql).toContain('REFERENCES workspaces(id) ON DELETE CASCADE');
  expect(sql).toMatch(/FROM workspace_agent_capabilities c/i);
  expect(sql).not.toMatch(/FROM agent_capabilities/i);
  for (const pkg of REVIEWED_TOOL_PACKAGES) expect(sql).toContain(pkg.manifestHash);
});

test('schema inspection requires ownership, uniqueness, and both foreign keys', async () => {
  const db = { query: jest.fn(async sql => {
    const text = String(sql);
    if (text.includes('to_regclass')) return { rows: [{ present: true }] };
    if (text.includes('information_schema.columns')) return { rows: [
      'workspace_id', 'package_id', 'module_id', 'package_version', 'manifest_hash',
      'installed_by_user_id', 'installed_at',
    ].map(column_name => ({ column_name })) };
    if (text.includes('information_schema.table_constraints')) return { rows: [
      { constraint_name: 'pk', constraint_type: 'PRIMARY KEY' },
      { constraint_name: 'uq', constraint_type: 'UNIQUE' },
      { constraint_name: 'workspace_fk', constraint_type: 'FOREIGN KEY' },
      { constraint_name: 'user_fk', constraint_type: 'FOREIGN KEY' },
    ] };
    throw new Error(`Unexpected query: ${text}`);
  }) };
  await expect(inspectToolPackageSchema(db)).resolves.toMatchObject({
    ready: true, present: true, table: 'workspace_tool_package_installs',
  });
});
