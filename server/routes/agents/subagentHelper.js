import express from 'express';
import { requireDb } from './shared.js';
import { agentRouteError } from './scope.js';
import { resolveSubAgentRouteScope } from './subagentScope.js';
import { getSubAgentById } from '../../memory.js';
import { handleStartHelper } from '../../tools/handlers/nanoHelper.js';

// Start a nano helper by hand (diagram 15): the "Start a helper" form in a
// sub-agent's data box. Same helper the start_helper tool runs, on the
// sub-agent's own model and the person's own key; the answer lands in its box.
export const subagentHelperRouter = express.Router();

subagentHelperRouter.post('/sub-agents/:id/helper', requireDb, async (req, res) => {
  try {
    const scope = await resolveSubAgentRouteScope(req);
    const sub = await getSubAgentById(req.params.id, scope);
    if (!sub) return res.status(404).json({ error: 'Sub-agent not found' });
    const { job, task, input, project } = req.body || {};
    const message = await handleStartHelper(sub.id, { job, task, input, project }, scope);
    if (!/^The \w+ helper finished/.test(message)) return res.status(400).json({ error: message });
    res.json({ ok: true, message });
  } catch (err) {
    agentRouteError(res, err);
  }
});
