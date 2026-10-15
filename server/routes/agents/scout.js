import express from 'express';
import pool from '../../db.js';
import { requireDb } from './shared.js';
import { scoutArea } from '../../scout/run.js';
import { draftOutreach } from '../../scout/draft.js';
import { agentRouteError, resolveAgentRouteScope } from './scope.js';

export const scoutRouter = express.Router();

// Run a bounded scout pass: one area + who the user sells to (target, or the
// older icp field) in, up to topK leads in the store out. Costs 1 search + up
// to topK extracts on the user's own Tavily key, else the server's.
scoutRouter.post('/scout/run', requireDb, async (req, res) => {
  try {
    const scope = await resolveAgentRouteScope(req);
    const { area, icp = '', target = '', business = '', topK = 3 } = req.body || {};
    if (!area || typeof area !== 'string') {
      return res.status(400).json({ error: 'Provide area: "City, ST".' });
    }
    const k = Math.max(1, Math.min(Number(topK) || 3, 5));
    const run = await scoutArea({
      area: area.trim(),
      target: String(target || icp || '').slice(0, 500),
      business: String(business || '').slice(0, 500),
      scope,
      topK: k,
    });
    res.json({ ok: true, area: area.trim(), ...run });
  } catch (err) {
    agentRouteError(res, err);
  }
});

// Draft a short outreach email for one banked lead, pitching the user's own
// business (sent from the Lead Queue's settings).
scoutRouter.post('/scout/draft', requireDb, async (req, res) => {
  try {
    const scope = await resolveAgentRouteScope(req);
    const { lead_id: leadId, business = '', target = '' } = req.body || {};
    if (!leadId) return res.status(400).json({ error: 'Provide lead_id.' });
    const { rows } = await pool.query(
      `SELECT id, name, team, brokerage, city, phone, email, website, buying_signals
       FROM sales_leads WHERE id = $1 AND workspace_id = $2`,
      [leadId, scope.workspaceId]
    );
    const lead = rows[0];
    if (!lead) return res.status(404).json({ error: 'Lead not found.' });
    const draft = await draftOutreach(lead, {
      business: String(business || '').slice(0, 500),
      target: String(target || '').slice(0, 500),
    });
    res.json({ ok: true, lead_id: lead.id, ...draft });
  } catch (err) {
    agentRouteError(res, err);
  }
});
