import express from 'express';
import {
  engineStatus, listContainers, containerStats, inspectContainer, containerLogs,
  listImages, listVolumes, listNetworks, listComposeProjects,
} from '../docker/engine.js';
import {
  containerAction, removeContainer, execInContainer, removeImage, pullImage,
  removeVolume, removeNetwork, prune, composeAction,
} from '../docker/actions.js';

// /api/docker — the Docker window's API. Mounted behind requireLocalFilesystem
// in routeMap.js: it drives the host's Docker engine, so cloud_saas never
// gets it and private servers must opt in.
export const dockerRouter = express.Router();

const truthy = (v) => v === true || v === 'true' || v === '1';

function handle(fn) {
  return async (req, res) => {
    try {
      res.json(await fn(req));
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message, reason: err.reason || null });
    }
  };
}

dockerRouter.get('/status', handle(() => engineStatus()));
dockerRouter.get('/containers', handle(async () => ({ containers: await listContainers() })));
dockerRouter.get('/stats', handle(async () => ({ stats: await containerStats() })));
dockerRouter.get('/containers/:id', handle((req) => inspectContainer(req.params.id)));
dockerRouter.get('/containers/:id/logs', handle(async (req) => ({
  lines: await containerLogs(req.params.id, { tail: req.query.tail, since: req.query.since }),
})));
dockerRouter.post('/containers/:id/exec', handle((req) => execInContainer(req.params.id, req.body?.command)));
dockerRouter.post('/containers/:id/:action', handle((req) => containerAction(req.params.id, req.params.action)));
dockerRouter.delete('/containers/:id', handle((req) => removeContainer(req.params.id, {
  force: truthy(req.query.force), volumes: truthy(req.query.volumes),
})));

dockerRouter.get('/images', handle(async () => ({ images: await listImages() })));
dockerRouter.post('/images/pull', handle((req) => pullImage(req.body?.ref)));
// Image refs carry slashes (ghcr.io/org/app:tag), so the ref rides the query.
dockerRouter.delete('/images', handle((req) => removeImage(req.query.ref, { force: truthy(req.query.force) })));

dockerRouter.get('/volumes', handle(async () => ({ volumes: await listVolumes() })));
dockerRouter.delete('/volumes/:name', handle((req) => removeVolume(req.params.name)));

dockerRouter.get('/networks', handle(async () => ({ networks: await listNetworks() })));
dockerRouter.delete('/networks/:name', handle((req) => removeNetwork(req.params.name)));

dockerRouter.get('/compose', handle(async () => ({ projects: await listComposeProjects() })));
dockerRouter.post('/compose/:project/:action', handle((req) => composeAction(req.params.project, req.params.action)));

dockerRouter.post('/prune/:target', handle((req) => prune(req.params.target)));
