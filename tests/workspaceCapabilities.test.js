import { jest } from '@jest/globals';
import { getToolPackageForModule } from '../server/capabilities/packageCatalog.js';

const createWorkspaceEvent = jest.fn(async () => ({ id: 'event-1' }));
jest.unstable_mockModule('../server/operational-intelligence/factories.js', () => ({ createWorkspaceEvent }));

const {
  replaceWorkspaceCapabilityModules,
  validateCapabilityModuleIds,
} = await import('../server/capabilities/workspaceCapabilities.js');

function row(moduleId = 'web-research') {
  const pkg = getToolPackageForModule(moduleId);
  return {
    module_id: moduleId,
    capability_id: moduleId === 'web-research' ? 'browser.read' : 'memory.read',
    mode: 'autonomous',
    equipped_slot: moduleId === 'web-research' ? 'head' : 'trinket',
    source: 'exoskeleton',
    equipped_by_user_id: 7,
    package_id: pkg.id,
    package_version: pkg.version,
    manifest_hash: pkg.manifestHash,
  };
}

function installRow(moduleId = 'web-research') {
  const pkg = getToolPackageForModule(moduleId);
  return {
    workspace_id: 'workspace-a', package_id: pkg.id, module_id: moduleId,
    package_version: pkg.version, manifest_hash: pkg.manifestHash,
  };
}

beforeEach(() => jest.clearAllMocks());

test('selection validation rejects unknown, duplicate, oversized, and same-slot modules', () => {
  expect(() => validateCapabilityModuleIds(['unknown'])).toThrow(/Unknown module/);
  expect(() => validateCapabilityModuleIds(['web-research', 'web-research'])).toThrow(/unique/);
  expect(() => validateCapabilityModuleIds([
    'web-research', 'project-reader', 'workspace-reader', 'memory-reader', 'github-reader',
  ])).toThrow(/At most four/);
  expect(() => validateCapabilityModuleIds(['project-reader', 'github-reader'])).toThrow(/one module.*slot/i);
});

test('replacement derives every persisted field from catalog and signed scope', async () => {
  let inserted = false;
  const client = {
    query: jest.fn(async sql => {
      const text = String(sql);
      if (text.includes('FROM workspace_tool_package_installs')) return { rows: [installRow()] };
      if (text.includes('FROM workspace_agent_capabilities')) return { rows: inserted ? [row()] : [] };
      if (text.includes('INSERT INTO workspace_agent_capabilities')) inserted = true;
      return { rows: [] };
    }),
    release: jest.fn(),
  };
  const db = { connect: jest.fn(async () => client) };
  const result = await replaceWorkspaceCapabilityModules(db, {
    workspaceId: 'workspace-a', userId: 7, agentId: 'atlas', moduleIds: ['web-research'],
  });

  expect(result).toMatchObject({ changed: true, eventId: 'event-1' });
  const insert = client.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO workspace_agent_capabilities'));
  expect(insert[1]).toEqual([
    'workspace-a', 'atlas', ['web-research'], ['browser.read'], ['autonomous'], ['head'], 7,
  ]);
  expect(createWorkspaceEvent).toHaveBeenCalledWith({ db: client }, expect.objectContaining({
    workspaceId: 'workspace-a',
    actor: { kind: 'user', id: '7' },
    payload: expect.objectContaining({ agentId: 'atlas', moduleIds: ['web-research'] }),
  }));
  expect(client.query).toHaveBeenCalledWith('COMMIT');
  expect(client.release).toHaveBeenCalled();
});

test('an exact reapply is idempotent and creates no event or mutation', async () => {
  const client = {
    query: jest.fn(async sql => {
      const text = String(sql);
      if (text.includes('FROM workspace_tool_package_installs')) return { rows: [installRow()] };
      if (text.includes('FROM workspace_agent_capabilities')) return { rows: [row()] };
      return { rows: [] };
    }),
    release: jest.fn(),
  };
  const result = await replaceWorkspaceCapabilityModules({ connect: async () => client }, {
    workspaceId: 'workspace-a', userId: 7, agentId: 'atlas', moduleIds: ['web-research'],
  });
  expect(result).toMatchObject({ changed: false, eventId: null });
  expect(client.query.mock.calls.every(([sql]) => !String(sql).includes('DELETE FROM'))).toBe(true);
  expect(createWorkspaceEvent).not.toHaveBeenCalled();
});

test('an uninstalled package fails closed before capability mutation', async () => {
  const client = {
    query: jest.fn(async sql => String(sql).includes('FROM workspace_tool_package_installs')
      ? { rows: [] } : { rows: [] }),
    release: jest.fn(),
  };
  await expect(replaceWorkspaceCapabilityModules({ connect: async () => client }, {
    workspaceId: 'workspace-a', userId: 7, agentId: 'atlas', moduleIds: ['web-research'],
  })).rejects.toMatchObject({ code: 'TOOL_PACKAGE_NOT_INSTALLED', statusCode: 409 });
  expect(client.query.mock.calls.some(([sql]) => String(sql)
    .includes('INSERT INTO workspace_agent_capabilities'))).toBe(false);
  expect(client.query).toHaveBeenCalledWith('ROLLBACK');
});

test('invalid input fails before a transaction opens', async () => {
  const db = { connect: jest.fn() };
  await expect(replaceWorkspaceCapabilityModules(db, {
    workspaceId: 'workspace-a', userId: 7, agentId: 'atlas', moduleIds: ['terminal'],
  })).rejects.toThrow(/Unknown module/);
  expect(db.connect).not.toHaveBeenCalled();
});
