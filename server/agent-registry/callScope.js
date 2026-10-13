import pool from '../db.js';
import { actorId, resolveBuiltInAgentId } from '../agent-card-runs/contract.js';
import { canActorInvokeCard, resolveRegistryWorkspace } from './access.js';

export async function prepareAgentCardCall({
  card,
  actor,
  payload,
  options,
  workspaceId,
  db = pool,
}) {
  if (!(await canActorInvokeCard(card, actor, db))) {
    const error = new Error('Card not found');
    error.code = 'card-not-found';
    error.statusCode = 404;
    throw error;
  }
  resolveBuiltInAgentId(card);
  const workspace = await resolveRegistryWorkspace({
    userId: actorId(actor),
    workspaceId: workspaceId || options?.workspaceId || null,
    db,
  });
  return {
    card,
    callerId: actorId(actor),
    payload,
    options: { ...(options || {}), workspaceId: workspace.id },
  };
}
