import { jest } from '@jest/globals';
import request from 'supertest';

jest.unstable_mockModule('../server/dbState.js', () => ({ dbReady: () => true }));
jest.unstable_mockModule('../server/db.js', () => ({
  default: { query: jest.fn(), on: jest.fn(), end: jest.fn() },
}));
const resolveAuthorizedWorkspaceProject = jest.fn(async (_db, { projectIdentifier }) => {
  if (projectIdentifier === 'project-foreign') {
    const error = new Error('Project access denied'); error.statusCode = 403; throw error;
  }
  return { id: projectIdentifier };
});
jest.unstable_mockModule('../server/workspaces/projectAccess.js', () => ({ resolveAuthorizedWorkspaceProject }));

const getAllSubAgents = jest.fn(async ({ workspaceId }) => workspaceId === 'workspace-owner'
  ? [{ id: 'scoped-sub', parent_id: 'atlas', workspace_id: workspaceId }]
  : []);
const getSubAgents = jest.fn(async (_parentId, scope) => getAllSubAgents(scope));
const getSubAgentById = jest.fn(async (id, { workspaceId }) =>
  id === 'scoped-sub' && workspaceId === 'workspace-owner'
    ? { id, parent_id: 'atlas', workspace_id: workspaceId }
    : null);
const createSubAgent = jest.fn(async (parentId, input, scope) => ({
  id: 'scoped-sub', parent_id: parentId, name: input.name,
  workspace_id: scope.workspaceId, created_by_user_id: scope.userId,
}));
const updateSubAgent = jest.fn(async (id, patch, scope) =>
  scope.workspaceId === 'workspace-owner' ? { id, name: patch.name, workspace_id: scope.workspaceId } : null);
const deleteSubAgent = jest.fn(async (id, scope) =>
  scope.workspaceId === 'workspace-owner' ? { id } : null);
const scratchpadRead = jest.fn(async () => [{ key: 'note', value: 'owner only' }]);
const scratchpadWrite = jest.fn(async (id, project, key, value, scope) =>
  scope.workspaceId === 'workspace-owner' ? { sub_agent_id: id, project, key, value } : null);
const scratchpadClear = jest.fn(async () => 1);

jest.unstable_mockModule('../server/memory.js', () => ({
  getAllSubAgents, getSubAgents, getSubAgentById, createSubAgent, updateSubAgent,
  deleteSubAgent, scratchpadRead, scratchpadWrite, scratchpadClear,
}));

const resolveWorkspaceContext = jest.fn(async (_db, { userId, workspaceId }) => {
  if (workspaceId === 'workspace-owner' && Number(userId) !== 7) {
    const error = new Error('Workspace access denied'); error.statusCode = 403; throw error;
  }
  return { id: workspaceId };
});
jest.unstable_mockModule('../server/workspaces/context.js', () => ({ resolveWorkspaceContext }));

const { subagentsRouter } = await import('../server/routes/agents/subagents.js');

describe('sub-agent REST tenancy', () => {
  let app;
  beforeAll(async () => {
    const express = (await import('express')).default;
    app = express(); app.use(express.json());
    app.use((req, _res, next) => {
      const userId = Number(req.get('x-user-id'));
      req.session = Number.isInteger(userId) && userId > 0 ? { userId } : {};
      next();
    });
    app.use('/api', subagentsRouter);
  });
  beforeEach(() => jest.clearAllMocks());

  test('derives create ownership from the signed-in workspace member', async () => {
    const response = await request(app).post('/api/sub-agents').set('x-user-id', '7').send({
      parentId: 'atlas', name: 'Builder', workspaceId: 'workspace-owner',
      workspace_id: 'workspace-outsider', created_by_user_id: 99,
    });
    expect(response.status).toBe(200);
    expect(createSubAgent).toHaveBeenCalledWith('atlas', expect.not.objectContaining({
      workspace_id: expect.anything(), created_by_user_id: expect.anything(),
    }), { workspaceId: 'workspace-owner', userId: 7 });
    expect(response.body).toMatchObject({ workspace_id: 'workspace-owner', created_by_user_id: 7 });
  });

  test('requires explicit workspace and denies a foreign member before listing', async () => {
    const missing = await request(app).get('/api/sub-agents').set('x-user-id', '7');
    const foreign = await request(app).get('/api/sub-agents?workspaceId=workspace-owner').set('x-user-id', '8');
    expect(missing.status).toBe(400); expect(missing.body.error).toMatch(/open a workspace/i);
    expect(foreign.status).toBe(403); expect(getAllSubAgents).not.toHaveBeenCalled();
  });

  test('rejects an unauthorized project binding before persistence', async () => {
    const response = await request(app).post('/api/sub-agents').set('x-user-id', '7').send({
      parentId: 'atlas', name: 'Builder', workspaceId: 'workspace-owner', projectId: 'project-foreign',
    });
    expect(response.status).toBe(403);
    expect(createSubAgent).not.toHaveBeenCalled();
  });

  test('hides another workspace sub-agent from direct scratchpad access', async () => {
    const response = await request(app)
      .get('/api/scratchpad/scoped-sub/default?workspaceId=workspace-outsider')
      .set('x-user-id', '8');
    expect(response.status).toBe(404);
    expect(scratchpadRead).not.toHaveBeenCalled();
  });

  test('scopes scratchpad writes and rejects a foreign id without persistence', async () => {
    const owner = await request(app).post('/api/scratchpad/scoped-sub/default')
      .set('x-user-id', '7').send({ workspaceId: 'workspace-owner', key: 'note', value: 'owner only' });
    const outsider = await request(app).post('/api/scratchpad/scoped-sub/default')
      .set('x-user-id', '8').send({ workspaceId: 'workspace-outsider', key: 'note', value: 'steal' });
    expect(owner.status).toBe(200); expect(outsider.status).toBe(404);
    expect(scratchpadWrite).toHaveBeenNthCalledWith(
      1, 'scoped-sub', 'default', 'note', 'owner only', { workspaceId: 'workspace-owner', userId: 7 },
    );
  });
});
