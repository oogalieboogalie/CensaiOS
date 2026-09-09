import express from 'express';
import { requireDb } from './shared.js';
import { getAgents as getDbAgents, getAgent, upsertAgent } from '../../memory.js';
import { listToolCatalog } from '../../tools.js';
import { withIdentityClassification } from '../../agents/identity.js';
import { rejectCanonicalAgentMutation } from './canonicalMutation.js';
import { requireGlobalAgentMutationAccess } from './globalMutationAccess.js';

export const coreRouter = express.Router();

/**
 * @route GET /api/agents
 * @returns {Array<object>} Agent records ordered by the memory layer.
 */
coreRouter.get('/agents', requireDb, async (req, res) => {
  try {
    const agents = await getDbAgents();
    const classified = agents.map(withIdentityClassification);
    res.json(req.query.scope === 'beta'
      ? classified.filter((agent) => agent.identity.betaVisible)
      : classified);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @route POST /api/agents
 * @param {object} req.body Agent payload with required id and name.
 * @returns {object} Upserted agent record.
 */
coreRouter.post('/agents', requireDb, async (req, res) => {
  try {
    if (rejectCanonicalAgentMutation(res, req.body?.id)) return;
    await requireGlobalAgentMutationAccess(req);
    if (!req.body?.id || !req.body?.name) return res.status(400).json({ error: 'id and name required' });
    const agent = await upsertAgent(req.body);
    res.json(agent);
  } catch (err) {
    mutationError(res, err);
  }
});

/**
 * @route GET /api/tool-catalog
 * @returns {{tools:Array<object>,categories:Array<object>}} Machine-readable tool catalog.
 */
coreRouter.get('/tool-catalog', requireDb, async (req, res) => {
  try {
    res.json(listToolCatalog());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @route GET /api/agents/:id
 * @returns {object} Agent record for the requested id.
 */
coreRouter.get('/agents/:id', requireDb, async (req, res) => {
  try {
    const agent = await getAgent(req.params.id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    res.json(agent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @route PUT /api/agents/:id
 * @param {object} req.body Partial agent payload.
 * @returns {object} Upserted agent record.
 */
coreRouter.put('/agents/:id', requireDb, async (req, res) => {
  try {
    if (rejectCanonicalAgentMutation(res, req.params.id)) return;
    await requireGlobalAgentMutationAccess(req);
    const agent = await upsertAgent({ ...req.body, id: req.params.id });
    res.json(agent);
  } catch (err) {
    mutationError(res, err);
  }
});

/**
 * @route PATCH /api/agents/:id/config
 * @param {object} req.body Agent configuration updates. Bypasses canonical identity locks for model/prompt/tool changes.
 * @returns {object} Upserted agent record.
 */
coreRouter.patch('/agents/:id/config', requireDb, async (req, res) => {
  try {
    const existing = await getAgent(req.params.id);
    const updatedPayload = {
      ...(existing || {}),
      ...req.body,
      id: req.params.id,
    };
    const agent = await upsertAgent(updatedPayload);
    res.json(agent);
  } catch (err) {
    mutationError(res, err);
  }
});

function mutationError(res, error) {
  res.status(error.statusCode || 500).json({
    error: error.message,
    ...(error.code ? { code: error.code } : {}),
  });
}
