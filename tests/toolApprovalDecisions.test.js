import { jest } from '@jest/globals';

const findApprovalGrant = jest.fn();
const requireWorkspaceMember = jest.fn();
const createWorkspaceEvent = jest.fn(async () => ({ id: 'event-1' }));
jest.unstable_mockModule('../server/approvals/grants.js', () => ({ findApprovalGrant }));
jest.unstable_mockModule('../server/workspaces/context.js', () => ({ requireWorkspaceMember }));
jest.unstable_mockModule('../server/operational-intelligence/factories.js', () => ({ createWorkspaceEvent }));
const {
  assertApprovedToolExecution, decideToolApproval, finishToolApproval,
} = await import('../server/approvals/decisions.js');

const current = {
  id: 'approval-1', workspace_id: 'workspace-a', agent_id: 'censai', module_id: 'project-writer',
  tool_name: 'project_write', arguments: { project: 'demo', path: 'a.md', content: 'x' },
  request_hash: 'ignored', status: 'pending', revision: 0,
};

function decisionDb(row = current) {
  const client = { release: jest.fn(), query: jest.fn(async sql => {
    if (sql.startsWith('SELECT * FROM workspace_tool_approvals')) return { rows: row ? [row] : [] };
    if (sql.includes("status='executing'")) return { rows: [{ ...row, status: 'executing', revision: 1, decided_by_user_id: 7 }] };
    if (sql.includes("status='denied'")) return { rows: [{ ...row, status: 'denied', revision: 1 }] };
    if (sql.includes("status='cancelled'")) return { rows: [{ ...row, status: 'cancelled', revision: 1 }] };
    return { rows: [] };
  }) };
  return { db: { connect: jest.fn(async () => client) }, client };
}

beforeEach(() => {
  jest.clearAllMocks();
  findApprovalGrant.mockResolvedValue({ moduleId: 'project-writer', mode: 'execute_with_approval' });
  requireWorkspaceMember.mockResolvedValue({ role: 'owner' });
});

test('owner approval atomically claims the exact pending revision for execution', async () => {
  const { db, client } = decisionDb();
  await expect(decideToolApproval(db, {
    workspaceId: 'workspace-a', userId: 7, approvalId: 'approval-1', decision: 'approve', revision: 0,
  })).resolves.toMatchObject({ execute: true, approval: { status: 'executing', revision: 1 } });
  expect(createWorkspaceEvent).toHaveBeenCalledWith({ db: client }, expect.objectContaining({
    type: 'agent.tool_approval.approved', actor: { kind: 'user', id: '7' },
  }));
  const calls = client.query.mock.calls.map(([sql]) => String(sql));
  expect(calls.findIndex(sql => sql.includes('pg_advisory_xact_lock')))
    .toBeLessThan(calls.findIndex(sql => sql.includes('FOR UPDATE')));
});

test('denial is terminal without an execution claim', async () => {
  const { db } = decisionDb();
  await expect(decideToolApproval(db, {
    workspaceId: 'workspace-a', userId: 7, approvalId: 'approval-1', decision: 'deny', revision: 0,
  })).resolves.toMatchObject({ execute: false, approval: { status: 'denied' } });
  expect(findApprovalGrant).not.toHaveBeenCalled();
});

test('a removed module cancels instead of executing', async () => {
  findApprovalGrant.mockResolvedValue(null);
  const { db } = decisionDb();
  await expect(decideToolApproval(db, {
    workspaceId: 'workspace-a', userId: 7, approvalId: 'approval-1', decision: 'approve', revision: 0,
  })).resolves.toMatchObject({ execute: false, cancelled: true, approval: { status: 'cancelled' } });
});

test('stale revisions and terminal rows cannot be decided again', async () => {
  const { db } = decisionDb({ ...current, status: 'denied', revision: 1 });
  await expect(decideToolApproval(db, {
    workspaceId: 'workspace-a', userId: 7, approvalId: 'approval-1', decision: 'approve', revision: 0,
  })).rejects.toMatchObject({ statusCode: 409, code: 'TOOL_APPROVAL_STALE' });
});

test('execution proof revalidates owner, row, captured hash, and equipped grant', async () => {
  const { approvalRequestHash } = await import('../server/approvals/requestContract.js');
  const args = { project: 'demo', path: 'a.md', content: 'x' };
  const executing = { ...current, status: 'executing', revision: 1, decided_by_user_id: 7,
    request_hash: approvalRequestHash({ moduleId: 'project-writer', toolName: 'project_write', args }) };
  const db = { query: jest.fn().mockResolvedValue({ rows: [executing] }) };
  await expect(assertApprovedToolExecution(db, {
    approvalId: 'approval-1', agentId: 'censai', toolName: 'project_write', args,
    context: { workspaceId: 'workspace-a', userId: 7 },
  })).resolves.toEqual(executing);
  expect(requireWorkspaceMember).toHaveBeenCalledWith(db, {
    workspaceId: 'workspace-a', userId: 7, roles: ['owner', 'admin'],
  });
});

test('finishing execution atomically stores a bounded result and event', async () => {
  const approval = { ...current, status: 'executing', revision: 1 };
  const client = { release: jest.fn(), query: jest.fn(async sql => sql.includes('UPDATE workspace_tool_approvals')
    ? { rows: [{ ...approval, status: 'succeeded', revision: 2 }] } : { rows: [] }) };
  const db = { connect: jest.fn(async () => client) };
  await expect(finishToolApproval(db, { approval, userId: 7, ok: true, result: 'done' }))
    .resolves.toMatchObject({ status: 'succeeded', revision: 2 });
  expect(createWorkspaceEvent).toHaveBeenCalledWith({ db: client }, expect.objectContaining({
    type: 'agent.tool_approval.succeeded',
  }));
});
