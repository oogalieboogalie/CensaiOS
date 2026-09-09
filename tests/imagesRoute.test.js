import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

const callModel = jest.fn();
const createModelAccessContext = jest.fn(input => ({ verified: input }));
const workspaceUsageSink = jest.fn();
const resolveWorkspaceContext = jest.fn();
const resolveImageGenerationModelConfig = jest.fn(({ modelName }) => ({
  provider: 'google',
  model: modelName || 'imagen-4.0-generate-001',
  apiKey: 'key',
}));
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'censai-images-'));
process.env.IMAGE_GALLERY_FILE = path.join(tmpDir, 'gallery.json');

jest.unstable_mockModule('../server/aiGateway/index.js', () => ({
  callModel,
  createModelAccessContext,
  IMAGE_GENERATION_MODEL_KIND: 'image.generation',
  resolveImageGenerationModelConfig,
  workspaceUsageSink,
}));
jest.unstable_mockModule('../server/db.js', () => ({ default: { query: jest.fn() } }));
jest.unstable_mockModule('../server/workspaces/context.js', () => ({ resolveWorkspaceContext }));

const { imagesRouter } = await import('../server/routes/images/index.js');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use((req, _res, next) => {
  req.session = { userId: 7 };
  next();
});
app.use('/api/images', imagesRouter);

beforeEach(() => {
  resolveWorkspaceContext.mockImplementation(async (_db, { workspaceId }) => ({ id: workspaceId }));
});

afterEach(async () => {
  jest.clearAllMocks();
  await fs.promises.rm(process.env.IMAGE_GALLERY_FILE, { force: true });
});

afterAll(async () => {
  await fs.promises.rm(tmpDir, { recursive: true, force: true });
});

describe('/api/images routes', () => {
  test('generates an image through the gateway and saves it to gallery', async () => {
    callModel.mockResolvedValue({
      generatedImages: [{ image: { imageBytes: 'abc', mimeType: 'image/png' } }],
    });

    const res = await request(app).post('/api/images/generate').send({
      prompt: 'a clean app icon',
      additionalInstructions: 'flat vector style',
      model: 'imagen-4.0-fast-generate-001',
      canvasState: { objects: [{ type: 'path' }, { type: 'rect' }, { type: 'rect' }] },
      sourceWindowId: 'w1',
      workspaceId: 'workspace-1',
      userId: 999,
    });

    expect(res.status).toBe(200);
    expect(res.body.image).toMatchObject({
      src: 'data:image/png;base64,abc',
      prompt: 'a clean app icon',
      additionalInstructions: 'flat vector style',
      model: 'imagen-4.0-fast-generate-001',
      sourceWindowId: 'w1',
    });
    expect(callModel).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'image.generation',
      body: expect.objectContaining({
        prompt: expect.stringContaining('flat vector style'),
      }),
      logContext: { source: 'image-studio' },
      accessContext: createModelAccessContext.mock.results[0].value,
      usageAttribution: {
        workspaceId: 'workspace-1',
        actor: { kind: 'user', id: 7 },
        source: 'image-studio',
      },
      usageSink: workspaceUsageSink,
    }));
    expect(createModelAccessContext).toHaveBeenCalledWith({
      userId: 7, workspaceId: 'workspace-1', source: 'image-studio',
    });
    expect(callModel.mock.calls[0][0].body.prompt).toContain('Canvas sketch contains: 1 path, 2 rect.');

    const gallery = await request(app).get('/api/images/gallery?workspaceId=workspace-1');
    expect(gallery.body.images).toHaveLength(1);
    expect(gallery.body.images[0].id).toBe(res.body.image.id);
  });

  test('scopes gallery reads and deletes to an authorized workspace', async () => {
    callModel.mockResolvedValue({
      generatedImages: [{ image: { imageBytes: 'private', mimeType: 'image/png' } }],
    });
    const generated = await request(app).post('/api/images/generate').send({
      prompt: 'workspace one image', workspaceId: 'workspace-1',
    });
    const imageId = generated.body.image.id;

    const foreignGallery = await request(app).get('/api/images/gallery?workspaceId=workspace-2');
    const foreignDelete = await request(app).delete(
      `/api/images/gallery/${imageId}?workspaceId=workspace-2`
    );
    const ownerGallery = await request(app).get('/api/images/gallery?workspaceId=workspace-1');

    expect(foreignGallery.body.images).toEqual([]);
    expect(foreignDelete.status).toBe(404);
    expect(ownerGallery.body.images.map(image => image.id)).toEqual([imageId]);
    expect(ownerGallery.body.images[0]).toMatchObject({
      workspaceId: 'workspace-1', createdByUserId: '7',
    });
  });

  test('denies missing and foreign workspaces before gallery or model work', async () => {
    const missing = await request(app).get('/api/images/gallery');
    expect(missing.status).toBe(400);
    expect(missing.body).toEqual({ error: 'workspace_required' });

    resolveWorkspaceContext.mockRejectedValueOnce(
      Object.assign(new Error('private workspace details'), { statusCode: 403 })
    );
    const foreign = await request(app).post('/api/images/generate').send({
      prompt: 'must not dispatch', workspaceId: 'workspace-foreign',
    });
    expect(foreign.status).toBe(403);
    expect(foreign.body).toEqual({ error: 'workspace_access_denied' });
    expect(callModel).not.toHaveBeenCalled();
  });

  test('rejects empty prompts', async () => {
    const res = await request(app).post('/api/images/generate').send({ prompt: ' ' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Missing prompt' });
    expect(callModel).not.toHaveBeenCalled();
  });

  test('rejects unsupported image models', async () => {
    const res = await request(app).post('/api/images/generate').send({
      prompt: 'a clean app icon',
      model: 'not-a-real-imagen-model',
    });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Unsupported image model' });
    expect(callModel).not.toHaveBeenCalled();
  });

  test('preserves the central shared-image denial contract', async () => {
    callModel.mockRejectedValueOnce(Object.assign(new Error('A personal key is required'), {
      statusCode: 403, code: 'PLATFORM_MODEL_KIND_DENIED',
    }));

    const res = await request(app).post('/api/images/generate').send({
      prompt: 'a clean app icon', workspaceId: 'workspace-1',
    });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: 'A personal key is required',
      code: 'PLATFORM_MODEL_KIND_DENIED',
      retryAfter: null,
    });
  });
});
