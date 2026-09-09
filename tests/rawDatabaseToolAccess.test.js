import { jest } from '@jest/globals';
import { toolCallOk } from '../server/routes/chat/toolOutcome.js';

const rawHandler = jest.fn(async () => 'database tool executed');
const getAgent = jest.fn(async () => ({
  id: 'nexus',
  tool_scopes: {
    mode: 'custom',
    tools: ['postgres_query', 'postgres_exec_file', 'web_search'],
  },
}));
const getSubAgentById = jest.fn(async () => null);
const pool = {
  query: jest.fn(),
  connect: jest.fn(),
  on: jest.fn(),
  end: jest.fn(),
};

jest.unstable_mockModule('../server/db.js', () => ({
  default: pool,
  createDbPool: () => pool,
}));
jest.unstable_mockModule('../server/memory.js', () => ({
  getAgent,
  getSubAgentById,
}));
jest.unstable_mockModule('../server/tools/handlers/index.js', () => ({
  TOOL_REGISTRY: {
    postgres_query: rawHandler,
    postgres_exec_file: rawHandler,
  },
}));

const { executeTool } = await import('../server/tools.js');
const { filterToolsForAgent } = await import('../server/tools/rbac/checks.js');

const priorMode = process.env.CENSAI_MODE;
let databaseRole = 'user';
let workspaceMember = true;

function context(overrides = {}) {
  return { userId: 7, workspaceId: 'workspace-a', userRole: 'admin', ...overrides };
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.CENSAI_MODE = 'cloud_saas';
  databaseRole = 'user';
  workspaceMember = true;
  getAgent.mockResolvedValue({
    id: 'nexus',
    tool_scopes: {
      mode: 'custom',
      tools: ['postgres_query', 'postgres_exec_file', 'web_search'],
    },
  });
  getSubAgentById.mockResolvedValue(null);
  pool.query.mockImplementation(async (sql) => {
    const text = String(sql);
    if (text === 'SELECT role FROM users WHERE id = $1') {
      return { rows: databaseRole ? [{ role: databaseRole }] : [] };
    }
    if (text.includes('FROM workspaces w')) {
      return { rows: workspaceMember
        ? [{ id: 'workspace-a', name: 'Workspace A', role: 'member' }]
        : [] };
    }
    if (text.includes('FROM workspace_agent_capabilities')) return { rows: [] };
    if (text.includes('FROM agent_messages')) return { rows: [] };
    throw new Error(`Unexpected query: ${text}`);
  });
});

afterAll(() => {
  if (priorMode === undefined) delete process.env.CENSAI_MODE;
  else process.env.CENSAI_MODE = priorMode;
});

test.each(['postgres_query', 'postgres_exec_file'])(
  'ordinary cloud users cannot execute %s even with a spoofed role',
  async (name) => {
    const result = await executeTool('nexus', name, { sql: 'SELECT 1', allow_write: true }, context());

    expect(result).toBe(
      `Error: TOOL_NOT_AVAILABLE: Tool ${name} is not active for this agent in this workspace.`
    );
    expect(toolCallOk(result)).toBe(false);
    expect(rawHandler).not.toHaveBeenCalled();
  },
);

test('cloud execution fails closed for missing or foreign context before the handler', async () => {
  const missing = await executeTool('nexus', 'postgres_query', { sql: 'SELECT 1' }, {});
  expect(missing).toMatch(/^Error: TOOL_ACCESS_DENIED:/);
  expect(pool.query).not.toHaveBeenCalled();

  databaseRole = 'admin';
  workspaceMember = false;
  const foreign = await executeTool(
    'nexus',
    'postgres_query',
    { sql: 'SELECT 1' },
    context({ workspaceId: 'workspace-foreign' }),
  );
  expect(foreign).toMatch(/^Error: TOOL_NOT_AVAILABLE:/);
  expect(rawHandler).not.toHaveBeenCalled();
});

test.each(['admin', 'operator'])(
  'DB-verified %s still cannot widen a canonical workspace through legacy scopes',
  async (role) => {
    databaseRole = role;
    const result = await executeTool('nexus', 'postgres_query', {
      sql: 'SELECT 1',
    }, context({ userRole: 'user' }));

    expect(result).toMatch(/^Error: TOOL_NOT_AVAILABLE:/);
    expect(rawHandler).not.toHaveBeenCalled();
  },
);

test('cloud authorization-store failure is a stable failed result before the handler', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  pool.query.mockRejectedValueOnce(new Error('database internals'));

  const result = await executeTool('nexus', 'postgres_query', { sql: 'SELECT 1' }, context());

  expect(result).toMatch(/^Error: TOOL_NOT_AVAILABLE:/);
  expect(toolCallOk(result)).toBe(false);
  expect(rawHandler).not.toHaveBeenCalled();
  warn.mockRestore();
});

test('local and private runtimes preserve the existing raw-tool path explicitly', async () => {
  for (const mode of ['local_desktop', 'private_server']) {
    process.env.CENSAI_MODE = mode;
    await expect(executeTool('nexus', 'postgres_query', { sql: 'SELECT 1' }))
      .resolves.toBe('database tool executed');
  }
  expect(pool.query).not.toHaveBeenCalled();
  expect(rawHandler).toHaveBeenCalledTimes(2);
});

test('tool filtering removes custom-scoped raw tools for ordinary cloud users', async () => {
  const names = (await filterToolsForAgent('nexus', context()))
    .map(tool => tool.function.name);

  expect(names).not.toContain('web_search');
  expect(names).not.toContain('postgres_query');
  expect(names).not.toContain('postgres_exec_file');
});

test('tool filtering never lets a cloud operator legacy scope widen the family baseline', async () => {
  databaseRole = 'operator';
  const names = (await filterToolsForAgent('nexus', context({ userRole: 'user' })))
    .map(tool => tool.function.name);

  expect(names).not.toContain('postgres_query');
  expect(names).not.toContain('postgres_exec_file');
});
