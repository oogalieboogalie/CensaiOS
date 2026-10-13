import pool from '../../db.js';
import { resolveMemoryScope } from '../tenancy.js';

export async function addTriple(agentId, subject, predicate, object, confidence = 1.0, scopeInput = {}) {
  const scope = resolveMemoryScope(scopeInput, { requireUser: true });
  const { rows } = await pool.query(
    `INSERT INTO knowledge_graph (agent_id, subject, predicate, object, confidence,
       workspace_id, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [agentId, subject, predicate, object, confidence, scope.workspaceId, scope.userId]
  );
  return rows[0].id;
}

export async function queryGraph(agentId, subject, scopeInput = {}) {
  const scope = resolveMemoryScope(scopeInput);
  const { rows } = await pool.query(
    `SELECT subject, predicate, object, confidence FROM knowledge_graph
     WHERE agent_id = $1 AND workspace_id = $2 AND (subject = $3 OR object = $3)
     ORDER BY confidence DESC`,
    [agentId, scope.workspaceId, subject]
  );
  return rows;
}
