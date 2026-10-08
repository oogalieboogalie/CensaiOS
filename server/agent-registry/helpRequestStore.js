// AGENT NETWORK — help request persistence + public shape.
// SQL only; policy lives in helpRequests.js.

export class AgentHelpError extends Error {
  constructor(message, statusCode = 400, code = 'AGENT_HELP_INVALID') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

const SELECT_JOINED = `SELECT h.*, c.name AS target_name, r.status AS run_status,
    r.metadata->'result' AS run_result,
    (SELECT error FROM run_steps WHERE run_id=r.id AND status='failed'
      ORDER BY created_at DESC LIMIT 1) AS run_failure
  FROM agent_help_requests h
  JOIN agent_cards c ON c.id=h.target_card_id
  LEFT JOIN runs r ON r.id=h.run_id`;

const RUN_STATUS = Object.freeze({
  pending: 'queued', running: 'working', succeeded: 'completed', failed: 'failed', cancelled: 'failed',
});

export function deriveHelpStatus(row) {
  if (row.status === 'dispatch_failed') return 'failed';
  if (row.status !== 'dispatched') return row.status;
  return RUN_STATUS[row.run_status] || 'unknown';
}

function failureMessage(row) {
  if (row.error) return row.error;
  const failure = row.run_failure;
  return failure ? String(failure.message || failure.error || 'The helper agent failed.') : null;
}

/** side: 'outgoing' (requesting workspace) sees the result; 'incoming' (card owner) does not. */
export function publicHelpRequest(row, side = 'outgoing') {
  const status = deriveHelpStatus(row);
  return {
    id: row.id,
    side,
    workspaceId: side === 'outgoing' ? row.workspace_id : undefined,
    cardId: row.target_card_id,
    cardName: row.target_name || row.target_card_id,
    skillId: row.skill_id || null,
    task: row.task,
    requester: { kind: row.requester_kind, id: row.requester_id },
    status,
    approval: row.target_owner_id && side === 'incoming' ? 'owner' : undefined,
    decisionNote: row.decision_note || null,
    result: side === 'outgoing' && status === 'completed' ? (row.run_result ?? null) : null,
    error: status === 'failed' ? failureMessage(row) : null,
    runId: side === 'outgoing' ? row.run_id || null : undefined,
    createdAt: row.created_at,
    decidedAt: row.decided_at || null,
  };
}

export async function insertHelpRequest(db, input) {
  const { rows: [row] } = await db.query(`INSERT INTO agent_help_requests
    (workspace_id,target_card_id,target_owner_id,requester_kind,requester_id,
     requested_by_user_id,skill_id,task,status)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [
    input.workspaceId, input.cardId, input.targetOwnerId, input.requesterKind,
    input.requesterId, input.userId, input.skillId, input.task, input.status,
  ]);
  return row;
}

export async function markDispatched(db, id, runId) {
  await db.query(`UPDATE agent_help_requests SET status='dispatched', run_id=$2, error=NULL,
    updated_at=NOW() WHERE id=$1`, [id, runId]);
}

export async function markDispatchFailed(db, id, message) {
  await db.query(`UPDATE agent_help_requests SET status='dispatch_failed', error=$2,
    updated_at=NOW() WHERE id=$1`, [id, String(message || 'Dispatch failed.').slice(0, 500)]);
}

/** Atomic pending → next transition; returns the row or null when it was not pending. */
export async function transitionPending(db, { id, where, params, status, userId, note }) {
  const { rows: [row] } = await db.query(`UPDATE agent_help_requests SET status=$2,
      decided_by_user_id=$3, decided_at=NOW(), decision_note=$4, updated_at=NOW()
    WHERE id=$1 AND status='pending' AND ${where} RETURNING *`,
  [id, status, userId, note ? String(note).slice(0, 500) : null, ...params]);
  return row || null;
}

export async function findHelpRequest(db, id) {
  const { rows: [row] } = await db.query(`${SELECT_JOINED} WHERE h.id=$1`, [id]);
  return row || null;
}

export async function listOutgoing(db, workspaceId, limit = 50) {
  const { rows } = await db.query(`${SELECT_JOINED} WHERE h.workspace_id=$1
    ORDER BY h.created_at DESC LIMIT $2`, [workspaceId, limit]);
  return rows;
}

export async function listIncoming(db, { userId, workspaceId }, limit = 50) {
  const { rows } = await db.query(`${SELECT_JOINED} WHERE h.target_owner_id=$1
    AND h.workspace_id <> $2 ORDER BY (h.status='pending') DESC, h.created_at DESC LIMIT $3`,
  [String(userId), workspaceId, limit]);
  return rows;
}
