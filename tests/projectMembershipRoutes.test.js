import { jest } from '@jest/globals';
import request from 'supertest';

const pool = { query: jest.fn(), connect: jest.fn(), on: jest.fn(), end: jest.fn() };
const requireWorkspaceMember = jest.fn();
const listWorkspaceAgentProjects = jest.fn();
const replaceCanvasProjectMemberships = jest.fn();

jest.unstable_mockModule('../server/db.js', () => ({
  default: pool,
  createDbPool: () => pool,
}));
jest.unstable_mockModule('../server/workspaces/context.js', () => ({ requireWorkspaceMember }));
jest.unstable_mockModule('../server/workspaces/projectMemberships.js', () => ({
  listWorkspaceAgentProjects,
  replaceCanvasProjectMemberships,
}));

const { projectMembershipsRouter } = await import('../server/routes/projects/memberships.js');

describe('project membership routes', () => {
  let app;

  beforeAll(async () => {
    const express = (await import('express')).default;
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.session = { userId: 7 };
      next();
    });
    app.use('/api', projectMembershipsRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    requireWorkspaceMember.mockResolvedValue({ id: 'workspace-1', role: 'owner' });
    listWorkspaceAgentProjects.mockResolvedValue([]);
    replaceCanvasProjectMemberships.mockResolvedValue([]);
  });

  test('lists memberships only after workspace access is proven', async () => {
    listWorkspaceAgentProjects.mockResolvedValue([{
      workspace_id: 'workspace-1',
      project_id: 'project-1',
      project_name: 'Dream Machine',
      agent_id: 'architect',
      permission: 'work',
      source_kind: 'canvas',
    }]);

    const res = await request(app).get('/api/workspaces/workspace-1/agent-projects');

    expect(res.status).toBe(200);
    expect(requireWorkspaceMember).toHaveBeenCalledWith(pool, {
      userId: 7,
      workspaceId: 'workspace-1',
    });
    expect(res.body.memberships[0]).toMatchObject({
      projectName: 'Dream Machine',
      agentId: 'architect',
      permission: 'work',
    });
  });

  test('fails closed for a non-member without querying memberships', async () => {
    const denied = new Error('Workspace access denied');
    denied.statusCode = 403;
    requireWorkspaceMember.mockRejectedValue(denied);

    const res = await request(app).get('/api/workspaces/workspace-2/agent-projects');

    expect(res.status).toBe(403);
    expect(listWorkspaceAgentProjects).not.toHaveBeenCalled();
  });

  test('passes an authenticated atomic canvas sync to the membership service', async () => {
    const memberships = [{ agentId: 'architect', permission: 'work' }];
    const res = await request(app)
      .put('/api/workspaces/workspace-1/agent-projects/project-1')
      .send({ memberships, sourceId: 'canvas-1' });

    expect(res.status).toBe(200);
    expect(requireWorkspaceMember).toHaveBeenCalledWith(pool, expect.objectContaining({
      userId: 7,
      roles: ['owner', 'admin', 'member'],
    }));
    expect(replaceCanvasProjectMemberships).toHaveBeenCalledWith(pool, {
      workspaceId: 'workspace-1',
      projectId: 'project-1',
      memberships,
      sourceId: 'canvas-1',
      userId: 7,
    });
  });
});
