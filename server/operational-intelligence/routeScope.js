import pool from '../db.js';
import { resolveWorkspaceContext } from '../workspaces/context.js';
import { publicOperationalError } from './tracePrivacy.js';

function scopeError(message, statusCode, code) {
  return Object.assign(new Error(message), { statusCode, code });
}

function sessionUserId(req) {
  const userId = Number(req.session?.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw scopeError('Authenticated user required', 401, 'AUTHENTICATION_REQUIRED');
  }
  return userId;
}

function requestedWorkspaceId(req) {
  const values = [
    req.query?.workspaceId,
    req.query?.workspace_id,
    req.body?.workspaceId,
    req.body?.workspace_id,
    req.params?.workspaceId,
  ].map(value => String(value ?? '').trim()).filter(Boolean);
  const unique = [...new Set(values)];
  if (unique.length > 1) {
    throw scopeError(
      'Conflicting workspace IDs are not allowed',
      400,
      'OPERATIONAL_WORKSPACE_CONFLICT',
    );
  }
  return unique[0] || null;
}

export async function resolveOperationalScope(req, {
  db = pool,
  write = false,
  roles = null,
  requireWorkspace = true,
} = {}) {
  const userId = sessionUserId(req);
  const workspaceId = requestedWorkspaceId(req);
  if (requireWorkspace && !workspaceId) {
    throw scopeError('workspaceId is required', 400, 'OPERATIONAL_WORKSPACE_REQUIRED');
  }
  let workspace;
  try {
    workspace = await resolveWorkspaceContext(db, {
      userId,
      workspaceId,
    });
  } catch (error) {
    if ([400, 401, 403, 404].includes(error?.statusCode)) throw error;
    throw scopeError(
      'Operational workspace authorization is temporarily unavailable',
      503,
      'OPERATIONAL_SCOPE_UNAVAILABLE',
    );
  }
  if ((write && workspace.role === 'viewer')
    || (Array.isArray(roles) && !roles.includes(workspace.role))) {
    throw scopeError('Workspace access denied', 403, 'OPERATIONAL_WRITE_DENIED');
  }
  return {
    userId,
    workspaceId: workspace.id,
    tenantId: workspace.tenantId ?? null,
    role: workspace.role,
    actor: { kind: 'user', id: String(userId) },
  };
}

export function operationalRouteError(res, error, fallbackStatus = 400) {
  const publicError = publicOperationalError(error, fallbackStatus);
  return res.status(publicError.status).json(publicError.body);
}
