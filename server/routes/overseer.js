import express from 'express';
import { getStatus, startWatcher, stopWatcher, runAuditNow } from '../overseerWatcher.js';
import { requireSystemAdmin } from '../security/systemAdmin.js';

export const overseerRouter = express.Router();

overseerRouter.get('/overseer/status', (req, res) => {
  try {
    res.json(getStatus());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

overseerRouter.post('/overseer/start', requireSystemAdmin, (req, res) => {
  try {
    const { repo, intervalSeconds, autoMerge } = req.body || {};
    startWatcher(repo, intervalSeconds, { autoMerge: autoMerge === true });
    res.json(getStatus());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

overseerRouter.post('/overseer/stop', requireSystemAdmin, (req, res) => {
  try {
    stopWatcher();
    res.json(getStatus());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

overseerRouter.post('/overseer/run', requireSystemAdmin, (req, res) => {
  try {
    const { autoMerge } = req.body || {};
    runAuditNow({ autoMerge: autoMerge === true });
    res.json(getStatus());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
