import { FAMILY_AGENT_BY_ID } from '../../src/data/family-agents.js';
import { filterReviewedMindsets } from './reviewedMindsetSources.js';

const TYPES = new Set(['attribute', 'mindset']);

export class DefinitionSelectionError extends Error {
  constructor(message, { code = 'INVALID_DEFINITION_SELECTION', statusCode = 400 } = {}) {
    super(message);
    this.name = 'DefinitionSelectionError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function validateDefinitionIds(definitionIds) {
  if (!Array.isArray(definitionIds)) throw new DefinitionSelectionError('Selection must be an array of IDs.');
  if (definitionIds.length > 64) throw new DefinitionSelectionError('Selection cannot contain more than 64 IDs.');
  const ids = definitionIds.map((id) => typeof id === 'string' ? id.trim() : '');
  if (ids.some((id) => !id)) throw new DefinitionSelectionError('Every selection ID must be a non-empty string.');
  if (new Set(ids).size !== ids.length) throw new DefinitionSelectionError('Selection IDs must be unique.');
  return ids;
}

export function validateEquipmentScope(scope = {}) {
  const workspaceId = String(scope.workspaceId || '').trim();
  const userId = Number(scope.userId);
  if (!workspaceId || !Number.isInteger(userId) || userId <= 0) {
    throw new DefinitionSelectionError('Equipment writes require an authorized workspace and user.', {
      code: 'AGENT_CONFIGURATION_SCOPE_REQUIRED',
    });
  }
  return { workspaceId, userId };
}

function validateAgentId(agentId) {
  const id = String(agentId || '').trim().toLowerCase();
  if (!FAMILY_AGENT_BY_ID[id]) {
    throw new DefinitionSelectionError('Only canonical family agents can be configured in private beta.', {
      code: 'AGENT_CONFIGURATION_UNSUPPORTED_AGENT',
      statusCode: 422,
    });
  }
  return id;
}

async function persistSelection(client, agentId, ids, type, scope) {
  await client.query(
    'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
    [JSON.stringify([scope.workspaceId, agentId, type])]
  );
  const { rows } = await client.query(
    `SELECT id,type,validation FROM attribute_definitions
      WHERE id = ANY($1) AND type = $2 AND is_active = TRUE`,
    [ids, type]
  );
  const validRows = type === 'mindset' ? filterReviewedMindsets(rows) : rows;
  const valid = new Set(validRows.map((row) => row.id));
  const invalid = ids.filter((id) => !valid.has(id));
  if (invalid.length) {
    const qualifier = type === 'mindset' ? 'Unknown, inactive, or unreviewed' : 'Unknown or inactive';
    throw new DefinitionSelectionError(`${qualifier} ${type} IDs: ${invalid.join(', ')}`);
  }
  await client.query(
    `DELETE FROM workspace_agent_equipped_items e
      WHERE e.workspace_id = $1 AND e.agent_id = $2
        AND EXISTS (SELECT 1 FROM attribute_definitions d
          WHERE d.id = e.definition_id AND d.type = $3)`,
    [scope.workspaceId, agentId, type]
  );
  if (ids.length) await client.query(
    `INSERT INTO workspace_agent_equipped_items
       (workspace_id, agent_id, definition_id, equipped_by_user_id, equipped_at)
     SELECT $1, $2, id, $3, NOW() FROM attribute_definitions WHERE id = ANY($4)
     ON CONFLICT (workspace_id, agent_id, definition_id) DO UPDATE SET
       equipped_by_user_id = EXCLUDED.equipped_by_user_id, equipped_at = NOW()`,
    [scope.workspaceId, agentId, scope.userId, ids]
  );
}

async function runTransaction(pool, agentId, ids, type, scope) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await persistSelection(client, agentId, ids, type, scope);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function saveDefinitionIds(pool, agentId, definitionIds, type, scope = {}) {
  if (!TYPES.has(type)) throw new DefinitionSelectionError(`Unsupported definition type: ${type}`);
  const ids = validateDefinitionIds(definitionIds);
  const scopedOwner = validateEquipmentScope(scope);
  await runTransaction(pool, validateAgentId(agentId), ids, type, scopedOwner);
}
