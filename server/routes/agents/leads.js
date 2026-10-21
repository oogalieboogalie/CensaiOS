import express from 'express';
import { requireDb } from './shared.js';
import { listLeads, setLeadStatus } from '../../salesLeads/store.js';
import { countLeadStatuses } from '../../salesLeads/queueCounts.js';
import { agentRouteError, resolveAgentRouteScope } from './scope.js';
import { createLogger } from '../../logger.js';

const log = createLogger('leads');
// The filter comes from the request, so only these names reach a log line.
const LOGGED_FILTERS = new Set(['all', 'new', 'contacted', 'qualified', 'dead']);

export const leadsRouter = express.Router();

// Human queue UI: the leads Search & Rescue has banked in this workspace.
// Counts are the whole board, so the filter buttons stay true after a pick.
leadsRouter.get('/sales-leads', requireDb, async (req, res) => {
  try {
    const scope = await resolveAgentRouteScope(req);
    const filter = typeof req.query.status === 'string' && req.query.status ? req.query.status : 'all';
    const leadsPromise = listLeads({
      ...scope,
      status: filter === 'all' ? undefined : filter,
      minScore: req.query.min_score !== undefined ? Number(req.query.min_score) : undefined,
      limit: req.query.limit !== undefined ? Number(req.query.limit) : undefined,
    });
    const countsPromise = countLeadStatuses(scope);
    const [leads, counts] = await Promise.all([leadsPromise, countsPromise]);
    log.info(`list: filter=${LOGGED_FILTERS.has(filter) ? filter : 'other'} count=${leads.length}`);
    res.json({ leads, counts });
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
