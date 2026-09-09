import { jest } from '@jest/globals';
import { getToolPackageForModule } from '../server/capabilities/packageCatalog.js';

const createWorkspaceEvent = jest.fn(async () => ({ id: 'event-1' }));
const requireWorkspaceMember = jest.fn(async () => ({ role: 'owner' }));
jest.unstable_mockModule('../server/operational-intelligence/factories.js', () => ({ createWorkspaceEvent }));
jest.unstable_mockModule('../server/workspaces/context.js', () => ({ requireWorkspaceMember }));
const {
  installWorkspaceToolPackage, listWorkspaceToolPackages, removeWorkspaceToolPackage,
} = await import('../server/capabilities/packageStore.js');

const pkg = getToolPackageForModule('web-research');
const install = { workspace_id: 'workspace-a', package_id: pkg.id, module_id: pkg.module.id,
  package_version: pkg.version, manifest_hash: pkg.manifestHash, installed_by_user_id: 7 };

beforeEach(() => jest.clearAllMocks());

test('install is workspace-locked, durable, and idempotent', async () => {
  let current = null;
  const client = { release: jest.fn(), query: jest.fn(async (sql) => {
    const text = String(sql);
    if (text.includes('SELECT * FROM workspace_tool_package_installs')) return { rows: current ? [current] : [] };
    if (text.includes('INSERT INTO workspace_tool_package_installs')) { current = install; return { rows: [install] }; }
    return { rows: [] };
  }) };
  const db = { connect: jest.fn(async () => client) };
  await expect(installWorkspaceToolPackage(db, {
    workspaceId: 'workspace-a', userId: 7, packageId: pkg.id,
  })).resolves.toMatchObject({ created: true, install });
  await expect(installWorkspaceToolPackage(db, {
    workspaceId: 'workspace-a', userId: 7, packageId: pkg.id,
  })).resolves.toMatchObject({ created: false, eventId: null });
  expect(client.query.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO')).length).toBe(1);
  expect(createWorkspaceEvent).toHaveBeenCalledTimes(1);
  expect(client.query).toHaveBeenCalledWith(
    'SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`tool-package:workspace-a:${pkg.id}`],
  );
});

test('list exposes every reviewed package but only current installs as installed', async () => {
  const db = { query: jest.fn(async () => ({ rows: [install] })) };
  const result = await listWorkspaceToolPackages(db, { workspaceId: 'workspace-a', userId: 8 });
  expect(result.canManage).toBe(true);
  expect(result.packages.find(item => item.id === pkg.id)).toMatchObject({ installed: true });
  expect(result.packages.filter(item => item.installed)).toHaveLength(1);
  expect(requireWorkspaceMember).toHaveBeenCalledWith(db, { workspaceId: 'workspace-a', userId: 8 });
});

test('remove atomically strips every agent grant and pending approval', async () => {
  const client = { release: jest.fn(), query: jest.fn(async sql => {
    const text = String(sql);
    if (text.includes('SELECT * FROM workspace_tool_package_installs')) return { rows: [install] };
    if (text.includes("status='executing'")) return { rows: [{ count: 0 }] };
    if (text.includes('DELETE FROM workspace_agent_capabilities')) {
      return { rows: [{ agent_id: 'atlas' }, { agent_id: 'censai' }, { agent_id: 'atlas' }] };
    }
    if (text.includes('UPDATE workspace_tool_approvals')) return { rows: [{ id: 'a' }, { id: 'b' }] };
    return { rows: [] };
  }) };
  const result = await removeWorkspaceToolPackage({ connect: async () => client }, {
    workspaceId: 'workspace-a', userId: 7, packageId: pkg.id,
  });
  expect(result).toMatchObject({ removed: true, affectedAgents: ['atlas', 'censai'], cancelledApprovals: 2 });
  expect(client.query).toHaveBeenCalledWith('COMMIT');
  expect(createWorkspaceEvent).toHaveBeenCalledWith({ db: client }, expect.objectContaining({
    type: 'agent.tool_package.removed',
    payload: expect.objectContaining({ affectedAgents: ['atlas', 'censai'], cancelledApprovalCount: 2 }),
  }));
});

test('remove rejects an executing action without mutating grants', async () => {
  const client = { release: jest.fn(), query: jest.fn(async sql => {
    const text = String(sql);
    if (text.includes('SELECT * FROM workspace_tool_package_installs')) return { rows: [install] };
    if (text.includes("status='executing'")) return { rows: [{ count: 1 }] };
    return { rows: [] };
  }) };
  await expect(removeWorkspaceToolPackage({ connect: async () => client }, {
    workspaceId: 'workspace-a', userId: 7, packageId: pkg.id,
  })).rejects.toMatchObject({ code: 'TOOL_PACKAGE_EXECUTION_IN_PROGRESS', statusCode: 409 });
  expect(client.query.mock.calls.some(([sql]) => String(sql)
    .includes('DELETE FROM workspace_agent_capabilities'))).toBe(false);
  expect(client.query).toHaveBeenCalledWith('ROLLBACK');
});
