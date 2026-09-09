import { jest } from '@jest/globals';
import request from 'supertest';

const pool = { query: jest.fn(), connect: jest.fn(), on: jest.fn(), end: jest.fn() };
const listWorkspaceMembers = jest.fn();
const inviteRegisteredWorkspaceMember = jest.fn();
const leaveWorkspaceMembership = jest.fn();
const ensurePersonalWorkspace = jest.fn();

jest.unstable_mockModule('../server/db.js', () => ({
  default: pool,
  createDbPool: () => pool,
}));
jest.unstable_mockModule('../server/workspaces/members.js', () => ({
  listWorkspaceMembers,
  inviteRegisteredWorkspaceMember,
  leaveWorkspaceMembership,
}));
jest.unstable_mockModule('../server/workspaces/context.js', () => ({ ensurePersonalWorkspace }));

const { workspaceMembersRouter } = await import('../server/routes/workspaceMembers.js');

async function appFor(userId = 7) {
  const express = (await import('express')).default;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.session = userId ? { userId } : {}; next(); });
  app.use('/api', workspaceMembersRouter);
  return app;
}

describe('workspace member routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listWorkspaceMembers.mockResolvedValue({
      workspace: { id: 'workspace-a', name: 'Launch', role: 'owner' },
      members: [{ id: 7, email: 'owner@example.com', name: 'Owner', role: 'owner' }],
    });
    inviteRegisteredWorkspaceMember.mockResolvedValue({
      workspace: { id: 'workspace-a', name: 'Launch', role: 'owner' },
      member: { id: 8, email: 'peer@example.com', name: 'Peer', role: 'member' },
      alreadyMember: false,
    });
    ensurePersonalWorkspace.mockResolvedValue({ id: 'user-7-default', role: 'owner' });
    leaveWorkspaceMembership.mockResolvedValue({
      leftWorkspace: { id: 'workspace-a', role: 'member' },
      workspace: { id: 'user-7-default', role: 'owner' },
    });
  });

  test('lists the authenticated owner-visible membership', async () => {
    const response = await request(await appFor()).get('/api/workspaces/workspace-a/members');
    expect(response.status).toBe(200);
    expect(response.body.members).toEqual([
      expect.objectContaining({ email: 'owner@example.com', role: 'owner' }),
    ]);
    expect(listWorkspaceMembers).toHaveBeenCalledWith(pool, {
      workspaceId: 'workspace-a', userId: 7,
    });
  });

  test('adds a registered account and returns the member receipt', async () => {
    const response = await request(await appFor())
      .post('/api/workspaces/workspace-a/members')
      .send({ email: 'peer@example.com' });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      member: { email: 'peer@example.com', role: 'member' }, alreadyMember: false,
    });
    expect(inviteRegisteredWorkspaceMember).toHaveBeenCalledWith(pool, {
      workspaceId: 'workspace-a', userId: 7, email: 'peer@example.com',
    });
  });

  test('fails closed without an authenticated account', async () => {
    const response = await request(await appFor(null)).get('/api/workspaces/workspace-a/members');
    expect(response.status).toBe(401);
    expect(listWorkspaceMembers).not.toHaveBeenCalled();
  });

  test('returns the authenticated account personal workspace explicitly', async () => {
    const response = await request(await appFor()).post('/api/workspaces/personal');
    expect(response.status).toBe(200);
    expect(response.body.workspace.id).toBe('user-7-default');
    expect(ensurePersonalWorkspace).toHaveBeenCalledWith(pool, 7);
  });

  test('leaves the current shared workspace and returns a safe destination', async () => {
    const response = await request(await appFor()).delete('/api/workspaces/workspace-a/members/me');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      leftWorkspace: { id: 'workspace-a' }, workspace: { id: 'user-7-default' },
    });
    expect(leaveWorkspaceMembership).toHaveBeenCalledWith(pool, {
      workspaceId: 'workspace-a', userId: 7,
    });
  });

  test('preserves typed authorization and registration errors', async () => {
    inviteRegisteredWorkspaceMember.mockRejectedValue(Object.assign(
      new Error('That account has not registered yet.'),
      { statusCode: 404, code: 'REGISTERED_ACCOUNT_REQUIRED' },
    ));
    const response = await request(await appFor())
      .post('/api/workspaces/workspace-a/members')
      .send({ email: 'missing@example.com' });
    expect(response.status).toBe(404);
    expect(response.body.code).toBe('REGISTERED_ACCOUNT_REQUIRED');
  });
});
