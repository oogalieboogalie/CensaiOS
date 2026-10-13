import { jest } from '@jest/globals';
import { getToolPackageForModule } from '../server/capabilities/packageCatalog.js';
import { getToolPackageOwnershipSummary } from '../server/capabilities/packageStatus.js';

function currentInstall(workspaceId, moduleId) {
  const pkg = getToolPackageForModule(moduleId);
  return { workspace_id: workspaceId, package_id: pkg.id, module_id: moduleId,
    package_version: pkg.version, manifest_hash: pkg.manifestHash };
}

function database(installs, capabilities) {
  return { query: jest.fn(async sql => {
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
    if (text.includes('FROM workspace_tool_package_installs')) return { rows: installs };
    if (text.includes('FROM workspace_agent_capabilities')) return { rows: capabilities };
    throw new Error(`Unexpected query: ${text}`);
  }) };
}

test('ownership is ready only for current installs with no orphan capabilities', async () => {
  const db = database([
    currentInstall('workspace-a', 'web-research'),
    currentInstall('workspace-b', 'project-reader'),
  ], [
    { workspace_id: 'workspace-a', module_id: 'web-research' },
    { workspace_id: 'workspace-b', module_id: 'project-reader' },
  ]);
  await expect(getToolPackageOwnershipSummary(db)).resolves.toEqual({
    ready: true, totalCount: 2, workspaceCount: 2, validCount: 2,
    invalidCount: 0, orphanCapabilityCount: 0,
  });
});

test('manifest drift and orphan capability rows fail readiness', async () => {
  const drifted = { ...currentInstall('workspace-a', 'web-research'), manifest_hash: '0'.repeat(64) };
  const db = database([drifted], [{ workspace_id: 'workspace-a', module_id: 'web-research' }]);
  await expect(getToolPackageOwnershipSummary(db)).resolves.toMatchObject({
    ready: false, invalidCount: 1, orphanCapabilityCount: 1,
  });
});
