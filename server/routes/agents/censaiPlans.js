// Censai the orchestrator: the person's plans, for Censai's pinned chat
// (server/censaiOrchestrator). Each person sees, and stops, only their own plans
// on the board they are on.
import express from 'express';
import pool from '../../db.js';
import { can, memberPrincipal } from '../../access/policy.js';
import { publicPlan } from '../../censaiOrchestrator/shape.js';
import { claimReport, getPlan, listPlans } from '../../censaiOrchestrator/store.js';
import { recoverOnce, stopPlan } from '../../censaiOrchestrator/runner.js';
import { requireDb } from './shared.js';
import { agentRouteError, resolveAgentRouteScope } from './scope.js';

export const censaiPlansRouter = express.Router();
const PLAN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function scoped(req, res) {
  try {
    const scope = await resolveAgentRouteScope(req);
    return { ...scope, userId: Number(scope.userId) };
  } catch (error) {
    agentRouteError(res, error);
    return null;
  }
}

function planId(req, res) {
  if (PLAN_ID.test(req.params.id)) return req.params.id;
  res.status(404).json({ error: 'No plan of yours has that id.' });
  return null;
}

censaiPlansRouter.get('/censai/plans', requireDb, async (req, res) => {
  const scope = await scoped(req, res);
  if (!scope) return;
  try {
    await recoverOnce();
    const rows = await listPlans(pool, {
      workspaceId: scope.workspaceId, userId: scope.userId, open: req.query.open === '1', limit: req.query.limit,
    });
    res.json({ plans: rows.map((row) => publicPlan(row)) });
  } catch {
    res.status(500).json({ error: 'Could not load your plans.' });
  }
});

// The first tab to ask after a plan finished posts its result line; any other gets first: false.
censaiPlansRouter.post('/censai/plans/:id/reported', requireDb, async (req, res) => {
  const scope = await scoped(req, res);
  const id = scope && planId(req, res);
  if (!id) return;
  try {
    const first = await claimReport(pool, { id, workspaceId: scope.workspaceId, userId: scope.userId });
    const row = await getPlan(pool, { id, workspaceId: scope.workspaceId, userId: scope.userId });
    if (!row) return res.status(404).json({ error: 'No plan of yours has that id.' });
    res.json({ first, plan: publicPlan(row, { withAnswers: true }) });
  } catch {
    res.status(500).json({ error: 'Could not mark the plan as told.' });
  }
});

censaiPlansRouter.post('/censai/plans/:id/stop', requireDb, async (req, res) => {
  const scope = await scoped(req, res);
  const id = scope && planId(req, res);
  if (!id) return;
  if (!can(memberPrincipal(scope.role), 'agent.ask')) {
    return res.status(403).json({ error: 'You can look at this board but not stop work on it.' });
  }
  try {
    const row = await stopPlan({ id, workspaceId: scope.workspaceId, userId: scope.userId });
    if (!row) return res.status(404).json({ error: 'No plan of yours has that id.' });
    res.json({ plan: publicPlan(row) });
  } catch {
    res.status(500).json({ error: 'Could not stop the plan.' });
  }
});
