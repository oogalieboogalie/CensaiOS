import { jest } from '@jest/globals';

const debug = jest.fn();
const info = jest.fn();
const warn = jest.fn();
const error = jest.fn();
const handler = jest.fn(async () => 'tool-result-secret');

jest.unstable_mockModule('../server/logger.js', () => ({
  createLogger: () => ({
    debug,
    info,
    warn,
    error,
    startTimer: () => () => 3,
  }),
}));
jest.unstable_mockModule('../server/tools/handlers/index.js', () => ({
  TOOL_REGISTRY: { journal: handler, project_write: handler },
}));
jest.unstable_mockModule('../server/tools/dynamicRegistry.js', () => ({
  initializeDynamicTools: jest.fn(),
}));
jest.unstable_mockModule('../server/tools/mcpClient.js', () => ({
  initializeMcpTools: jest.fn(),
  shutdownMcpTools: jest.fn(),
}));
jest.unstable_mockModule('../server/tools/definitions.js', () => ({
  TOOL_DEFINITIONS: [],
  filterToolsForAgent: jest.fn(),
  listToolCatalog: jest.fn(),
}));
jest.unstable_mockModule('../server/db.js', () => ({ default: { query: jest.fn() } }));
jest.unstable_mockModule('../server/workspaces/projectMemberships.js', () => ({
  assertAgentRepoAccess: jest.fn(),
}));
jest.unstable_mockModule('../server/memory.js', () => ({ getAgent: jest.fn(), getSubAgentById: jest.fn() }));

const { executeTool } = await import('../server/tools.js');

describe('tool executor logging privacy', () => {
  beforeEach(() => jest.clearAllMocks());

  test('logs invocation shape without raw args, provenance, results, or errors', async () => {
    await executeTool('atlas', 'journal', {
      content: 'journal-secret',
      __provenance: { prompt: 'prompt-secret' },
    });
    await executeTool('sub-agent-1', 'project_write', {
      path: 'secret/path.js',
      content: 'file-secret',
      __provenance: { prompt: 'prompt-secret' },
    });

    expect(debug).toHaveBeenNthCalledWith(1, 'tool call', {
      agentId: 'atlas',
      name: 'journal',
      argumentCount: 0,
      private: true,
      redacted: true,
    });
    expect(debug).toHaveBeenNthCalledWith(2, 'tool call', {
      agentId: 'sub-agent-1',
      name: 'project_write',
      argumentCount: 2,
    });
    expect(info).toHaveBeenLastCalledWith('tool ok', {
      agentId: 'sub-agent-1',
      name: 'project_write',
      ms: 3,
      resultLength: 18,
    });
    expect(JSON.stringify({ debug: debug.mock.calls, info: info.mock.calls }))
      .not.toMatch(/journal-secret|prompt-secret|file-secret|secret\/path|__provenance|tool-result-secret/);
  });
});
