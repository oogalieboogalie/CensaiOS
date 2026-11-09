import pool from '../../db.js';
import { userRole } from '../../security/systemAdmin.js';
import { assertSubAgentToolScopes } from '../../tools/rbac/subagentToolScopes.js';
import { resolveSubAgentRouteScope } from './subagentScope.js';

function scopesIn(body) {
  if (!body || typeof body !== 'object') return [];
  const found = [];
  if (Object.prototype.hasOwnProperty.call(body, 'tool_scopes')) found.push(body.tool_scopes);
  if (Object.prototype.hasOwnProperty.call(body, 'toolScopes')) found.push(body.toolScopes);
  return found;
}

/**
 * Create, edit and delete are for a board owner or admin. Tool lists are
 * checked against what that person is allowed to grant.
 */
export async function resolveSubAgentWrite(req) {
  const scope = await resolveSubAgentRouteScope(req, { write: true });
  const scopes = scopesIn(req.body);
  if (scopes.length === 0) return scope;

  let systemRole;
  try {
    systemRole = await userRole(scope.userId, { db: pool });
  } catch {
    const error = new Error('Could not check who is editing this sub-agent.');
    error.statusCode = 503;
    error.code = 'SUB_AGENT_ROLE_UNCHECKED';
    throw error;
  }
  for (const entry of scopes) await assertSubAgentToolScopes(entry, { systemRole });
  return scope;
}
