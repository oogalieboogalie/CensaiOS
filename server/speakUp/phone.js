// Speak-up notes reach the owner's phone too (diagram 17), through the same
// optional push address the Jules ping uses (JULES_PHONE_PING_URL in .env).
// Only notes from boards this computer's owner owns are sent: the push goes
// to the owner's phone, so a teammate's board never lands there.
import { sendPush } from '../jules-task-sync/phonePing.js';

export async function ownerBoard(db, workspaceId) {
  const { rows } = await db.query(
    `SELECT 1 FROM workspace_members wm JOIN users u ON u.id=wm.user_id
      WHERE wm.workspace_id=$1 AND wm.role='owner' AND u.role='admin' LIMIT 1`,
    [workspaceId],
  );
  return rows.length > 0;
}

/** Resolves to 'sent', 'off', 'not_owner_board' or 'failed: <why>'; never throws. */
export async function pingSpeakUpNote(db, { workspaceId, agentName, note }, { env = process.env, post } = {}) {
  try {
    if (!String(env.JULES_PHONE_PING_URL || '').trim()) return 'off';
    if (!(await ownerBoard(db, workspaceId))) return 'not_owner_board';
    return await sendPush({ title: `${agentName} spoke up`, body: note, tags: 'speech_balloon' }, { env, post });
  } catch (err) {
    return `failed: ${err?.message || 'no answer'}`;
  }
}
