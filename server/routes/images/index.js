import express from 'express';
import pool from '../../db.js';
import {
  callModel,
  createModelAccessContext,
  IMAGE_GENERATION_MODEL_KIND,
  resolveImageGenerationModelConfig,
  workspaceUsageSink,
} from '../../aiGateway/index.js';
import {
  deleteGalleryImage,
  listGalleryImages,
  saveGalleryImage,
} from './galleryStore.js';
import {
  buildImagePrompt,
  imageRecordFromResponse,
} from './imageRecords.js';
import { sendPublicModelError } from '../chat/httpErrors.js';
import { resolveWorkspaceContext } from '../../workspaces/context.js';

export const imagesRouter = express.Router();
const IMAGE_STUDIO_MODELS = new Set([
  'imagen-4.0-generate-001',
  'imagen-4.0-ultra-generate-001',
  'imagen-4.0-fast-generate-001',
]);

imagesRouter.get('/gallery', async (req, res) => {
  const scope = await imageScope(req, res, req.query?.workspaceId);
  if (!scope) return;
  try {
    res.json({ images: await listGalleryImages(scope) });
  } catch {
    res.status(503).json({ error: 'Image gallery is temporarily unavailable.' });
  }
});

imagesRouter.delete('/gallery/:id', async (req, res) => {
  const scope = await imageScope(req, res, req.query?.workspaceId);
  if (!scope) return;
  try {
    const deleted = await deleteGalleryImage(req.params.id, scope);
    res.status(deleted ? 200 : 404).json({ deleted });
  } catch {
    res.status(503).json({ error: 'Image gallery is temporarily unavailable.' });
  }
});

imagesRouter.post('/generate', async (req, res) => {
  const {
    prompt,
    additionalInstructions = '',
    model = 'imagen-4.0-generate-001',
    canvasState = null,
    canvasImage = null,
    sourceWindowId = null,
    workspaceId = null,
  } = req.body || {};

  if (!String(prompt || '').trim()) {
    return res.status(400).json({ error: 'Missing prompt' });
  }
  if (!IMAGE_STUDIO_MODELS.has(String(model))) {
    return res.status(400).json({ error: 'Unsupported image model' });
  }

  const scope = await imageScope(req, res, workspaceId);
  if (!scope) return;

  try {
    const accessContext = createModelAccessContext({
      userId: scope.userId,
      workspaceId: scope.workspaceId,
      source: 'image-studio',
    });
    const config = resolveImageGenerationModelConfig({ modelProvider: 'google', modelName: model });
    const finalPrompt = buildImagePrompt({ prompt, additionalInstructions, canvasState, canvasImage });
    const response = await callModel({
      accessContext,
      kind: IMAGE_GENERATION_MODEL_KIND,
      config,
      body: {
        model: config.model,
        prompt: finalPrompt,
      },
      timeoutMs: 90000,
      logContext: { source: 'image-studio' },
      usageAttribution: accessContext ? {
        workspaceId: scope.workspaceId,
        actor: { kind: 'user', id: scope.userId },
        source: 'image-studio',
      } : null,
      usageSink: workspaceUsageSink,
    });
    const image = imageRecordFromResponse({
      response,
      prompt: String(prompt).trim(),
      additionalInstructions: String(additionalInstructions || '').trim(),
      model: config.model,
      sourceWindowId,
    });
    const saved = await saveGalleryImage(image, scope);
    res.json({ image: saved });
  } catch (err) {
    sendPublicModelError(res, err, 'IMAGE_GENERATION_FAILED');
  }
});

async function imageScope(req, res, requestedWorkspaceId) {
  const userId = Number(req.session?.userId);
  const workspaceId = String(requestedWorkspaceId ?? '').trim();
  if (!Number.isInteger(userId) || userId <= 0) {
    res.status(401).json({ error: 'authentication_required' });
    return null;
  }
  if (!workspaceId) {
    res.status(400).json({ error: 'workspace_required' });
    return null;
  }
  try {
    const workspace = await resolveWorkspaceContext(pool, { userId, workspaceId });
    return { userId, workspaceId: workspace.id };
  } catch (error) {
    const status = [403, 404].includes(error?.statusCode) ? error.statusCode : 503;
    const code = status === 403 ? 'workspace_access_denied'
      : status === 404 ? 'workspace_not_found' : 'image_scope_unavailable';
    res.status(status).json({ error: code });
    return null;
  }
}
