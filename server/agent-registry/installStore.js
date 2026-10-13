import { canReadCard, isSystemAgentCard } from '../agent-card-runs/contract.js';
import { createWorkspaceEvent } from '../operational-intelligence/factories.js';
import { requireWorkspaceMember } from '../workspaces/context.js';

export class AgentCardInstallError extends Error {
  constructor(message, statusCode = 400, code = 'AGENT_CARD_INSTALL_INVALID') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export async function listAgentCardInstalls(db, { workspaceId, userId }) {
  const workspace = await requireWorkspaceMember(db, { workspaceId, userId });
  const { rows } = await db.query(`SELECT i.card_id,i.installed_by_user_id,i.installed_at,
    c.name,c.description,c.version,c.visibility
    FROM workspace_agent_card_installs i JOIN agent_cards c ON c.id=i.card_id
    WHERE i.workspace_id=$1 AND c.deleted_at IS NULL ORDER BY i.installed_at,i.card_id`, [workspaceId]);
  return { canManage: ['owner', 'admin'].includes(workspace.role), items: rows };
}

async function visibleCard(client, { cardId, workspaceId, userId }) {
  const { rows: [card] } = await client.query(
    'SELECT * FROM agent_cards WHERE id=$1 AND deleted_at IS NULL', [cardId],
  );
  if (!card) return null;
  const memberships = await client.query('SELECT workspace_id FROM workspace_members WHERE user_id=$1', [userId]);
  const actor = { kind: 'user', id: String(userId), workspaceIds: memberships.rows.map(row => row.workspace_id) };
  const targetVisible = isSystemAgentCard(card) || card.visibility === 'public' || card.workspace_id === workspaceId;
  return targetVisible && canReadCard(card, actor) ? card : null;
}

async function event(client, { workspaceId, userId, cardId, type }) {
  await createWorkspaceEvent({ db: client }, {
    workspaceId, type, actor: { kind: 'user', id: String(userId) }, payload: { cardId },
  });
}

export async function installAgentCard(db, { workspaceId, userId, cardId }) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await requireWorkspaceMember(client, { workspaceId, userId, roles: ['owner', 'admin'] });
    if (!await visibleCard(client, { cardId, workspaceId, userId })) {
      throw new AgentCardInstallError('AgentCard not found.', 404, 'AGENT_CARD_NOT_FOUND');
    }
    const { rows: [created] } = await client.query(`INSERT INTO workspace_agent_card_installs
      (workspace_id,card_id,installed_by_user_id) VALUES($1,$2,$3)
      ON CONFLICT (workspace_id,card_id) DO NOTHING RETURNING *`, [workspaceId, cardId, userId]);
    if (created) await event(client, {
      workspaceId, userId, cardId, type: 'agent.registry_card.installed',
    });
    const { rows: [install] } = created ? { rows: [created] } : await client.query(
      'SELECT * FROM workspace_agent_card_installs WHERE workspace_id=$1 AND card_id=$2',
      [workspaceId, cardId],
    );
    await client.query('COMMIT');
    return { created: Boolean(created), install };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function removeAgentCardInstall(db, { workspaceId, userId, cardId }) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await requireWorkspaceMember(client, { workspaceId, userId, roles: ['owner', 'admin'] });
    const { rows: [removed] } = await client.query(`DELETE FROM workspace_agent_card_installs
      WHERE workspace_id=$1 AND card_id=$2 RETURNING *`, [workspaceId, cardId]);
    if (removed) await event(client, {
      workspaceId, userId, cardId, type: 'agent.registry_card.removed',
    });
    await client.query('COMMIT');
    return { removed: Boolean(removed), install: removed || null };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
