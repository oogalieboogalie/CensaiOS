import express from 'express';
import { requireLocalFilesystem } from '../middleware/runtimeMode.js';
import { listContainers, getContainerLogs, restartContainer, removeContainer } from '../tools/handlers/container.js';

export const containersRouter = express.Router();

// GET /api/containers
containersRouter.get('/containers', async (req, res) => {
  try {
    const containers = await listContainers();
    res.json({ containers });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
});

// POST /api/containers/:id/restart
containersRouter.post('/containers/:id/restart', requireLocalFilesystem, async (req, res) => {
  try {
    const service = req.params.id;
    const result = await restartContainer(service);
    res.json({ result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/containers/:id — remove a container (e.g. a stranded sandbox).
containersRouter.delete('/containers/:id', requireLocalFilesystem, async (req, res) => {
  try {
    const result = await removeContainer(req.params.id);
    res.json({ result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
