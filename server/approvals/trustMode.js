// Trust mode: when it is on (the default), family agents run their write tools
// straight away instead of parking them in Action Approvals. A board-wide row
// (agent_id '*') sets the board; a row for one agent overrides the board.
export const BOARD = '*';
// Only people who could press "Approve once" themselves skip the click: an
// owner or admin. A member's or viewer's request still waits for one of them.
export const TRUSTED_ROLES = Object.freeze(['owner', 'admin']);

function agentKey(agentId) {
  const id = String(agentId || '').trim().toLowerCase();
  if (id === BOARD) return BOARD;
  if (!/^[a-z0-9._-]{1,64}$/.test(id)) {
    const error = new Error('Unknown agent.');
    error.statusCode = 400;
    throw error;
  }
  return id;
}

/** { board: boolean, agents: { [agentId]: boolean } } — missing board row = on. */
export async function readTrustMode(db, workspaceId) {
  const { rows } = await db.query(
    'SELECT agent_id, trusted FROM workspace_agent_trust WHERE workspace_id=$1', [workspaceId],
  );
  const agents = {};
  let board = true;
  for (const row of rows) {
    if (row.agent_id === BOARD) board = Boolean(row.trusted);
    else agents[row.agent_id] = Boolean(row.trusted);
  }
  return { board, agents };
}

export async function agentIsTrusted(db, { workspaceId, agentId }) {
  if (!workspaceId) return false;
  const state = await readTrustMode(db, workspaceId);
  const own = state.agents[String(agentId || '').toLowerCase()];
  return typeof own === 'boolean' ? own : state.board;
}

/** trusted: true/false sets it; null clears an agent's override (follow the board). */
export async function setTrustMode(db, { workspaceId, agentId = BOARD, trusted, userId }) {
  const key = agentKey(agentId);
  if (trusted === null && key !== BOARD) {
    await db.query('DELETE FROM workspace_agent_trust WHERE workspace_id=$1 AND agent_id=$2',
      [workspaceId, key]);
  } else {
    await db.query(`INSERT INTO workspace_agent_trust (workspace_id,agent_id,trusted,updated_by_user_id)
      VALUES ($1,$2,$3,$4) ON CONFLICT (workspace_id,agent_id)
      DO UPDATE SET trusted=EXCLUDED.trusted,updated_by_user_id=EXCLUDED.updated_by_user_id,updated_at=NOW()`,
    [workspaceId, key, Boolean(trusted), userId || null]);
  }
  return readTrustMode(db, workspaceId);
}

