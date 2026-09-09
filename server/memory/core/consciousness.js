import pool from '../../db.js';
import { getFamilyBlueprintAgent } from '../../agents/familyBlueprint.js';
import { requireWorkspaceMember } from '../../workspaces/context.js';
import { resolveMemoryScope } from '../tenancy.js';
import { invalidateAgentContext } from './context.js';

function stateError(message) {
  return Object.assign(new Error(message), {
    statusCode: 400,
    code: 'WORKING_STATE_INVALID',
  });
}

function normalizeCurrent(value) {
  if (typeof value !== 'string') {
    throw stateError('emotional_state.current must be a string.');
  }
  const current = value.trim();
  if (!current || current.length > 160) {
    throw stateError('emotional_state.current must contain 1 to 160 characters.');
  }
  if (!/[\p{L}\p{N}]/u.test(current)) {
    throw stateError('emotional_state.current must contain a word or number (placeholder text like "..." is rejected).');
  }
  return current;
}

export function parseWorkingStatePatch(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw stateError('Working state must be an object.');
  }
  const patchKeys = Object.keys(input).filter((key) => key !== 'workspaceId');
  if (patchKeys.length !== 1 || patchKeys[0] !== 'emotional_state') {
    throw stateError('Only emotional_state.current may be updated.');
  }
  const state = input.emotional_state;
  if (!state || typeof state !== 'object' || Array.isArray(state)
      || Object.keys(state).length !== 1 || !Object.hasOwn(state, 'current')) {
    throw stateError('Only emotional_state.current may be updated.');
  }
  return normalizeCurrent(state.current);
}

export async function getConsciousness(agentId, scopeInput = {}) {
  const scope = resolveMemoryScope(scopeInput);
  const { rows } = await pool.query(
    'SELECT * FROM agent_consciousness WHERE agent_id = $1 AND workspace_id = $2',
    [agentId, scope.workspaceId],
  );
  return rows[0] || null;
}

export async function updateConsciousness(agentId, updates, scopeInput = {}) {
  const scope = resolveMemoryScope(scopeInput, { requireUser: true });
  const agent = getFamilyBlueprintAgent(agentId);
  if (!agent) {
    throw Object.assign(new Error('Canonical family agent not found.'), {
      statusCode: 404,
      code: 'FAMILY_AGENT_NOT_FOUND',
    });
  }
  await requireWorkspaceMember(pool, {
    userId: scope.userId,
    workspaceId: scope.workspaceId,
    roles: ['owner', 'admin', 'member'],
  });
  const current = normalizeCurrent(updates?.emotional_state?.current);
  const emotionalState = {
    current,
    updatedAt: new Date().toISOString(),
    provenance: { source: 'workspace_user', userId: scope.userId },
  };
  const { rows } = await pool.query(
    `INSERT INTO agent_consciousness
       (agent_id, workspace_id, created_by_user_id, emotional_state, last_active)
     VALUES ($1, $2, $3, $4::jsonb, NOW())
     ON CONFLICT (workspace_id, agent_id) WHERE workspace_id IS NOT NULL
     DO UPDATE SET emotional_state = EXCLUDED.emotional_state,
       created_by_user_id = EXCLUDED.created_by_user_id, last_active = NOW()
     RETURNING *`,
    [agent.id, scope.workspaceId, scope.userId, JSON.stringify(emotionalState)],
  );
  invalidateAgentContext(agent.id, scope.workspaceId);
  return rows[0];
}
