import { jest } from '@jest/globals';
import { getToolPackageForModule } from '../server/capabilities/packageCatalog.js';

const getAgent = jest.fn(async () => ({
  id: 'censai',
  name: 'Censai',
  tool_scopes: null,
}));
const getSubAgentById = jest.fn(async () => null);
const pool = { query: jest.fn(), connect: jest.fn(), on: jest.fn(), end: jest.fn() };

jest.unstable_mockModule('../server/db.js', () => ({
  default: pool,
  createDbPool: () => pool,
}));
jest.unstable_mockModule('../server/memory.js', () => ({ getAgent, getSubAgentById }));

const { filterToolsForAgent } = await import('../server/tools/rbac/checks.js');

function capabilityRow(overrides = {}) {
  const pkg = getToolPackageForModule('workspace-reader');
  return {
    module_id: 'workspace-reader',
    capability_id: 'calendar.read',
    mode: 'autonomous',
    equipped_slot: 'offHand',
    source: 'exoskeleton',
    package_id: pkg.id,
    package_version: pkg.version,
    manifest_hash: pkg.manifestHash,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  pool.query.mockImplementation(async sql => {
    const text = String(sql);
    if (text.includes('workspace_agent_capabilities')) return { rows: [capabilityRow()] };
    if (text.includes('FROM agent_messages')) return { rows: [] };
    throw new Error(`Unexpected query: ${text}`);
  });
});

test('unscoped calls keep the minimal family baseline and never consult a capability table', async () => {
  const names = (await filterToolsForAgent('censai')).map(tool => tool.function.name);
  expect(names).toEqual(expect.arrayContaining(['remember', 'recall', 'message_to', 'report']));
  expect(names).toEqual(expect.arrayContaining(['create_sub_agent', 'project_read']));
  expect(names).not.toContain('web_search');
  expect(names).not.toContain('project_write');
  expect(names).not.toContain('read_calendar');
  expect(pool.query).not.toHaveBeenCalled();
});

test('the authenticated workspace adds its exact read-only module tools', async () => {
  const names = (await filterToolsForAgent('censai', {
    workspaceId: 'workspace-a', userId: 1,
  })).map(tool => tool.function.name);

  expect(names).toEqual(expect.arrayContaining(['read_calendar', 'sheets_read_range']));
  expect(pool.query.mock.calls.some(([sql, params]) => (
    String(sql).includes('workspace_agent_capabilities') && params[0] === 'workspace-a'
  ))).toBe(true);
});

test('a foreign workspace and a drifted row grant no module tools', async () => {
  pool.query.mockImplementation(async (sql, params) => {
    const text = String(sql);
    if (text.includes('workspace_agent_capabilities')) {
      return { rows: params[0] === 'workspace-b'
        ? [capabilityRow({ capability_id: 'terminal.execute' })]
        : [] };
    }
    if (text.includes('FROM agent_messages')) return { rows: [] };
    throw new Error(`Unexpected query: ${text}`);
  });

  const foreign = (await filterToolsForAgent('censai', {
    workspaceId: 'workspace-foreign', userId: 1,
  })).map(tool => tool.function.name);
  const drifted = (await filterToolsForAgent('censai', {
    workspaceId: 'workspace-b', userId: 1,
  })).map(tool => tool.function.name);
  expect(foreign).not.toContain('read_calendar');
  expect(drifted).not.toContain('terminal_run');
  expect(drifted).not.toContain('sandbox_exec');
});

test('legacy global approval rows are not queried or converted into executable tools', async () => {
  await filterToolsForAgent('censai', { workspaceId: 'workspace-a', userId: 1 });
  expect(pool.query.mock.calls.every(([sql]) => !String(sql).includes('FROM agent_capabilities'))).toBe(true);
});
