import { jest } from '@jest/globals';
import request from 'supertest';

const pool = { query: jest.fn() };
const resolveWorkspaceContext = jest.fn();
const createSchedule = jest.fn();
const deleteOwnedSchedule = jest.fn();
const getSchedules = jest.fn();
const updateOwnedSchedule = jest.fn();

jest.unstable_mockModule('../server/db.js', () => ({ default: pool }));
jest.unstable_mockModule('../server/workspaces/context.js', () => ({ resolveWorkspaceContext }));
jest.unstable_mockModule('../server/memory/schedules.js', () => ({
  createSchedule,
  deleteOwnedSchedule,
  getSchedules,
  updateOwnedSchedule,
}));

const express = (await import('express')).default;
const { schedulesRouter } = await import('../server/routes/schedules.js');

function appFor(userId = 7) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = { userId };
    next();
  });
  app.use('/api', schedulesRouter);
  return app;
}

describe('schedule tenancy routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resolveWorkspaceContext.mockResolvedValue({ id: 'workspace-1', role: 'member' });
    getSchedules.mockResolvedValue([]);
    createSchedule.mockResolvedValue({ id: 'schedule-1' });
    updateOwnedSchedule.mockResolvedValue({ id: 'schedule-1', status: 'inactive' });
    deleteOwnedSchedule.mockResolvedValue(true);
  });

  test('lists through the authenticated user and authorized workspace scope', async () => {
    const response = await request(appFor()).get('/api/schedules?workspaceId=workspace-1');
    expect(response.status).toBe(200);
    expect(resolveWorkspaceContext).toHaveBeenCalledWith(pool, {
      userId: 7, workspaceId: 'workspace-1',
    });
    expect(getSchedules).toHaveBeenCalledWith({
      db: pool, userId: 7, workspaceId: 'workspace-1',
    });
  });

  test('ignores spoofed ownership fields when creating', async () => {
    const response = await request(appFor()).post('/api/schedules').send({
      workspaceId: 'workspace-1', created_by_user_id: 999,
      agent_id: 'censai', task_text: 'Review.',
    });
    expect(response.status).toBe(200);
    expect(createSchedule).toHaveBeenCalledWith(expect.objectContaining({
      created_by_user_id: 999,
    }), { db: pool, userId: 7, workspaceId: 'workspace-1' });
  });

  test('fails closed when workspace membership is denied', async () => {
    const denied = new Error('Workspace access denied');
    denied.statusCode = 403;
    resolveWorkspaceContext.mockRejectedValue(denied);
    const response = await request(appFor(8)).get('/api/schedules?workspaceId=workspace-1');
    expect(response.status).toBe(403);
    expect(getSchedules).not.toHaveBeenCalled();
  });

  test('allows viewer reads but rejects every schedule mutation before persistence', async () => {
    resolveWorkspaceContext.mockResolvedValue({ id: 'workspace-1', role: 'viewer' });

    const listed = await request(appFor()).get('/api/schedules?workspaceId=workspace-1');
    const created = await request(appFor()).post('/api/schedules').send({
      workspaceId: 'workspace-1', agent_id: 'censai', task_text: 'Run tools.',
    });
    const patched = await request(appFor()).patch('/api/schedules/schedule-1')
      .query({ workspaceId: 'workspace-1' }).send({ status: 'inactive' });
    const deleted = await request(appFor()).delete('/api/schedules/schedule-1')
      .query({ workspaceId: 'workspace-1' });

    expect(listed.status).toBe(200);
    for (const response of [created, patched, deleted]) {
      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Workspace role does not allow this operation');
    }
    expect(getSchedules).toHaveBeenCalledTimes(1);
    expect(createSchedule).not.toHaveBeenCalled();
    expect(updateOwnedSchedule).not.toHaveBeenCalled();
    expect(deleteOwnedSchedule).not.toHaveBeenCalled();
  });

  test('does not disclose schedules outside the scoped owner', async () => {
    updateOwnedSchedule.mockResolvedValue(null);
    deleteOwnedSchedule.mockResolvedValue(false);
    const patched = await request(appFor()).patch('/api/schedules/foreign')
      .query({ workspaceId: 'workspace-1' }).send({ status: 'inactive' });
    const deleted = await request(appFor()).delete('/api/schedules/foreign')
      .query({ workspaceId: 'workspace-1' });
    expect(patched.status).toBe(404);
    expect(deleted.status).toBe(404);
  });
});
