import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';

// Mock the container handlers
jest.unstable_mockModule('../tools/handlers/container.js', () => ({
  listContainers: jest.fn().mockResolvedValue([{ Service: 'test-service', Status: 'Up' }]),
  getContainerLogs: jest.fn().mockResolvedValue('test logs output'),
  restartContainer: jest.fn().mockResolvedValue('test-service restarted successfully.'),
  removeContainer: jest.fn().mockResolvedValue('test-service removed.'),
}));

// Mock middleware
jest.unstable_mockModule('../middleware/runtimeMode.js', () => ({
  requireLocalFilesystem: (req, res, next) => next(),
}));

describe('Containers Router', () => {
  let app;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    // In actual app it's mounted at /api, so we mount it similarly
    const { containersRouter: router } = await import('./containers.js');
    app.use('/api', router);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('GET /api/containers should return a list of containers', async () => {
    const { listContainers } = await import('../tools/handlers/container.js');
    const res = await request(app).get('/api/containers');
    expect(res.status).toBe(200);
    expect(res.body.containers).toEqual([{ Service: 'test-service', Status: 'Up' }]);
    expect(listContainers).toHaveBeenCalledTimes(1);
  });

  it('GET /api/containers/:id/logs should return logs for a container', async () => {
    const { getContainerLogs } = await import('../tools/handlers/container.js');
    const res = await request(app).get('/api/containers/test-service/logs?lines=10');
    expect(res.status).toBe(200);
    expect(res.body.logs).toBe('test logs output');
    expect(getContainerLogs).toHaveBeenCalledWith('test-service', 10);
  });

  it('POST /api/containers/:id/restart should restart a container', async () => {
    const { restartContainer } = await import('../tools/handlers/container.js');
    const res = await request(app).post('/api/containers/test-service/restart');
    expect(res.status).toBe(200);
    expect(res.body.result).toBe('test-service restarted successfully.');
    expect(restartContainer).toHaveBeenCalledWith('test-service');
  });

  it('DELETE /api/containers/:id should remove a container', async () => {
    const { removeContainer } = await import('../tools/handlers/container.js');
    const res = await request(app).delete('/api/containers/homebase-sbx-abc123');
    expect(res.status).toBe(200);
    expect(res.body.result).toBe('test-service removed.');
    expect(removeContainer).toHaveBeenCalledWith('homebase-sbx-abc123');
  });
});
