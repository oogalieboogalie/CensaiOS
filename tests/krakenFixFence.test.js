import { jest } from '@jest/globals';

// During a Kraken fix the agent changes files only through the project tools, on the fix's
// own branch (server/tools/jobProject.js codeJobRefusal). These two doors do not go through
// the tool handlers: an outside (MCP) tool goes straight from the run engine to its server
// (server/runEngine/index.js toolRunner), and a tool that needs an OK raises an approval card
// before it runs (server/tools.js executeTool). Both refuse during a fix. Made-up agent: Atlas.

const pool = { query: jest.fn(async () => ({ rows: [] })), connect: jest.fn(), on: jest.fn(), end: jest.fn() };
const ran = jest.fn(async (_agentId, name) => `${name} ran`);
const requestToolApprovalIfRequired = jest.fn(async () => ({ required: true, approval: { id: 'card-1' } }));

jest.unstable_mockModule('../server/db.js', () => ({ default: pool, createDbPool: () => pool }));
jest.unstable_mockModule('../server/tools/handlers/index.js', () => ({ TOOL_REGISTRY: { local_write_file: ran, recall: ran } }));
jest.unstable_mockModule('../server/approvals/requests.js', () => ({
  requestToolApprovalIfRequired,
  ToolApprovalError: class ToolApprovalError extends Error {},
  notEquippedWords: () => 'not equipped',
  listToolApprovals: async () => [],
}));

const { executeTool } = await import('../server/tools.js');
const { toolRunner } = await import('../server/runEngine/index.js');
const { runInJobProject } = await import('../server/tools/jobProject.js');
const { runWithOfferedTools } = await import('../server/tools/rbac/offeredTools.js');

const CONTEXT = { userId: 7, workspaceId: 'made-up-board' };
const offered = (...names) => names.map((name) => ({ type: 'function', function: { name, parameters: { type: 'object', properties: {} } } }));
const duringFix = (fn) => runInJobProject({ agentId: 'atlas', project: 'p-cloud', confined: true }, fn);

const outside = {
  definitions: [{ type: 'function', function: { name: 'mcp__files__write_file' } }],
  has: (name) => name === 'mcp__files__write_file',
  call: jest.fn(async () => 'outside ran'),
};

beforeEach(() => {
  outside.call.mockClear();
  ran.mockClear();
  requestToolApprovalIfRequired.mockClear();
});

describe('an outside tool, through the run engine', () => {
  const ask = () => runWithOfferedTools(offered('mcp__files__write_file'), () => (
    toolRunner(outside)('atlas', 'mcp__files__write_file', { path: 'notes.md' }, CONTEXT)
  ));

  test('is refused during a fix, and its server is never called', async () => {
    expect(await duringFix(ask)).toMatch(/^Error: Blocked\. Nothing was changed\. During this fix/);
    expect(outside.call).not.toHaveBeenCalled();
  });

  test('still runs outside a fix', async () => {
    expect(await ask()).toBe('outside ran');
  });
});

describe('a tool that needs an OK', () => {
  test('is refused during a fix before any approval card is raised', async () => {
    const result = await duringFix(() => executeTool('atlas', 'local_write_file', { path: 'notes.md', content: 'x' }, CONTEXT));
    expect(result).toMatch(/^Error: Blocked\. Nothing was changed\. During this fix/);
    expect(requestToolApprovalIfRequired).not.toHaveBeenCalled();
    expect(ran).not.toHaveBeenCalled();
  });
});
