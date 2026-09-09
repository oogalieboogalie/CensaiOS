import pool from '../../db.js';
import { getRuntimeMode, RUNTIME_MODES } from '../../middleware/runtimeMode.js';

const CLOUD_OPERATOR_ROLES = new Set(['admin', 'operator']);

function accessError(message, statusCode, code) {
  return Object.assign(new Error(message), { statusCode, code });
}

export async function requireGlobalAgentMutationAccess(req, {
  db = pool,
  mode = getRuntimeMode(),
} = {}) {
  if (mode !== RUNTIME_MODES.CLOUD_SAAS) {
    return { authorized: true, enforced: false };
  }

  const userId = Number(req.session?.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw accessError('Authentication is required.', 401, 'AUTHENTICATION_REQUIRED');
  }

  let role;
  try {
    const { rows } = await db.query('SELECT role FROM users WHERE id = $1', [userId]);
    role = String(rows[0]?.role || '').trim().toLowerCase();
  } catch {
    throw accessError(
      'Global agent authorization is temporarily unavailable.',
      503,
      'GLOBAL_AGENT_AUTHORIZATION_UNAVAILABLE',
    );
  }

  if (!CLOUD_OPERATOR_ROLES.has(role)) {
    throw accessError(
      'Global agents are operator-managed in cloud mode. Create a workspace-scoped sub-agent instead.',
      403,
      'GLOBAL_AGENT_MUTATION_DENIED',
    );
  }

  return { authorized: true, enforced: true, userId, role };
}
