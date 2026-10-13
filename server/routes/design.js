import express from 'express';
import pool from '../db.js';
import { resolveWorkspaceContext } from '../workspaces/context.js';
import { sendPublicModelError } from './chat/httpErrors.js';
import { callModel, createModelAccessContext, resolveChatModelConfig } from '../aiGateway/index.js';
import { createFigmaClient, parseFigmaFileUrl, resolveFigmaToken } from '../design/figmaClient.js';
import { importFigmaFrame, listFigmaFrames } from '../design/figmaImport.js';
import {
  buildRemixMessages,
  extractRemixedCode,
  MAX_REMIX_SOURCE_BYTES,
  normalizeRemixSourceType,
} from '../design/remix.js';

// Design surface: Figma import (BYOK token) and model remixes of on-canvas code.
export const designRouter = express.Router();

function sendError(res, err, fallbackCode) {
  const status = Number(err?.statusCode) || 500;
  res.status(status).json({
    error: status >= 500 && !err?.code ? 'Design request failed.' : err.message,
    code: err?.code || fallbackCode,
  });
}

function requireFileLink(value) {
  const parsed = parseFigmaFileUrl(value);
  if (!parsed) {
    throw Object.assign(new Error('Paste a Figma file link (figma.com/design/...).'), { statusCode: 400, code: 'FIGMA_URL_INVALID' });
  }
  return parsed;
}

async function figmaClientFor(req) {
  const { token } = await resolveFigmaToken(req.session?.userId);
  return createFigmaClient(token);
}

// Is a Figma token available, and whose? Never returns the token itself.
designRouter.get('/figma/status', async (req, res) => {
  try {
    const { token, source } = await resolveFigmaToken(req.session?.userId);
    if (!source) return res.json({ connected: false, source: null, user: null });
    let user = null;
    try {
      const me = await createFigmaClient(token).me();
      user = me?.handle || me?.email || null;
    } catch (err) {
      if (err.code === 'FIGMA_TOKEN_INVALID') {
        return res.json({ connected: false, source, user: null, invalid: true });
      }
    }
    res.json({ connected: true, source, user });
  } catch (err) {
    sendError(res, err, 'FIGMA_STATUS_FAILED');
  }
});

designRouter.get('/figma/frames', async (req, res) => {
  try {
    const { fileKey } = requireFileLink(req.query.url);
    const client = await figmaClientFor(req);
    res.json(await listFigmaFrames(client, fileKey));
  } catch (err) {
    sendError(res, err, 'FIGMA_FRAMES_FAILED');
  }
});

designRouter.post('/figma/import', async (req, res) => {
  try {
    const link = requireFileLink(req.body?.url);
    const nodeId = String(req.body?.nodeId || link.nodeId || '').trim();
    if (!nodeId) {
      return res.status(400).json({ error: 'Pick a frame to import.', code: 'FIGMA_NODE_REQUIRED' });
    }
    const client = await figmaClientFor(req);
    res.json(await importFigmaFrame(client, link.fileKey, nodeId));
  } catch (err) {
    sendError(res, err, 'FIGMA_IMPORT_FAILED');
  }
});

designRouter.post('/remix', async (req, res) => {
  const source = typeof req.body?.source === 'string' ? req.body.source : '';
  const instruction = typeof req.body?.instruction === 'string' ? req.body.instruction.trim() : '';
  if (!source.trim()) return res.status(400).json({ error: 'There is no code to change yet.', code: 'REMIX_SOURCE_REQUIRED' });
  if (!instruction) return res.status(400).json({ error: 'Say what to change.', code: 'REMIX_INSTRUCTION_REQUIRED' });
  if (Buffer.byteLength(source, 'utf8') > MAX_REMIX_SOURCE_BYTES) {
    return res.status(413).json({ error: 'This block is too large to send to a model.', code: 'REMIX_SOURCE_TOO_LARGE' });
  }
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Authentication required', code: 'AUTHENTICATION_REQUIRED' });
  }

  try {
    const sourceType = normalizeRemixSourceType(req.body?.sourceType);
    const workspace = await resolveWorkspaceContext(pool, {
      userId: req.session.userId,
      workspaceId: req.body?.workspaceId || null,
    });
    const config = resolveChatModelConfig({
      modelProvider: req.body?.modelProvider || null,
      modelName: req.body?.modelName || null,
    });
    const completion = await callModel({
      accessContext: createModelAccessContext({
        userId: req.session.userId, workspaceId: workspace.id, source: 'design-remix',
      }),
      config,
      body: {
        model: config.model,
        temperature: 0.3,
        messages: buildRemixMessages({ source, sourceType, instruction: instruction.slice(0, 4000) }),
      },
      timeoutMs: 120000,
      logContext: { source: 'design-remix' },
    });
    const code = extractRemixedCode(completion?.choices?.[0]?.message?.content);
    if (!code) {
      return res.status(502).json({ error: 'The model returned no code.', code: 'REMIX_EMPTY' });
    }
    res.json({ source: code, sourceType, model: config.model, provider: config.provider || null });
  } catch (err) {
    sendPublicModelError(res, err, 'REMIX_FAILED');
  }
});
