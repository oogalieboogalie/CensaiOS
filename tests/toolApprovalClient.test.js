import { jest } from '@jest/globals';
import { decideToolApproval, getToolApprovals } from '../src/lib/api/approvals.js';

const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; jest.clearAllMocks(); });

test('approval list always includes the active workspace scope', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ approvals: [] }) });
  await getToolApprovals('workspace a', { status: 'pending', limit: 20 });
  expect(global.fetch).toHaveBeenCalledWith('/api/tool-approvals?workspaceId=workspace%20a&limit=20&status=pending');
});

test('decision sends only workspace, decision, and current revision', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
  await decideToolApproval('approval/1', { workspaceId: 'workspace-a', decision: 'approve', revision: 3,
    agentId: 'attacker', toolName: 'restart_service' });
  expect(global.fetch).toHaveBeenCalledWith('/api/tool-approvals/approval%2F1/decision', expect.objectContaining({
    method: 'POST', body: JSON.stringify({ workspaceId: 'workspace-a', decision: 'approve', revision: 3 }),
  }));
});

test('denials throw the public server error instead of becoming a false empty state', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 403,
    json: async () => ({ error: 'Workspace role does not allow this operation', code: 'FORBIDDEN' }) });
  await expect(getToolApprovals('workspace-a')).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
});
