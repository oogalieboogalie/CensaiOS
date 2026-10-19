// Hosted agent rows (docker/070-hosted-agents.sql): which vendor agent a
// board agent stands for, and the vendor conversation per person and chat.

export async function findHostedAgent(db, agentId) {
  if (!agentId) return null;
  const { rows } = await db.query(
    'SELECT agent_id, vendor, remote_ref, endpoint, settings FROM hosted_agents WHERE agent_id = $1',
    [String(agentId)],
  );
  return rows[0] || null;
}

export async function saveHostedAgent(db, { agentId, vendor, ref, endpoint = null, settings = {}, userId = null }) {
  await db.query(
    `INSERT INTO hosted_agents (agent_id, vendor, remote_ref, endpoint, settings, imported_by_user_id)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)
     ON CONFLICT (agent_id) DO UPDATE SET
       vendor = EXCLUDED.vendor, remote_ref = EXCLUDED.remote_ref, endpoint = EXCLUDED.endpoint,
       settings = EXCLUDED.settings, imported_by_user_id = EXCLUDED.imported_by_user_id, updated_at = NOW()`,
    [agentId, vendor, ref, endpoint, JSON.stringify(settings || {}), userId],
  );
}

export async function findThread(db, { agentId, userId, conversationKey }) {
  const { rows } = await db.query(
    `SELECT remote_thread FROM hosted_agent_threads
     WHERE agent_id = $1 AND user_id = $2 AND conversation_key = $3`,
    [agentId, userId, conversationKey],
  );
  return rows[0]?.remote_thread || null;
}

export async function saveThread(db, { agentId, userId, conversationKey, thread }) {
  if (!thread) return;
  await db.query(
    `INSERT INTO hosted_agent_threads (agent_id, user_id, conversation_key, remote_thread)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (agent_id, user_id, conversation_key) DO UPDATE SET
       remote_thread = EXCLUDED.remote_thread, updated_at = NOW()`,
    [agentId, userId, conversationKey, String(thread).slice(0, 400)],
  );
}
