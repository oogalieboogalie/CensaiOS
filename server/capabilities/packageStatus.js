import pool from '../db.js';
import { isCurrentToolPackageInstall } from './packageCatalog.js';
import { inspectToolPackageSchema } from './packageSchema.js';

export async function getToolPackageOwnershipSummary(db = pool) {
  const schema = await inspectToolPackageSchema(db);
  if (!schema.ready) return {
    ready: false, schema, totalCount: null, workspaceCount: null,
    validCount: null, invalidCount: null, orphanCapabilityCount: null,
  };
  const [{ rows: installs }, { rows: capabilities }] = await Promise.all([
    db.query(`SELECT workspace_id,package_id,module_id,package_version,manifest_hash
      FROM workspace_tool_package_installs`),
    db.query('SELECT workspace_id,module_id FROM workspace_agent_capabilities'),
  ]);
  const validKeys = new Set(installs.filter(row => isCurrentToolPackageInstall(row))
    .map(row => `${row.workspace_id}\u0000${row.module_id}`));
  const invalidCount = installs.filter(row => !isCurrentToolPackageInstall(row)).length;
  const orphanCapabilityCount = capabilities.filter(row => (
    !validKeys.has(`${row.workspace_id}\u0000${row.module_id}`)
  )).length;
  return {
    ready: invalidCount === 0 && orphanCapabilityCount === 0,
    totalCount: installs.length,
    workspaceCount: new Set(installs.map(row => row.workspace_id)).size,
    validCount: installs.length - invalidCount,
    invalidCount,
    orphanCapabilityCount,
  };
}
