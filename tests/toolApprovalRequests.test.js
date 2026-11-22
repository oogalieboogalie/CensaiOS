import { jest } from '@jest/globals';

const findApprovalGrant = jest.fn();
const requireWorkspaceMember = jest.fn();
const createWorkspaceEvent = jest.fn(async () => ({ id: 'event-1' }));
jest.unstable_mockModule('../server/approvals/grants.js', () => ({ findApprovalGrant }));
jest.unstable_mockModule('../server/workspaces/context.js', () => ({ requireWorkspaceMember }));
jest.unstable_mockModule('../server/operational-intelligence/factories.js', () => ({ createWorkspaceEvent }));
const agentIsTrusted = jest.fn(async () => false);
jest.unstable_mockModule('../server/approvals/trustMode.js', () => ({
  agentIsTrusted, TRUSTED_ROLES: ['owner', 'admin'],
}));
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
  agentIsTrusted.mockResolvedValue(false);
});

test('Trust mode on: the agent acts now, nothing waits in Approvals', async () => {
  agentIsTrusted.mockResolvedValue(true);
  const { db } = database();
  await expect(requestToolApprovalIfRequired(db, {
    agentId: 'atlas', toolName: 'project_edit', args: { path: 'a.md' },
    context: { workspaceId: 'workspace-a', userId: 7 },
  })).resolves.toEqual({ required: false, trusted: true });
  expect(agentIsTrusted).toHaveBeenCalledWith(db, { workspaceId: 'workspace-a', agentId: 'atlas' });
  expect(db.connect).not.toHaveBeenCalled();
  expect(createWorkspaceEvent).toHaveBeenCalledWith({ db }, expect.objectContaining({
    type: 'agent.tool.trusted', actor: { kind: 'agent', id: 'atlas' },
  }));
});

test('Trust mode on still waits when someone who cannot approve asked', async () => {
  agentIsTrusted.mockResolvedValue(true);
  requireWorkspaceMember.mockResolvedValue({ role: 'member' });
  const { db } = database();
  await expect(requestToolApprovalIfRequired(db, {
    agentId: 'atlas', toolName: 'project_edit', args: { path: 'a.md' },
    context: { workspaceId: 'workspace-a', userId: 7 },
  })).resolves.toMatchObject({ required: true, created: true });
});

test('Trust mode still needs the module equipped', async () => {
  agentIsTrusted.mockResolvedValue(true);
  findApprovalGrant.mockResolvedValue(null);
  await expect(requestToolApprovalIfRequired({ connect: jest.fn() }, {
    agentId: 'atlas', toolName: 'project_edit', args: {},
    context: { workspaceId: 'workspace-a', userId: 7 },
  })).rejects.toMatchObject({ code: 'TOOL_APPROVAL_GRANT_REQUIRED' });
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

test('sub-agent calls never enter the canonical gate; with Trust mode off their writes refuse', async () => {
  const db = { connect: jest.fn(), query: jest.fn(async () => ({ rows: [] })) };
  await expect(requestToolApprovalIfRequired(db, {
    agentId: 'sub-agent-1', toolName: 'recall', args: {},
    context: { workspaceId: 'workspace-a', userId: 7 },
  })).resolves.toEqual({ required: false });
  await expect(requestToolApprovalIfRequired(db, {
    agentId: 'sub-agent-1', toolName: 'project_write', args: {},
    context: { workspaceId: 'workspace-a', userId: 7 },
  })).rejects.toMatchObject({ code: 'TOOL_APPROVAL_HELPER_NEEDS_TRUST' });
  agentIsTrusted.mockResolvedValue(true);
  await expect(requestToolApprovalIfRequired(db, {
    agentId: 'sub-agent-1', toolName: 'project_write', args: {},
    context: { workspaceId: 'workspace-a', userId: 7 },
  })).resolves.toEqual({ required: false, trusted: true });
  expect(findApprovalGrant).not.toHaveBeenCalled();
  expect(db.connect).not.toHaveBeenCalled();
});

test('a family agent\'s file save runs in a chat that is on no board, where there is nothing to wait in', async () => {
  for (const agentId of ['Atlas', 'echo', 'censai', 'foundation', 'guardian']) {
    for (const toolName of ['project_write', 'project_edit']) {
      await expect(requestToolApprovalIfRequired({}, {
        agentId, toolName, args: {}, context: { userId: 7 },
      })).resolves.toEqual({ required: false });
    }
  }
  // The same for a role tool that asks first on a board.
  await expect(requestToolApprovalIfRequired({}, {
    agentId: 'atlas', toolName: 'terminal_run', args: {}, context: { userId: 7 },
  })).resolves.toEqual({ required: false });
  expect(findApprovalGrant).not.toHaveBeenCalled();
});

test('Trust mode off: a role tool that asks first waits under "role"; one that only looks runs', async () => {
  findApprovalGrant.mockResolvedValue({ moduleId: 'role', capabilityId: 'role.terminal_run', mode: 'execute_with_approval' });
  const { db, client } = database();
  await expect(requestToolApprovalIfRequired(db, {
    agentId: 'atlas', toolName: 'terminal_run', args: { command: 'ls' },
    context: { workspaceId: 'workspace-a', userId: 7 },
  })).resolves.toMatchObject({ required: true, created: true });
  const insert = client.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO workspace_tool_approvals'));
  expect(insert[1].slice(0, 4)).toEqual(['workspace-a', 'atlas', 'role', 'terminal_run']);
  // "role" has no package to lock.
  expect(client.query.mock.calls.some(([, params]) => params?.[0] == null && params?.length === 1)).toBe(false);

  await expect(requestToolApprovalIfRequired({ connect: jest.fn() }, {
    agentId: 'atlas', toolName: 'web_search', args: { query: 'x' },
    context: { workspaceId: 'workspace-a', userId: 7 },
  })).resolves.toEqual({ required: false });
  // Echo does not have commands by role, so nothing is asked for her here (the tool gate refuses first).
  await expect(requestToolApprovalIfRequired({ connect: jest.fn() }, {
    agentId: 'echo', toolName: 'terminal_run', args: {},
    context: { workspaceId: 'workspace-a', userId: 7 },
  })).resolves.toEqual({ required: false });
});
