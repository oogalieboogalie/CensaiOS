import { jest } from '@jest/globals';

const findApprovalGrant = jest.fn();
const requireWorkspaceMember = jest.fn();
const createWorkspaceEvent = jest.fn(async () => ({ id: 'event-1' }));
jest.unstable_mockModule('../server/approvals/grants.js', () => ({ findApprovalGrant }));
jest.unstable_mockModule('../server/workspaces/context.js', () => ({ requireWorkspaceMember }));
jest.unstable_mockModule('../server/operational-intelligence/factories.js', () => ({ createWorkspaceEvent }));
const { requestToolApprovalIfRequired } = await import('../server/approvals/requests.js');

function database({ existing = null } = {}) {
  const approval = { id: 'approval-1', status: 'pending', revision: 0 };
  const client = { release: jest.fn(), query: jest.fn(async (sql, params) => {
    if (sql.includes('SELECT * FROM workspace_tool_approvals')) return { rows: existing ? [existing] : [] };
    if (sql.includes('INSERT INTO workspace_tool_approvals')) return { rows: [{ ...approval, arguments: JSON.parse(params[4]) }] };
    return { rows: [] };
  }) };
  return { db: { connect: jest.fn(async () => client) }, client, approval };
}

beforeEach(() => {
  jest.clearAllMocks();
  findApprovalGrant.mockResolvedValue({ moduleId: 'project-writer', mode: 'execute_with_approval' });
  requireWorkspaceMember.mockResolvedValue({ role: 'owner' });
});

test('creates one attributed pending request and strips model provenance', async () => {
  const { db, client } = database();
  const result = await requestToolApprovalIfRequired(db, {
    agentId: 'censai', toolName: 'project_write',
    args: { project: 'demo', path: 'a.md', content: 'x', __provenance: { prompt: 'secret' } },
    context: { workspaceId: 'workspace-a', userId: 7 },
  });
  expect(result).toMatchObject({ required: true, created: true, approval: { id: 'approval-1' } });
  expect(result.approval.arguments).not.toHaveProperty('__provenance');
  expect(requireWorkspaceMember).toHaveBeenCalledWith(db, { workspaceId: 'workspace-a', userId: 7 });
  expect(createWorkspaceEvent).toHaveBeenCalledWith({ db: client }, expect.objectContaining({
    workspaceId: 'workspace-a', type: 'agent.tool_approval.requested',
    actor: { kind: 'agent', id: 'censai' },
  }));
});

test('reuses an active identical request without a second event', async () => {
  const existing = { id: 'existing', status: 'pending', revision: 0 };
  const { db } = database({ existing });
  await expect(requestToolApprovalIfRequired(db, {
    agentId: 'censai', toolName: 'project_write', args: { path: 'a.md' },
    context: { workspaceId: 'workspace-a', userId: 7 },
  })).resolves.toMatchObject({ required: true, created: false, approval: existing });
  expect(createWorkspaceEvent).not.toHaveBeenCalled();
});

test('fails closed when the approval module no longer grants the tool', async () => {
  findApprovalGrant.mockResolvedValue(null);
  const db = { connect: jest.fn() };
  await expect(requestToolApprovalIfRequired(db, {
    agentId: 'censai', toolName: 'project_write', args: {},
    context: { workspaceId: 'workspace-a', userId: 7 },
  })).rejects.toMatchObject({ code: 'TOOL_APPROVAL_GRANT_REQUIRED', statusCode: 403 });
  expect(db.connect).not.toHaveBeenCalled();
});

test('revalidates the grant after taking the package lock', async () => {
  findApprovalGrant
    .mockResolvedValueOnce({ moduleId: 'project-writer', mode: 'execute_with_approval' })
    .mockResolvedValueOnce(null);
  const { db, client } = database();
  await expect(requestToolApprovalIfRequired(db, {
    agentId: 'censai', toolName: 'project_write', args: { path: 'a.md' },
    context: { workspaceId: 'workspace-a', userId: 7 },
  })).rejects.toMatchObject({ code: 'TOOL_APPROVAL_GRANT_REQUIRED', statusCode: 403 });
  expect(client.query).toHaveBeenCalledWith(
    'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
    ['tool-package:workspace-a:censai/project-writer'],
  );
  expect(client.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO'))).toBe(false);
  expect(client.query).toHaveBeenCalledWith('ROLLBACK');
});

test('non-approval and permission-tiered sub-agent calls do not enter the canonical gate', async () => {
  const db = { connect: jest.fn() };
  await expect(requestToolApprovalIfRequired(db, {
    agentId: 'sub-agent-1', toolName: 'recall', args: {},
    context: { workspaceId: 'workspace-a', userId: 7 },
  })).resolves.toEqual({ required: false });
  await expect(requestToolApprovalIfRequired(db, {
    agentId: 'sub-agent-1', toolName: 'project_write', args: {},
    context: { workspaceId: 'workspace-a', userId: 7 },
  })).resolves.toEqual({ required: false });
  expect(findApprovalGrant).not.toHaveBeenCalled();
});

test('canonical approval tools cannot fall back to unscoped execution', async () => {
  await expect(requestToolApprovalIfRequired({}, {
    agentId: 'censai', toolName: 'project_write', args: {}, context: {},
  })).rejects.toMatchObject({ code: 'TOOL_APPROVAL_SCOPE_REQUIRED', statusCode: 403 });
  expect(findApprovalGrant).not.toHaveBeenCalled();
});
