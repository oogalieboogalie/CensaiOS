// POST /api/image: the Image window. Spends the caller's own Google key
// (aiGateway/imageKeys.js) and goes through the same per-person access and
// usage checks as chat, so a teammate never spends the owner's Google credit.

import {
  callModel,
  createModelAccessContext,
  IMAGE_GENERATION_MODEL_KIND,
  resolveImageGenerationModelConfig,
  workspaceUsageSink,
} from '../../aiGateway/index.js';
import { imageConfigForCaller } from '../../aiGateway/imageKeys.js';
import pool from '../../db.js';
import { resolveWorkspaceContext } from '../../workspaces/context.js';
import { sendImageModelError } from './httpErrors.js';

const SOURCE = 'image-generation';

export async function handleImageGen(req, res) {
  const { prompt, workspaceId = null } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'Missing prompt' });
  const userId = req.session?.userId;
  if (!userId) {
    return res.status(401).json({
      error: 'Authentication required', code: 'AUTHENTICATION_REQUIRED', retryAfter: null,
    });
  }

  try {
    const workspace = await resolveWorkspaceContext(pool, { userId, workspaceId: workspaceId || null });
    const accessContext = createModelAccessContext({ userId, workspaceId: workspace.id, source: SOURCE });
    const config = await imageConfigForCaller(
      resolveImageGenerationModelConfig({ modelProvider: 'google' }),
      { userId, userRole: req.session?.userRole || null },
    );
    const response = await callModel({
      accessContext,
      kind: IMAGE_GENERATION_MODEL_KIND,
      config,
      body: {
        model: config.model,
        prompt,
      },
      logContext: { source: SOURCE },
      usageAttribution: { workspaceId: workspace.id, actor: { kind: 'user', id: userId }, source: SOURCE },
      usageSink: workspaceUsageSink,
    });

    let base64Image = null;
    let mimeType = 'image/png';

    for (const part of response?.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        base64Image = part.inlineData.data;
        mimeType = part.inlineData.mimeType || 'image/png';
        break;
      }
    }

    if (!base64Image) {
      throw new Error('No image returned by Gemini');
    }

    res.json({ image: `data:${mimeType};base64,${base64Image}` });
  } catch (err) {
    sendImageModelError(res, err, 'IMAGE_GENERATION_FAILED');
  }
}
