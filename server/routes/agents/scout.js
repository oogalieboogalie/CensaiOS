import express from 'express';
import pool from '../../db.js';
import { requireDb } from './shared.js';
import { scoutArea } from '../../scout/run.js';
import { draftOutreach } from '../../scout/draft.js';
import { agentRouteError, resolveAgentRouteScope } from './scope.js';

export const scoutRouter = express.Router();

// Run a bounded scout pass: one area + ICP description in, up to topK scored
// leads in the store out. Costs 1 search + up to topK extracts.
scoutRouter.post('/scout/run', requireDb, async (req, res) => {
  try {
    const scope = await resolveAgentRouteScope(req);
    const { area, icp = '', topK = 3 } = req.body || {};
    if (!area || typeof area !== 'string') {
      return res.status(400).json({ error: 'Provide area: "City, ST".' });
    }
    const k = Math.max(1, Math.min(Number(topK) || 3, 5));
    const run = await scoutArea({ area: area.trim(), icp: String(icp || '').slice(0, 500), scope, topK: k });
    res.json({ ok: true, area: area.trim(), ...run });
  } catch (err) {
    agentRouteError(res, err);
  }
});

// Draft a short outreach email for one banked lead.
scoutRouter.post('/scout/draft', requireDb, async (req, res) => {
  try {
    const scope = await resolveAgentRouteScope(req);
    const { lead_id: leadId } = req.body || {};
    if (!leadId) return res.status(400).json({ error: 'Provide lead_id.' });
    const { rows } = await pool.query(
      `SELECT id, name, team, brokerage, city, phone, email, buying_signals
       FROM sales_leads WHERE id = $1 AND workspace_id = $2`,
      [leadId, scope.workspaceId]
    );
    const lead = rows[0];
    if (!lead) return res.status(404).json({ error: 'Lead not found.' });
    const draft = await draftOutreach(lead);
    res.json({ ok: true, lead_id: lead.id, ...draft });
  } catch (err) {
    agentRouteError(res, err);
  }
});
