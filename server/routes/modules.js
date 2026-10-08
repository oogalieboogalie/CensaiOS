import express from 'express';
import pool from '../db.js';
import { resolveWorkspaceContext } from '../workspaces/context.js';
import { publicChatError, sendPublicModelError } from './chat/httpErrors.js';
import { callModel, createModelAccessContext } from '../aiGateway/index.js';
import { generateModule } from '../modules/generator.js';
import { moduleModelConfig } from '../modules/modelConfig.js';
import { buildAskMessages } from '../modules/prompt.js';
import { loadModuleExamples } from '../modules/examples.js';
import { deleteSavedModule, getSavedModule, listSavedModules, saveModule } from '../modules/library.js';
import { MAX_MODULE_SOURCE_BYTES, sourceBytes } from '../../src/lib/modules/moduleFormat.js';
import { sketchProblem } from '../modules/sketch.js';

// Spec 6, modules on demand: generate and edit sandboxed modules, answer a
// module's agent.ask calls, and keep each person's saved modules.
export const modulesRouter = express.Router();

function requireUser(req, res) {
  if (req.session?.userId) return req.session.userId;
  res.status(401).json({ error: 'Authentication required', code: 'AUTHENTICATION_REQUIRED' });
  return null;
}

function sendError(res, err, fallbackCode) {
  const status = Number(err?.statusCode) || 500;
  res.status(status).json({ error: status >= 500 && !err?.code ? 'Module request failed.' : err.message, code: err?.code || fallbackCode });
}

async function workspaceFor(req) {
  return resolveWorkspaceContext(pool, { userId: req.session.userId, workspaceId: req.body?.workspaceId || null });
}

// Streams newline-delimited JSON: {type:'delta', text} while the model
// writes, then {type:'done', manifest, source} or {type:'error', ...}.
modulesRouter.post('/generate', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const request = typeof req.body?.request === 'string' ? req.body.request.trim() : '';
  const instruction = typeof req.body?.instruction === 'string' ? req.body.instruction.trim() : '';
  const source = typeof req.body?.source === 'string' ? req.body.source : '';
  if (!request && !instruction) return res.status(400).json({ error: 'Say what the module should do.', code: 'MODULE_REQUEST_REQUIRED' });
  if (sourceBytes(source) > MAX_MODULE_SOURCE_BYTES) return res.status(413).json({ error: 'This module is too large to edit.', code: 'MODULE_TOO_LARGE' });
  const sketch = !instruction && typeof req.body?.sketch === 'string' ? req.body.sketch : '';

  let workspace;
  let config;
  try {
    workspace = await workspaceFor(req);
    config = await moduleModelConfig({
      agentId: typeof req.body?.agentId === 'string' && req.body.agentId ? req.body.agentId : undefined,
      userId,
      workspaceId: workspace.id,
      modelProvider: req.body?.modelProvider || null,
      modelName: req.body?.modelName || null,
    });
  } catch (err) {
    return sendPublicModelError(res, err, 'MODULE_GENERATION_FAILED');
  }
  const problem = sketch ? sketchProblem(sketch, config) : null;
  if (problem) return res.status(problem.status).json({ error: problem.error, code: problem.code });

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  const write = (event) => { if (!res.writableEnded) res.write(`${JSON.stringify(event)}\n`); };
  let lastAttempt = 1;
  try {
    const result = await generateModule({
      userId,
      workspaceId: workspace.id,
      request,
      instruction,
      source,
      sketch,
      manifest: req.body?.manifest || null,
      config,
      onDelta: (chunk, { attempt }) => {
        if (attempt !== lastAttempt) { lastAttempt = attempt; write({ type: 'retry', attempt }); }
        write({ type: 'delta', text: chunk });
      },
    });
    write({ type: 'done', ...result });
  } catch (err) {
    const normalized = publicChatError(err);
    const code = normalized.body.code === 'CHAT_REQUEST_FAILED' ? 'MODULE_GENERATION_FAILED' : normalized.body.code;
    const message = err?.code?.startsWith?.('MODULE_') ? err.message : normalized.body.message;
    write({ type: 'error', code, error: message, status: normalized.status });
  }
  res.end();
});

// A module's censai.agent.ask(). The window asks the person for the "agent"
// permission before it ever calls this.
modulesRouter.post('/ask', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
  if (!prompt) return res.status(400).json({ error: 'The module sent an empty question.', code: 'MODULE_ASK_EMPTY' });
  try {
    const workspace = await workspaceFor(req);
    const config = await moduleModelConfig({ userId, workspaceId: workspace.id });
    const completion = await callModel({
      accessContext: createModelAccessContext({ userId, workspaceId: workspace.id, source: 'module-ask' }),
      config,
      body: { model: config.model, temperature: 0.4, messages: buildAskMessages({ prompt, moduleName: req.body?.moduleName }) },
      timeoutMs: 60000,
      logContext: { source: 'module-ask' },
    });
    const text = String(completion?.choices?.[0]?.message?.content || '').trim();
    res.json({ text });
  } catch (err) {
    sendPublicModelError(res, err, 'MODULE_ASK_FAILED');
  }
});

modulesRouter.get('/templates', async (_req, res) => {
  try {
    res.json({ templates: await loadModuleExamples() });
  } catch (err) {
    sendError(res, err, 'MODULE_TEMPLATES_FAILED');
  }
});

modulesRouter.get('/library', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try { res.json({ modules: await listSavedModules(pool, userId) }); } catch (err) { sendError(res, err, 'MODULE_LIBRARY_FAILED'); }
});

modulesRouter.get('/library/:id', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try { res.json({ module: await getSavedModule(pool, userId, req.params.id) }); } catch (err) { sendError(res, err, 'MODULE_LIBRARY_FAILED'); }
});

modulesRouter.post('/library', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const saved = await saveModule(pool, userId, {
      id: req.body?.id || null,
      request: req.body?.request || '',
      manifest: req.body?.manifest,
      source: req.body?.source,
    });
    res.json({ module: saved });
  } catch (err) {
    sendError(res, err, 'MODULE_SAVE_FAILED');
  }
});

modulesRouter.delete('/library/:id', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try { res.json({ deleted: await deleteSavedModule(pool, userId, req.params.id) }); } catch (err) { sendError(res, err, 'MODULE_DELETE_FAILED'); }
});
