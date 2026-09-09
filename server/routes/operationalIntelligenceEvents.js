import express from 'express';
import pool from '../db.js';
import {
  listAuthorizedWorkspaceEvents,
  recordAuthorizedRuntimeProvenance,
} from '../operational-intelligence/eventAccess.js';
import { resolveWorkspaceContext } from '../workspaces/context.js';
import { publicOperationalError } from '../operational-intelligence/tracePrivacy.js';

export const operationalIntelligenceEventsRouter = express.Router();

operationalIntelligenceEventsRouter.get('/events', async (req, res) => {
  try {
    const scope = await resolveEventScope(req);
    const events = await listAuthorizedWorkspaceEvents(pool, {
      workspaceId: scope.workspaceId,
      type: req.query.type,
      limit: req.query.limit,
    });
    res.json(events);
  } catch (error) {
    routeError(res, error);
  }
});

operationalIntelligenceEventsRouter.post('/telemetry/provenance', async (req, res) => {
  try {
    const scope = await resolveEventScope(req, { acceptSnakeCase: true, write: true });
    const event = await recordAuthorizedRuntimeProvenance(pool, {
      workspaceId: scope.workspaceId,
      actor: scope.actor,
      input: req.body,
    });
    res.status(201).json(event);
  } catch (error) {
    if (!error.statusCode || error.statusCode >= 500) {
      console.error('[Telemetry] Provenance request failed', {
        status: Number(error.statusCode || 500),
      });
    }
    routeError(res, error, 500);
  }
});

async function resolveEventScope(req, { acceptSnakeCase = false, write = false } = {}) {
  const userId = Number(req.session?.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    const error = new Error('Authenticated user required');
    error.statusCode = 401;
    throw error;
  }
  const requestedWorkspaceId = req.query?.workspaceId
    || req.body?.workspaceId
    || (acceptSnakeCase ? req.body?.workspace_id : null)
    || null;
  const workspace = await resolveWorkspaceContext(pool, {
    userId,
    workspaceId: requestedWorkspaceId,
  });
  if (write && workspace.role === 'viewer') {
    const error = new Error('Workspace access denied');
    error.statusCode = 403;
    throw error;
  }
  return {
    userId,
    workspaceId: workspace.id,
    actor: { kind: 'user', id: String(userId) },
  };
}

function routeError(res, error, fallbackStatus = 400) {
  const publicError = publicOperationalError(error, fallbackStatus);
  res.status(publicError.status).json(publicError.body);
}
