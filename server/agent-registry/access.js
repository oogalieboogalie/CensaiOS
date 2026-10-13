import pool from '../db.js';
import { canInvokeCard, canReadCard } from '../agent-card-runs/contract.js';
import { resolveWorkspaceContext } from '../workspaces/context.js';

export async function actorWithWorkspaceAccess(actor, db = pool) {
  if (!actor?.id) return null;
  const { rows } = await db.query(
    'SELECT workspace_id FROM workspace_members WHERE user_id = $1',
    [actor.id]
  );
  return { ...actor, workspaceIds: rows.map(row => row.workspace_id) };
}

export async function canActorReadCard(card, actor, db = pool) {
  if (canReadCard(card, null)) return true;
  return canReadCard(card, await actorWithWorkspaceAccess(actor, db));
}

export async function canActorInvokeCard(card, actor, db = pool) {
  if (canInvokeCard(card, actor)) return true;
  return canInvokeCard(card, await actorWithWorkspaceAccess(actor, db));
}

export async function resolveRegistryWorkspace({ userId, workspaceId, db = pool }) {
  return resolveWorkspaceContext(db, { userId, workspaceId: workspaceId || null });
}

export async function getAgentCardOwnershipSummary(db = pool) {
  const { rows } = await db.query(`SELECT
    count(*) FILTER (WHERE owner_id IS NULL AND workspace_id IS NULL AND deleted_at IS NULL)::int AS system_count,
    count(*) FILTER (WHERE owner_id IS NOT NULL AND workspace_id IS NULL AND deleted_at IS NULL)::int AS legacy_count,
    count(*) FILTER (WHERE owner_id IS NOT NULL AND workspace_id IS NOT NULL AND deleted_at IS NULL)::int AS scoped_count
    FROM agent_cards`);
  const row = rows[0] || {};
  return {
    ready: true,
    systemCount: row.system_count || 0,
    legacyUnscopedCount: row.legacy_count || 0,
    scopedCustomCount: row.scoped_count || 0,
  };
}
