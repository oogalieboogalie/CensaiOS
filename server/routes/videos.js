// Videos made on the board (Google Veo, BYOK):
//   POST /api/videos            { prompt, aspectRatio?, workspaceId? } → job
//   GET  /api/videos?workspaceId=                                     → jobs
//   GET  /api/videos/:id        checks the job once                    → job
//   GET  /api/videos/:id/file   the finished mp4
// Only the person who started a clip (or their agents) can see it.

import express from 'express';
import fs from 'fs';
import { collectVideo, startVideo, videoUrl } from '../video/service.js';
import { canSeeVideoJob, getVideoJob, listVideoJobs, videoFilePath } from '../video/store.js';

export const videosRouter = express.Router();

function who(req, source = {}) {
  return {
    userId: req.session?.userId ?? null,
    userRole: req.session?.userRole || null,
    workspaceId: typeof source.workspaceId === 'string' && source.workspaceId ? source.workspaceId : null,
  };
}

function publicJob(job) {
  if (!job) return null;
  const { operation: _operation, userId: _userId, ...rest } = job;
  return job.status === 'ready' ? { ...rest, url: videoUrl(job.id) } : rest;
}

function sendError(res, err) {
  const status = err.code === 'VIDEO_KEY_REQUIRED' ? 403
    : err.code === 'VIDEO_NOT_FOUND' ? 404
      : err.code === 'VIDEO_EMPTY' || err.code === 'VIDEO_BAD_JOB' ? 400
        : err.code === 'VIDEO_RATE_LIMITED' ? 429 : 502;
  res.status(status).json({ error: err.message, code: err.code || 'VIDEO_FAILED' });
}

videosRouter.use((req, res, next) => {
  if (!req.session?.userId) return res.status(401).json({ error: 'Sign in first.' });
  return next();
});

videosRouter.get('/', async (req, res) => {
  try {
    res.json((await listVideoJobs(who(req, req.query))).map(publicJob));
  } catch (err) {
    sendError(res, err);
  }
});

videosRouter.post('/', async (req, res) => {
  try {
    const body = req.body || {};
    const job = await startVideo({
      prompt: body.prompt,
      aspectRatio: body.aspectRatio,
      negativePrompt: body.negativePrompt,
      fast: Boolean(body.fast),
      agentId: null,
      ...who(req, body),
    });
    res.status(202).json(publicJob(job));
  } catch (err) {
    sendError(res, err);
  }
});

videosRouter.get('/:id', async (req, res) => {
  try {
    res.json(publicJob(await collectVideo({ id: req.params.id, ...who(req, req.query) })));
  } catch (err) {
    sendError(res, err);
  }
});

videosRouter.get('/:id/file', async (req, res) => {
  const job = await getVideoJob(req.params.id).catch(() => null);
  const file = videoFilePath(req.params.id);
  if (!file || job?.status !== 'ready' || !canSeeVideoJob(job, { userId: req.session?.userId ?? null })) {
    return res.status(404).json({ error: 'No video with that id.' });
  }
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'That video file is gone.' });
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Cache-Control', 'private, max-age=86400');
  return res.sendFile(file);
});
