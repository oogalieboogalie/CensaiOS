import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

const requireWorkspaceMember = jest.fn();
const listToolApprovals = jest.fn();
const decideToolApproval = jest.fn();
const finishToolApproval = jest.fn();
const executeApprovedTool = jest.fn();
jest.unstable_mockModule('../server/db.js', () => ({ default: {} }));
jest.unstable_mockModule('../server/workspaces/context.js', () => ({ requireWorkspaceMember }));
jest.unstable_mockModule('../server/approvals/requests.js', () => ({
  listToolApprovals,
  ToolApprovalError: class ToolApprovalError extends Error {
    constructor(message, statusCode = 400, code = 'TOOL_APPROVAL_INVALID') {
      super(message); this.statusCode = statusCode; this.code = code;
    }
  },
}));
jest.unstable_mockModule('../server/approvals/decisions.js', () => ({ decideToolApproval, finishToolApproval }));
jest.unstable_mockModule('../server/tools.js', () => ({ executeApprovedTool }));
const { approvalsRouter } = await import('../server/routes/approvals.js');

const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.session = { userId: 7 }; next(); });
app.use('/api', approvalsRouter);

const pending = {
  id: '00000000-0000-4000-8000-000000000001', workspace_id: 'workspace-a', agent_id: 'censai',
  module_id: 'project-writer', tool_name: 'project_write', arguments: { path: 'a.md' }, status: 'pending', revision: 0,
};

beforeEach(() => {
  jest.clearAllMocks();
  requireWorkspaceMember.mockResolvedValue({ id: 'workspace-a', role: 'owner' });
  listToolApprovals.mockResolvedValue([pending]);
});

test('member list is workspace scoped and reports server-derived decision authority', async () => {
  requireWorkspaceMember.mockResolvedValue({ id: 'workspace-a', role: 'viewer' });
  const response = await request(app).get('/api/tool-approvals?workspaceId=workspace-a&status=pending');
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({ workspaceId: 'workspace-a', canDecide: false, approvals: [pending] });
  expect(listToolApprovals).toHaveBeenCalledWith({}, expect.objectContaining({ workspaceId: 'workspace-a' }));
});

test('viewer decision is denied before state-machine access', async () => {
  requireWorkspaceMember.mockRejectedValue(Object.assign(new Error('Workspace role does not allow this operation'), { statusCode: 403 }));
  const response = await request(app).post(`/api/tool-approvals/${pending.id}/decision`)
    .send({ workspaceId: 'workspace-a', decision: 'approve', revision: 0 });
  expect(response.status).toBe(403);
  expect(decideToolApproval).not.toHaveBeenCalled();
});

test('approval executes only the captured row and stores the durable result', async () => {
  const executing = { ...pending, status: 'executing', revision: 1, decided_by_user_id: 7 };
  const succeeded = { ...pending, status: 'succeeded', revision: 2, result_preview: 'Wrote a.md' };
  decideToolApproval.mockResolvedValue({ execute: true, approval: executing });
  executeApprovedTool.mockResolvedValue('Wrote a.md');
  finishToolApproval.mockResolvedValue(succeeded);
  const response = await request(app).post(`/api/tool-approvals/${pending.id}/decision`)
    .send({ workspaceId: 'workspace-a', decision: 'approve', revision: 0,
      agentId: 'atlas', toolName: 'restart_service', arguments: { service: 'attacker' }, userId: 999 });
  expect(response.status).toBe(200);
  expect(executeApprovedTool).toHaveBeenCalledWith(
    'censai', 'project_write', { path: 'a.md' }, expect.objectContaining({ workspaceId: 'workspace-a', userId: 7 }), pending.id,
  );
  expect(finishToolApproval).toHaveBeenCalledWith({}, expect.objectContaining({ approval: executing, ok: true }));
});

test('removed module returns a durable cancellation conflict without execution', async () => {
  decideToolApproval.mockResolvedValue({ execute: false, cancelled: true,
    approval: { ...pending, status: 'cancelled', revision: 1 } });
  const response = await request(app).post(`/api/tool-approvals/${pending.id}/decision`)
    .send({ workspaceId: 'workspace-a', decision: 'approve', revision: 0 });
  expect(response.status).toBe(409);
  expect(response.body.code).toBe('TOOL_APPROVAL_MODULE_REMOVED');
  expect(executeApprovedTool).not.toHaveBeenCalled();
});

test('there is no public request-creation route', async () => {
  const response = await request(app).post('/api/tool-approvals').send({ workspaceId: 'workspace-a' });
  expect(response.status).toBe(404);
});
