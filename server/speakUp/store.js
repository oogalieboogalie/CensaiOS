// Speak up (diagram 17): an agent posts one short note to the Inbox on its
// own. Off for each agent until an owner or admin turns it on, at most one
// note per agent an hour, and each note is one or two sentences.
export const NOTE_MAX = 280;
export const NOTE_GAP_MS = 60 * 60 * 1000;
export const NOTE_DAYS = 7;

function agentKey(agentId) {
  const id = String(agentId || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{1,64}$/.test(id)) {
    const error = new Error('Unknown agent.');
    error.statusCode = 400;
    throw error;
  }
  return id;
}

/** { agents: { [agentId]: true } } — only the agents that may speak up. */
export async function readSpeakUp(db, workspaceId) {
  const { rows } = await db.query(
    'SELECT agent_id, enabled FROM workspace_agent_speak_up WHERE workspace_id=$1', [workspaceId],
  );
  const agents = {};
  for (const row of rows) if (row.enabled) agents[row.agent_id] = true;
  return { agents };
}

export async function setSpeakUp(db, { workspaceId, agentId, enabled, userId }) {
  await db.query(`INSERT INTO workspace_agent_speak_up (workspace_id,agent_id,enabled,updated_by_user_id)
    VALUES ($1,$2,$3,$4) ON CONFLICT (workspace_id,agent_id)
    DO UPDATE SET enabled=EXCLUDED.enabled,updated_by_user_id=EXCLUDED.updated_by_user_id,updated_at=NOW()`,
  [workspaceId, agentKey(agentId), Boolean(enabled), userId || null]);
  return readSpeakUp(db, workspaceId);
}

/** Posts the note when this agent may speak up. Returns { posted, why }. */
export async function postSpeakUpNote(db, { workspaceId, agentId, note, now = Date.now() }) {
  const text = String(note || '').replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX);
  if (!workspaceId) return { posted: false, why: 'no_board' };
  if (!text) return { posted: false, why: 'empty' };
  const id = agentKey(agentId);
  const { agents } = await readSpeakUp(db, workspaceId);
  if (!agents[id]) return { posted: false, why: 'off' };
  const { rows } = await db.query(
    'SELECT created_at FROM agent_speak_up_notes WHERE workspace_id=$1 AND agent_id=$2 ORDER BY created_at DESC LIMIT 1',
    [workspaceId, id],
  );
  const last = rows[0] ? new Date(rows[0].created_at).getTime() : 0;
  if (last && now - last < NOTE_GAP_MS) return { posted: false, why: 'too_soon' };
  await db.query('INSERT INTO agent_speak_up_notes (workspace_id,agent_id,note) VALUES ($1,$2,$3)', [workspaceId, id, text]);
  return { posted: true, note: text };
}

/** The last week of notes on every board this person belongs to, newest first. */
export async function listSpeakUpNotes(db, { userId, limit = 20 }) {
  const { rows } = await db.query(
    `SELECT n.id, n.agent_id, n.note, n.created_at, w.name AS workspace_name
       FROM agent_speak_up_notes n
       JOIN workspace_members wm ON wm.workspace_id=n.workspace_id AND wm.user_id=$1
       JOIN workspaces w ON w.id=n.workspace_id
      WHERE n.created_at > NOW() - make_interval(days => $2)
      ORDER BY n.created_at DESC LIMIT $3`,
    [userId, NOTE_DAYS, limit],
  );
  return rows;
}
