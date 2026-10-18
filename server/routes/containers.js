import express from 'express';
import { requireSystemAdmin } from '../security/systemAdmin.js';
import { requireLocalFilesystem } from '../middleware/runtimeMode.js';
import { listContainers, getContainerLogs, restartContainer, removeContainer } from '../tools/handlers/container.js';

export const containersRouter = express.Router();

// No runner or no Docker is a setup state, not a crash: answer 503 with the
// same plain reason the Docker window shows.
const RUNNER_DOWN = /RUNNER_SECRET|Runner error|ECONNREFUSED|fetch failed|Dangerous execution is disabled/i;
function sendError(res, err) {
  const message = String(err?.message || err);
  if (RUNNER_DOWN.test(message)) {
    return res.status(503).json({ error: `Homebase can't reach its command runner (${message.slice(0, 120)}).`, reason: 'runner-unreachable' });
  }
  return res.status(500).json({ error: message });
}

// GET /api/containers
containersRouter.get('/containers', async (req, res) => {
  try {
    const containers = await listContainers();
    res.json({ containers });
  } catch (err) {
    sendError(res, err);
  }
});

// GET /api/containers/:id/logs
containersRouter.get('/containers/:id/logs', async (req, res) => {
  try {
    const service = req.params.id;
    const lines = parseInt(req.query.lines, 10) || 100;
    const logs = await getContainerLogs(service, lines);
    res.json({ logs });
  } catch (err) {
    sendError(res, err);
  }
});

// POST /api/containers/:id/restart
containersRouter.post('/containers/:id/restart', requireLocalFilesystem, requireSystemAdmin, async (req, res) => {
  try {
    const service = req.params.id;
    const result = await restartContainer(service);
    res.json({ result });
  } catch (err) {
    sendError(res, err);
  }
});

// DELETE /api/containers/:id — remove a container (e.g. a stranded sandbox).
containersRouter.delete('/containers/:id', requireLocalFilesystem, requireSystemAdmin, async (req, res) => {
  try {
    const result = await removeContainer(req.params.id);
    res.json({ result });
  } catch (err) {
    sendError(res, err);
  }
});
