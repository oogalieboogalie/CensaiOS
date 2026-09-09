import { jest } from '@jest/globals';
import request from 'supertest';

const pool = { query: jest.fn() };
const getWorkspaceState = jest.fn();
const setWorkspaceState = jest.fn();
const deleteWorkspaceState = jest.fn();
const resolveWorkspaceContext = jest.fn();
const persistCollaborationEpisodesSafely = jest.fn();

jest.unstable_mockModule('../server/db.js', () => ({ default: pool }));
jest.unstable_mockModule('../server/state/clientStateStore.js', () => ({
  WORKSPACE_STATE_KEY: 'homebase.workspace.v1',
  deleteUserState: jest.fn(), deleteWorkspaceState,
  getUserState: jest.fn(), getWorkspaceState,
  isSupportedClientStateKey: key => key === 'homebase.workspace.v1',
  setUserState: jest.fn(), setWorkspaceState,
}));
jest.unstable_mockModule('../server/workspaces/context.js', () => ({ resolveWorkspaceContext }));
jest.unstable_mockModule('../server/collaboration/episodeStore.js', () => ({
  persistCollaborationEpisodesSafely,
}));

const { default: express } = await import('express');
const { clientStateRouter } = await import('../server/routes/files/clientState.js');

function app(userId = 7) {
  const server = express();
  server.use(express.json());
  server.use((req, _res, next) => { req.session = { userId }; next(); });
  server.use('/api', clientStateRouter);
  return server;
}

describe('workspace client-state route revisions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resolveWorkspaceContext.mockResolvedValue({ id: 'workspace-1', role: 'member' });
  });

  test('read exposes the authoritative revision', async () => {
    getWorkspaceState.mockResolvedValue({
      found: true, value: { wins: [] }, revision: 8, updatedAt: '2026-07-14T00:00:00Z',
    });
    const res = await request(app()).get('/api/client-state/homebase.workspace.v1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      value: { wins: [] }, workspaceId: 'workspace-1', revision: 8,
      updatedAt: '2026-07-14T00:00:00Z',
    });
  });

  test('missing state is an explicit revision-zero 404', async () => {
    getWorkspaceState.mockResolvedValue({ found: false, value: null, revision: 0 });
    const res = await request(app()).get('/api/client-state/homebase.workspace.v1');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ value: null, workspaceId: 'workspace-1', revision: 0 });
  });

  test('write passes expectedRevision and returns the incremented value', async () => {
    getWorkspaceState.mockResolvedValue({ found: true, value: { wins: [{ id: 'before' }] }, revision: 8 });
    setWorkspaceState.mockResolvedValue({ revision: 9, updatedAt: '2026-07-14T00:01:00Z' });
    const res = await request(app()).put('/api/client-state/homebase.workspace.v1').send({
      value: { workspaceId: 'workspace-1', wins: [] }, expectedRevision: 8,
    });
    expect(res.status).toBe(200);
    expect(setWorkspaceState).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: 'workspace-1', expectedRevision: 8,
    }));
    expect(res.body.revision).toBe(9);
    expect(persistCollaborationEpisodesSafely).toHaveBeenCalledWith(pool, expect.objectContaining({
      workspaceId: 'workspace-1', revision: 9,
      previousValue: { wins: [{ id: 'before' }] },
      nextValue: { workspaceId: 'workspace-1', wins: [] },
      actor: { type: 'human', id: '7', label: 'Member 7' },
    }));
  });

  test('viewer writes fail before persistence', async () => {
    resolveWorkspaceContext.mockResolvedValue({ id: 'workspace-1', role: 'viewer' });
    const res = await request(app()).put('/api/client-state/homebase.workspace.v1').send({
      value: { wins: [] }, expectedRevision: 0,
    });
    expect(res.status).toBe(403);
    expect(setWorkspaceState).not.toHaveBeenCalled();
  });

  test('revision conflict remains a 409', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    setWorkspaceState.mockRejectedValue(Object.assign(new Error('Workspace changed since it was loaded'), {
      statusCode: 409,
    }));
    const res = await request(app()).put('/api/client-state/homebase.workspace.v1').send({
      value: { wins: [] }, expectedRevision: 2,
    });
    expect({ status: res.status, body: res.body }).toEqual({
      status: 409,
      body: { error: 'Workspace changed since it was loaded' },
    });
    expect(res.body.error).toMatch(/changed since/i);
    expect(consoleError).not.toHaveBeenCalled();
    expect(persistCollaborationEpisodesSafely).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  test('delete is revision-bound and viewer deletion is denied', async () => {
    deleteWorkspaceState.mockResolvedValue({ removed: true, revision: 3 });
    const removed = await request(app())
      .delete('/api/client-state/homebase.workspace.v1?workspaceId=workspace-1&expectedRevision=3');
    expect(removed.status).toBe(200);
    expect(deleteWorkspaceState).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: 'workspace-1', expectedRevision: '3',
    }));

    resolveWorkspaceContext.mockResolvedValue({ id: 'workspace-1', role: 'viewer' });
    const denied = await request(app())
      .delete('/api/client-state/homebase.workspace.v1?workspaceId=workspace-1&expectedRevision=3');
    expect(denied.status).toBe(403);
    expect(deleteWorkspaceState).toHaveBeenCalledTimes(1);
  });
});
