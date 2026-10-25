import { jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';

// Videos made on the board (server/routes/videos.js) through a real request,
// with the real job store on a temp folder. Only Google's Veo calls and the
// key vault are stand-ins. Made-up people at Testco: Pat (user 1) starts a
// clip; Sam (user 2) is a teammate on the same board.

class VideoError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}
const startVeoJob = jest.fn(async () => ({ operation: 'operations/op-1', model: 'veo-test' }));
const checkVeoJob = jest.fn(async () => ({ done: true, uri: 'https://video.invalid/clip.mp4' }));
const downloadVeoVideo = jest.fn(async () => ({ bytes: Buffer.from('fake mp4 bytes') }));
jest.unstable_mockModule('../server/video/veo.js', () => ({ VideoError, startVeoJob, checkVeoJob, downloadVeoVideo }));
jest.unstable_mockModule('../server/security/userApiKeys.js', () => ({
  getUserApiKeyConfig: jest.fn(async () => ({ apiKey: 'own-google-key' })),
}));
jest.unstable_mockModule('../server/security/serverKeys.js', () => ({ mayUseServerKeys: jest.fn(async () => false) }));
jest.unstable_mockModule('../server/googleKeys.js', () => ({ getGeminiApiKey: () => '' }));

const { videosRouter } = await import('../server/routes/videos.js');
const express = (await import('express')).default;

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  const userId = Number(req.get('x-user-id'));
  req.session = userId > 0 ? { userId } : {};
  next();
});
app.use('/api/videos', videosRouter);

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'videos-route-'));
  process.env.VIDEO_STATE_DIR = dir;
  jest.clearAllMocks();
});
afterEach(() => {
  delete process.env.VIDEO_STATE_DIR;
  fs.rmSync(dir, { recursive: true, force: true });
});

const start = (userId) => request(app).post('/api/videos').set('x-user-id', String(userId))
  .send({ prompt: 'A Testco logo spinning', workspaceId: 'ws-testco' });

describe('videos route', () => {
  test('signed out is refused', async () => {
    expect((await request(app).get('/api/videos')).status).toBe(401);
    expect((await request(app).post('/api/videos').send({ prompt: 'x' })).status).toBe(401);
    expect(startVeoJob).not.toHaveBeenCalled();
  });

  test('Pat starts a clip and finds it in her list, without the operation or her id', async () => {
    const started = await start(1);
    expect(started.status).toBe(202);
    expect(started.body).toMatchObject({ status: 'working', workspaceId: 'ws-testco' });
    expect(started.body.operation).toBeUndefined();
    expect(started.body.userId).toBeUndefined();

    const list = await request(app).get('/api/videos?workspaceId=ws-testco').set('x-user-id', '1');
    expect(list.status).toBe(200);
    expect(list.body.map((job) => job.id)).toEqual([started.body.id]);
  });

  test('Pat checks her clip; once ready she can fetch the file', async () => {
    const { body: job } = await start(1);
    const ready = await request(app).get(`/api/videos/${job.id}?workspaceId=ws-testco`).set('x-user-id', '1');
    expect(ready.status).toBe(200);
    expect(ready.body).toMatchObject({ id: job.id, status: 'ready', url: `/api/videos/${job.id}/file` });

    const file = await request(app).get(`/api/videos/${job.id}/file`).set('x-user-id', '1');
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('video/mp4');
  });

  test('Sam, on the same board, cannot list, check or download Pat\'s clip', async () => {
    const { body: job } = await start(1);
    const list = await request(app).get('/api/videos?workspaceId=ws-testco').set('x-user-id', '2');
    expect(list.body).toEqual([]);

    const check = await request(app).get(`/api/videos/${job.id}?workspaceId=ws-testco`).set('x-user-id', '2');
    expect(check.status).toBe(404);
    expect(checkVeoJob).not.toHaveBeenCalled();

    await request(app).get(`/api/videos/${job.id}`).set('x-user-id', '1');
    const file = await request(app).get(`/api/videos/${job.id}/file`).set('x-user-id', '2');
    expect(file.status).toBe(404);
  });
});
