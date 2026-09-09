import express from 'express';
import { requireDb } from './shared.js';
import { listLeads, setLeadStatus } from '../../salesLeads/store.js';
import { agentRouteError, resolveAgentRouteScope } from './scope.js';

export const leadsRouter = express.Router();

// Human queue UI: the leads Search & Rescue has banked in this workspace.
leadsRouter.get('/sales-leads', requireDb, async (req, res) => {
  try {
    const scope = await resolveAgentRouteScope(req);
    const leads = await listLeads({
      ...scope,
      status: typeof req.query.status === 'string' && req.query.status ? req.query.status : undefined,
      minScore: req.query.min_score !== undefined ? Number(req.query.min_score) : undefined,
      limit: req.query.limit !== undefined ? Number(req.query.limit) : undefined,
    });
    res.json({ leads });
  } catch (err) {
    agentRouteError(res, err);
  }
});

leadsRouter.patch('/sales-leads/:id/status', requireDb, async (req, res) => {
  try {
    const scope = await resolveAgentRouteScope(req);
    const ok = await setLeadStatus(req.params.id, req.body?.status, scope);
    if (!ok) return res.status(404).json({ error: 'Lead not found.' });
    res.json({ ok: true });
  } catch (err) {
    agentRouteError(res, err);
  }
});
