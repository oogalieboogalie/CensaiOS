import { jest } from '@jest/globals';

const handler = jest.fn(async () => 'Wrote a.md');
const requestToolApprovalIfRequired = jest.fn();
const assertApprovedToolExecution = jest.fn();
const assertFamilyToolAvailable = jest.fn();
jest.unstable_mockModule('../server/logger.js', () => ({ createLogger: () => ({
  debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), startTimer: () => () => 1,
}) }));
jest.unstable_mockModule('../server/tools/handlers/index.js', () => ({ TOOL_REGISTRY: { project_write: handler } }));
jest.unstable_mockModule('../server/tools/dynamicRegistry.js', () => ({ initializeDynamicTools: jest.fn() }));
jest.unstable_mockModule('../server/tools/mcpClient.js', () => ({ initializeMcpTools: jest.fn(), shutdownMcpTools: jest.fn() }));
jest.unstable_mockModule('../server/tools/definitions.js', () => ({
  TOOL_DEFINITIONS: [], filterToolsForAgent: jest.fn(), listToolCatalog: jest.fn(),
}));
jest.unstable_mockModule('../server/db.js', () => ({ default: {} }));
jest.unstable_mockModule('../server/workspaces/projectMemberships.js', () => ({ assertAgentRepoAccess: jest.fn() }));
jest.unstable_mockModule('../server/memory.js', () => ({ getSubAgentById: jest.fn() }));
jest.unstable_mockModule('../server/tools/rbac/runtimeAccess.js', () => ({ authorizeToolInvocation: jest.fn() }));
jest.unstable_mockModule('../server/tools/rbac/executionBoundary.js', () => ({ assertFamilyToolAvailable }));
jest.unstable_mockModule('../server/approvals/requests.js', () => ({ requestToolApprovalIfRequired }));
jest.unstable_mockModule('../server/approvals/decisions.js', () => ({ assertApprovedToolExecution }));
const { executeApprovedTool, executeTool } = await import('../server/tools.js');

beforeEach(() => {
  jest.clearAllMocks();
  assertFamilyToolAvailable.mockResolvedValue({ enforced: true });
});

test('a stale or unequipped tool is denied before approval lookup and handler execution', async () => {
  assertFamilyToolAvailable.mockRejectedValue(Object.assign(new Error('not active'), {
    code: 'TOOL_NOT_AVAILABLE',
  }));
  await expect(executeTool('censai', 'project_write', { path: 'a.md' }, {
    workspaceId: 'workspace-a', userId: 7,
  })).resolves.toBe('Error: TOOL_NOT_AVAILABLE: not active');
  expect(requestToolApprovalIfRequired).not.toHaveBeenCalled();
  expect(handler).not.toHaveBeenCalled();
});

test('ordinary execution returns a pending receipt without calling the handler', async () => {
  requestToolApprovalIfRequired.mockResolvedValue({ required: true, approval: { id: 'approval-1' } });
  await expect(executeTool('censai', 'project_write', { path: 'a.md' }, {
    workspaceId: 'workspace-a', userId: 7,
  })).resolves.toBe('APPROVAL_REQUIRED: approval-1 is pending owner/admin review. No action was executed.');
  expect(handler).not.toHaveBeenCalled();
});

test('approved execution requires durable proof and invokes the handler once', async () => {
  assertApprovedToolExecution.mockResolvedValue({ id: 'approval-1', status: 'executing' });
  await expect(executeApprovedTool('censai', 'project_write', { path: 'a.md' }, {
    workspaceId: 'workspace-a', userId: 7,
  }, 'approval-1')).resolves.toBe('Wrote a.md');
  expect(assertApprovedToolExecution).toHaveBeenCalled();
  expect(handler).toHaveBeenCalledTimes(1);
});

test('invalid execution proof fails closed before the handler', async () => {
  assertApprovedToolExecution.mockRejectedValue(Object.assign(new Error('stale'), { code: 'TOOL_APPROVAL_EXECUTION_STALE' }));
  await expect(executeApprovedTool('censai', 'project_write', { path: 'a.md' }, {
    workspaceId: 'workspace-a', userId: 7,
  }, 'approval-1')).resolves.toMatch(/^Error: TOOL_APPROVAL_EXECUTION_STALE:/);
  expect(handler).not.toHaveBeenCalled();
});
