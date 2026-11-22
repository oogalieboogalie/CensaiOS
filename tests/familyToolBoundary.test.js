import { jest } from '@jest/globals';
import { FAMILY_AGENTS } from '../src/data/family-agents.js';
import { AGENT_CAPABILITY_MODULE_BY_ID } from '../src/data/agent-capability-modules.js';
import { FAMILY_DEFAULT_TOOL_NAMES } from '../server/tools/rbac/familyBaseline.js';
import { getToolPackageForModule } from '../server/capabilities/packageCatalog.js';

const getAgent = jest.fn();
const getSubAgentById = jest.fn(async () => null);
const pool = { query: jest.fn(), connect: jest.fn(), on: jest.fn(), end: jest.fn() };

jest.unstable_mockModule('../server/db.js', () => ({ default: pool, createDbPool: () => pool }));
jest.unstable_mockModule('../server/memory.js', () => ({ getAgent, getSubAgentById }));

const { filterToolsForAgent } = await import('../server/tools/rbac/checks.js');

// Tools no family agent has by role, so an old saved scope must not bring them in.
const FORBIDDEN_DEFAULTS = ['vex_run', 'generate_image', 'hand_coding_job_to_github', 'policy_evaluate', 'scratchpad_clear'];
// The powerful tools go only to the roles they belong to.
const ROLE_ONLY = {
  terminal_run: ['architect', 'atlas', 'genesis', 'nexus', 'phoenix', 'foundation'],
  db_inspect: ['atlas', 'nexus'],
  restart_service: ['nexus', 'phoenix', 'foundation'],
  mailcow_domains: ['foundation'],
};

beforeEach(() => {
  jest.clearAllMocks();
  getAgent.mockImplementation(async id => ({
    id,
    tool_scopes: { mode: 'custom', tools: [...FORBIDDEN_DEFAULTS] },
  }));
  pool.query.mockImplementation(async sql => {
    const text = String(sql);
    if (text.includes('workspace_agent_capabilities')) return { rows: [] };
    if (text.includes('FROM agent_messages')) return { rows: [] };
    throw new Error(`Unexpected query: ${text}`);
  });
});

test.each(FAMILY_AGENTS.map(agent => agent.id))(
  '%s gets its role\'s tools and nothing else when the workspace has no modules',
  async agentId => {
    const names = (await filterToolsForAgent(agentId, {
      workspaceId: 'workspace-a', userId: 7,
    })).map(tool => tool.function.name);

    // The two raw database tools are offered only to the computer's owner (rawDatabaseToolAccess.test.js).
    const raw = ['postgres_query', 'postgres_exec_file'];
    expect(names).toEqual(expect.arrayContaining(FAMILY_DEFAULT_TOOL_NAMES[agentId].filter(name => !raw.includes(name))));
    expect(names).toEqual(expect.arrayContaining(['search_tools', 'get_tool']));
    expect(names).toEqual(expect.arrayContaining(['web_search', 'github_read_file', 'read_journal', 'run_tests']));
    for (const forbidden of FORBIDDEN_DEFAULTS) expect(names).not.toContain(forbidden);
    for (const [tool, roles] of Object.entries(ROLE_ONLY)) expect(names.includes(tool)).toBe(roles.includes(agentId));
  },
);

test('a reviewed module adds exactly its declared tools despite legacy global scopes', async () => {
  const module = AGENT_CAPABILITY_MODULE_BY_ID['project-reader'];
  const pkg = getToolPackageForModule(module.id);
  pool.query.mockImplementation(async sql => {
    const text = String(sql);
    if (text.includes('workspace_agent_capabilities')) return { rows: [{
      module_id: module.id,
      capability_id: module.capabilityId,
      mode: module.mode,
      equipped_slot: module.slot,
      package_id: pkg.id,
      package_version: pkg.version,
      manifest_hash: pkg.manifestHash,
    }] };
    if (text.includes('FROM agent_messages')) return { rows: [] };
    throw new Error(`Unexpected query: ${text}`);
  });

  const names = (await filterToolsForAgent('censai', {
    workspaceId: 'workspace-a', userId: 7,
  })).map(tool => tool.function.name);
  expect(names).toEqual(expect.arrayContaining(module.toolNames));
  expect(names).not.toContain('vex_run');
  expect(names).not.toContain('terminal_run');
});

test('every reviewed module tool is one the whole family already has by role', () => {
  for (const module of Object.values(AGENT_CAPABILITY_MODULE_BY_ID)) {
    for (const name of module.toolNames) {
      for (const agent of FAMILY_AGENTS) expect(FAMILY_DEFAULT_TOOL_NAMES[agent.id]).toContain(name);
    }
  }
});
