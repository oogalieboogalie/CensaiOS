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

const FORBIDDEN_DEFAULTS = [
  'web_search', 'github_read_file', 'sheets_read_range',
  'read_journal', 'terminal_run', 'sandbox_exec', 'postgres_query', 'container_logs',
  'restart_service', 'mailcow_domains', 'vex_run', 'jules_submit', 'generate_image',
];

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
  '%s gets only its intrinsic baseline when the workspace has no modules',
  async agentId => {
    const names = (await filterToolsForAgent(agentId, {
      workspaceId: 'workspace-a', userId: 7,
    })).map(tool => tool.function.name);

    expect(names).toEqual(expect.arrayContaining(FAMILY_DEFAULT_TOOL_NAMES[agentId]));
    expect(names).toEqual(expect.arrayContaining(['search_tools', 'get_tool']));
    for (const forbidden of FORBIDDEN_DEFAULTS) expect(names).not.toContain(forbidden);
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
  expect(names).not.toContain('project_write');
  expect(names).not.toContain('terminal_run');
});

test('reviewed modules do not duplicate intrinsic family tools beyond the documented baseline', () => {
  // Project read tools are deliberately in the family baseline AND the
  // project-reader/writer modules (modules add approval/packaging; baseline
  // grants the raw capability). This is the only sanctioned overlap.
  const ALLOWED_BASELINE_OVERLAPS = new Set([
    'project-reader:project_read', 'project-reader:project_list',
    'project-reader:project_file_outline', 'project-reader:read_brief',
    'project-writer:project_write', 'project-writer:project_edit',
  ]);
  const intrinsic = new Set(Object.values(FAMILY_DEFAULT_TOOL_NAMES).flat());
  const overlaps = Object.values(AGENT_CAPABILITY_MODULE_BY_ID).flatMap(module => (
    module.toolNames.filter(name => intrinsic.has(name)).map(name => `${module.id}:${name}`)
  ));
  expect(overlaps.sort()).toEqual([...ALLOWED_BASELINE_OVERLAPS].sort());
});
