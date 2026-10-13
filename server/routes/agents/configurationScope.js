import pool from '../../db.js';
import { FAMILY_AGENT_BY_ID } from '../../../src/data/family-agents.js';
import { requireWorkspaceMember } from '../../workspaces/context.js';

function scopeError(message, statusCode, code) {
  return Object.assign(new Error(message), { statusCode, code });
}

function requestedWorkspaceId(req) {
  const queryId = String(req.query?.workspaceId || '').trim();
  const bodyId = String(req.body?.workspaceId || '').trim();
  if (queryId && bodyId && queryId !== bodyId) {
    throw scopeError(
      'Conflicting workspace IDs are not allowed.',
      400,
      'AGENT_CONFIGURATION_SCOPE_CONFLICT'
    );
  }
  const workspaceId = queryId || bodyId;
  if (!workspaceId) {
    throw scopeError(
      'Open a workspace to configure an agent.',
      400,
      'AGENT_CONFIGURATION_SCOPE_REQUIRED'
    );
  }
  return workspaceId;
}

export function canonicalConfigurationAgentId(value) {
  const agentId = String(value || '').trim().toLowerCase();
  if (!FAMILY_AGENT_BY_ID[agentId]) {
    throw scopeError(
      'Only canonical family agents can be configured in private beta.',
      422,
      'AGENT_CONFIGURATION_UNSUPPORTED_AGENT'
    );
  }
  return agentId;
}

export async function resolveConfigurationScope(req, { write = false, db = pool } = {}) {
  const userId = Number(req.session?.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw scopeError('Authentication is required.', 401, 'AUTHENTICATION_REQUIRED');
  }
  const workspaceId = requestedWorkspaceId(req);
  const workspace = await requireWorkspaceMember(db, {
    userId,
    workspaceId,
    ...(write ? { roles: ['owner', 'admin'] } : {}),
  });
  return {
    workspaceId: workspace.id,
    userId,
    agentId: canonicalConfigurationAgentId(req.params.id),
    role: workspace.role,
  };
}
