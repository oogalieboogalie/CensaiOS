import express from 'express';
import pool from '../db.js';
import {
  convertAuthorizedTraceToTest,
  findAuthorizedTrace,
  listAuthorizedTraceEvents,
  listAuthorizedTraces,
} from '../operational-intelligence/traceAccess.js';
import { resolveWorkspaceContext } from '../workspaces/context.js';
import { publicOperationalError } from '../operational-intelligence/tracePrivacy.js';

export const operationalIntelligenceTracesRouter = express.Router();

operationalIntelligenceTracesRouter.get('/traces', async (req, res) => {
  try {
    const scope = await resolveTraceScope(req);
    const traces = await listAuthorizedTraces(pool, {
      workspaceId: scope.workspaceId,
      limit: req.query.limit,
    });
    res.json(traces);
  } catch (error) {
    traceRouteError(res, error);
  }
});

operationalIntelligenceTracesRouter.get('/traces/:id/events', async (req, res) => {
  try {
    const scope = await resolveTraceScope(req);
    const trace = await findAuthorizedTrace(pool, {
      workspaceId: scope.workspaceId,
      traceId: req.params.id,
    });
    if (!trace) return res.status(404).json({ error: 'Trace not found' });
    const events = await listAuthorizedTraceEvents(pool, {
      workspaceId: scope.workspaceId,
      traceId: trace.id,
    });
    res.json(events);
  } catch (error) {
    traceRouteError(res, error);
  }
});

operationalIntelligenceTracesRouter.post('/traces/:id/convert-to-test', async (req, res) => {
  try {
    const scope = await resolveTraceScope(req, { write: true });
    const trace = await findAuthorizedTrace(pool, {
      workspaceId: scope.workspaceId,
      traceId: req.params.id,
    });
    if (!trace) return res.status(404).json({ error: 'Trace not found' });
    const events = await listAuthorizedTraceEvents(pool, {
      workspaceId: scope.workspaceId,
      traceId: trace.id,
    });
    const testCase = await convertAuthorizedTraceToTest(pool, {
      workspaceId: scope.workspaceId,
      trace,
      events,
    });
    res.json(testCase);
  } catch (error) {
    traceRouteError(res, error);
  }
});

async function resolveTraceScope(req, { write = false } = {}) {
  const userId = Number(req.session?.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    const error = new Error('Authenticated user required');
    error.statusCode = 401;
    throw error;
  }
  const workspace = await resolveWorkspaceContext(pool, {
    userId,
    workspaceId: req.query?.workspaceId || null,
  });
  if (write && workspace.role === 'viewer') {
    const error = new Error('Workspace access denied');
    error.statusCode = 403;
    throw error;
  }
  return { userId, workspaceId: workspace.id };
}

function traceRouteError(res, error) {
  const publicError = publicOperationalError(error);
  res.status(publicError.status).json(publicError.body);
}
