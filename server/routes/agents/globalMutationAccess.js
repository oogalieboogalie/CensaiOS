import pool from '../../db.js';
import { getRuntimeMode, RUNTIME_MODES } from '../../middleware/runtimeMode.js';
import { userRole } from '../../security/systemAdmin.js';
import { createLogger } from '../../logger.js';

const log = createLogger('agents');
const CLOUD_OPERATOR_ROLES = new Set(['admin', 'operator']);
// On a computer install the shared agents are the owner's: a teammate on the
// owner's board makes their own board agents instead.
const OWNER_ONLY_AGENTS = "Only this computer's owner can change the shared agents. Make your own agent on this board instead.";

function accessError(message, statusCode, code) {
  return Object.assign(new Error(message), { statusCode, code });
}

export async function requireGlobalAgentMutationAccess(req, {
  db = pool,
  mode = getRuntimeMode(),
} = {}) {
  const cloud = mode === RUNTIME_MODES.CLOUD_SAAS;
  const userId = Number(req.session?.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw accessError('Authentication is required.', 401, 'AUTHENTICATION_REQUIRED');
  }

  let role;
  try {
    role = String((await userRole(userId, { db })) || '').trim().toLowerCase();
  } catch {
    throw accessError(
      'Global agent authorization is temporarily unavailable.',
      503,
      'GLOBAL_AGENT_AUTHORIZATION_UNAVAILABLE',
    );
  }

  if (cloud && !CLOUD_OPERATOR_ROLES.has(role)) {
    throw accessError(
      'Global agents are operator-managed in cloud mode. Create a workspace-scoped sub-agent instead.',
      403,
      'GLOBAL_AGENT_MUTATION_DENIED',
    );
  }
  if (!cloud && role !== 'admin') {
    log.warn(`agent change refused: not the owner (account ${userId}, ${req.method})`);
    throw accessError(OWNER_ONLY_AGENTS, 403, 'GLOBAL_AGENT_OWNER_ONLY');
  }

  return { authorized: true, enforced: true, userId, role };
}
