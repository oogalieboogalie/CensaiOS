// Kraken Requests in the database (docker/096-kraken-requests.sql). Every read
// a person makes is scoped to their own requests on that board.

import { randomUUID } from 'node:crypto';
import { storable } from '../censaiOrchestrator/store.js';

const COLUMNS = 'id, workspace_id, user_id, title, project, mode, status, arms, created_at, updated_at, finished_at';

export async function insertRequest(db, { workspaceId, userId, title, project, mode, arms, id = randomUUID() }) {
  const { rows } = await db.query(
    `INSERT INTO kraken_requests (id, workspace_id, user_id, title, project, mode, arms)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb) RETURNING ${COLUMNS}`,
    [id, workspaceId, userId, storable(title), storable(project) || null, mode, JSON.stringify(storable(arms))],
  );
  return rows[0];
}

export async function getRequest(db, { id, workspaceId, userId }) {
  const { rows } = await db.query(
    `SELECT ${COLUMNS} FROM kraken_requests WHERE id = $1 AND workspace_id = $2 AND user_id = $3`,
    [id, workspaceId, userId],
  );
  return rows[0] || null;
}

/** The person's requests on this board, newest first. */
export async function listRequests(db, { workspaceId, userId, limit = 5 }) {
  const { rows } = await db.query(
    `SELECT ${COLUMNS} FROM kraken_requests WHERE workspace_id = $1 AND user_id = $2
     ORDER BY created_at DESC LIMIT $3`,
    [workspaceId, userId, Math.max(1, Math.min(Math.trunc(Number(limit)) || 5, 20))],
  );
  return rows;
}

/** The person's requests still handing arms out, oldest first. */
export async function listOpenRequests(db, { workspaceId, userId }) {
  const { rows } = await db.query(
    `SELECT ${COLUMNS} FROM kraken_requests
     WHERE workspace_id = $1 AND user_id = $2 AND status = 'open' ORDER BY created_at`,
    [workspaceId, userId],
  );
  return rows;
}

/** Unscoped: everyone with a request still out (for the feeder, after a start). */
export async function listOpenOwners(db) {
  const { rows } = await db.query(
    "SELECT DISTINCT workspace_id, user_id FROM kraken_requests WHERE status = 'open' LIMIT 200",
  );
  return rows.map((row) => ({ workspaceId: row.workspace_id, userId: row.user_id }));
}

/** Save an open request. A finished one is never written over (null), so a late save cannot undo a stop. */
export async function saveRequest(db, { id, status, arms }) {
  const { rows } = await db.query(
    `UPDATE kraken_requests SET status = $2, arms = $3::jsonb, updated_at = NOW(),
       finished_at = CASE WHEN $2 = 'open' THEN NULL ELSE COALESCE(finished_at, NOW()) END
     WHERE id = $1 AND status = 'open' RETURNING ${COLUMNS}`,
    [id, status, JSON.stringify(storable(arms))],
  );
  return rows[0] || null;
}
