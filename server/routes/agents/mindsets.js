import express from 'express';
import { requireDb } from './shared.js';
import { resolveConfigurationScope } from './configurationScope.js';
import { sendConfigurationError } from './configurationErrors.js';
import {
  listMindsetDefinitions,
  loadAgentEquippedMindsetIds,
  saveAgentMindsetIds,
} from '../../attributes/registry.js';

export const mindsetsRouter = express.Router();

mindsetsRouter.get('/mindsets', requireDb, async (_req, res) => {
  try {
    const mindsets = await listMindsetDefinitions();
    res.json({ mindsets, status: 'candidate' });
  } catch (error) {
    sendConfigurationError(res, error);
  }
});

mindsetsRouter.get('/agents/:id/mindsets', requireDb, async (req, res) => {
  try {
    const scope = await resolveConfigurationScope(req);
    const mindsets = await loadAgentEquippedMindsetIds(scope.agentId, scope);
    res.json({ mindsets, workspaceId: scope.workspaceId });
  } catch (error) {
    sendConfigurationError(res, error);
  }
});

mindsetsRouter.put('/agents/:id/mindsets', requireDb, async (req, res) => {
  try {
    const scope = await resolveConfigurationScope(req, { write: true });
    await saveAgentMindsetIds(scope.agentId, req.body?.mindsets, scope);
    res.json({ ok: true, workspaceId: scope.workspaceId });
  } catch (error) {
    sendConfigurationError(res, error);
  }
});
