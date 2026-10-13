import express from 'express';
import {
  startDevServer, listDevServers, devServerStatus, stopDevServer, DEFAULT_IMAGE, DEFAULT_PORT,
} from '../devServers/manager.js';
import { heartbeat, markStopped } from '../devServers/reaper.js';
import { containerLogs } from '../docker/engine.js';

// /api/dev-servers — the Run dev window. Mounted behind
// requireLocalFilesystem: it mounts folders from this computer into Docker.
export const devServersRouter = express.Router();

function handle(fn) {
  return async (req, res) => {
    try {
      res.json(await fn(req));
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message, reason: err.reason || null });
    }
  };
}

devServersRouter.get('/', handle(async () => ({
  servers: await listDevServers(), defaults: { image: DEFAULT_IMAGE, port: DEFAULT_PORT },
})));
devServersRouter.post('/', handle(async (req) => {
  const started = await startDevServer(req.body || {});
  heartbeat([started.name]);
  return started;
}));
devServersRouter.post('/heartbeat', handle((req) => {
  heartbeat(Array.isArray(req.body?.names) ? req.body.names.slice(0, 50) : []);
  return { ok: true };
}));
devServersRouter.get('/:name', handle((req) => devServerStatus(req.params.name)));
devServersRouter.get('/:name/logs', handle(async (req) => ({
  lines: await containerLogs(req.params.name, { tail: req.query.tail || 400 }),
})));
devServersRouter.delete('/:name', handle(async (req) => {
  markStopped(req.params.name);
  return stopDevServer(req.params.name);
}));
